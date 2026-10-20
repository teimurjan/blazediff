import type { ReviewEntry, ReviewRunMeta } from "../types";
import {
	type Decision,
	parseRef,
	runDate,
	VERDICT_ORDER,
	VERDICTS,
} from "./verdict";

function RunTitle({ meta }: { meta: ReviewRunMeta }) {
	const candidate = parseRef(meta.candidate);
	const baseline = parseRef(meta.baseline);
	if (!candidate) return "Visual review";
	const head = candidate.sha || candidate.ref;
	return (
		<>
			<span className="font-mono font-semibold tracking-[-0.03em]">{head}</span>{" "}
			<span className="font-normal text-muted">
				{baseline ? "against" : "on"}
			</span>{" "}
			<span className="font-mono font-semibold tracking-[-0.03em]">
				{baseline ? baseline.ref : candidate.ref}
			</span>
		</>
	);
}

export function Header({
	meta,
	entries,
	decisionFor,
}: {
	meta: ReviewRunMeta;
	entries: ReviewEntry[];
	decisionFor: (entry: ReviewEntry) => Decision;
}) {
	const done = entries.filter(
		(entry) => decisionFor(entry) !== "pending",
	).length;
	const percent = entries.length
		? Math.round((done / entries.length) * 100)
		: 0;

	return (
		<header>
			<div className="flex flex-wrap justify-between gap-2 font-mono text-xs leading-[18px] text-muted">
				<span>blazediff · {meta.name}</span>
				<span>{runDate(meta.startedAt)}</span>
			</div>

			<h1 className="mt-10 text-[34px] leading-[42px] font-bold tracking-[-0.02em]">
				<RunTitle meta={meta} />
			</h1>

			<div className="mt-7 flex flex-wrap items-end justify-between gap-5 border-b border-line pb-6">
				<div>
					<p className="flex items-baseline gap-2.5">
						<span className="text-2xl leading-[30px] font-semibold tracking-[-0.02em]">
							{entries.length || "No"}
						</span>
						<span className="text-[17px] leading-6 font-medium text-muted">
							{entries.length === 1 ? "change" : "changes"} to look at
						</span>
					</p>
					{entries.length > 0 && (
						<ul className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
							{VERDICT_ORDER.map((kind) => {
								const count = entries.filter(
									(entry) => entry.classification === kind,
								).length;
								if (count === 0) return null;
								return (
									<li key={kind} className="inline-flex items-center gap-[7px]">
										<span
											className={`size-2 rounded-full ${VERDICTS[kind].dot}`}
										/>
										{count} {VERDICTS[kind].label}
									</li>
								);
							})}
						</ul>
					)}
				</div>
				{entries.length > 0 && (
					<div className="min-w-[180px]">
						<p className="text-right text-sm text-muted">
							{done} of {entries.length} reviewed
						</p>
						<div
							className="mt-2 h-1 overflow-hidden rounded-sm bg-line"
							role="progressbar"
							aria-label="Reviewed"
							aria-valuenow={percent}
							aria-valuemin={0}
							aria-valuemax={100}
						>
							<div className="h-1 bg-ink" style={{ width: `${percent}%` }} />
						</div>
					</div>
				)}
			</div>
		</header>
	);
}
