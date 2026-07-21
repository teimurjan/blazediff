import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewEntry, ReviewPayload, ReviewRunMeta } from "../types";
import {
	type Filter,
	HelpOverlay,
	Inspector,
	Rail,
	TopBar,
	VerdictBanner,
} from "./components";
import { Icons } from "./icons";
import { Viewer, type ViewMode } from "./viewer";

const MODES: [
	ViewMode,
	string,
	string,
	(p: { w: number; h: number }) => JSX.Element,
][] = [
	["compare", "Compare", "1", Icons.Layers],
	["slider", "Slider", "2", Icons.Slider],
	["flip", "Flip", "3", Icons.Flip],
	["diff", "Diff", "4", Icons.Diff],
];

function ViewModeSwitch({
	mode,
	setMode,
}: {
	mode: ViewMode;
	setMode: (m: ViewMode) => void;
}) {
	return (
		<div className="seg" role="tablist">
			{MODES.map(([k, lbl, kb, Ico]) => (
				<button
					key={k}
					className={mode === k ? "on" : ""}
					onClick={() => setMode(k)}
					role="tab"
					aria-selected={mode === k}
				>
					<Ico w={12} h={12} />
					{lbl}
					<span className="kb">{kb}</span>
				</button>
			))}
		</div>
	);
}

async function postAction(
	id: string,
	action: "approve" | "reject",
): Promise<ReviewEntry | null> {
	try {
		const res = await fetch(
			`/api/entries/${encodeURIComponent(id)}/${action}`,
			{
				method: "POST",
			},
		);
		if (!res.ok) return null;
		const body = (await res.json()) as { ok: boolean; entry?: ReviewEntry };
		return body.entry ?? null;
	} catch {
		return null;
	}
}

export function App() {
	const [meta, setMeta] = useState<ReviewRunMeta | null>(null);
	const [entries, setEntries] = useState<ReviewEntry[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [mode, setMode] = useState<ViewMode>("compare");
	const [maskOnSelect, setMaskOnSelect] = useState(true);
	const [selectedRegion, setSelectedRegion] = useState<
		Record<string, number | null>
	>({});
	const [flipShowBefore, setFlipShowBefore] = useState(false);
	const [showHelp, setShowHelp] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	const undoStack = useRef<
		{ snap: { id: string; prev: ReviewEntry }; label: string }[]
	>([]);
	const flashTimer = useRef<ReturnType<typeof setTimeout>>();

	// ── load report ───────────────────────────────────────────────────────────
	useEffect(() => {
		fetch("/api/report")
			.then((r) => r.json())
			.then((payload: ReviewPayload) => {
				setMeta(payload.meta);
				setEntries(payload.entries);
				setActiveId(payload.entries[0]?.id ?? null);
			})
			.catch(() => undefined)
			.finally(() => setLoaded(true));
	}, []);

	const active = entries.find((e) => e.id === activeId);
	const activeRegionId =
		activeId != null
			? (selectedRegion[activeId] ?? active?.regions[0]?.id ?? null)
			: null;

	const flash = useCallback((msg: string) => {
		setToast(msg);
		clearTimeout(flashTimer.current);
		flashTimer.current = setTimeout(() => setToast(null), 1400);
	}, []);

	const mutate = useCallback((id: string, patch: Partial<ReviewEntry>) => {
		setEntries((prev) =>
			prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
		);
	}, []);

	const goNextUnreviewed = useCallback((fromId: string) => {
		setEntries((current) => {
			const idx = current.findIndex((e) => e.id === fromId);
			for (let i = 1; i <= current.length; i++) {
				const c = current[(idx + i) % current.length];
				if (c.status === "unreviewed") {
					setActiveId(c.id);
					break;
				}
			}
			return current;
		});
	}, []);

	const onApprove = useCallback(() => {
		if (!active || active.status !== "unreviewed") return;
		const prev = { ...active };
		undoStack.current.push({ snap: { id: active.id, prev }, label: "Approve" });
		mutate(active.id, {
			status: "approved",
			reviewedAt: "just now",
			reviewedBy: "you",
		});
		flash(`Approved ${active.name}`);
		const id = active.id;
		postAction(id, "approve").then((entry) => {
			if (entry) mutate(id, entry);
			else {
				mutate(id, prev);
				flash(`Couldn't approve ${id}`);
			}
		});
		setTimeout(() => goNextUnreviewed(id), 220);
	}, [active, mutate, flash, goNextUnreviewed]);

	const onReject = useCallback(() => {
		if (!active || active.status !== "unreviewed") return;
		const prev = { ...active };
		undoStack.current.push({ snap: { id: active.id, prev }, label: "Reject" });
		mutate(active.id, {
			status: "rejected",
			reviewedAt: "just now",
			reviewedBy: "you",
		});
		flash(`Marked ${active.name} as regression`);
		const id = active.id;
		postAction(id, "reject").then((entry) => {
			if (entry) mutate(id, entry);
			else {
				mutate(id, prev);
				flash(`Couldn't reject ${id}`);
			}
		});
		setTimeout(() => goNextUnreviewed(id), 220);
	}, [active, mutate, flash, goNextUnreviewed]);

	const onSkip = useCallback(() => {
		if (!active) return;
		flash(`Skipped ${active.name}`);
		goNextUnreviewed(active.id);
	}, [active, flash, goNextUnreviewed]);

	// Undo is visual-only: a committed approve already promoted the baseline on
	// disk. Re-run `check` for a fresh comparison if you need to truly revert.
	const onUndo = useCallback(() => {
		const u = undoStack.current.pop();
		if (!u) return;
		mutate(u.snap.id, u.snap.prev);
		flash(`Undid ${u.label}`);
	}, [mutate, flash]);

	const approveTargets = useCallback(
		(targets: ReviewEntry[], description: string) => {
			if (targets.length === 0) return;
			const targetIds = new Set(targets.map((entry) => entry.id));
			setEntries((current) =>
				current.map((entry) =>
					targetIds.has(entry.id)
						? {
								...entry,
								status: "approved",
								reviewedAt: "just now",
								reviewedBy: "you",
							}
						: entry,
				),
			);
			flash(`Approved ${targets.length} ${description}`);
			void (async () => {
				let failed = 0;
				for (const target of targets) {
					const entry = await postAction(target.id, "approve");
					if (entry) {
						mutate(target.id, entry);
					} else {
						mutate(target.id, target);
						failed++;
					}
				}
				if (failed > 0)
					flash(`Couldn't approve ${failed} change${failed === 1 ? "" : "s"}`);
			})();
		},
		[flash, mutate],
	);

	const onApproveAllIntentional = useCallback(() => {
		const targets = entries.filter(
			(entry) =>
				entry.status === "unreviewed" &&
				entry.classification === "intentional-likely",
		);
		approveTargets(
			targets,
			`intentional change${targets.length === 1 ? "" : "s"}`,
		);
	}, [entries, approveTargets]);

	const onApproveAll = useCallback(() => {
		const targets = entries.filter((entry) => entry.status === "unreviewed");
		approveTargets(targets, `change${targets.length === 1 ? "" : "s"}`);
	}, [entries, approveTargets]);

	const goRelative = useCallback(
		(delta: number) => {
			const visible = entries.filter((e) =>
				filter === "all"
					? true
					: filter === "pending"
						? e.status === "unreviewed"
						: filter === "approved"
							? e.status === "approved"
							: e.status === "rejected",
			);
			if (visible.length === 0) return;
			const i = visible.findIndex((e) => e.id === activeId);
			const next = visible[(i + delta + visible.length) % visible.length];
			setActiveId(next.id);
		},
		[entries, filter, activeId],
	);

	const cycleRegion = useCallback(
		(delta: number) => {
			if (!active || !active.regions.length || activeId == null) return;
			const i = active.regions.findIndex((r) => r.id === activeRegionId);
			const next =
				active.regions[
					(i + delta + active.regions.length) % active.regions.length
				];
			setSelectedRegion((s) => ({ ...s, [activeId]: next.id }));
		},
		[active, activeId, activeRegionId],
	);

	// ── keyboard ─────────────────────────────────────────────────────────────
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName?.toLowerCase() ?? "";
			if (tag === "input" || tag === "textarea") return;

			if (e.key === "?" || (e.shiftKey && e.key === "/")) {
				e.preventDefault();
				setShowHelp((v) => !v);
				return;
			}
			if (e.key === "Escape") {
				if (showHelp) {
					setShowHelp(false);
					return;
				}
				if (activeId != null)
					setSelectedRegion((s) => ({ ...s, [activeId]: null }));
				return;
			}
			if (showHelp) return;

			if (e.key === " ") {
				e.preventDefault();
				setFlipShowBefore(true);
				return;
			}
			if (e.key === "j") return goRelative(1);
			if (e.key === "k") return goRelative(-1);
			if (e.key === "]") return cycleRegion(1);
			if (e.key === "[") return cycleRegion(-1);
			if (e.key === "1") setMode("compare");
			if (e.key === "2") setMode("slider");
			if (e.key === "3") setMode("flip");
			if (e.key === "4") setMode("diff");
			if (e.key === "a") onApprove();
			if (e.key === "r") onReject();
			if (e.key === "s") onSkip();
			if (e.key === "u") onUndo();
			if (e.key === "m") setMaskOnSelect((v) => !v);
		};
		const onUp = (e: KeyboardEvent) => {
			if (e.key === " ") setFlipShowBefore(false);
		};
		window.addEventListener("keydown", onKey);
		window.addEventListener("keyup", onUp);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("keyup", onUp);
		};
	}, [
		activeId,
		showHelp,
		goRelative,
		cycleRegion,
		onApprove,
		onReject,
		onSkip,
		onUndo,
	]);

	if (!loaded) return <div className="review-status">Loading report…</div>;
	if (!meta || entries.length === 0)
		return (
			<div className="review-status">
				No differences to review — all entries passed.
			</div>
		);

	return (
		<div className="app">
			<TopBar
				meta={meta}
				entries={entries}
				onApproveAllIntentional={onApproveAllIntentional}
				onApproveAll={onApproveAll}
				onShowHelp={() => setShowHelp(true)}
			/>

			<Rail
				entries={entries}
				activeId={activeId}
				filter={filter}
				setFilter={setFilter}
				onSelect={setActiveId}
			/>

			<div className="center">
				<div className="center-hd">
					<div className="entry-title">
						<h1>{active?.name}</h1>
						<span className="url">{active?.url}</span>
					</div>
					<div className="center-hd-spacer" />
					{active?.status !== "approved" && (
						<>
							<button
								className={`topbar-btn ghost ${maskOnSelect ? "on-focus" : ""}`}
								onClick={() => setMaskOnSelect((v) => !v)}
								title="Dim outside the selected region (M)"
								style={
									maskOnSelect
										? {
												color: "var(--accent-hi)",
												background: "var(--accent-soft)",
											}
										: {}
								}
							>
								<Icons.Focus w={13} h={13} /> Focus
							</button>
							<ViewModeSwitch mode={mode} setMode={setMode} />
						</>
					)}
				</div>

				{active && (
					<VerdictBanner
						entry={active}
						onApprove={onApprove}
						onReject={onReject}
						onUndo={onUndo}
					/>
				)}

				{active && (
					<Viewer
						entry={active}
						mode={mode}
						selectedRegionId={activeRegionId}
						masked={maskOnSelect}
						onSelectRegion={(rid) =>
							setSelectedRegion((s) => ({ ...s, [active.id]: rid }))
						}
						baseline={meta.baseline.split(" @ ")[1] || meta.baseline}
						candidate={meta.candidate.split(" @ ")[1] || meta.candidate}
						flipShowBefore={flipShowBefore}
					/>
				)}
			</div>

			<Inspector
				entry={active}
				selectedRegionId={activeRegionId}
				onSelectRegion={(rid) =>
					active && setSelectedRegion((s) => ({ ...s, [active.id]: rid }))
				}
				onSkip={onSkip}
			/>

			{showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
			{toast && <div className="toast">{toast}</div>}
		</div>
	);
}
