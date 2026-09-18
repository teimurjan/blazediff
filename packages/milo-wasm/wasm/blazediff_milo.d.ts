/* tslint:disable */
/* eslint-disable */
export function _start(): void;
/**
 * Score `distorted` against `reference`, both RGBA8 buffers of
 * `width * height * 4` bytes.
 */
export function miloRgba(reference: Uint8Array, distorted: Uint8Array, width: number, height: number): MiloResult;
/**
 * What `miloRgba` hands back. The maps are copied out on access, so a caller
 * that only wants the scores never pays for them.
 */
export class MiloResult {
  private constructor();
  free(): void;
  /**
   * Row-major per-pixel visibility mask, `width * height` values.
   */
  mask(): Float32Array;
  /**
   * Row-major per-pixel perceived error in 0..1, `width * height` values.
   */
  errorMap(): Float32Array;
  /**
   * The raw error on KADID-10k's 1-5 mean-opinion-score scale.
   */
  readonly mos: number;
  readonly width: number;
  readonly height: number;
  /**
   * Masked mean absolute error. Zero means identical.
   */
  readonly rawError: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_miloresult_free: (a: number, b: number) => void;
  readonly _start: () => void;
  readonly miloRgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly miloresult_errorMap: (a: number, b: number) => void;
  readonly miloresult_height: (a: number) => number;
  readonly miloresult_mask: (a: number, b: number) => void;
  readonly miloresult_mos: (a: number) => number;
  readonly miloresult_rawError: (a: number) => number;
  readonly miloresult_width: (a: number) => number;
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
