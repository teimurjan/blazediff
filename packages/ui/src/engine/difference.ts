import blazediff, { type CoreOptions } from "@blazediff/core";
import { getImageData, loadImageElement } from "./image";
import { createStore } from "./store";
import type {
	DifferenceConfig,
	DifferenceEngine,
	DifferenceState,
} from "./types";

const LOAD_RELEVANT: (keyof DifferenceConfig)[] = [
	"src1",
	"src2",
	"threshold",
	"includeAA",
	"alpha",
	"crossOrigin",
];

export function createDifferenceEngine(
	config: DifferenceConfig,
): DifferenceEngine {
	const store = createStore<DifferenceState>({ status: "idle" });
	let current: DifferenceConfig = { ...config };
	let generation = 0;
	let destroyed = false;

	async function run() {
		const my = ++generation;
		const {
			src1,
			src2,
			threshold = 0.1,
			includeAA = false,
			alpha = 0.1,
		} = current;

		if (!src1 || !src2) {
			store.set({ status: "idle" });
			return;
		}

		store.set({ status: "loading" });

		try {
			const [img1, img2] = await Promise.all([
				loadImageElement(src1, { crossOrigin: current.crossOrigin }),
				loadImageElement(src2, { crossOrigin: current.crossOrigin }),
			]);
			if (destroyed || my !== generation) return;

			if (
				img1.naturalWidth !== img2.naturalWidth ||
				img1.naturalHeight !== img2.naturalHeight
			) {
				throw new Error(
					`Image dimensions do not match. Image 1: ${img1.naturalWidth}x${img1.naturalHeight}, Image 2: ${img2.naturalWidth}x${img2.naturalHeight}`,
				);
			}

			const width = img1.naturalWidth;
			const height = img1.naturalHeight;
			const data1 = getImageData(img1).data;
			const data2 = getImageData(img2).data;
			if (destroyed || my !== generation) return;

			const output = new Uint8ClampedArray(width * height * 4);
			const options: CoreOptions = { threshold, includeAA, alpha };
			const diffCount = blazediff(data1, data2, output, width, height, options);
			if (destroyed || my !== generation) return;

			const totalPixels = width * height;
			store.set({
				status: "ready",
				diff: {
					output,
					width,
					height,
					diffCount,
					totalPixels,
					percentage: (diffCount / totalPixels) * 100,
				},
			});
		} catch (error) {
			if (destroyed || my !== generation) return;
			store.set({ status: "error", error });
		}
	}

	run();

	return {
		getState: store.get,
		subscribe: store.subscribe,
		setConfig(next) {
			const changed = LOAD_RELEVANT.some(
				(key) => key in next && next[key] !== current[key],
			);
			current = { ...current, ...next };
			if (changed) run();
		},
		actions: {},
		destroy() {
			destroyed = true;
			generation++;
		},
	};
}
