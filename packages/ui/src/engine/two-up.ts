import { loadImageElement } from "./image";
import { createStore } from "./store";
import type { Dimensions, TwoUpConfig, TwoUpEngine, TwoUpState } from "./types";

const LOAD_RELEVANT: (keyof TwoUpConfig)[] = ["src1", "src2", "crossOrigin"];

export function formatDimensionLabel(
	dims1: Dimensions,
	dims2: Dimensions,
): string {
	if (dims1.width === dims2.width && dims1.height === dims2.height) {
		return `${dims1.width}×${dims1.height}`;
	}
	const widthDiff = dims2.width - dims1.width;
	const heightDiff = dims2.height - dims1.height;
	const sign = (n: number) => (n > 0 ? "+" : "");
	return `Dimensions changed: ${dims1.width}×${dims1.height} → ${dims2.width}×${dims2.height} (${sign(widthDiff)}${widthDiff}×${sign(heightDiff)}${heightDiff})`;
}

export function createTwoUpEngine(config: TwoUpConfig): TwoUpEngine {
	const store = createStore<TwoUpState>({ status: "idle" });
	let current: TwoUpConfig = { ...config };
	let generation = 0;
	let destroyed = false;

	async function run() {
		const my = ++generation;
		const { src1, src2 } = current;

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

			const dims1: Dimensions = {
				width: img1.naturalWidth,
				height: img1.naturalHeight,
			};
			const dims2: Dimensions = {
				width: img2.naturalWidth,
				height: img2.naturalHeight,
			};

			store.set({
				status: "ready",
				dims1,
				dims2,
				dimensionLabel: formatDimensionLabel(dims1, dims2),
				changed: dims1.width !== dims2.width || dims1.height !== dims2.height,
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
