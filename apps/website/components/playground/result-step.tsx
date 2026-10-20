"use client";

import type { InterpretResult } from "@blazediff/interpret-wasm";
import { useState } from "react";
import { RegionList } from "../interpret-regions";
import InterpretSummary from "../interpret-summary";
import { algorithmInfo } from "./algorithms";
import type { PlaygroundImage } from "./drop-slot";
import HighlightedImage, { type Highlight } from "./highlighted-image";
import type { Size } from "./image-header";
import type { ComparePhase, MetricResult } from "./playground.worker";
import { useObjectUrl } from "./use-object-url";

export interface Comparison {
	phase: ComparePhase | null;
	metric: MetricResult | null;
	interpret: InterpretResult | null;
	mismatch: { a: Size; b: Size } | null;
	error: string | null;
}

const PHASE_LABEL: Record<ComparePhase, string> = {
	decoding: "Decoding",
	measuring: "Measuring",
	interpreting: "Classifying regions",
};

function describeMetric(metric: MetricResult): string {
	const label = algorithmInfo(metric.algorithm).label;
	switch (metric.algorithm) {
		case "pixel": {
			const total = metric.width * metric.height;
			const percent = ((metric.value / total) * 100).toFixed(2);
			return `${metric.value.toLocaleString()} of ${total.toLocaleString()} pixels differ (${percent}%)`;
		}
		case "gmsd":
			return `${label} ${metric.value.toFixed(4)} (0 = identical)`;
		case "milo":
			return `Raw error ${metric.value.toFixed(4)} (0 = identical) · MOS ${metric.mos?.toFixed(2)} (about 4.35 = identical)`;
		default:
			return `${label} ${metric.value.toFixed(4)} (1 = identical)`;
	}
}

function Pane({
	src,
	label,
	highlight,
}: {
	src: string | null;
	label: string;
	highlight: Highlight | null;
}) {
	return (
		<div>
			<div className="rounded-lg border border-line p-1">
				{src ? (
					<HighlightedImage src={src} alt={label} highlight={highlight} />
				) : (
					<div className="aspect-square animate-pulse rounded-lg bg-surface" />
				)}
			</div>
			<p className="mt-2 text-center text-sm text-muted">{label}</p>
		</div>
	);
}

export default function ResultStep({
	imageA,
	imageB,
	comparison,
	mapLabel,
	onRetry,
}: {
	imageA: PlaygroundImage;
	imageB: PlaygroundImage;
	comparison: Comparison;
	mapLabel: string;
	onRetry: () => void;
}) {
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
	const urlA = useObjectUrl(imageA.blob);
	const urlB = useObjectUrl(imageB.blob);
	const mapUrl = useObjectUrl(comparison.metric?.map ?? null);

	const { phase, metric, interpret, mismatch, error } = comparison;
	const hovered =
		interpret && hoveredIndex !== null ? interpret.regions[hoveredIndex] : null;
	const highlight: Highlight | null = hovered
		? { bbox: hovered.bbox, ...imageA.size }
		: null;

	if (mismatch) {
		return (
			<p className="text-sm text-red-400">
				Image A decodes to {mismatch.a.width}×{mismatch.a.height} and image B to{" "}
				{mismatch.b.width}×{mismatch.b.height}. Use two images of the same size.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid max-h-[36rem] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-3">
				<Pane src={urlA} label="Image A" highlight={highlight} />
				<Pane src={urlB} label="Image B" highlight={highlight} />
				<Pane src={mapUrl} label={mapLabel} highlight={highlight} />
			</div>

			{phase && (
				<p className="font-mono text-sm text-muted">{PHASE_LABEL[phase]}…</p>
			)}

			{error && (
				<div className="space-y-3 rounded-lg border border-red-500/40 p-4">
					<p className="text-sm">{error}</p>
					<button
						type="button"
						onClick={onRetry}
						className="text-sm text-muted hover:text-fg"
					>
						Retry
					</button>
				</div>
			)}

			{metric && (
				<div className="rounded-lg border border-line bg-surface p-4">
					<p className="text-sm">{describeMetric(metric)}</p>
				</div>
			)}

			{interpret && (
				<>
					<InterpretSummary
						severity={interpret.severity}
						diffPercentage={interpret.diffPercentage}
					>
						<p className="whitespace-pre-line text-sm">{interpret.summary}</p>
					</InterpretSummary>
					{interpret.regions.length > 0 && (
						<RegionList
							regions={interpret.regions}
							hoveredIndex={hoveredIndex}
							onHover={setHoveredIndex}
						/>
					)}
				</>
			)}
		</div>
	);
}
