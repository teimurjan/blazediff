import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import Grainient from "./components/Grainient";
import { MacWindow } from "./components/MacWindow";
import { Subtitles } from "./components/Subtitles";
import { DemoScene } from "./scenes/DemoScene";

const WINDOW_WIDTH = 1720;
const WINDOW_HEIGHT = 960;

export const Video: React.FC = () => {
	return (
		<AbsoluteFill>
			<Audio src={staticFile("audio.mp3")} />

			<AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
				<Grainient
					color1="#ec6565"
					color2="#ffb066"
					color3="#eb8947"
					timeSpeed={0.25}
					colorBalance={0}
					warpStrength={1}
					warpFrequency={5}
					warpSpeed={2}
					warpAmplitude={50}
					blendAngle={0}
					blendSoftness={0.05}
					rotationAmount={500}
					noiseScale={2}
					grainAmount={0}
					grainScale={2}
					grainAnimated={false}
					contrast={1.5}
					gamma={1}
					saturation={1}
					centerX={0}
					centerY={0}
					zoom={0.9}
				/>
			</AbsoluteFill>

			{/* Mac window centered */}
			<AbsoluteFill
				style={{
					justifyContent: "center",
					alignItems: "center",
				}}
			>
				<MacWindow width={WINDOW_WIDTH} height={WINDOW_HEIGHT}>
					<AbsoluteFill>
						<Sequence from={0} durationInFrames={756}>
							<DemoScene />
						</Sequence>
					</AbsoluteFill>
					<Subtitles />
				</MacWindow>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
