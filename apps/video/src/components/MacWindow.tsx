import type { ReactNode } from "react";

const BORDER_RADIUS = 12;

interface MacWindowProps {
	children: ReactNode;
	width: number;
	height: number;
}

export const MacWindow: React.FC<MacWindowProps> = ({
	children,
	width,
	height,
}) => {
	return (
		<div
			style={{
				width,
				height,
				borderRadius: BORDER_RADIUS,
				overflow: "hidden",
				display: "flex",
				flexDirection: "column",
				boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
			}}
		>
			{/* Content area */}
			<div
				style={{
					flex: 1,
					backgroundColor: "rgba(10, 10, 10, 0.85)",
					position: "relative",
					overflow: "hidden",
				}}
			>
				{children}
			</div>
		</div>
	);
};
