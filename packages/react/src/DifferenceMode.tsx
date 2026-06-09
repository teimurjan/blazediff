import { createDifferenceEngine } from "@blazediff/ui/engine";
import type React from "react";
import { useEffect, useRef } from "react";
import type { DifferenceModeProps } from "./types";
import { useEngine } from "./useEngine";
import { useLatestRef } from "./useLatestRef";

export const DifferenceMode: React.FC<DifferenceModeProps> = ({
	src1,
	src2,
	threshold = 0.1,
	includeAA = false,
	alpha = 0.1,
	className,
	containerClassName,
	canvasClassName,
	onDiffComplete,
	onDiffError,
}) => {
	const [engine, state] = useEngine(() =>
		createDifferenceEngine({ src1, src2, threshold, includeAA, alpha }),
	);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const onDiffCompleteRef = useLatestRef(onDiffComplete);
	const onDiffErrorRef = useLatestRef(onDiffError);

	useEffect(() => {
		engine.setConfig({ src1, src2, threshold, includeAA, alpha });
	}, [engine, src1, src2, threshold, includeAA, alpha]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (state.status !== "ready" || !state.diff || !canvas) return;
		const ctx = canvas.getContext("2d");
		canvas.width = state.diff.width;
		canvas.height = state.diff.height;
		ctx?.putImageData(
			new ImageData(
				state.diff.output as Uint8ClampedArray<ArrayBuffer>,
				state.diff.width,
				state.diff.height,
			),
			0,
			0,
		);
	}, [state.status, state.diff]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fire once per status transition
	useEffect(() => {
		if (state.status === "ready" && state.diff) {
			onDiffCompleteRef.current?.({
				diffCount: state.diff.diffCount,
				totalPixels: state.diff.totalPixels,
				percentage: state.diff.percentage,
			});
		} else if (state.status === "error") {
			onDiffErrorRef.current?.(state.error);
		}
	}, [state.status]);

	return (
		<div className={className}>
			<div className={containerClassName}>
				<canvas ref={canvasRef} className={canvasClassName} />
			</div>
		</div>
	);
};
