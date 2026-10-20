import {
	createTwoUpEngine,
	DEFAULT_ZOOM_SIZE,
	type Dimensions,
	placeZoomPopup,
	type TwoUpEngine,
	type TwoUpZoom,
	toTwoUpHover,
	zoomPaneStyle,
} from "@blazediff/ui/engine";
import type React from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { TwoUpModeProps } from "./types";
import { useEngine } from "./useEngine";
import { useImageSourceUrl } from "./useImageSourceUrl";
import { useLatestRef } from "./useLatestRef";

interface ZoomPane {
	src: string;
	natural: Dimensions;
}

interface ZoomPopupProps {
	zoom: TwoUpZoom;
	scale: number;
	size: number;
	pane1: ZoomPane;
	pane2: ZoomPane;
	className?: string;
	panelClassName?: string;
}

const ZoomPopup: React.FC<ZoomPopupProps> = ({
	zoom,
	scale,
	size,
	pane1,
	pane2,
	className,
	panelClassName,
}) => {
	const ref = useRef<HTMLDivElement>(null);

	// Placement needs the rendered popup size, so it runs after layout.
	useLayoutEffect(() => {
		const popup = ref.current;
		if (!popup) return;
		const position = placeZoomPopup(
			zoom.anchor,
			{ width: popup.offsetWidth, height: popup.offsetHeight },
			{ width: window.innerWidth, height: window.innerHeight },
		);
		popup.style.left = `${position.x}px`;
		popup.style.top = `${position.y}px`;
	}, [zoom.anchor]);

	return createPortal(
		<div
			ref={ref}
			className={className}
			style={{
				position: "fixed",
				pointerEvents: "none",
				zIndex: 1000,
				display: "flex",
			}}
		>
			<div
				className={panelClassName}
				style={zoomPaneStyle(pane1.src, pane1.natural, zoom.point, scale, size)}
			/>
			<div
				className={panelClassName}
				style={zoomPaneStyle(pane2.src, pane2.natural, zoom.point, scale, size)}
			/>
		</div>,
		document.body,
	);
};

function hoverHandler(engine: TwoUpEngine, image: 1 | 2, enabled: boolean) {
	return (event: React.PointerEvent<HTMLImageElement>) => {
		if (!enabled) return;
		const hover = toTwoUpHover(
			image,
			event,
			event.currentTarget.getBoundingClientRect(),
		);
		if (hover) engine.actions.hover(hover);
	};
}

export const TwoUpMode: React.FC<TwoUpModeProps> = ({
	src1,
	src2,
	className,
	containerClassName,
	containerInnerClassName,
	panelClassName,
	imageClassName,
	dimensionInfoClassName,
	zoom,
	zoomSize = DEFAULT_ZOOM_SIZE,
	zoomClassName,
	zoomPanelClassName,
	onImagesLoaded,
	onLoadError,
}) => {
	const src1Url = useImageSourceUrl(src1);
	const src2Url = useImageSourceUrl(src2);
	const [engine, state] = useEngine(() => createTwoUpEngine({ src1, src2 }));
	const onImagesLoadedRef = useLatestRef(onImagesLoaded);
	const onLoadErrorRef = useLatestRef(onLoadError);
	const zoomEnabled = !!zoom;

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

	const onLeave = () => engine.actions.leave();

	return (
		<div className={className}>
			<div className={containerClassName}>
				<div className={containerInnerClassName} style={{ display: "flex" }}>
					<div className={panelClassName}>
						<img
							className={imageClassName}
							src={src1Url}
							crossOrigin="anonymous"
							alt=""
							onPointerMove={hoverHandler(engine, 1, zoomEnabled)}
							onPointerLeave={onLeave}
						/>
					</div>
					<div className={panelClassName}>
						<img
							className={imageClassName}
							src={src2Url}
							crossOrigin="anonymous"
							alt=""
							onPointerMove={hoverHandler(engine, 2, zoomEnabled)}
							onPointerLeave={onLeave}
						/>
					</div>
				</div>
				<div className={dimensionInfoClassName}>
					{state.dimensionLabel ?? ""}
				</div>
			</div>
			{zoom &&
				state.zoom &&
				state.dims1 &&
				state.dims2 &&
				src1Url &&
				src2Url && (
					<ZoomPopup
						zoom={state.zoom}
						scale={zoom}
						size={zoomSize}
						pane1={{ src: src1Url, natural: state.dims1 }}
						pane2={{ src: src2Url, natural: state.dims2 }}
						className={zoomClassName}
						panelClassName={zoomPanelClassName}
					/>
				)}
		</div>
	);
};
