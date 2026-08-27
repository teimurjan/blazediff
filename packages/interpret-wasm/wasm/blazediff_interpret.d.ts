/* tslint:disable */
/* eslint-disable */
export function _start(): void;
/**
 * Interpret the pixel diff between two RGBA buffers.
 *
 * Returns the `InterpretResult` as a plain JS object — the same shape
 * `@blazediff/interpret-native` returns, because both serialize the one
 * `Serialize` derive on the struct.
 *
 * If `out_diff` is provided, the diff visualization is written into it
 * in-place (must be width*height*4 bytes). Pass `null`/`undefined` to skip it;
 * the diff still needs a scratch buffer internally, but nothing is copied back.
 */
export function interpretRgba(rgba_a: Uint8Array, rgba_b: Uint8Array, width: number, height: number, threshold: number, antialiasing: boolean, out_diff?: Uint8Array | null): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly _start: () => void;
  readonly interpretRgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
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
