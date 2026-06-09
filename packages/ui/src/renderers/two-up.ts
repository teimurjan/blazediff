import { createTwoUpEngine } from "../engine/two-up";
import type { Status } from "../engine/types";
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
	img1.crossOrigin = "anonymous";
	img2.crossOrigin = "anonymous";
	img1.alt = "";
	img2.alt = "";
	img1.src = opts.src1;
	img2.src = opts.src2;

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

	let lastStatus: Status | null = null;

	const unsubscribe = engine.subscribe(() => {
		const state = engine.getState();

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
			if (img1.src !== opts.src1) img1.src = opts.src1;
			if (img2.src !== opts.src2) img2.src = opts.src2;
			engine.setConfig({
				src1: opts.src1,
				src2: opts.src2,
				crossOrigin: opts.crossOrigin,
			});
		},
		destroy() {
			unsubscribe();
			engine.destroy();
			root.remove();
		},
	};
}
