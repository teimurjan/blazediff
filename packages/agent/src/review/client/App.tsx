import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { ReviewEntry, ReviewPayload } from "../types";
import { fetchReport, postDecision } from "./api";
import { EntryRow } from "./EntryRow";
import { Header } from "./Header";
import type { ViewMode } from "./ViewSelect";
import { type Decision, decisionOf, plural, runRefs } from "./verdict";

type Load =
	| { state: "loading" }
	| { state: "error"; error: string }
	| { state: "ready"; payload: ReviewPayload };

const isLocked = (entry: ReviewEntry) => entry.status !== "unreviewed";

const primaryButton =
	"h-11 cursor-pointer rounded-xl bg-ink px-[18px] text-[14.5px] font-medium text-paper disabled:cursor-default disabled:opacity-40";
const secondaryButton =
	"h-11 cursor-pointer rounded-xl border border-btn-line bg-transparent px-[18px] text-[14.5px] font-medium disabled:cursor-default disabled:opacity-40";

function Page({ children }: { children: ReactNode }) {
	return (
		<main className="mx-auto max-w-[760px] px-6 pt-12 pb-24">{children}</main>
	);
}

function UnchangedRow({ ids }: { ids: string[] }) {
	if (ids.length === 0) return null;
	return (
		<div className="flex items-start gap-3.5 border-b border-line py-4">
			<span
				aria-hidden="true"
				className="flex h-6 w-[22px] flex-none items-center justify-center"
			>
				<span className="h-[1.5px] w-3 rounded-[1px] bg-unclear" />
			</span>
			<div className="min-w-0 flex-1 text-muted">
				<p className="text-[17px] leading-6">
					{plural(ids.length, "page looks", "pages look")} exactly the same
				</p>
				<p className="mt-[3px] text-[13.5px] leading-5">{ids.join(", ")}</p>
			</div>
			<span className="flex-none pr-[18px] font-mono text-[15px] leading-6 text-muted">
				0%
			</span>
		</div>
	);
}

export function App() {
	const [load, setLoad] = useState<Load>({ state: "loading" });
	// Local decisions, only sent to the server on "Finish review".
	const [decisions, setDecisions] = useState<Record<string, Decision>>({});
	const [open, setOpen] = useState<Record<string, boolean>>({});
	const [view, setView] = useState<ViewMode>("difference");
	const [saving, setSaving] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		void fetchReport().then((result) => {
			if (!result.ok) return setLoad({ state: "error", error: result.error });
			const firstPending = result.value.entries.find((e) => !isLocked(e));
			if (firstPending) setOpen({ [firstPending.id]: true });
			setLoad({ state: "ready", payload: result.value });
		});
	}, []);

	const entries = load.state === "ready" ? load.payload.entries : [];

	const decisionFor = useCallback(
		(entry: ReviewEntry): Decision =>
			isLocked(entry)
				? decisionOf(entry.status)
				: (decisions[entry.id] ?? "pending"),
		[decisions],
	);

	const unsaved = useMemo(
		() => entries.filter((e) => !isLocked(e) && decisionFor(e) !== "pending"),
		[entries, decisionFor],
	);

	useEffect(() => {
		if (unsaved.length === 0) return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [unsaved.length]);

	const decide = (id: string, decision: Decision) => {
		setNotice(null);
		setDecisions((current) => ({ ...current, [id]: decision }));
	};

	const toggleOpen = (id: string) =>
		setOpen((current) => ({ ...current, [id]: !current[id] }));

	const approveIntended = () => {
		setNotice(null);
		setDecisions((current) => {
			const next = { ...current };
			for (const entry of entries) {
				if (
					entry.classification === "intentional-likely" &&
					decisionFor(entry) === "pending"
				)
					next[entry.id] = "approved";
			}
			return next;
		});
	};

	const finish = async () => {
		setSaving(true);
		const saved = new Map<string, ReviewEntry>();
		const failed: string[] = [];
		for (const entry of unsaved) {
			const action = decisionFor(entry) === "approved" ? "approve" : "reject";
			const result = await postDecision(entry.id, action);
			if (result.ok) saved.set(entry.id, result.value);
			else failed.push(entry.name);
		}
		setLoad((current) =>
			current.state === "ready"
				? {
						state: "ready",
						payload: {
							...current.payload,
							entries: current.payload.entries.map(
								(entry) => saved.get(entry.id) ?? entry,
							),
						},
					}
				: current,
		);
		const approved = [...saved.values()].filter(
			(e) => e.status === "approved",
		).length;
		const bugs = saved.size - approved;
		setNotice(
			[
				saved.size > 0 &&
					`Review saved: ${approved} approved, ${plural(bugs, "marked as a bug", "marked as bugs")}.`,
				failed.length > 0 && `Could not save ${failed.join(", ")}.`,
			]
				.filter(Boolean)
				.join(" "),
		);
		setSaving(false);
	};

	if (load.state === "loading")
		return (
			<Page>
				<p className="text-muted">Loading report…</p>
			</Page>
		);
	if (load.state === "error")
		return (
			<Page>
				<p className="text-bug-ink">{load.error}</p>
			</Page>
		);

	const { meta, unchanged } = load.payload;
	const refs = runRefs(meta);
	const hasIntendedPending = entries.some(
		(e) =>
			e.classification === "intentional-likely" && decisionFor(e) === "pending",
	);

	return (
		<Page>
			<Header meta={meta} entries={entries} decisionFor={decisionFor} />

			<ul>
				{entries.map((entry) => {
					const decision = decisionFor(entry);
					return (
						<EntryRow
							key={entry.id}
							entry={entry}
							decision={decision}
							locked={isLocked(entry)}
							open={!!open[entry.id]}
							refs={refs}
							view={view}
							onViewChange={setView}
							onToggleOpen={() => toggleOpen(entry.id)}
							onToggleApprove={() =>
								decide(
									entry.id,
									decision === "approved" ? "pending" : "approved",
								)
							}
							onApprove={() => {
								decide(entry.id, "approved");
								setOpen((current) => ({ ...current, [entry.id]: false }));
							}}
							onToggleBug={() =>
								decide(entry.id, decision === "bug" ? "pending" : "bug")
							}
						/>
					);
				})}
			</ul>

			<UnchangedRow ids={unchanged} />

			{entries.length > 0 && (
				<div className="mt-7 flex flex-wrap items-center justify-between gap-4">
					<p className="text-[13.5px] leading-5 text-muted" aria-live="polite">
						{notice ?? "Tap a line to see why. Tap a circle to approve."}
					</p>
					<div className="flex flex-wrap gap-2.5">
						<button
							type="button"
							onClick={approveIntended}
							disabled={!hasIntendedPending}
							className={secondaryButton}
						>
							Approve what looks intended
						</button>
						<button
							type="button"
							onClick={() => void finish()}
							disabled={saving || unsaved.length === 0}
							className={primaryButton}
						>
							{saving ? "Saving…" : "Finish review"}
						</button>
					</div>
				</div>
			)}
		</Page>
	);
}
