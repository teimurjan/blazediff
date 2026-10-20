"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	CORE_WASM_URL,
	INTERPRET_WASM_URL,
	MILO_WASM_URL,
} from "../../utils/wasm";
import { fetchBytes } from "../image-decode";
import { type FixturePair, findPair, isHeavy } from "../interpret-fixtures";
import { algorithmInfo, usesThreshold } from "./algorithms";
import type { PlaygroundImage } from "./drop-slot";
import { readBlobHeader } from "./image-header";
import PickImagesStep, { type Side } from "./pick-images-step";
import type { CompareRequest, CompareResponse } from "./playground.worker";
import ResultStep, { type Comparison } from "./result-step";
import SettingsStep, { DEFAULT_SETTINGS, type Settings } from "./settings-step";
import { Step, Stepper, type StepStatus } from "./stepper";

type StepIndex = 1 | 2 | 3;

const COMPARISON_IDLE: Comparison = {
	phase: null,
	metric: null,
	interpret: null,
	mismatch: null,
	error: null,
};

function applyMessage(state: Comparison, message: CompareResponse): Comparison {
	switch (message.type) {
		case "phase":
			return { ...state, phase: message.phase };
		case "size-mismatch":
			return {
				...state,
				phase: null,
				mismatch: { a: message.a, b: message.b },
			};
		case "metric":
			return { ...state, metric: message.result };
		case "interpret":
			return { ...state, interpret: message.result };
		case "done":
			return { ...state, phase: null };
		case "error":
			return { ...state, phase: null, error: message.message };
	}
}

const isFinal = (message: CompareResponse) =>
	message.type === "done" || message.type === "error";

const statusOf = (index: StepIndex, current: StepIndex): StepStatus =>
	index === current ? "active" : index < current ? "done" : "upcoming";

const fileName = (url: string) => url.slice(url.lastIndexOf("/") + 1);

type Loaded =
	| { ok: true; image: PlaygroundImage }
	| { ok: false; error: string };

async function loadImage(blob: Blob, name: string): Promise<Loaded> {
	const header = await readBlobHeader(blob);
	return header
		? { ok: true, image: { blob, name, size: header.size } }
		: { ok: false, error: `${name} is not a PNG, JPEG or WebP image.` };
}

function summarizeSettings(settings: Settings): string {
	const parts = [
		algorithmInfo(settings.algorithm).label,
		settings.interpret ? "interpret on" : "interpret off",
	];
	if (usesThreshold(settings.algorithm, settings.interpret)) {
		parts.push(`threshold ${settings.threshold.toFixed(2)}`);
	}
	return parts.join(" · ");
}

/**
 * One worker per comparison, terminated when it ends: wasm linear memory never
 * shrinks, so terminating is both how a run is cancelled and how its memory is
 * given back.
 */
function useCompareWorker() {
	const workerRef = useRef<Worker | null>(null);

	const stop = useCallback(() => {
		workerRef.current?.terminate();
		workerRef.current = null;
	}, []);

	const start = useCallback(
		(
			request: CompareRequest,
			onMessage: (message: CompareResponse) => void,
		) => {
			stop();
			const worker = new Worker(
				new URL("./playground.worker.ts", import.meta.url),
				{ type: "module" },
			);
			workerRef.current = worker;

			worker.onmessage = (event: MessageEvent<CompareResponse>) => {
				if (workerRef.current !== worker) return;
				onMessage(event.data);
				if (isFinal(event.data)) stop();
			};
			worker.onerror = (event) => {
				if (workerRef.current !== worker) return;
				onMessage({
					type: "error",
					message: event.message || "the playground worker failed to start",
				});
				stop();
			};
			worker.postMessage(request);
		},
		[stop],
	);

	useEffect(() => stop, [stop]);

	return { start, stop };
}

export default function Playground() {
	const [step, setStep] = useState<StepIndex>(1);
	const [imageA, setImageA] = useState<PlaygroundImage | null>(null);
	const [imageB, setImageB] = useState<PlaygroundImage | null>(null);
	const [sampleId, setSampleId] = useState("");
	const [gatedPair, setGatedPair] = useState<FixturePair | null>(null);
	const [loadingSample, setLoadingSample] = useState(false);
	const [pickError, setPickError] = useState<string | null>(null);
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [comparison, setComparison] = useState<Comparison>(COMPARISON_IDLE);
	const [runId, setRunId] = useState(0);

	// Bumped on every new input, so a slow load cannot land after a newer one.
	const inputToken = useRef(0);
	const { start, stop } = useCompareWorker();

	const pickFile = async (side: Side, file: File) => {
		const token = ++inputToken.current;
		setSampleId("");
		setGatedPair(null);
		setLoadingSample(false);
		const loaded = await loadImage(file, file.name);
		if (token !== inputToken.current) return;
		if (!loaded.ok) {
			setPickError(loaded.error);
			return;
		}
		setPickError(null);
		(side === "a" ? setImageA : setImageB)(loaded.image);
	};

	const loadSample = async (pair: FixturePair) => {
		const token = ++inputToken.current;
		setGatedPair(null);
		setPickError(null);
		setLoadingSample(true);
		try {
			const [loadedA, loadedB] = await Promise.all(
				[pair.a, pair.b].map(async (url) =>
					loadImage(new Blob([await fetchBytes(url)]), fileName(url)),
				),
			);
			if (token !== inputToken.current) return;
			if (!loadedA.ok) {
				setPickError(loadedA.error);
				return;
			}
			if (!loadedB.ok) {
				setPickError(loadedB.error);
				return;
			}
			setImageA(loadedA.image);
			setImageB(loadedB.image);
		} catch (error) {
			if (token !== inputToken.current) return;
			setPickError(error instanceof Error ? error.message : String(error));
		} finally {
			if (token === inputToken.current) setLoadingSample(false);
		}
	};

	const chooseSample = (id: string) => {
		setSampleId(id);
		const pair = findPair(id);
		if (!pair) return;
		// The heavy pairs cost tens of megabytes and about a gigabyte of wasm
		// memory, so the reader confirms before any of it is spent.
		if (isHeavy(pair)) {
			inputToken.current += 1;
			setLoadingSample(false);
			setGatedPair(pair);
			return;
		}
		loadSample(pair);
	};

	const compare = () => {
		if (!imageA || !imageB) return;
		setComparison(COMPARISON_IDLE);
		setRunId((id) => id + 1);
		setStep(3);
		start(
			{
				a: imageA.blob,
				b: imageB.blob,
				...settings,
				wasmUrls: {
					core: CORE_WASM_URL,
					interpret: INTERPRET_WASM_URL,
					milo: MILO_WASM_URL,
				},
			},
			(message) => setComparison((state) => applyMessage(state, message)),
		);
	};

	const editStep = (index: StepIndex) => {
		stop();
		setComparison(COMPARISON_IDLE);
		setStep(index);
	};

	return (
		<Stepper>
			<Step
				index={1}
				title="Pick two images"
				status={statusOf(1, step)}
				summary={
					imageA &&
					imageB &&
					`${imageA.name} and ${imageB.name} · ${imageA.size.width}×${imageA.size.height}`
				}
				onEdit={() => editStep(1)}
			>
				<PickImagesStep
					imageA={imageA}
					imageB={imageB}
					sampleId={sampleId}
					gatedPair={gatedPair}
					loadingSample={loadingSample}
					error={pickError}
					onPick={pickFile}
					onSample={chooseSample}
					onLoadGated={loadSample}
					onContinue={() => setStep(2)}
				/>
			</Step>
			<Step
				index={2}
				title="Choose how to compare"
				status={statusOf(2, step)}
				summary={summarizeSettings(settings)}
				onEdit={() => editStep(2)}
			>
				{imageA && (
					<SettingsStep
						settings={settings}
						size={imageA.size}
						onChange={setSettings}
						onCompare={compare}
					/>
				)}
			</Step>
			<Step index={3} title="Result" status={statusOf(3, step)} last>
				{imageA && imageB && (
					<ResultStep
						key={runId}
						imageA={imageA}
						imageB={imageB}
						comparison={comparison}
						mapLabel={algorithmInfo(settings.algorithm).mapLabel}
						onRetry={compare}
					/>
				)}
			</Step>
		</Stepper>
	);
}
