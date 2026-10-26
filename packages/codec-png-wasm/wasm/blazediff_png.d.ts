/* tslint:disable */
/* eslint-disable */
export function _start(): void;
/**
 * Decode a PNG to RGBA8.
 */
export function decode(png: Uint8Array): DecodedImage;
/**
 * Encode RGBA8 pixels (`width * height * 4` bytes) as a PNG. `compression`
 * is 0 (stored) or 1-12 (default 4); `filter` is "none", "sub", "up",
 * "average", "paeth" or "adaptive" (default); `color` is "auto" (default,
 * smallest lossless mode) or "rgba8".
 */
export function encode(rgba: Uint8Array, width: number, height: number, compression?: number | null, filter?: string | null, color?: string | null): Uint8Array;
/**
 * What `decode` returns. Read `width` and `height`, then call `takeData()`,
 * which moves the pixels out and frees the struct.
 */
export class DecodedImage {
  private constructor();
  free(): void;
  /**
   * RGBA8 pixels, row-major. Consumes the struct, so the pixels cross into
   * JS with one copy instead of two.
   */
  takeData(): Uint8Array;
  readonly width: number;
  readonly height: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_decodedimage_free: (a: number, b: number) => void;
  readonly _start: () => void;
  readonly decode: (a: number, b: number, c: number) => void;
  readonly decodedimage_height: (a: number) => number;
  readonly decodedimage_takeData: (a: number, b: number) => void;
  readonly decodedimage_width: (a: number) => number;
  readonly encode: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
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
