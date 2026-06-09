import { createTwoUpEngine } from "@blazediff/ui/engine";
import type React from "react";
import { useEffect } from "react";
import type { TwoUpModeProps } from "./types";
import { useEngine } from "./useEngine";
import { useLatestRef } from "./useLatestRef";

export const TwoUpMode: React.FC<TwoUpModeProps> = ({
	src1,
	src2,
	className,
	containerClassName,
	containerInnerClassName,
	panelClassName,
	imageClassName,
	dimensionInfoClassName,
	onImagesLoaded,
	onLoadError,
}) => {
	const [engine, state] = useEngine(() => createTwoUpEngine({ src1, src2 }));
	const onImagesLoadedRef = useLatestRef(onImagesLoaded);
	const onLoadErrorRef = useLatestRef(onLoadError);

	useEffect(() => {
		engine.setConfig({ src1, src2 });
	}, [engine, src1, src2]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fire once per status transition
	useEffect(() => {
		if (state.status === "ready" && state.dims1 && state.dims2) {
			onImagesLoadedRef.current?.({ image1: state.dims1, image2: state.dims2 });
		} else if (state.status === "error") {
			onLoadErrorRef.current?.(state.error);
		}
	}, [state.status]);

	return (
		<div className={className}>
			<div className={containerClassName}>
				<div className={containerInnerClassName} style={{ display: "flex" }}>
					<div className={panelClassName}>
						<img
							className={imageClassName}
							src={src1}
							crossOrigin="anonymous"
							alt=""
						/>
					</div>
					<div className={panelClassName}>
						<img
							className={imageClassName}
							src={src2}
							crossOrigin="anonymous"
							alt=""
						/>
					</div>
				</div>
				<div className={dimensionInfoClassName}>
					{state.dimensionLabel ?? ""}
				</div>
			</div>
		</div>
	);
};
