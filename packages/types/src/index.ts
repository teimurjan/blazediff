/**
 * Shared types for the BlazeDiff project
 */

/**
 * Image data structure
 */
export interface BlazeDiffImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * BlazeDiffTransformer to transform images to a common format & write the output image
 */
export interface BlazeDiffTransformer {
  transform: (filePath: string) => Promise<BlazeDiffImage>;
  write: (imageData: BlazeDiffImage, filePath: string) => Promise<void>;
}

/**
 * Core BlazeDiff algorithm options
 */
export interface BlazeDiffOptions {
  threshold?: number;
  includeAA?: boolean;
  alpha?: number;
  aaColor?: [number, number, number];
  diffColor?: [number, number, number];
  diffColorAlt?: [number, number, number];
  diffMask?: boolean;
}
