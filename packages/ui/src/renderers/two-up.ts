import { bindImageSource } from "../engine/image";
import { createTwoUpEngine } from "../engine/two-up";
import type { Status, TwoUpState } from "../engine/types";
import {
	DEFAULT_ZOOM_SIZE,
	placeZoomPopup,
	toTwoUpHover,
	zoomPaneStyle,
} from "../engine/zoom";
import type { MountHandle, TwoUpMountOptions } from "../types";
import { applyClassName, createElement } from "./dom";

export function mountTwoUp(
	target: HTMLElement,
	options: TwoUpMountOptions,
): MountHandle<TwoUpMountOptions> {
	let opts = options;

	const root = createElement("div", { className: opts.className });
	const container = createElement("div", {
		className: opts.containerClassName,
	});
	const containerInner = createElement("div", {
		className: opts.containerInnerClassName,
		// Structural: side-by-side is two-up's core function, not theming.
		style: { display: "flex" },
	});
	const leftPanel = createElement("div", { className: opts.panelClassName });
	const rightPanel = createElement("div", { className: opts.panelClassName });

	const img1 = createElement("img", { className: opts.imageClassName });
	const img2 = createElement("img", { className: opts.imageClassName });
	// Respect opts.crossOrigin (null disables); default to "anonymous" when unset.
	const crossOrigin =
		opts.crossOrigin === undefined ? "anonymous" : opts.crossOrigin;
	img1.crossOrigin = crossOrigin;
	img2.crossOrigin = crossOrigin;
	img1.alt = "";
	img2.alt = "";
	const image1Source = bindImageSource(img1, opts.src1);
	const image2Source = bindImageSource(img2, opts.src2);

	const dimensionInfo = createElement("div", {
		className: opts.dimensionInfoClassName,
	});

	leftPanel.appendChild(img1);
	rightPanel.appendChild(img2);
	containerInner.append(leftPanel, rightPanel);
	container.append(containerInner, dimensionInfo);
	root.appendChild(container);
	target.appendChild(root);

	const engine = createTwoUpEngine({
		src1: opts.src1,
		src2: opts.src2,
		crossOrigin: opts.crossOrigin,
	});

	// Structural: a fixed, click-through overlay so it never steals the hover.
	const zoomPopup = createElement("div", {
		className: opts.zoomClassName,
		style: {
			position: "fixed",
			pointerEvents: "none",
			zIndex: "1000",
			display: "none",
		},
	});
	const zoomPane1 = createElement("div", {
		className: opts.zoomPanelClassName,
	});
	const zoomPane2 = createElement("div", {
		className: opts.zoomPanelClassName,
	});
	zoomPopup.append(zoomPane1, zoomPane2);
	document.body.appendChild(zoomPopup);

	const hoverListener = (image: 1 | 2, element: HTMLImageElement) => {
		return (event: PointerEvent) => {
			if (!opts.zoom) return;
			const hover = toTwoUpHover(image, event, element.getBoundingClientRect());
			if (hover) engine.actions.hover(hover);
		};
	};
	const onHover1 = hoverListener(1, img1);
	const onHover2 = hoverListener(2, img2);
	const onLeave = () => engine.actions.leave();
	img1.addEventListener("pointermove", onHover1);
	img2.addEventListener("pointermove", onHover2);
	img1.addEventListener("pointerleave", onLeave);
	img2.addEventListener("pointerleave", onLeave);

	function renderZoom(state: TwoUpState) {
		const { zoom, dims1, dims2 } = state;
		if (!opts.zoom || !zoom || !dims1 || !dims2) {
			zoomPopup.style.display = "none";
			return;
		}
		const size = opts.zoomSize ?? DEFAULT_ZOOM_SIZE;
		Object.assign(
			zoomPane1.style,
			zoomPaneStyle(img1.currentSrc, dims1, zoom.point, opts.zoom, size),
		);
		Object.assign(
			zoomPane2.style,
			zoomPaneStyle(img2.currentSrc, dims2, zoom.point, opts.zoom, size),
		);
		zoomPopup.style.display = "flex";
		const position = placeZoomPopup(
			zoom.anchor,
			{ width: zoomPopup.offsetWidth, height: zoomPopup.offsetHeight },
			{ width: window.innerWidth, height: window.innerHeight },
		);
		zoomPopup.style.left = `${position.x}px`;
		zoomPopup.style.top = `${position.y}px`;
	}

	let lastStatus: Status | null = null;

	const unsubscribe = engine.subscribe(() => {
		const state = engine.getState();
		renderZoom(state);

		if (state.status === "ready" && state.dimensionLabel !== undefined) {
			dimensionInfo.textContent = state.dimensionLabel;
		}

		if (state.status !== lastStatus) {
			lastStatus = state.status;
			if (state.status === "ready" && state.dims1 && state.dims2) {
				opts.onImagesLoaded?.({ image1: state.dims1, image2: state.dims2 });
			} else if (state.status === "error") {
				opts.onLoadError?.(state.error);
			}
		}
	});

	return {
		update(next) {
			opts = { ...opts, ...next };
			applyClassName(root, opts.className);
			applyClassName(container, opts.containerClassName);
			applyClassName(containerInner, opts.containerInnerClassName);
			applyClassName(leftPanel, opts.panelClassName);
			applyClassName(rightPanel, opts.panelClassName);
			applyClassName(img1, opts.imageClassName);
			applyClassName(img2, opts.imageClassName);
			applyClassName(dimensionInfo, opts.dimensionInfoClassName);
			applyClassName(zoomPopup, opts.zoomClassName);
			applyClassName(zoomPane1, opts.zoomPanelClassName);
			applyClassName(zoomPane2, opts.zoomPanelClassName);
			image1Source.update(opts.src1);
			image2Source.update(opts.src2);
			engine.setConfig({
				src1: opts.src1,
				src2: opts.src2,
				crossOrigin: opts.crossOrigin,
			});
			renderZoom(engine.getState());
		},
		destroy() {
			unsubscribe();
			img1.removeEventListener("pointermove", onHover1);
			img2.removeEventListener("pointermove", onHover2);
			img1.removeEventListener("pointerleave", onLeave);
			img2.removeEventListener("pointerleave", onLeave);
			zoomPopup.remove();
			engine.destroy();
			image1Source.destroy();
			image2Source.destroy();
			root.remove();
		},
	};
}
