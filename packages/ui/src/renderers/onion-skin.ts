import { createOnionSkinEngine, normalizedOpacity } from "../engine/onion-skin";
import type { Status } from "../engine/types";
import type { MountHandle, OnionSkinMountOptions } from "../types";
import { applyClassName, createElement } from "./dom";

export function mountOnionSkin(
	target: HTMLElement,
	options: OnionSkinMountOptions,
): MountHandle<OnionSkinMountOptions> {
	let opts = options;

	const root = createElement("div", { className: opts.className });
	const container = createElement("div", {
		className: opts.containerClassName,
	});
	const imageContainer = createElement("div", {
		className: opts.imageContainerClassName,
		style: { position: "relative" },
	});

	const img1 = createElement("img", { className: opts.imageClassName });
	const img2 = createElement("img", {
		className: opts.imageClassName,
		style: { position: "absolute", top: "0", left: "0" },
	});
	// Respect opts.crossOrigin (null disables); default to "anonymous" when unset.
	const crossOrigin =
		opts.crossOrigin === undefined ? "anonymous" : opts.crossOrigin;
	img1.crossOrigin = crossOrigin;
	img2.crossOrigin = crossOrigin;
	img1.alt = "";
	img2.alt = "";
	img1.src = opts.src1;
	img2.src = opts.src2;

	imageContainer.append(img1, img2);

	const sliderContainer = createElement("div", {
		className: opts.sliderContainerClassName,
	});
	const sliderLabel = createElement("label", {
		className: opts.sliderLabelClassName,
	});
	sliderLabel.textContent = opts.sliderLabelText ?? "Opacity:";

	const slider = createElement("input", { className: opts.sliderClassName });
	slider.type = "range";
	slider.min = "0";
	slider.max = "100";

	sliderContainer.append(sliderLabel, slider);
	container.append(imageContainer, sliderContainer);
	root.appendChild(container);
	target.appendChild(root);

	const engine = createOnionSkinEngine(
		{ src1: opts.src1, src2: opts.src2, crossOrigin: opts.crossOrigin },
		opts.opacity ?? 50,
	);

	let lastStatus: Status | null = null;
	let lastOpacity = engine.getState().opacity;
	slider.value = String(lastOpacity);
	img2.style.opacity = String(normalizedOpacity(lastOpacity));

	const onInput = () => engine.actions.setOpacity(Number(slider.value));
	slider.addEventListener("input", onInput);

	const unsubscribe = engine.subscribe(() => {
		const state = engine.getState();

		img2.style.opacity = String(normalizedOpacity(state.opacity));
		if (slider.value !== String(state.opacity)) {
			slider.value = String(state.opacity);
		}
		if (state.opacity !== lastOpacity) {
			lastOpacity = state.opacity;
			opts.onOpacityChange?.(state.opacity);
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
			applyClassName(imageContainer, opts.imageContainerClassName);
			applyClassName(img1, opts.imageClassName);
			applyClassName(img2, opts.imageClassName);
			applyClassName(sliderContainer, opts.sliderContainerClassName);
			applyClassName(sliderLabel, opts.sliderLabelClassName);
			applyClassName(slider, opts.sliderClassName);
			sliderLabel.textContent = opts.sliderLabelText ?? "Opacity:";
			if (img1.src !== opts.src1) img1.src = opts.src1;
			if (img2.src !== opts.src2) img2.src = opts.src2;
			if (
				opts.opacity !== undefined &&
				opts.opacity !== engine.getState().opacity
			) {
				engine.actions.setOpacity(opts.opacity);
			}
			engine.setConfig({
				src1: opts.src1,
				src2: opts.src2,
				crossOrigin: opts.crossOrigin,
			});
		},
		destroy() {
			unsubscribe();
			slider.removeEventListener("input", onInput);
			engine.destroy();
			root.remove();
		},
	};
}
