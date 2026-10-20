"use client";

import { useId } from "react";
import {
	ALGORITHMS,
	type Algorithm,
	miloSeconds,
	usesThreshold,
} from "./algorithms";
import type { Size } from "./image-header";

export interface Settings {
	algorithm: Algorithm;
	threshold: number;
	interpret: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
	algorithm: "pixel",
	threshold: 0.1,
	interpret: true,
};

export default function SettingsStep({
	settings,
	size,
	onChange,
	onCompare,
}: {
	settings: Settings;
	size: Size;
	onChange: (settings: Settings) => void;
	onCompare: () => void;
}) {
	const name = useId();
	const thresholdId = useId();
	const interpretId = useId();
	const update = (patch: Partial<Settings>) =>
		onChange({ ...settings, ...patch });

	return (
		<div className="space-y-6">
			<fieldset className="space-y-2">
				<legend className="mb-2 font-mono text-sm text-muted">Algorithm</legend>
				<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
					{ALGORITHMS.map((info) => {
						const checked = settings.algorithm === info.id;
						return (
							<label
								key={info.id}
								className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
									checked
										? "border-accent bg-accent/10"
										: "border-line hover:border-accent/60"
								}`}
							>
								<input
									type="radio"
									name={name}
									value={info.id}
									checked={checked}
									onChange={() => update({ algorithm: info.id })}
									className="mt-1 accent-accent"
								/>
								<span className="space-y-1">
									<span className="block text-sm font-medium text-fg">
										{info.label}
										{info.id === "milo" && (
											<span className="ml-2 font-mono text-xs text-muted">
												about {miloSeconds(size)} s
											</span>
										)}
									</span>
									<span className="block text-sm text-muted">
										{info.description}
									</span>
								</span>
							</label>
						);
					})}
				</div>
			</fieldset>

			<label
				htmlFor={interpretId}
				className="flex cursor-pointer items-start gap-3"
			>
				<input
					id={interpretId}
					type="checkbox"
					checked={settings.interpret}
					onChange={(event) => update({ interpret: event.target.checked })}
					className="mt-1 accent-accent"
				/>
				<span className="space-y-1">
					<span className="block text-sm font-medium text-fg">Interpret</span>
					<span className="block text-sm text-muted">
						Group the changed pixels into regions and classify each one: color
						change, content change, shift, addition or deletion.
					</span>
				</span>
			</label>

			{usesThreshold(settings.algorithm, settings.interpret) && (
				<div className="max-w-sm space-y-1">
					<label
						htmlFor={thresholdId}
						className="flex justify-between font-mono text-sm text-muted"
					>
						<span>Threshold</span>
						<span className="text-fg">{settings.threshold.toFixed(2)}</span>
					</label>
					<input
						id={thresholdId}
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={settings.threshold}
						onChange={(event) =>
							update({ threshold: Number(event.target.value) })
						}
						className="w-full accent-accent"
					/>
					<p className="text-xs text-muted">
						Color difference that counts as a change. Lower is stricter.
					</p>
				</div>
			)}

			<button
				type="button"
				onClick={onCompare}
				className="rounded-lg bg-accent px-4 py-2 font-mono text-sm text-canvas"
			>
				Compare
			</button>
		</div>
	);
}
