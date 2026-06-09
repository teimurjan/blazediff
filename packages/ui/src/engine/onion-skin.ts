import { loadImageElement } from "./image";
import { createStore } from "./store";
import type {
	Dimensions,
	OnionSkinConfig,
	OnionSkinEngine,
	OnionSkinState,
} from "./types";

const LOAD_RELEVANT: (keyof OnionSkinConfig)[] = [
	"src1",
	"src2",
	"crossOrigin",
];

export function normalizedOpacity(opacity: number): number {
	return opacity / 100;
}

export function createOnionSkinEngine(
	config: OnionSkinConfig,
	initialOpacity = 50,
): OnionSkinEngine {
	const store = createStore<OnionSkinState>({
		status: "idle",
		opacity: Math.max(0, Math.min(100, initialOpacity)),
	});
	let current: OnionSkinConfig = { ...config };
	let generation = 0;
	let destroyed = false;

	async function run() {
		const my = ++generation;
		const { src1, src2 } = current;

		if (!src1 || !src2) {
			store.set((prev) => ({ ...prev, status: "idle" }));
			return;
		}

		store.set((prev) => ({ ...prev, status: "loading" }));

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

			store.set((prev) => ({ ...prev, status: "ready", dims1, dims2 }));
		} catch (error) {
			if (destroyed || my !== generation) return;
			store.set((prev) => ({ ...prev, status: "error", error }));
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
		actions: {
			setOpacity(value) {
				store.set((prev) => ({
					...prev,
					opacity: Math.max(0, Math.min(100, value)),
				}));
			},
		},
		destroy() {
			destroyed = true;
			generation++;
		},
	};
}
