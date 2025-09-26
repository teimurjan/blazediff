import type React from "react";
import { useEffect, useRef } from "react";
import "@blazediff/ui/swipe-mode";
import type { SwipeModeProps } from "./types";

export const SwipeMode: React.FC<SwipeModeProps> = ({
	src1,
	src2,
	alt1 = "Before",
	alt2 = "After",
	className,
	containerClassName,
	image1ClassName,
	image2ClassName,
	dividerClassName,
	onPositionChange,
}) => {
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const handlePositionChange = (e: CustomEvent) => {
			onPositionChange?.(e.detail.position);
		};

		element.addEventListener(
			"position-change",
			handlePositionChange as EventListener,
		);

		return () => {
			element.removeEventListener(
				"position-change",
				handlePositionChange as EventListener,
			);
		};
	}, [onPositionChange]);

	return (
		<blazediff-swipe
			ref={ref}
			className={className}
			src1={src1}
			src2={src2}
			alt1={alt1}
			alt2={alt2}
			class-container={containerClassName}
			class-image1={image1ClassName}
			class-image2={image2ClassName}
			class-divider={dividerClassName}
		/>
	);
};
