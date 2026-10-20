export type ViewMode = "side-by-side" | "swipe" | "difference";

const VIEWS: [ViewMode, string][] = [
	["side-by-side", "Side by side"],
	["swipe", "Swipe"],
	["difference", "Difference"],
];

export function ViewSelect({
	name,
	value,
	onChange,
}: {
	/** Radio group name; must be unique per select on the page. */
	name: string;
	value: ViewMode;
	onChange: (view: ViewMode) => void;
}) {
	return (
		<fieldset className="inline-flex self-start rounded-lg bg-well p-0.5">
			<legend className="sr-only">View</legend>
			{VIEWS.map(([view, label]) => (
				<label
					key={view}
					className="cursor-pointer rounded-md px-2.5 py-1 text-[13px] leading-5 font-medium text-muted has-checked:bg-white has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-ink"
				>
					<input
						type="radio"
						name={name}
						value={view}
						checked={value === view}
						onChange={() => onChange(view)}
						className="sr-only"
					/>
					{label}
				</label>
			))}
		</fieldset>
	);
}
