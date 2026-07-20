// TopBar, Rail (sidebar), Inspector, HelpOverlay, VerdictBanner.
import { useMemo, useState } from "react";
import logoUrl from "../../../../../apps/website/public/logo.png";
import type {
	ReviewClass,
	ReviewEntry,
	ReviewRegion,
	ReviewRunMeta,
} from "../types";
import { Icons } from "./icons";
import { PixelZoomPopover } from "./viewer";

export type Filter = "all" | "pending" | "approved" | "issues";

// ─── TopBar ──────────────────────────────────────────────────────────────────
export function TopBar({
	meta,
	entries,
	onApproveAllIntentional,
	onApproveAll,
	onShowHelp,
}: {
	meta: ReviewRunMeta;
	entries: ReviewEntry[];
	onApproveAllIntentional: () => void;
	onApproveAll: () => void;
	onShowHelp: () => void;
}) {
	const reviewed = entries.filter((e) => e.status !== "unreviewed").length;
	const pending = entries.length - reviewed;
	const intentionalPending = entries.filter(
		(e) =>
			e.status === "unreviewed" && e.classification === "intentional-likely",
	).length;

	return (
		<div className="topbar">
			<div className="brand">
				<img className="brand-logo" src={logoUrl} alt="" />
				<span>blazediff</span>
			</div>

			<div className="crumb">
				<span style={{ color: "var(--text3)" }}>run</span>
				<b>{meta.name}</b>
				<span className="crumb-arrow">·</span>
				<span className="mono branch" style={{ color: "var(--text3)" }}>
					{meta.baseline.split(" @ ")[0] || "baseline"}
				</span>
				<Icons.ChevR w={11} h={11} style={{ color: "var(--text4)" }} />
				<span className="mono branch" style={{ color: "var(--accent-hi)" }}>
					{meta.candidate.split(" @ ")[0] || "candidate"}
				</span>
			</div>

			<div className="topbar-spacer" />

			<div className="topbar-prog">
				<div className="prog-bar">
					<div
						className="prog-fill"
						style={{
							width: `${entries.length ? (reviewed / entries.length) * 100 : 0}%`,
						}}
					/>
				</div>
				<span className="num">
					<b style={{ color: "var(--text-hi)", fontWeight: 500 }}>{reviewed}</b>{" "}
					<span style={{ color: "var(--text3)" }}>
						/ {entries.length} reviewed
					</span>
				</span>
			</div>

			<button
				className="topbar-btn"
				onClick={onApproveAllIntentional}
				disabled={intentionalPending === 0}
				style={
					intentionalPending === 0 ? { opacity: 0.4, cursor: "default" } : {}
				}
				title="Approve all pending intentional changes"
			>
				<Icons.Spark w={12} h={12} style={{ color: "var(--ok)" }} />
				<span className="bulk-label">Approve all intentional</span>
				{intentionalPending > 0 && (
					<span
						className="mono"
						style={{ color: "var(--text3)", marginLeft: 2 }}
					>
						{intentionalPending}
					</span>
				)}
			</button>
			<button
				className="topbar-btn primary"
				onClick={onApproveAll}
				disabled={pending === 0}
				style={pending === 0 ? { opacity: 0.4, cursor: "default" } : {}}
				title="Approve every pending change"
			>
				<Icons.Check w={12} h={12} />
				<span className="bulk-label">Approve all</span>
				{pending > 0 && <span className="mono bulk-count">{pending}</span>}
			</button>

			<button
				className="topbar-btn ghost"
				onClick={onShowHelp}
				aria-label="Keyboard shortcuts"
			>
				<Icons.Kbd w={14} h={14} />
			</button>
		</div>
	);
}

// ─── Rail (left sidebar) ─────────────────────────────────────────────────────
export function Rail({
	entries,
	activeId,
	filter,
	setFilter,
	onSelect,
}: {
	entries: ReviewEntry[];
	activeId: string | null;
	filter: Filter;
	setFilter: (f: Filter) => void;
	onSelect: (id: string) => void;
}) {
	const counts = useMemo(
		() => ({
			all: entries.length,
			pending: entries.filter((e) => e.status === "unreviewed").length,
			approved: entries.filter((e) => e.status === "approved").length,
			issues: entries.filter((e) => e.status === "rejected").length,
		}),
		[entries],
	);

	const filtered = useMemo(
		() =>
			entries.filter((e) =>
				filter === "all"
					? true
					: filter === "pending"
						? e.status === "unreviewed"
						: filter === "approved"
							? e.status === "approved"
							: filter === "issues"
								? e.status === "rejected"
								: true,
			),
		[entries, filter],
	);

	return (
		<div className="rail">
			<div className="rail-hd">
				<p className="rail-label">Differences</p>
				<div className="rail-stats">
					<span className="big num">{entries.length}</span>
					<span className="sub">found · {counts.approved} cleared</span>
				</div>

				<div className="filter-row">
					{(
						[
							["all", "All", counts.all],
							["pending", "Pending", counts.pending],
							["approved", "Done", counts.approved],
							["issues", "Issues", counts.issues],
						] as [Filter, string, number][]
					).map(([k, label, n]) => (
						<button
							key={k}
							className={filter === k ? "on" : ""}
							onClick={() => setFilter(k)}
						>
							<span>{label}</span>
							<span className="count">{n}</span>
						</button>
					))}
				</div>
			</div>

			<div className="rail-list" role="listbox">
				{filtered.length === 0 && (
					<div
						style={{
							padding: "32px 12px",
							color: "var(--text3)",
							fontSize: 12,
							textAlign: "center",
						}}
					>
						Nothing here.
					</div>
				)}
				{filtered.map((e) => (
					<button
						key={e.id}
						className={`rail-item ${activeId === e.id ? "active" : ""} ${e.status === "approved" ? "approved" : ""}`}
						onClick={() => onSelect(e.id)}
						role="option"
						aria-selected={activeId === e.id}
					>
						<span className={`ic ${e.status}`}>
							{e.status === "approved" && <Icons.Check w={9} h={9} />}
							{e.status === "rejected" && <Icons.X w={9} h={9} />}
						</span>
						<span className="name">
							{e.name}
							<span className="url">{e.url}</span>
						</span>
						<span className="right">
							<span className="diff-pct num">{e.diff.toFixed(2)}%</span>
							<span
								className={`sev-dot sev-${e.severity}`}
								title={e.severity}
							/>
						</span>
					</button>
				))}
			</div>

			<div className="rail-ft">
				<Icons.Branch w={12} h={12} />
				<span>{entries.reduce((s, e) => s + e.regions.length, 0)} regions</span>
				<span style={{ marginLeft: "auto" }}>
					<kbd>j</kbd> <kbd>k</kbd>
				</span>
			</div>
		</div>
	);
}

// ─── Inspector (right) ───────────────────────────────────────────────────────
export function ClassTag({ kind }: { kind: ReviewClass }) {
	const map: Record<ReviewClass, [string, string]> = {
		"intentional-likely": ["intentional", "intentional-likely"],
		regression: ["regression", "regression"],
		"layout-shift": ["layout", "layout-shift"],
	};
	const [cls, label] = map[kind] ?? ["intentional", kind];
	return (
		<span className={`tag ${cls}`}>
			<span className="dot" />
			{label}
		</span>
	);
}

export function Inspector({
	entry,
	selectedRegionId,
	onSelectRegion,
	onSkip,
}: {
	entry: ReviewEntry | undefined;
	selectedRegionId: number | null;
	onSelectRegion: (id: number) => void;
	onSkip: () => void;
}) {
	const [preview, setPreview] = useState<{
		region: ReviewRegion;
		x: number;
		y: number;
	} | null>(null);
	if (!entry) return <div className="inspect" />;
	const isReviewed = entry.status !== "unreviewed";

	const dimensionChange =
		entry.baselineSize && entry.candidateSize
			? { before: entry.baselineSize, after: entry.candidateSize }
			: null;
	return (
		<div className="inspect">
			<div className="inspect-body">
				{/* metadata */}
				<div className="insp-section">
					<p className="insp-label">
						<span>Page</span>
						<span className="meta">
							{entry.regions.length} region
							{entry.regions.length === 1 ? "" : "s"}
						</span>
					</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
						<div
							style={{
								fontSize: 16,
								fontWeight: 600,
								color: "var(--text-hi)",
								letterSpacing: "-.005em",
							}}
						>
							{entry.name}
						</div>
						<div
							className="mono"
							style={{ fontSize: 12, color: "var(--text3)" }}
						>
							{entry.url}
							{!dimensionChange && ` · ${entry.width}×${entry.height}`}
						</div>
					</div>
					{dimensionChange && (
						<div className="dimension-change">
							<div>
								<span>Before</span>
								<strong>
									{dimensionChange.before.width}×{dimensionChange.before.height}
								</strong>
							</div>
							<span className="dimension-arrow">→</span>
							<div>
								<span>After</span>
								<strong>
									{dimensionChange.after.width}×{dimensionChange.after.height}
								</strong>
							</div>
						</div>
					)}
					<div className="meta-grid">
						<div className="meta-cell">
							<div className="k">Diff</div>
							<div className="v">{entry.diff.toFixed(2)}%</div>
						</div>
						<div className="meta-cell">
							<div className="k">Pixels</div>
							<div className="v">
								{entry.regions.reduce((s, r) => s + r.pixels, 0)}
							</div>
						</div>
					</div>
				</div>

				{/* changes */}
				{entry.changes.length > 0 && (
					<div className="insp-section">
						<p className="insp-label">
							<span>Detected changes</span>
							<span className="meta">{entry.changes.length}</span>
						</p>
						<ul className="changes">
							{entry.changes.map((c, i) => (
								<li key={i}>{c}</li>
							))}
						</ul>
					</div>
				)}

				{/* regions */}
				{entry.regions.length > 0 && (
					<div className="insp-section">
						<p className="insp-label">
							<span>Regions</span>
							<span className="meta">
								<kbd>[</kbd> <kbd>]</kbd>
							</span>
						</p>
						<div className="reg-list">
							{entry.regions.map((region, index) => (
								<button
									key={region.id}
									className={`reg-row ${selectedRegionId === region.id ? "selected" : ""}`}
									onClick={() => onSelectRegion(region.id)}
									onMouseEnter={(event) =>
										setPreview({
											region,
											x: event.clientX,
											y: event.clientY,
										})
									}
									onMouseLeave={() => setPreview(null)}
								>
									<span className="rnum">#{index + 1}</span>
									<span>
										<div className="rcoord">
											x={region.bbox.x} y={region.bbox.y} · {region.bbox.w}×
											{region.bbox.h}
										</div>
										<div className="rchange">
											{region.kind} · {region.pixels}px ·{" "}
											{region.change.toFixed(3)}%
										</div>
									</span>
									<Icons.ChevR
										w={12}
										h={12}
										style={{ color: "var(--text4)" }}
									/>
								</button>
							))}
						</div>
						{preview && (
							<PixelZoomPopover
								entry={entry}
								region={preview.region}
								anchorX={preview.x}
								anchorY={preview.y}
							/>
						)}
					</div>
				)}

				{/* secondary actions */}
				{!isReviewed && (
					<div className="insp-section">
						<button className="btn skip" onClick={onSkip}>
							Skip for later{" "}
							<span className="btn-kbd" style={{ marginLeft: 6 }}>
								S
							</span>
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Help overlay ────────────────────────────────────────────────────────────
export function HelpOverlay({ onClose }: { onClose: () => void }) {
	const rows: [string, string[]][] = [
		["Next page", ["j"]],
		["Prev page", ["k"]],
		["Next region", ["]"]],
		["Prev region", ["["]],
		["Compare", ["1"]],
		["Slider", ["2"]],
		["Flip", ["3"]],
		["Diff", ["4"]],
		["Approve", ["a"]],
		["Mark regression", ["r"]],
		["Skip for later", ["s"]],
		["Toggle mask", ["m"]],
		["Hold to flip", ["space"]],
		["Toggle help", ["?"]],
		["Clear selection", ["esc"]],
		["Undo last", ["u"]],
	];
	return (
		<div className="help-overlay" onClick={onClose}>
			<div className="help-card" onClick={(e) => e.stopPropagation()}>
				<h3>Keyboard shortcuts</h3>
				<div className="help-grid">
					{rows.map(([lbl, keys]) => (
						<div className="row" key={lbl}>
							<span className="lbl">{lbl}</span>
							<span className="keys">
								{keys.map((k) => (
									<kbd key={k}>{k}</kbd>
								))}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// ─── AI verdict banner (above viewer) ────────────────────────────────────────
export function VerdictBanner({
	entry,
	onApprove,
	onReject,
	onUndo,
}: {
	entry: ReviewEntry | undefined;
	onApprove: () => void;
	onReject: () => void;
	onUndo: () => void;
}) {
	if (!entry) return null;
	const kindClass =
		{
			"intentional-likely": "verdict-intentional",
			regression: "verdict-regression",
			"layout-shift": "verdict-layout",
		}[entry.classification] || "verdict-intentional";

	const isReviewed = entry.status !== "unreviewed";

	return (
		<div className={`verdict-bar ${kindClass} ${isReviewed ? "reviewed" : ""}`}>
			<span className="vb-icon">
				<Icons.Sparkle w={16} h={16} />
			</span>
			<div className="vb-body">
				<div className="vb-head">
					<span className="vb-class">
						{entry.classification}
						<span className="by">· blazediff·llm</span>
					</span>
					<span className="vb-severity">
						<span className="dot" />
						{entry.severity} risk
					</span>
				</div>
				<div className="vb-summary">{entry.summary}</div>
				<div className="vb-suggest">
					<span>suggested action</span>
					<span style={{ color: "var(--text4)" }}>→</span>
					<b>{entry.action}</b>
				</div>
			</div>
			{isReviewed ? (
				<span className="reviewed-pill">
					<Icons.Check w={12} h={12} />
					{entry.status === "approved" ? "Approved" : "Regression"}
					{entry.reviewedAt && (
						<span style={{ color: "var(--text3)", marginLeft: 4 }}>
							· {entry.reviewedAt}
						</span>
					)}
					<button className="undo" onClick={onUndo}>
						Undo
					</button>
				</span>
			) : (
				<div className="vb-actions">
					<button className="btn ok" onClick={onApprove}>
						<Icons.Check w={13} h={13} /> Approve{" "}
						<span className="btn-kbd">A</span>
					</button>
					<button className="btn bad" onClick={onReject}>
						<Icons.X w={13} h={13} /> Regression{" "}
						<span className="btn-kbd">R</span>
					</button>
				</div>
			)}
		</div>
	);
}
