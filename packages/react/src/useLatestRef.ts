import { useRef } from "react";

/**
 * Holds the latest value in a ref that updates on every render. Lets effects
 * call the most recent callback without listing it as a dependency — which
 * would otherwise re-run the effect (and re-fire) on every parent re-render.
 */
export function useLatestRef<T>(value: T) {
	const ref = useRef(value);
	ref.current = value;
	return ref;
}
