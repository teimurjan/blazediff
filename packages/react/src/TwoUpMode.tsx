import type React from "react";
import { useEffect, useRef } from "react";
import "@blazediff/ui/two-up-mode";
import type { TwoUpModeProps } from "./types";

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
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const handleImagesLoaded = (e: CustomEvent) => {
			onImagesLoaded?.(e.detail);
		};

		const handleLoadError = (e: CustomEvent) => {
			onLoadError?.(e.detail.error);
		};

		element.addEventListener(
			"images-loaded",
			handleImagesLoaded as EventListener,
		);
		element.addEventListener("load-error", handleLoadError as EventListener);

		return () => {
			element.removeEventListener(
				"images-loaded",
				handleImagesLoaded as EventListener,
			);
			element.removeEventListener(
				"load-error",
				handleLoadError as EventListener,
			);
		};
	}, [onImagesLoaded, onLoadError]);

	return (
		<blazediff-twoup
			ref={ref}
			className={className}
			src1={src1}
			src2={src2}
			class-container={containerClassName}
			class-container-inner={containerInnerClassName}
			class-panel={panelClassName}
			class-image={imageClassName}
			class-dimension-info={dimensionInfoClassName}
		/>
	);
};
