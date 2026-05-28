// Minimal stroked icons. No fills, 14px default, currentColor.
import type { CSSProperties } from "react";

interface IconProps {
	w?: number;
	h?: number;
	fill?: string;
	style?: CSSProperties;
}

const Ic = ({
	d,
	w = 14,
	h = 14,
	fill,
	...p
}: IconProps & { d: string | string[] }) => (
	<svg
		viewBox="0 0 24 24"
		className="ic-svg"
		style={{ width: w, height: h, ...p.style }}
	>
		{Array.isArray(d) ? (
			d.map((x, i) => <path key={i} d={x} fill={fill || "none"} />)
		) : (
			<path d={d} fill={fill || "none"} />
		)}
	</svg>
);

export const Icons = {
	Sparkle: (p: IconProps) => (
		<Ic
			{...p}
			d={[
				"M12 3v6",
				"M12 15v6",
				"M3 12h6",
				"M15 12h6",
				"M5.6 5.6l3 3",
				"M15.4 15.4l3 3",
				"M18.4 5.6l-3 3",
				"M8.6 15.4l-3 3",
			]}
		/>
	),
	Layers: (p: IconProps) => (
		<Ic
			{...p}
			d={["M12 3 3 8l9 5 9-5-9-5Z", "M3 13l9 5 9-5", "M3 18l9 5 9-5"]}
		/>
	),
	Slider: (p: IconProps) => <Ic {...p} d={["M3 12h18", "M12 3v18"]} />,
	Diff: (p: IconProps) => (
		<Ic {...p} d={["M5 4h9l5 5v11H5z", "M14 4v5h5", "M9 13h6", "M9 17h6"]} />
	),
	Flip: (p: IconProps) => (
		<Ic
			{...p}
			d={[
				"M3 12a9 9 0 0 1 14.5-7.1L21 8",
				"M21 4v4h-4",
				"M21 12a9 9 0 0 1-14.5 7.1L3 16",
				"M3 20v-4h4",
			]}
		/>
	),
	Check: (p: IconProps) => <Ic {...p} d="M5 12l4.5 4.5L19 7" />,
	X: (p: IconProps) => <Ic {...p} d={["M6 6l12 12", "M18 6 6 18"]} />,
	ChevR: (p: IconProps) => <Ic {...p} d="M9 6l6 6-6 6" />,
	Focus: (p: IconProps) => (
		<Ic
			{...p}
			d={[
				"M3 8V5a2 2 0 0 1 2-2h3",
				"M21 8V5a2 2 0 0 0-2-2h-3",
				"M3 16v3a2 2 0 0 0 2 2h3",
				"M21 16v3a2 2 0 0 1-2 2h-3",
				"M9 12h6",
				"M12 9v6",
			]}
		/>
	),
	Kbd: (p: IconProps) => (
		<Ic
			{...p}
			d={[
				"M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
				"M7 10h.01",
				"M11 10h.01",
				"M15 10h.01",
				"M7 14h10",
			]}
		/>
	),
	Branch: (p: IconProps) => (
		<Ic
			{...p}
			d={[
				"M6 3v18",
				"M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
				"M6 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
				"M18 9v4a3 3 0 0 1-3 3H9",
			]}
		/>
	),
	Spark: (p: IconProps) => (
		<Ic
			{...p}
			d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z"
		/>
	),
	Settings: (p: IconProps) => (
		<Ic
			{...p}
			d={[
				"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
				"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
			]}
		/>
	),
};
