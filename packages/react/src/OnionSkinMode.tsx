import { createOnionSkinEngine, normalizedOpacity } from "@blazediff/ui/engine";
import type React from "react";
import { useEffect, useRef } from "react";
import type { OnionSkinModeProps } from "./types";
import { useEngine } from "./useEngine";

export const OnionSkinMode: React.FC<OnionSkinModeProps> = ({
	src1,
	src2,
	opacity = 50,
	className,
	containerClassName,
	imageContainerClassName,
	imageClassName,
	sliderContainerClassName,
	sliderClassName,
	sliderLabelClassName,
	sliderLabelText,
	onOpacityChange,
	onImagesLoaded,
	onLoadError,
}) => {
	const [engine, state] = useEngine(() =>
		createOnionSkinEngine({ src1, src2 }, opacity),
	);
	const isFirstOpacity = useRef(true);

	useEffect(() => {
		engine.setConfig({ src1, src2 });
	}, [engine, src1, src2]);

	useEffect(() => {
		engine.actions.setOpacity(opacity);
	}, [engine, opacity]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fire only on opacity change, skip initial
	useEffect(() => {
		if (isFirstOpacity.current) {
			isFirstOpacity.current = false;
			return;
		}
		onOpacityChange?.(state.opacity);
	}, [state.opacity]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fire once per status transition
	useEffect(() => {
		if (state.status === "ready" && state.dims1 && state.dims2) {
			onImagesLoaded?.({ image1: state.dims1, image2: state.dims2 });
		} else if (state.status === "error") {
			onLoadError?.(state.error);
		}
	}, [state.status]);

	return (
		<div className={className}>
			<div className={containerClassName}>
				<div
					className={imageContainerClassName}
					style={{ position: "relative" }}
				>
					<img
						className={imageClassName}
						src={src1}
						crossOrigin="anonymous"
						alt=""
					/>
					<img
						className={imageClassName}
						src={src2}
						crossOrigin="anonymous"
						alt=""
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							opacity: normalizedOpacity(state.opacity),
						}}
					/>
				</div>
				<div className={sliderContainerClassName}>
					{/* biome-ignore lint/a11y/noLabelWithoutControl: range input is the next sibling */}
					<label className={sliderLabelClassName}>
						{sliderLabelText ?? "Opacity:"}
					</label>
					<input
						className={sliderClassName}
						type="range"
						min={0}
						max={100}
						value={state.opacity}
						onChange={(e) => engine.actions.setOpacity(Number(e.target.value))}
					/>
				</div>
			</div>
		</div>
	);
};
