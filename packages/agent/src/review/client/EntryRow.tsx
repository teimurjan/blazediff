import type { ReviewEntry } from "../types";
import { Compare } from "./Compare";
import { AlertIcon, CheckIcon, ChevronIcon, SparkIcon } from "./icons";
import { type ViewMode, ViewSelect } from "./ViewSelect";
import {
	type Decision,
	diffText,
	type RunRefs,
	regionsText,
	suggestionFor,
	VERDICTS,
} from "./verdict";

export interface EntryRowProps {
	entry: ReviewEntry;
	decision: Decision;
	/** Already saved on the server, so it can no longer change here. */
	locked: boolean;
	open: boolean;
	refs: RunRefs;
	view: ViewMode;
	onViewChange: (view: ViewMode) => void;
	onToggleOpen: () => void;
	onToggleApprove: () => void;
	onApprove: () => void;
	onToggleBug: () => void;
}

function DecisionMark({ decision }: { decision: Decision }) {
	if (decision === "approved")
		return (
			<span className="flex size-[22px] items-center justify-center rounded-full bg-ink text-paper">
				<CheckIcon />
			</span>
		);
	if (decision === "bug")
		return (
			<span className="flex size-[22px] items-center justify-center rounded-full bg-bug text-white">
				<AlertIcon />
			</span>
		);
	return (
		<span className="block size-[22px] rounded-full border-[1.5px] border-unclear" />
	);
}

function sizeChange(entry: ReviewEntry): string | null {
	const { baselineSize: before, candidateSize: after } = entry;
	if (!before || !after) return null;
	return `${before.width}×${before.height} → ${after.width}×${after.height}`;
}

const secondaryButton =
	"h-11 cursor-pointer rounded-xl border border-btn-line bg-transparent px-[18px] text-[14.5px] font-medium";

export function EntryRow({
	entry,
	decision,
	locked,
	open,
	refs,
	view,
	onViewChange,
	onToggleOpen,
	onToggleApprove,
	onApprove,
	onToggleBug,
}: EntryRowProps) {
	const verdict = VERDICTS[entry.classification];
	const details = [regionsText(entry.regions), sizeChange(entry)].filter(
		(part): part is string => part !== null,
	);
	const thought = entry.changes.length
		? entry.changes.join(" ")
		: entry.summary;

	return (
		<li className="border-b border-line py-4">
			<div className="flex items-start gap-3.5">
				<button
					type="button"
					disabled={locked}
					aria-label={
						decision === "approved"
							? `Undo approval for ${entry.name}`
							: `Approve ${entry.name}`
					}
					onClick={onToggleApprove}
					className="-mx-[11px] -my-2.5 flex size-11 flex-none cursor-pointer items-center justify-center disabled:cursor-default"
				>
					<DecisionMark decision={decision} />
				</button>

				<button
					type="button"
					onClick={onToggleOpen}
					aria-expanded={open}
					className="min-w-0 flex-1 cursor-pointer text-left"
				>
					<span
						className={`block text-[17px] leading-6 ${decision === "pending" ? "text-ink" : "text-muted"} ${decision === "approved" ? "line-through" : ""}`}
					>
						{entry.name}: {entry.summary}
					</span>
					<span className="mt-[3px] block text-[13.5px] leading-5 text-muted">
						<span className="font-mono text-[12.5px]">{entry.url}</span>
						{details.map((part) => ` · ${part}`)} ·{" "}
						<span className={`font-medium ${verdict.text}`}>
							{verdict.label}
						</span>
					</span>
				</button>

				<button
					type="button"
					onClick={onToggleOpen}
					aria-label={`${open ? "Hide" : "Show"} details for ${entry.name}`}
					className={`-my-2.5 inline-flex min-h-11 flex-none cursor-pointer items-center gap-1.5 pl-3 font-mono text-[15px] ${open ? "text-ink" : "text-muted"}`}
				>
					{diffText(entry.diff)}
					<ChevronIcon className={open ? "rotate-90" : ""} />
				</button>
			</div>

			{open && (
				<div className="mt-4 mb-1 flex flex-col gap-4 sm:ml-9">
					<div className="rounded-xl bg-well px-4 pt-3.5 pb-4">
						<p className="flex items-center gap-[7px] text-[13px] leading-[18px] font-semibold text-muted">
							<SparkIcon />
							How blazediff read it
						</p>
						<p className="mt-1.5 text-[15px] leading-[23px] text-body">
							{thought}
						</p>
						<p className="mt-2 text-[13.5px] leading-5 text-muted">
							Suggestion: {suggestionFor(entry.action)}
						</p>
					</div>

					<div className="flex flex-col gap-3">
						<ViewSelect
							name={`view-${entry.id}`}
							value={view}
							onChange={onViewChange}
						/>
						<Compare entry={entry} view={view} refs={refs} />
					</div>

					<div className="flex flex-wrap items-center gap-2.5">
						{locked ? (
							<p className="text-sm text-muted">
								Saved as {decision === "approved" ? "approved" : "a bug"}.
							</p>
						) : (
							<>
								<button
									type="button"
									onClick={onApprove}
									className="h-11 cursor-pointer rounded-xl bg-ink px-[18px] text-[14.5px] font-medium text-paper"
								>
									Looks right
								</button>
								<button
									type="button"
									onClick={onToggleBug}
									aria-pressed={decision === "bug"}
									className={`${secondaryButton} text-bug-ink`}
								>
									{decision === "bug" ? "Marked as a bug" : "It's a bug"}
								</button>
							</>
						)}
					</div>
				</div>
			)}
		</li>
	);
}
