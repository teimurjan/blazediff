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
import {
	TweakColor,
	TweakRadio,
	TweakSection,
	type Tweaks,
	TweaksPanel,
	TweakToggle,
	useTweaks,
} from "./tweaks";
import { Viewer, type ViewMode } from "./viewer";

const TWEAK_DEFAULTS: Tweaks = {
	density: "regular",
	accent: "#818cf8",
	diffColor: "#f43fb0",
	layout: "default",
};

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
	const res = await fetch(`/api/entries/${encodeURIComponent(id)}/${action}`, {
		method: "POST",
	});
	if (!res.ok) return null;
	const body = (await res.json()) as { ok: boolean; entry?: ReviewEntry };
	return body.entry ?? null;
}

export function App() {
	const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
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

	// Apply tweak-driven CSS vars at the root.
	useEffect(() => {
		const root = document.documentElement;
		root.style.setProperty("--accent", t.accent);
		root.style.setProperty("--accent-hi", lighten(t.accent, 0.12));
		root.style.setProperty("--accent-soft", `${t.accent}22`);
		root.style.setProperty("--diff", t.diffColor);
		root.style.setProperty("--diff-soft", `${t.diffColor}26`);
		root.style.setProperty("--diff-glow", `${t.diffColor}66`);
	}, [t.accent, t.diffColor]);

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

	const onApproveAllIntentional = useCallback(() => {
		const targets = entries.filter(
			(e) =>
				e.status === "unreviewed" && e.classification === "intentional-likely",
		);
		if (targets.length === 0) return;
		setEntries((prev) =>
			prev.map((e) =>
				targets.some((tg) => tg.id === e.id)
					? {
							...e,
							status: "approved",
							reviewedAt: "just now",
							reviewedBy: "you",
						}
					: e,
			),
		);
		flash(
			`Approved ${targets.length} intentional change${targets.length === 1 ? "" : "s"}`,
		);
		Promise.all(
			targets.map((tg) =>
				postAction(tg.id, "approve").then(
					(entry) => entry && mutate(tg.id, entry),
				),
			),
		);
	}, [entries, flash, mutate]);

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

	const densityClass =
		t.density === "compact"
			? "density-compact"
			: t.density === "comfy"
				? "density-comfy"
				: "";
	const layoutClass = t.layout === "focus" ? "layout-focus" : "";

	if (!loaded) return <div className="review-status">Loading report…</div>;
	if (!meta || entries.length === 0)
		return (
			<div className="review-status">
				No differences to review — all entries passed.
			</div>
		);

	return (
		<div className={`app ${densityClass} ${layoutClass}`}>
			<TopBar
				meta={meta}
				entries={entries}
				onApproveAllIntentional={onApproveAllIntentional}
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

			<TweaksPanel>
				<TweakSection label="Layout" />
				<TweakRadio
					label="Density"
					value={t.density}
					options={["compact", "regular", "comfy"]}
					onChange={(v) => setTweak("density", v)}
				/>
				<TweakRadio
					label="Sidebar"
					value={t.layout}
					options={["default", "focus"]}
					onChange={(v) => setTweak("layout", v)}
				/>
				<TweakSection label="Color" />
				<TweakColor
					label="Accent"
					value={t.accent}
					options={["#818cf8", "#34d399", "#f5b342", "#f97316"]}
					onChange={(v) => setTweak("accent", v)}
				/>
				<TweakColor
					label="Diff highlight"
					value={t.diffColor}
					options={["#f43fb0", "#f43f5e", "#06b6d4", "#a3e635"]}
					onChange={(v) => setTweak("diffColor", v)}
				/>
				<TweakSection label="Behavior" />
				<TweakToggle
					label="Mask outside region on select"
					value={maskOnSelect}
					onChange={setMaskOnSelect}
				/>
			</TweaksPanel>
		</div>
	);
}

function lighten(hex: string, amt: number): string {
	const h = hex.replace("#", "");
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * amt));
	const hx = (n: number) => n.toString(16).padStart(2, "0");
	return `#${hx(f(r))}${hx(f(g))}${hx(f(b))}`;
}
