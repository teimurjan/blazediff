import type { Caption } from "@remotion/captions";
import { parseSrt } from "@remotion/captions";
import { useCallback, useEffect, useState } from "react";
import {
	continueRender,
	delayRender,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { COLORS, FONT_MONO } from "../styles";

export const Subtitles: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const [captions, setCaptions] = useState<Caption[] | null>(null);
	const [handle] = useState(() => delayRender("Loading subtitles..."));

	const fetchCaptions = useCallback(async () => {
		const response = await fetch(staticFile("subtitiles.srt"));
		const text = await response.text();
		const { captions: parsed } = parseSrt({ input: text });
		setCaptions(parsed);
		continueRender(handle);
	}, [handle]);

	useEffect(() => {
		fetchCaptions();
	}, [fetchCaptions]);

	if (!captions) return null;

	const currentTimeMs = (frame / fps) * 1000;
	const activeCaption = captions.find(
		(c) => currentTimeMs >= c.startMs && currentTimeMs < c.endMs,
	);

	if (!activeCaption) return null;

	return (
		<div
			style={{
				position: "absolute",
				bottom: 32,
				left: 0,
				right: 0,
				display: "flex",
				justifyContent: "center",
				zIndex: 20,
			}}
		>
			<div
				style={{
					backgroundColor: "rgba(0, 0, 0, 0.75)",
					padding: "8px 24px",
					borderRadius: 8,
					fontFamily: FONT_MONO,
					fontSize: 32,
					color: COLORS.text,
					textAlign: "center",
					maxWidth: "80%",
					lineHeight: 1.4,
				}}
			>
				{activeCaption.text}
			</div>
		</div>
	);
};
