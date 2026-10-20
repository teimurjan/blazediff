"use client";

import { IconChevronDown } from "@tabler/icons-react";
import { useId } from "react";
import {
	type FixturePair,
	groupPairs,
	INTERPRET_FIXTURES,
	megapixels,
} from "../interpret-fixtures";
import DropSlot, { type PlaygroundImage } from "./drop-slot";

export type Side = "a" | "b";

export const sameSize = (a: PlaygroundImage, b: PlaygroundImage) =>
	a.size.width === b.size.width && a.size.height === b.size.height;

export default function PickImagesStep({
	imageA,
	imageB,
	sampleId,
	gatedPair,
	loadingSample,
	error,
	onPick,
	onSample,
	onLoadGated,
	onContinue,
}: {
	imageA: PlaygroundImage | null;
	imageB: PlaygroundImage | null;
	sampleId: string;
	gatedPair: FixturePair | null;
	loadingSample: boolean;
	error: string | null;
	onPick: (side: Side, file: File) => void;
	onSample: (id: string) => void;
	onLoadGated: (pair: FixturePair) => void;
	onContinue: () => void;
}) {
	const selectId = useId();
	const mismatch = imageA && imageB && !sameSize(imageA, imageB);
	const ready = imageA && imageB && !mismatch && !loadingSample;

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<DropSlot
					label="Image A"
					image={imageA}
					onFile={(file) => onPick("a", file)}
				/>
				<DropSlot
					label="Image B"
					image={imageB}
					onFile={(file) => onPick("b", file)}
				/>
			</div>

			<div className="relative w-full">
				<label htmlFor={selectId} className="sr-only">
					Sample pair
				</label>
				<select
					id={selectId}
					value={sampleId}
					onChange={(event) => onSample(event.target.value)}
					className="w-full appearance-none rounded-lg border border-line bg-surface px-3 py-2 pr-10 font-mono text-sm text-fg transition-colors hover:border-accent/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
				>
					<option value="">Or start from a sample pair…</option>
					{groupPairs(INTERPRET_FIXTURES).map(([group, items]) => (
						<optgroup key={group} label={group}>
							{items.map((item) => (
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

			{gatedPair && (
				<div className="space-y-3 rounded-lg border border-line bg-surface p-4">
					<p className="text-sm">
						This pair is {megapixels(gatedPair).toFixed(1)} MP. It downloads
						tens of megabytes, and the analysis takes several seconds and
						roughly a gigabyte of memory.
					</p>
					<button
						type="button"
						onClick={() => onLoadGated(gatedPair)}
						className="rounded-lg border border-accent px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent hover:text-canvas"
					>
						Load anyway
					</button>
				</div>
			)}

			{loadingSample && (
				<p className="font-mono text-sm text-muted">Fetching sample…</p>
			)}
			{mismatch && (
				<p className="text-sm text-red-400">
					Image A is {imageA.size.width}×{imageA.size.height}, image B is{" "}
					{imageB.size.width}×{imageB.size.height}. Use two images of the same
					size.
				</p>
			)}
			{error && <p className="text-sm text-red-400">{error}</p>}

			<button
				type="button"
				onClick={onContinue}
				disabled={!ready}
				className="rounded-lg bg-accent px-4 py-2 font-mono text-sm text-canvas transition-opacity disabled:pointer-events-none disabled:opacity-40"
			>
				Continue
			</button>
		</div>
	);
}
