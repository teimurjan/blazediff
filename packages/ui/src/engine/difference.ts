import { diff } from "@blazediff/core";
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
	"antialiasing",
	"alpha",
	"crossOrigin",
	"enabled",
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
			antialiasing = true,
			alpha = 0.1,
			enabled = true,
		} = current;

		if (!enabled || !src1 || !src2) {
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

			const a = getImageData(img1);
			const b = getImageData(img2);
			if (destroyed || my !== generation) return;

			const { width, height } = a;
			const output = new Uint8ClampedArray(width * height * 4);
			const result = diff(a, b, {
				threshold,
				antialiasing,
				output: { data: output, width, height },
				render: { alpha },
			});
			if (destroyed || my !== generation) return;
			if (result.kind === "dimension-mismatch") {
				throw new Error(
					`Image dimensions do not match. Image 1: ${result.a.width}x${result.a.height}, Image 2: ${result.b.width}x${result.b.height}`,
				);
			}

			const totalPixels = width * height;
			store.set({
				status: "ready",
				diff: {
					output,
					width,
					height,
					diffCount: result.count,
					totalPixels,
					percentage: result.percentage,
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
