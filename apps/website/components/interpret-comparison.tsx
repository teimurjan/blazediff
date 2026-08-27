"use client";

import type { InterpretResult } from "@blazediff/interpret-wasm";
import { IconChevronDown } from "@tabler/icons-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
	InterpretPhase,
	InterpretRequest,
	InterpretResponse,
} from "./interpret.worker";
import {
	DEFAULT_PAIR_ID,
	type FixturePair,
	findPair,
	groupPairs,
	INTERPRET_FIXTURES,
	isHeavy,
	megapixels,
} from "./interpret-fixtures";
import InterpretSummary from "./interpret-summary";

interface BoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface InterpretComparisonProps {
	/** Which fixtures to offer. One id renders no select. */
	pairIds?: string[];
	/** Which of them to open on. */
	defaultId?: string;
}

/**
 * The published wasm module, pinned to the version this checkout ships (see
 * the note in next.config.mjs for why it comes off a CDN rather than the
 * bundle). jsDelivr serves it as `application/wasm` with `access-control-
 * allow-origin: *`, which is what lets the worker stream it cross-origin.
 */
const WASM_URL = `https://cdn.jsdelivr.net/npm/@blazediff/interpret-wasm@${process.env.NEXT_PUBLIC_INTERPRET_WASM_VERSION}/wasm/blazediff_interpret_bg.wasm`;

const PHASE_LABEL: Record<InterpretPhase, string> = {
	fetching: "Fetching images",
	decoding: "Decoding",
	analyzing: "Analyzing",
};

/** `content-change` -> `Content change`. */
function humanize(value: string): string {
	const spaced = value.replace(/-/g, " ");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function RegionHighlight({
	bbox,
	imageWidth,
	imageHeight,
}: {
	bbox: BoundingBox;
	imageWidth: number;
	imageHeight: number;
}) {
	return (
		<div
			className="absolute pointer-events-none border-2 border-white/80 rounded-sm transition-all duration-150"
			style={{
				left: `${(bbox.x / imageWidth) * 100}%`,
				top: `${(bbox.y / imageHeight) * 100}%`,
				width: `${(bbox.width / imageWidth) * 100}%`,
				height: `${(bbox.height / imageHeight) * 100}%`,
				boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
			}}
		/>
	);
}

function Pane({
	pair,
	src,
	caption,
	bbox,
}: {
	pair: FixturePair;
	src: string;
	caption: string;
	bbox: BoundingBox | null;
}) {
	return (
		<div>
			{/*
			  A plain <img>, not next/image: these are up to 3598x16384, and
			  routing them through the optimizer would decode ~236 MB in sharp
			  per request. The wrapper carries the true aspect ratio so the
			  percentage-positioned overlay lands on the right pixels.
			*/}
			<div
				className="relative overflow-hidden rounded-lg"
				style={{ aspectRatio: `${pair.width} / ${pair.height}` }}
			>
				{/* biome-ignore lint/performance/noImgElement: see above */}
				<img src={src} alt={caption} className="w-full" loading="lazy" />
				{bbox && (
					<RegionHighlight
						bbox={bbox}
						imageWidth={pair.width}
						imageHeight={pair.height}
					/>
				)}
			</div>
			<p className="text-sm text-gray-600 mt-2 text-center">{caption}</p>
		</div>
	);
}

export default function InterpretComparison({
	pairIds,
	defaultId,
}: InterpretComparisonProps) {
	const selectId = useId();

	const pairs = (pairIds ?? INTERPRET_FIXTURES.map((pair) => pair.id))
		.map(findPair)
		.filter((pair): pair is FixturePair => pair !== undefined);

	const [pairId, setPairId] = useState(
		defaultId ?? (pairIds ? pairs[0]?.id : DEFAULT_PAIR_ID) ?? "",
	);
	const [result, setResult] = useState<InterpretResult | null>(null);
	const [phase, setPhase] = useState<InterpretPhase | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [gated, setGated] = useState(false);
	const [jsonExpanded, setJsonExpanded] = useState(false);
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

	const workerRef = useRef<Worker | null>(null);

	const pair = findPair(pairId) ?? pairs[0];

	const stopWorker = useCallback(() => {
		// wasm linear memory never shrinks, so a worker that has analyzed a
		// 59 MP pair holds on to ~1 GB for the life of the page. Terminating is
		// both how we cancel and how we give that back.
		workerRef.current?.terminate();
		workerRef.current = null;
	}, []);

	const run = useCallback(
		(target: FixturePair) => {
			stopWorker();
			setResult(null);
			setError(null);
			setGated(false);
			setHoveredIndex(null);
			setPhase("fetching");

			const worker = new Worker(
				new URL("./interpret.worker.ts", import.meta.url),
				{ type: "module" },
			);
			workerRef.current = worker;

			worker.onmessage = (event: MessageEvent<InterpretResponse>) => {
				const message = event.data;
				if (message.type === "phase") {
					setPhase(message.phase);
					return;
				}
				if (message.type === "done") {
					setResult(message.result);
				} else {
					setError(message.message);
				}
				setPhase(null);
				stopWorker();
			};

			worker.onerror = (event) => {
				setError(event.message || "the analysis worker failed to start");
				setPhase(null);
				stopWorker();
			};

			worker.postMessage({
				a: target.a,
				b: target.b,
				width: target.width,
				height: target.height,
				wasmUrl: WASM_URL,
			} satisfies InterpretRequest);
		},
		[stopWorker],
	);

	useEffect(() => {
		if (!pair) return;

		// The heavy pairs cost tens of megabytes and roughly a gigabyte of wasm
		// memory. Make the reader ask for those rather than spending it on a
		// stray keystroke in the select.
		if (isHeavy(pair)) {
			stopWorker();
			setResult(null);
			setError(null);
			setPhase(null);
			setGated(true);
			return;
		}

		run(pair);
		return stopWorker;
	}, [pair, run, stopWorker]);

	const hoveredBbox =
		result && hoveredIndex !== null && hoveredIndex < result.regions.length
			? result.regions[hoveredIndex].bbox
			: null;

	return (
		<div className="space-y-4">
			{pairs.length > 1 && (
				<div className="relative w-full">
					<label htmlFor={selectId} className="sr-only">
						Fixture pair
					</label>
					<select
						id={selectId}
						value={pairId}
						onChange={(event) => setPairId(event.target.value)}
						className="w-full appearance-none rounded-lg border border-line bg-surface px-3 py-2 pr-10 font-mono text-sm text-fg transition-colors hover:border-accent/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
					>
						{groupPairs(pairs).map(([group, groupItems]) => (
							<optgroup key={group} label={group}>
								{groupItems.map((item) => (
									<option key={item.id} value={item.id}>
										{item.id} — {item.label} ({item.width}×{item.height})
									</option>
								))}
							</optgroup>
						))}
					</select>
					<IconChevronDown
						size={16}
						className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
					/>
				</div>
			)}

			{pair && (
				<div className="grid grid-cols-2 gap-4 max-h-[30rem] overflow-y-auto">
					<Pane pair={pair} src={pair.a} caption="Image 1" bbox={hoveredBbox} />
					<Pane pair={pair} src={pair.b} caption="Image 2" bbox={hoveredBbox} />
				</div>
			)}

			<div className="space-y-4">
				{gated && pair && (
					<div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800 space-y-3">
						<p className="text-sm">
							This pair is {megapixels(pair).toFixed(1)} MP. Analysis runs in a
							Web Worker in your browser and will take several seconds and
							roughly a gigabyte of memory.
						</p>
						<button
							type="button"
							onClick={() => run(pair)}
							className="rounded-lg border border-accent px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent hover:text-canvas"
						>
							Analyze anyway
						</button>
					</div>
				)}

				{phase && pair && (
					<div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
						<p className="font-mono text-sm text-gray-500">
							{PHASE_LABEL[phase]} {pair.width}×{pair.height}…
						</p>
					</div>
				)}

				{error && (
					<div className="p-4 rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-950/20 space-y-3">
						<p className="text-sm">{error}</p>
						{pair && (
							<button
								type="button"
								onClick={() => run(pair)}
								className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
							>
								Retry
							</button>
						)}
					</div>
				)}

				{result && (
					<>
						<InterpretSummary
							severity={result.severity}
							diffPercentage={result.diffPercentage}
						>
							<p className="text-sm whitespace-pre-line">{result.summary}</p>
						</InterpretSummary>

						{result.regions.length > 0 && (
							<div className="space-y-2 max-h-96 overflow-y-auto">
								<p className="text-sm font-medium flex items-center gap-2 justify-between">
									<span>Regions ({result.regions.length})</span>
									<span className="text-gray-500">
										Hover a region to highlight
									</span>
								</p>
								{result.regions.map((region, i) => (
									// biome-ignore lint/a11y/noStaticElementInteractions: hover highlight
									<div
										key={`${region.position}-${i}`}
										className={`p-3 rounded-lg border text-sm cursor-pointer transition-colors ${hoveredIndex === i ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-gray-200 dark:border-gray-700"}`}
										onMouseEnter={() => setHoveredIndex(i)}
										onMouseLeave={() => setHoveredIndex(null)}
									>
										<div className="flex items-center gap-2 flex-wrap">
											<span className="font-medium">
												{humanize(region.position)}
											</span>
											<span className="text-gray-500">·</span>
											<span>{humanize(region.changeType)}</span>
											<span className="text-gray-500">·</span>
											<span className="text-gray-500">
												{humanize(region.shape)}
											</span>
											<span className="text-gray-500">·</span>
											<span className="text-xs text-gray-400">
												({region.bbox.x}, {region.bbox.y}, {region.bbox.width}×
												{region.bbox.height}) · {region.percentage.toFixed(2)}%
											</span>
										</div>
									</div>
								))}
							</div>
						)}

						<div>
							<button
								type="button"
								onClick={() => setJsonExpanded(!jsonExpanded)}
								className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
							>
								{jsonExpanded ? "Hide" : "Show"} raw JSON
							</button>
							{jsonExpanded && (
								<pre className="mt-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs overflow-x-auto max-h-80">
									{JSON.stringify(result, null, 2)}
								</pre>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
