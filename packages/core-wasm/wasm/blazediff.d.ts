/* tslint:disable */
/* eslint-disable */
export function _start(): void;
/**
 * Interpret the diff between two RGBA buffers into structured change regions.
 *
 * Returns the `InterpretResult` (summary, regions with positions, change
 * types, severity, etc.) serialized as a plain JS object - the same shape the
 * native binding produces.
 */
export function interpretRgba(rgba_a: Uint8Array, rgba_b: Uint8Array, width: number, height: number, threshold: number, include_aa: boolean): any;
/**
 * Diff two RGBA buffers. Returns the count of differing pixels.
 *
 * If `out_diff` is provided, the visualization is written into it in-place
 * (must be width*height*4 bytes). Pass `null`/`undefined` to skip the
 * visualization and just get a count.
 */
export function diffRgba(rgba_a: Uint8Array, rgba_b: Uint8Array, width: number, height: number, threshold: number, include_aa: boolean, diff_mask: boolean, out_diff?: Uint8Array | null): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly _start: () => void;
  readonly diffRgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
  readonly interpretRgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly __wbindgen_export_0: (a: number, b: number) => number;
  readonly __wbindgen_export_1: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_2: (a: number, b: number, c: number) => void;
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
