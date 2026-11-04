/* tslint:disable */
/* eslint-disable */
export function _start(): void;
/**
 * Diff two equally sized RGBA buffers.
 *
 * Returns `[count, has_window, window_x, window_y, window_count]`. If
 * `out_diff` is provided, the visualization is written into it in place
 * (must be width*height*4 bytes).
 */
export function diffRgba(rgba_a: Uint8Array, rgba_b: Uint8Array, width: number, height: number, threshold: number, antialiasing: boolean, metric: string | null | undefined, mask: Uint8Array | null | undefined, window: number | null | undefined, alpha: number, diff_color: Uint8Array | null | undefined, diff_color_alt: Uint8Array | null | undefined, aa_color: Uint8Array | null | undefined, transparent: boolean, out_diff?: Uint8Array | null): Uint32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly _start: () => void;
  readonly diffRgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number) => void;
  readonly __wbindgen_export_0: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export_1: (a: number, b: number) => number;
  readonly __wbindgen_export_2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
