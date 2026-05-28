// Floating tweaks panel — appearance knobs only. The design's host edit-mode
// postMessage protocol is dropped; this is a plain self-toggled panel.
import { type ReactNode, useEffect, useState } from "react";
import { Icons } from "./icons";

const TWEAKS_STYLE = `
  .twk-fab{position:fixed;right:16px;bottom:16px;z-index:2147483646;
    width:36px;height:36px;border-radius:10px;border:1px solid var(--line2);
    background:var(--surface2);color:var(--text2);cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 8px 24px -10px rgba(0,0,0,.6)}
  .twk-fab:hover{color:var(--text-hi);border-color:var(--line3)}
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:264px;
    display:flex;flex-direction:column;background:var(--surface);color:var(--text);
    border:1px solid var(--line2);border-radius:12px;
    box-shadow:0 20px 60px -20px rgba(0,0,0,.7);
    font:12px/1.4 var(--sans);overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:11px 10px 11px 14px;border-bottom:1px solid var(--line)}
  .twk-hd b{font-size:12px;font-weight:600}
  .twk-x{appearance:none;border:0;background:transparent;color:var(--text3);
    width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:13px}
  .twk-x:hover{background:var(--surface2);color:var(--text)}
  .twk-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:12px}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
    color:var(--text3)}
  .twk-row{display:flex;flex-direction:column;gap:6px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between}
  .twk-lbl{color:var(--text2);font-weight:500}
  .twk-seg{display:flex;gap:3px;background:var(--surface2);padding:3px;
    border-radius:7px;border:1px solid var(--line)}
  .twk-seg button{flex:1;appearance:none;border:0;background:transparent;color:var(--text3);
    font:inherit;font-weight:500;padding:4px 6px;border-radius:5px;cursor:pointer}
  .twk-seg button.on{background:var(--surface3);color:var(--text-hi)}
  .twk-chips{display:flex;gap:6px}
  .twk-chip{flex:1;height:26px;border:0;border-radius:6px;cursor:pointer;
    box-shadow:0 0 0 1px var(--line2) inset}
  .twk-chip.on{box-shadow:0 0 0 2px var(--text-hi) inset}
  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:var(--line3);cursor:pointer;padding:0}
  .twk-toggle[data-on="1"]{background:var(--ok)}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}
`;

export type Tweaks = {
	density: "compact" | "regular" | "comfy";
	accent: string;
	diffColor: string;
	layout: "default" | "focus";
};

const STORAGE_KEY = "blazediff.review.tweaks";

export function useTweaks(
	defaults: Tweaks,
): [Tweaks, (key: keyof Tweaks, value: string) => void] {
	const [values, setValues] = useState<Tweaks>(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
		} catch {
			return defaults;
		}
	});
	const setTweak = (key: keyof Tweaks, value: string) => {
		setValues((prev) => {
			const next = { ...prev, [key]: value };
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			} catch {
				/* ignore */
			}
			return next;
		});
	};
	return [values, setTweak];
}

export function TweaksPanel({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		const el = document.createElement("style");
		el.textContent = TWEAKS_STYLE;
		document.head.appendChild(el);
		return () => {
			el.remove();
		};
	}, []);

	if (!open) {
		return (
			<button
				className="twk-fab"
				aria-label="Tweaks"
				onClick={() => setOpen(true)}
			>
				<Icons.Settings w={16} h={16} />
			</button>
		);
	}
	return (
		<div className="twk-panel">
			<div className="twk-hd">
				<b>Tweaks</b>
				<button
					className="twk-x"
					aria-label="Close tweaks"
					onClick={() => setOpen(false)}
				>
					✕
				</button>
			</div>
			<div className="twk-body">{children}</div>
		</div>
	);
}

export function TweakSection({ label }: { label: string }) {
	return <div className="twk-sect">{label}</div>;
}

export function TweakRadio({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: string[];
	onChange: (v: string) => void;
}) {
	return (
		<div className="twk-row">
			<span className="twk-lbl">{label}</span>
			<div className="twk-seg">
				{options.map((o) => (
					<button
						key={o}
						type="button"
						className={o === value ? "on" : ""}
						onClick={() => onChange(o)}
					>
						{o}
					</button>
				))}
			</div>
		</div>
	);
}

export function TweakColor({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: string[];
	onChange: (v: string) => void;
}) {
	return (
		<div className="twk-row">
			<span className="twk-lbl">{label}</span>
			<div className="twk-chips" role="radiogroup">
				{options.map((c) => (
					<button
						key={c}
						type="button"
						className={`twk-chip ${c === value ? "on" : ""}`}
						style={{ background: c }}
						aria-label={c}
						onClick={() => onChange(c)}
					/>
				))}
			</div>
		</div>
	);
}

export function TweakToggle({
	label,
	value,
	onChange,
}: {
	label: string;
	value: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div className="twk-row twk-row-h">
			<span className="twk-lbl">{label}</span>
			<button
				type="button"
				className="twk-toggle"
				data-on={value ? "1" : "0"}
				role="switch"
				aria-checked={value}
				onClick={() => onChange(!value)}
			>
				<i />
			</button>
		</div>
	);
}
