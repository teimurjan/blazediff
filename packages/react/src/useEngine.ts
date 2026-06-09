import { useEffect, useRef, useState } from "react";

interface ReadableEngine {
	getState(): unknown;
	subscribe(listener: () => void): () => void;
	destroy(): void;
}

/**
 * Owns a single engine instance for the component's lifetime, subscribes to it,
 * and re-renders on every state change. The engine holds all state/logic; React
 * holds none. `factory` is called once per mount (and again on a StrictMode
 * remount, since cleanup destroys the previous instance and nulls the ref).
 */
export function useEngine<E extends ReadableEngine>(
	factory: () => E,
): [E, ReturnType<E["getState"]>] {
	const ref = useRef<E | null>(null);
	if (ref.current === null) ref.current = factory();
	const [, force] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: factory captures initial config; subscription lifecycle is mount/unmount only.
	useEffect(() => {
		if (ref.current === null) ref.current = factory();
		const engine = ref.current;
		force((n) => n + 1);
		const unsubscribe = engine.subscribe(() => force((n) => n + 1));
		return () => {
			unsubscribe();
			engine.destroy();
			ref.current = null;
		};
	}, []);

	const engine = ref.current as E;
	return [engine, engine.getState() as ReturnType<E["getState"]>];
}
