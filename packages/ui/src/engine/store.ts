export interface Store<S> {
	get(): S;
	set(next: S | ((prev: S) => S)): void;
	subscribe(listener: () => void): () => void;
}

export function createStore<S>(initial: S): Store<S> {
	let state = initial;
	const listeners = new Set<() => void>();

	return {
		get() {
			return state;
		},
		set(next) {
			state =
				typeof next === "function" ? (next as (prev: S) => S)(state) : next;
			for (const listener of listeners) listener();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
