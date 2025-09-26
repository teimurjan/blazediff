import type React from "react";
import { useEffect, useRef } from "react";
import "@blazediff/ui/onion-skin-mode";
import type { OnionSkinModeProps } from "./types";

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
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const handleOpacityChange = (e: CustomEvent) => {
			onOpacityChange?.(e.detail.opacity);
		};

		const handleImagesLoaded = (e: CustomEvent) => {
			onImagesLoaded?.(e.detail);
		};

		const handleLoadError = (e: CustomEvent) => {
			onLoadError?.(e.detail.error);
		};

		element.addEventListener(
			"opacity-change",
			handleOpacityChange as EventListener,
		);
		element.addEventListener(
			"images-loaded",
			handleImagesLoaded as EventListener,
		);
		element.addEventListener("load-error", handleLoadError as EventListener);

		return () => {
			element.removeEventListener(
				"opacity-change",
				handleOpacityChange as EventListener,
			);
			element.removeEventListener(
				"images-loaded",
				handleImagesLoaded as EventListener,
			);
			element.removeEventListener(
				"load-error",
				handleLoadError as EventListener,
			);
		};
	}, [onOpacityChange, onImagesLoaded, onLoadError]);

	return (
		<blazediff-onionskin
			ref={ref}
			className={className}
			src1={src1}
			src2={src2}
			opacity={String(opacity)}
			class-container={containerClassName}
			class-image-container={imageContainerClassName}
			class-image={imageClassName}
			class-slider-container={sliderContainerClassName}
			class-slider={sliderClassName}
			class-slider-label={sliderLabelClassName}
			text-slider-label={sliderLabelText}
		/>
	);
};
