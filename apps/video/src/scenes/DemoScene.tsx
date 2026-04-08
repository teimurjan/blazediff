import {
	AbsoluteFill,
	Easing,
	Img,
	interpolate,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import interpretData from "../../public/interpret-data.json";
import { CarRace } from "../components/CarRace";
import { RegionCard } from "../components/RegionCard";
import { RegionSpotlight } from "../components/RegionSpotlight";
import { useDiffComputation } from "../hooks/use-diff-computation";
import { COLORS, FONT_MONO } from "../styles";
import type { InterpretResult } from "../types";

const PRODUCT_NAME = "BlazeDiff";

const IMG_WIDTH = 500;
const IMG_HEIGHT = 500;

const FRAMES_PER_REGION = 24;
const MAX_REGIONS = 5;

const interpret = interpretData as InterpretResult;

const ease = Easing.out(Easing.cubic);
const easeIn = Easing.in(Easing.cubic);

export const DemoScene: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const diff = useDiffComputation("3a.png", "3b.png");

	// ─── PHASE 1: HEADER ─────────────────────────────────────────

	const logoOpacity = interpolate(frame, [0, 30], [0, 1], {
		extrapolateRight: "clamp",
		easing: ease,
	});
	const logoScale = spring({
		frame,
		fps,
		config: { damping: 15, stiffness: 60, mass: 0.8 },
	});

	const textOpacity = interpolate(frame, [20, 45], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: ease,
	});

	const headerY = spring({
		frame: Math.max(0, frame - 55),
		fps,
		from: 0,
		to: -340,
		config: { damping: 20, stiffness: 60, mass: 0.8 },
	});
	const headerScale = interpolate(frame, [55, 90], [1, 0.55], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: ease,
	});

	// ─── PHASE 2: DIFF DEMO ──────────────────────────────────────

	const imgAEnter = interpolate(frame, [55, 105], [-600, -280], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.out(Easing.exp),
	});
	const imgAOpacity = interpolate(frame, [55, 85], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: ease,
	});

	const imgBEnter = interpolate(frame, [55, 105], [600, 280], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.out(Easing.exp),
	});
	const imgBOpacity = interpolate(frame, [55, 85], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: ease,
	});

	// Converge + crossfade (frames 135-185)
	const converge = interpolate(frame, [135, 185], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.inOut(Easing.cubic),
	});
	const imgAX =
		frame < 135 ? imgAEnter : interpolate(converge, [0, 1], [-280, 0]);
	const imgBX =
		frame < 135 ? imgBEnter : interpolate(converge, [0, 1], [280, 0]);
	const sourceFade = interpolate(converge, [0, 0.7, 1], [1, 1, 0]);
	const diffFadeIn = interpolate(converge, [0.6, 1], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	const showDiff = converge > 0.6;

	// Stats
	const statsProgress = spring({
		frame: Math.max(0, frame - 200),
		fps,
		config: { damping: 18, stiffness: 70, mass: 0.6 },
	});
	const statsTranslateY = interpolate(statsProgress, [0, 1], [16, 0]);

	// Diff fade out (frames 245-275)
	const diffFadeOut = interpolate(frame, [245, 275], [1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: easeIn,
	});

	const sourceImagesVisible = frame >= 55 && sourceFade > 0;
	const diffResultVisible = showDiff && frame < 275;

	// Header fades out with the diff
	const headerFadeOut = interpolate(frame, [245, 275], [1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: easeIn,
	});
	const headerVisible = frame < 275;

	// ─── PHASE 3: CAR RACES ─────────────────────────────────────

	const racesVisible = frame >= 280 && frame < 475;

	const racesFadeIn = interpolate(frame, [280, 310], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: ease,
	});
	const racesFadeOut = interpolate(frame, [445, 475], [1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: easeIn,
	});

	// ─── PHASE 4: INTERPRET ──────────────────────────────────────

	const interpretVisible = frame >= 480;

	const interpretFadeIn = interpolate(frame, [480, 510], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: ease,
	});

	const overlayOpacity = interpretFadeIn;

	const cyclingFrame = frame - 480;
	const displayRegions = interpret.regions.slice(0, MAX_REGIONS);
	const activeIndex =
		frame >= 480
			? Math.floor(cyclingFrame / FRAMES_PER_REGION) % displayRegions.length
			: null;

	const activeRegion =
		activeIndex !== null ? displayRegions[activeIndex] : null;
	const prevIndex =
		activeIndex !== null && activeIndex > 0
			? activeIndex - 1
			: displayRegions.length - 1;
	const prevRegion = activeIndex !== null ? displayRegions[prevIndex] : null;

	const regionLocalFrame =
		activeIndex !== null
			? cyclingFrame -
				Math.floor(cyclingFrame / FRAMES_PER_REGION) * FRAMES_PER_REGION
			: 0;
	const regionTransition = interpolate(regionLocalFrame, [0, 18], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: Easing.inOut(Easing.cubic),
	});
	const cardOpacity = activeRegion
		? interpolate(regionLocalFrame, [0, 14], [0, 1], {
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
				easing: ease,
			})
		: 0;

	// Final fade out
	const endFade = interpolate(frame, [726, 755], [1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: easeIn,
	});

	return (
		<AbsoluteFill style={{ opacity: interpretVisible ? endFade : 1 }}>
			{/* ─── HEADER ─── */}
			{headerVisible && (
				<div
					style={{
						position: "absolute",
						top: "50%",
						left: "50%",
						transform: `translate(-50%, -50%) translateY(${headerY}px) scale(${headerScale})`,
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						zIndex: 10,
						opacity: headerFadeOut,
					}}
				>
					<Img
						src={staticFile("logo.png")}
						style={{
							width: 208,
							height: "auto",
							opacity: logoOpacity,
							transform: `scale(${logoScale})`,
						}}
					/>
					<div
						style={{
							marginLeft: 32,
							fontFamily: FONT_MONO,
							fontSize: 83,
							fontWeight: 700,
							color: COLORS.text,
							letterSpacing: 2,
							whiteSpace: "nowrap",
							opacity: textOpacity,
						}}
					>
						{PRODUCT_NAME}
					</div>
				</div>
			)}

			{/* ─── CONTENT AREA ─── */}
			<AbsoluteFill
				style={{
					justifyContent: "center",
					alignItems: "center",
				}}
			>
				{/* ─── PHASE 2: SOURCE IMAGES ─── */}
				{sourceImagesVisible && (
					<>
						<div
							style={{
								position: "absolute",
								zIndex: 1,
								transform: `translateX(${imgAX}px)`,
								opacity: imgAOpacity * sourceFade,
							}}
						>
							<Img
								src={staticFile("3a.png")}
								style={{
									width: IMG_WIDTH,
									height: IMG_HEIGHT,
									borderRadius: 12,
									objectFit: "cover",
								}}
							/>
							<p
								style={{
									position: "absolute",
									left: 0,
									right: 0,
									top: IMG_HEIGHT + 12,
									textAlign: "center",
									color: COLORS.textMuted,
									fontSize: 48,
									fontFamily: FONT_MONO,
									margin: 0,
								}}
							>
								Original
							</p>
						</div>

						<div
							style={{
								position: "absolute",
								zIndex: 2,
								transform: `translateX(${imgBX}px)`,
								opacity: imgBOpacity * sourceFade,
							}}
						>
							<Img
								src={staticFile("3b.png")}
								style={{
									width: IMG_WIDTH,
									height: IMG_HEIGHT,
									borderRadius: 12,
									objectFit: "cover",
								}}
							/>
							<p
								style={{
									position: "absolute",
									left: 0,
									right: 0,
									top: IMG_HEIGHT + 12,
									textAlign: "center",
									color: COLORS.textMuted,
									fontSize: 48,
									fontFamily: FONT_MONO,
									margin: 0,
								}}
							>
								Modified
							</p>
						</div>
					</>
				)}

				{/* ─── PHASE 2: DIFF RESULT ─── */}
				{diffResultVisible && diff && (
					<div
						style={{
							position: "absolute",
							width: "100%",
							height: "100%",
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							opacity: frame >= 245 ? diffFadeOut : diffFadeIn,
						}}
					>
						<div style={{ position: "absolute", zIndex: 3 }}>
							{/* biome-ignore lint/a11y/useAltText: data URL */}
							<img
								src={diff.diffImageUrl}
								style={{
									width: IMG_WIDTH,
									height: IMG_HEIGHT,
									borderRadius: 12,
									objectFit: "cover",
								}}
							/>
						</div>

						<div
							style={{
								position: "absolute",
								zIndex: 3,
								top: `calc(50% + ${IMG_HEIGHT / 2 + 12}px)`,
								opacity: statsProgress,
								transform: `translateY(${statsTranslateY}px)`,
								fontFamily: FONT_MONO,
								fontSize: 48,
								color: COLORS.textMuted,
								textAlign: "center",
							}}
						>
							<span style={{ color: COLORS.text, fontWeight: 600 }}>
								{diff.diffPixels.toLocaleString()}
							</span>{" "}
							different pixels ({diff.percentage}%)
						</div>
					</div>
				)}

				{/* ─── PHASE 3: CAR RACES ─── */}
				{racesVisible && (
					<div
						style={{
							display: "flex",
							gap: 256,
							alignItems: "flex-end",
							position: "absolute",
							bottom: 160,
							opacity: frame >= 445 ? racesFadeOut : racesFadeIn,
						}}
					>
						<CarRace
							frame={frame}
							raceStart={310}
							raceEnd={400}
							fastLabel={
								<span
									style={{ display: "flex", alignItems: "center", gap: 16 }}
								>
									<Img
										src={staticFile("logo.png")}
										style={{ width: 96, height: "auto" }}
									/>
									core
								</span>
							}
							slowLabel="pixelmatch"
							slowStopPercent={0.4}
							cars={["audi", "porsche"]}
						/>
						<CarRace
							frame={frame}
							raceStart={310}
							raceEnd={400}
							fastLabel={
								<span
									style={{ display: "flex", alignItems: "center", gap: 16 }}
								>
									<Img
										src={staticFile("logo.png")}
										style={{ width: 96, height: "auto" }}
									/>
									native
								</span>
							}
							slowLabel="odiff"
							slowStopPercent={0.55}
							cars={["aston-martin", "porsche"]}
						/>
					</div>
				)}

				{/* ─── PHASE 4: INTERPRET ─── */}
				{interpretVisible && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							gap: 24,
							opacity: interpretFadeIn,
						}}
					>
						{/* Image pair — same size as diff scene */}
						<div style={{ display: "flex", gap: 32 }}>
							<div>
								<div
									style={{
										position: "relative",
										overflow: "hidden",
										borderRadius: 12,
									}}
								>
									<Img
										src={staticFile("3a.png")}
										style={{
											width: IMG_WIDTH,
											height: IMG_HEIGHT,
											objectFit: "cover",
										}}
									/>
									{activeRegion && (
										<RegionSpotlight
											bbox={activeRegion.bbox}
											prevBbox={prevRegion?.bbox ?? null}
											imageWidth={interpret.width}
											imageHeight={interpret.height}
											transitionProgress={regionTransition}
											overlayOpacity={overlayOpacity}
										/>
									)}
								</div>
							</div>

							<div>
								<div
									style={{
										position: "relative",
										overflow: "hidden",
										borderRadius: 12,
									}}
								>
									<Img
										src={staticFile("3b.png")}
										style={{
											width: IMG_WIDTH,
											height: IMG_HEIGHT,
											objectFit: "cover",
										}}
									/>
									{activeRegion && (
										<RegionSpotlight
											bbox={activeRegion.bbox}
											prevBbox={prevRegion?.bbox ?? null}
											imageWidth={interpret.width}
											imageHeight={interpret.height}
											transitionProgress={regionTransition}
											overlayOpacity={overlayOpacity}
										/>
									)}
								</div>
							</div>
						</div>

						{/* Region card — full width below */}
						<div style={{ width: IMG_WIDTH * 2 + 32 }}>
							<RegionCard
								region={activeRegion ?? displayRegions[0]}
								contentOpacity={cardOpacity}
							/>
						</div>
					</div>
				)}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
