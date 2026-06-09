import { createStore } from "./store";
import type { SwipeEngine, SwipeState } from "./types";

function clamp(position: number): number {
	return Math.max(0, Math.min(100, position));
}

export function createSwipeEngine(initialPosition = 50): SwipeEngine {
	const store = createStore<SwipeState>({
		position: clamp(initialPosition),
		isDragging: false,
	});

	function setPosition(position: number) {
		store.set((prev) => ({ ...prev, position: clamp(position) }));
	}

	return {
		getState: store.get,
		subscribe: store.subscribe,
		setConfig() {
			// Swipe has no async config; geometry only.
		},
		actions: {
			start(position) {
				store.set({ position: clamp(position), isDragging: true });
			},
			move(position) {
				if (!store.get().isDragging) return;
				setPosition(position);
			},
			end() {
				store.set((prev) => ({ ...prev, isDragging: false }));
			},
			setPosition,
		},
		destroy() {
			// No async work or listeners owned by the engine.
		},
	};
}
