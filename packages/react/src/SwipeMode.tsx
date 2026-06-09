import { createSwipeEngine } from "@blazediff/ui/engine";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import type { SwipeModeProps } from "./types";
import { useEngine } from "./useEngine";
import { useLatestRef } from "./useLatestRef";

const sharedImageStyle: React.CSSProperties = {
	width: "100%",
	height: "100%",
	objectFit: "contain",
	pointerEvents: "none",
};

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
	const [engine, state] = useEngine(() => createSwipeEngine(50));
	const containerRef = useRef<HTMLDivElement>(null);
	const isFirstPosition = useRef(true);
	const onPositionChangeRef = useLatestRef(onPositionChange);

	const percentFromClientX = useCallback((clientX: number) => {
		const el = containerRef.current;
		if (!el) return 0;
		const rect = el.getBoundingClientRect();
		if (rect.width === 0) return 0;
		return ((clientX - rect.left) / rect.width) * 100;
	}, []);

	useEffect(() => {
		if (!state.isDragging) return;
		const onMouseMove = (e: MouseEvent) =>
			engine.actions.move(percentFromClientX(e.clientX));
		const onMouseUp = () => engine.actions.end();
		const onTouchMove = (e: TouchEvent) =>
			engine.actions.move(percentFromClientX(e.touches[0].clientX));
		const onTouchEnd = () => engine.actions.end();
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
		document.addEventListener("touchmove", onTouchMove);
		document.addEventListener("touchend", onTouchEnd);
		return () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			document.removeEventListener("touchmove", onTouchMove);
			document.removeEventListener("touchend", onTouchEnd);
		};
	}, [state.isDragging, engine, percentFromClientX]);

	useEffect(() => {
		if (isFirstPosition.current) {
			isFirstPosition.current = false;
			return;
		}
		onPositionChangeRef.current?.(state.position);
	}, [state.position, onPositionChangeRef]);

	return (
		<div className={className}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag surface */}
			<div
				ref={containerRef}
				className={containerClassName}
				style={{
					position: "relative",
					overflow: "hidden",
					cursor: "ew-resize",
					userSelect: "none",
					WebkitUserSelect: "none",
				}}
				onMouseDown={(e) => engine.actions.start(percentFromClientX(e.clientX))}
				onTouchStart={(e) =>
					engine.actions.start(percentFromClientX(e.touches[0].clientX))
				}
			>
				<img
					className={image1ClassName}
					src={src1}
					alt={alt1}
					style={sharedImageStyle}
				/>
				<img
					className={image2ClassName}
					src={src2}
					alt={alt2}
					style={{
						...sharedImageStyle,
						position: "absolute",
						top: 0,
						left: 0,
						clipPath: `inset(0 0 0 ${state.position}%)`,
					}}
				/>
				<div
					className={dividerClassName}
					style={{
						position: "absolute",
						top: 0,
						bottom: 0,
						left: `${state.position}%`,
						width: 2,
						backgroundColor: "white",
						cursor: "ew-resize",
						zIndex: 10,
					}}
				/>
			</div>
		</div>
	);
};
