import type { ReactNode } from "react";
import { Easing, Img, interpolate, staticFile } from "remotion";
import { COLORS, FONT_MONO } from "../styles";

const CAR_WIDTH = 240;
const TRACK_HEIGHT = 360;

type Car = "porsche" | "aston-martin" | "audi";

interface CarRaceProps {
	frame: number;
	raceStart: number;
	raceEnd: number;
	fastLabel: ReactNode;
	slowLabel: ReactNode;
	slowStopPercent: number;
	cars: [Car, Car];
}

export const CarRace: React.FC<CarRaceProps> = ({
	frame,
	raceStart,
	raceEnd,
	fastLabel,
	slowLabel,
	slowStopPercent,
	cars,
}) => {
	const raceDuration = raceEnd - raceStart;
	const slowStopFrame = raceStart + raceDuration * 0.65;

	const fastProgress = interpolate(frame, [raceStart, raceEnd], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.out(Easing.cubic),
	});

	const slowProgress = interpolate(
		frame,
		[raceStart, slowStopFrame],
		[0, slowStopPercent],
		{
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
			easing: Easing.out(Easing.cubic),
		},
	);

	const fastY = fastProgress * TRACK_HEIGHT;
	const slowY = slowProgress * TRACK_HEIGHT;

	return (
		<div
			style={{
				display: "flex",
				alignItems: "flex-end",
				gap: 0,
			}}
		>
			{/* Slow lane (car + label) */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					width: CAR_WIDTH,
				}}
			>
				<div
					style={{
						width: CAR_WIDTH,
						height: TRACK_HEIGHT,
						position: "relative",
					}}
				>
					<Img
						src={staticFile(`${cars[0]}.png`)}
						style={{
							width: CAR_WIDTH,
							height: "auto",
							position: "absolute",
							bottom: 0,
							transform: `translateY(-${slowY}px)`,
						}}
					/>
				</div>
				<div
					style={{
						marginTop: 16,
						textAlign: "center",
						fontFamily: FONT_MONO,
						fontSize: 45,
						color: COLORS.textMuted,
						height: 80,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					{slowLabel}
				</div>
			</div>

			{/* Separator */}
			<div
				style={{
					borderRight: `8px dashed ${COLORS.textMuted}`,
					height: TRACK_HEIGHT * 2,
					margin: "0 56px",
					flexShrink: 0,
					alignSelf: "flex-end",
				}}
			/>

			{/* Fast lane (car + label) */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					width: CAR_WIDTH,
				}}
			>
				<div
					style={{
						width: CAR_WIDTH,
						height: TRACK_HEIGHT,
						position: "relative",
					}}
				>
					<Img
						src={staticFile(`${cars[1]}.png`)}
						style={{
							width: CAR_WIDTH,
							height: "auto",
							position: "absolute",
							bottom: 0,
							transform: `translateY(-${fastY}px)`,
						}}
					/>
				</div>
				<div
					style={{
						marginTop: 16,
						textAlign: "center",
						fontFamily: FONT_MONO,
						fontSize: 45,
						color: COLORS.text,
						height: 80,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					{fastLabel}
				</div>
			</div>
		</div>
	);
};
