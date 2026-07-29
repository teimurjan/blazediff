import { createDifferenceEngine } from "../engine/difference";
import { bindImageSource } from "../engine/image";
import type { Status } from "../engine/types";
import type { DifferenceMountOptions, MountHandle } from "../types";
import { applyClassName, createElement } from "./dom";

export function mountDifference(
	target: HTMLElement,
	options: DifferenceMountOptions,
): MountHandle<DifferenceMountOptions> {
	let opts = options;

	const root = createElement("div", { className: opts.className });
	const container = createElement("div", {
		className: opts.containerClassName,
	});
	const canvas = createElement("canvas", { className: opts.canvasClassName });
	const ctx = canvas.getContext("2d");
	const diffImage = createElement("img", { className: opts.canvasClassName });
	diffImage.alt = "";
	const diffImageSource = bindImageSource(diffImage, opts.diff);
	const hasProvidedDiff = opts.diff !== undefined;
	canvas.hidden = hasProvidedDiff;
	diffImage.hidden = !hasProvidedDiff;
	const onProvidedDiffError = (error: Event) => {
		if (opts.diff !== undefined) opts.onDiffError?.(error);
	};
	diffImage.addEventListener("error", onProvidedDiffError);
	container.append(canvas, diffImage);
	root.appendChild(container);
	target.appendChild(root);

	const engine = createDifferenceEngine({
		src1: opts.src1,
		src2: opts.src2,
		threshold: opts.threshold,
		includeAA: opts.includeAA,
		alpha: opts.alpha,
		crossOrigin: opts.crossOrigin,
		enabled: !hasProvidedDiff,
	});

	let lastStatus: Status | null = null;

	const unsubscribe = engine.subscribe(() => {
		const state = engine.getState();

		if (state.status === "ready" && state.diff && ctx) {
			const { output, width, height } = state.diff;
			canvas.width = width;
			canvas.height = height;
			// Buffer is freshly allocated per diff and never aliased after this.
			ctx.putImageData(
				new ImageData(output as Uint8ClampedArray<ArrayBuffer>, width, height),
				0,
				0,
			);
		}

		if (state.status !== lastStatus) {
			lastStatus = state.status;
			if (state.status === "ready" && state.diff) {
				opts.onDiffComplete?.({
					diffCount: state.diff.diffCount,
					totalPixels: state.diff.totalPixels,
					percentage: state.diff.percentage,
				});
			} else if (state.status === "error") {
				opts.onDiffError?.(state.error);
			}
		}
	});

	return {
		update(next) {
			opts = { ...opts, ...next };
			applyClassName(root, opts.className);
			applyClassName(container, opts.containerClassName);
			applyClassName(canvas, opts.canvasClassName);
			applyClassName(diffImage, opts.canvasClassName);
			const hasProvidedDiff = opts.diff !== undefined;
			canvas.hidden = hasProvidedDiff;
			diffImage.hidden = !hasProvidedDiff;
			diffImageSource.update(opts.diff);
			engine.setConfig({
				src1: opts.src1,
				src2: opts.src2,
				threshold: opts.threshold,
				includeAA: opts.includeAA,
				alpha: opts.alpha,
				crossOrigin: opts.crossOrigin,
				enabled: !hasProvidedDiff,
			});
		},
		destroy() {
			unsubscribe();
			engine.destroy();
			diffImage.removeEventListener("error", onProvidedDiffError);
			diffImageSource.destroy();
			root.remove();
		},
	};
}
