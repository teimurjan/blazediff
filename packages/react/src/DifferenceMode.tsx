import type React from "react";
import { useEffect, useRef } from "react";
import "@blazediff/ui/difference-mode";
import type { DifferenceModeProps } from "./types";

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
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const handleDiffComplete = (e: CustomEvent) => {
			onDiffComplete?.(e.detail);
		};

		const handleDiffError = (e: CustomEvent) => {
			onDiffError?.(e.detail.error);
		};

		element.addEventListener(
			"diff-complete",
			handleDiffComplete as EventListener,
		);
		element.addEventListener("diff-error", handleDiffError as EventListener);

		return () => {
			element.removeEventListener(
				"diff-complete",
				handleDiffComplete as EventListener,
			);
			element.removeEventListener(
				"diff-error",
				handleDiffError as EventListener,
			);
		};
	}, [onDiffComplete, onDiffError]);

	return (
		<blazediff-difference
			ref={ref}
			className={className}
			src1={src1}
			src2={src2}
			threshold={String(threshold)}
			include-aa={String(includeAA)}
			alpha={String(alpha)}
			class-container={containerClassName}
			class-canvas={canvasClassName}
		/>
	);
};
