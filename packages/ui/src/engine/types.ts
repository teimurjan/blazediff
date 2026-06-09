export type Status = "idle" | "loading" | "ready" | "error";

export interface Dimensions {
	width: number;
	height: number;
}

/**
 * Shared shape every mode controller implements. The engine owns all state,
 * calculations, and async work; it never touches the display surface.
 */
export interface Engine<S, C, A> {
	getState(): S;
	subscribe(listener: () => void): () => void;
	/** Shallow-diffs against the current config; reloads only when a load-relevant field changes. */
	setConfig(config: Partial<C>): void;
	actions: A;
	/** Aborts in-flight loads and stops all further state mutations. */
	destroy(): void;
}

// --- Difference ---

export interface DiffStats {
	output: Uint8ClampedArray;
	width: number;
	height: number;
	diffCount: number;
	totalPixels: number;
	percentage: number;
}

export interface DifferenceState {
	status: Status;
	diff?: DiffStats;
	error?: unknown;
}

export interface DifferenceConfig {
	src1: string;
	src2: string;
	threshold?: number;
	includeAA?: boolean;
	alpha?: number;
	crossOrigin?: string | null;
}

export type DifferenceEngine = Engine<
	DifferenceState,
	DifferenceConfig,
	Record<string, never>
>;

// --- Swipe ---

export interface SwipeState {
	position: number;
	isDragging: boolean;
}

export interface SwipeActions {
	/** `position` is the already-computed 0–100 percentage. */
	start(position: number): void;
	/** No-op unless currently dragging. */
	move(position: number): void;
	end(): void;
	setPosition(position: number): void;
}

export type SwipeEngine = Engine<
	SwipeState,
	Record<string, never>,
	SwipeActions
>;

// --- TwoUp ---

export interface TwoUpState {
	status: Status;
	dims1?: Dimensions;
	dims2?: Dimensions;
	dimensionLabel?: string;
	changed?: boolean;
	error?: unknown;
}

export interface TwoUpConfig {
	src1: string;
	src2: string;
	crossOrigin?: string | null;
}

export type TwoUpEngine = Engine<
	TwoUpState,
	TwoUpConfig,
	Record<string, never>
>;

// --- OnionSkin ---

export interface OnionSkinState {
	status: Status;
	opacity: number;
	dims1?: Dimensions;
	dims2?: Dimensions;
	error?: unknown;
}

export interface OnionSkinConfig {
	src1: string;
	src2: string;
	crossOrigin?: string | null;
}

export interface OnionSkinActions {
	/** Clamps to 0–100. */
	setOpacity(value: number): void;
}

export type OnionSkinEngine = Engine<
	OnionSkinState,
	OnionSkinConfig,
	OnionSkinActions
>;
