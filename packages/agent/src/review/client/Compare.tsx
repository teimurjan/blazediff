import { DifferenceMode, SwipeMode, TwoUpMode } from "@blazediff/react";
import { type ReactNode, useEffect, useState } from "react";
import type { ReviewEntry } from "../types";
import { fetchDiffImage, imgUrl } from "./api";
import type { ViewMode } from "./ViewSelect";
import type { RunRefs } from "./verdict";

const frame = "overflow-hidden rounded-[10px] border border-frame bg-white";
const caption = "mt-[7px] text-[12.5px] leading-[18px] text-muted";

function onRef(side: string, ref: string | null): ReactNode {
	if (!ref) return side;
	return (
		<>
			{side}, on <span className="font-mono">{ref}</span>
		</>
	);
}

function SideBySideView({
	entry,
	refs,
}: {
	entry: ReviewEntry;
	refs: RunRefs;
}) {
	return (
		<div>
			<TwoUpMode
				src1={imgUrl(entry.id, "baseline")}
				src2={imgUrl(entry.id, "actual")}
				zoom={3}
				zoomSize={180}
				containerInnerClassName="items-start gap-4"
				panelClassName={`min-w-0 flex-1 cursor-crosshair ${frame}`}
				imageClassName="block w-full"
				dimensionInfoClassName="hidden"
				zoomClassName="gap-1 rounded-xl border border-frame bg-paper p-1 shadow-lg"
				zoomPanelClassName="rounded-lg bg-white"
			/>
			<div className="flex gap-4">
				<p className={`flex-1 ${caption}`}>{onRef("Before", refs.before)}</p>
				<p className={`flex-1 ${caption}`}>{onRef("After", refs.after)}</p>
			</div>
		</div>
	);
}

function SwipeView({ entry, refs }: { entry: ReviewEntry; refs: RunRefs }) {
	return (
		<div>
			<SwipeMode
				src1={imgUrl(entry.id, "baseline")}
				src2={imgUrl(entry.id, "actual")}
				alt1={`${entry.name} before`}
				alt2={`${entry.name} after`}
				containerClassName={frame}
				dividerClassName="bg-ink!"
			/>
			<div className="flex justify-between gap-4">
				<p className={caption}>{onRef("Before", refs.before)}</p>
				<p className={caption}>Drag the line to compare</p>
				<p className={`text-right ${caption}`}>{onRef("After", refs.after)}</p>
			</div>
		</div>
	);
}

function DifferenceView({ entry }: { entry: ReviewEntry }) {
	// null while loading; `bytes` undefined means the browser computes the diff.
	const [diff, setDiff] = useState<{ bytes?: Uint8Array } | null>(null);

	useEffect(() => {
		let live = true;
		void fetchDiffImage(entry.id).then((bytes) => {
			if (live) setDiff({ bytes: bytes ?? undefined });
		});
		return () => {
			live = false;
		};
	}, [entry.id]);

	if (!diff) return <p className={caption}>Loading the difference…</p>;
	return (
		<div>
			<DifferenceMode
				src1={imgUrl(entry.id, "baseline")}
				src2={imgUrl(entry.id, "actual")}
				diff={diff.bytes}
				containerClassName={frame}
				canvasClassName="block w-full"
			/>
			<p className={caption}>Changed pixels are highlighted.</p>
		</div>
	);
}

export function Compare({
	entry,
	view,
	refs,
}: {
	entry: ReviewEntry;
	view: ViewMode;
	refs: RunRefs;
}) {
	if (view === "swipe") return <SwipeView entry={entry} refs={refs} />;
	if (view === "difference") return <DifferenceView entry={entry} />;
	return <SideBySideView entry={entry} refs={refs} />;
}
