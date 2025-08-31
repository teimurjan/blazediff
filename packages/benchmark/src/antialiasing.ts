import transformer from "@blazediff/pngjs-transformer";
import type { BlazeDiffImage } from "@blazediff/types";
import { ImagePair } from "./utils";

export interface AntialiasingBenchmarkResult {
  name: string;
  pixelmatch: { time: number; detections: number };
  green: { time: number; detections: number };
  accurate: { time: number; detections: number };
  greenSpeedup: number;
  accurateSpeedup: number;
}

export interface DeltaFunctionBenchmarkResult {
  colorDelta: { time: number };
  greenChannel: { time: number };
  accurateLuminance: { time: number };
  greenChannelSpeedup: number;
  accurateLuminanceSpeedup: number;
}

function pixelmatchColorDelta(
  image1: BlazeDiffImage["data"],
  image2: BlazeDiffImage["data"],
  k: number,
  m: number,
  yOnly: boolean
): number {
  const r1 = image1[k];
  const g1 = image1[k + 1];
  const b1 = image1[k + 2];
  const a1 = image1[k + 3];
  const r2 = image2[m];
  const g2 = image2[m + 1];
  const b2 = image2[m + 2];
  const a2 = image2[m + 3];

  let dr = r1 - r2;
  let dg = g1 - g2;
  let db = b1 - b2;
  const da = a1 - a2;

  if (!dr && !dg && !db && !da) return 0;

  if (a1 < 255 || a2 < 255) {
    const rb = 48 + 159 * (k % 2);
    const gb = 48 + 159 * (((k / 1.618033988749895) | 0) % 2);
    const bb = 48 + 159 * (((k / 2.618033988749895) | 0) % 2);
    dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
    dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
    db = (b1 * a1 - b2 * a2 - bb * da) / 255;
  }

  const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;

  if (yOnly) return y;

  const i = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
  const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;

  const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

  return y > 0 ? -delta : delta;
}

function pixelmatchAntialiasing(
  image: BlazeDiffImage["data"],
  x1: number,
  y1: number,
  width: number,
  height: number,
  a32: Uint32Array,
  b32: Uint32Array
): boolean {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = y1 * width + x1;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;

      const delta = pixelmatchColorDelta(
        image,
        image,
        pos * 4,
        (y * width + x) * 4,
        true
      );

      if (delta === 0) {
        zeroes++;
        if (zeroes > 2) return false;
      } else if (delta < min) {
        min = delta;
        minX = x;
        minY = y;
      } else if (delta > max) {
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  }

  if (min === 0 || max === 0) return false;

  return (
    (hasManySiblings(a32, minX, minY, width, height) &&
      hasManySiblings(b32, minX, minY, width, height)) ||
    (hasManySiblings(a32, maxX, maxY, width, height) &&
      hasManySiblings(b32, maxX, maxY, width, height))
  );
}

function luminanceDeltaGreen(
  image1: BlazeDiffImage["data"],
  image2: BlazeDiffImage["data"],
  pos1: number,
  pos2: number
): number {
  return image1[pos1 + 1] - image2[pos2 + 1];
}

function luminanceDeltaAccurate(
  image1: BlazeDiffImage["data"],
  image2: BlazeDiffImage["data"],
  pos1: number,
  pos2: number
): number {
  const r1 = image1[pos1],
    g1 = image1[pos1 + 1],
    b1 = image1[pos1 + 2];
  const r2 = image2[pos2],
    g2 = image2[pos2 + 1],
    b2 = image2[pos2 + 2];

  const luma1 = r1 * 0.2126 + g1 * 0.7152 + b1 * 0.0722;
  const luma2 = r2 * 0.2126 + g2 * 0.7152 + b2 * 0.0722;

  return luma1 - luma2;
}

function antialiasingLuminanceGreen(
  image: BlazeDiffImage["data"],
  x1: number,
  y1: number,
  width: number,
  height: number,
  a32: Uint32Array,
  b32: Uint32Array
): boolean {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = y1 * width + x1;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;

      const delta = luminanceDeltaGreen(
        image,
        image,
        pos * 4,
        (y * width + x) * 4
      );

      if (delta === 0) {
        zeroes++;
        if (zeroes > 2) return false;
      } else if (delta < min) {
        min = delta;
        minX = x;
        minY = y;
      } else if (delta > max) {
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  }

  if (min === 0 || max === 0) return false;

  return (
    (hasManySiblings(a32, minX, minY, width, height) &&
      hasManySiblings(b32, minX, minY, width, height)) ||
    (hasManySiblings(a32, maxX, maxY, width, height) &&
      hasManySiblings(b32, maxX, maxY, width, height))
  );
}

function antialiasingLuminanceAccurate(
  image: BlazeDiffImage["data"],
  x1: number,
  y1: number,
  width: number,
  height: number,
  a32: Uint32Array,
  b32: Uint32Array
): boolean {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = y1 * width + x1;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;

      const delta = luminanceDeltaAccurate(
        image,
        image,
        pos * 4,
        (y * width + x) * 4
      );

      if (delta === 0) {
        zeroes++;
        if (zeroes > 2) return false;
      } else if (delta < min) {
        min = delta;
        minX = x;
        minY = y;
      } else if (delta > max) {
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  }

  if (min === 0 || max === 0) return false;

  return (
    (hasManySiblings(a32, minX, minY, width, height) &&
      hasManySiblings(b32, minX, minY, width, height)) ||
    (hasManySiblings(a32, maxX, maxY, width, height) &&
      hasManySiblings(b32, maxX, maxY, width, height))
  );
}

export function benchmarkAntialiasing(
  image: BlazeDiffImage["data"],
  width: number,
  height: number,
  a32: Uint32Array,
  b32: Uint32Array,
  iterations: number = 1000
): Omit<AntialiasingBenchmarkResult, "name"> {
  const testCoords: Array<[number, number]> = [];
  for (let i = 0; i < iterations; i++) {
    const x = Math.floor(Math.random() * (width - 2)) + 1;
    const y = Math.floor(Math.random() * (height - 2)) + 1;
    testCoords.push([x, y]);
  }

  const startOriginal = performance.now();
  let originalResults = 0;
  for (const [x, y] of testCoords) {
    if (pixelmatchAntialiasing(image, x, y, width, height, a32, b32)) {
      originalResults++;
    }
  }
  const timeOriginal = performance.now() - startOriginal;

  const startGreen = performance.now();
  let greenResults = 0;
  for (const [x, y] of testCoords) {
    if (antialiasingLuminanceGreen(image, x, y, width, height, a32, b32)) {
      greenResults++;
    }
  }
  const timeGreen = performance.now() - startGreen;

  const startAccurate = performance.now();
  let accurateResults = 0;
  for (const [x, y] of testCoords) {
    if (antialiasingLuminanceAccurate(image, x, y, width, height, a32, b32)) {
      accurateResults++;
    }
  }
  const timeAccurate = performance.now() - startAccurate;

  return {
    pixelmatch: { time: timeOriginal, detections: originalResults },
    green: { time: timeGreen, detections: greenResults },
    accurate: { time: timeAccurate, detections: accurateResults },
    greenSpeedup: ((timeOriginal - timeGreen) / timeGreen) * 100,
    accurateSpeedup: ((timeOriginal - timeAccurate) / timeOriginal) * 100,
  };
}

export function benchmarkDeltaFunctions(
  image: BlazeDiffImage["data"],
  iterations: number = 100000
): DeltaFunctionBenchmarkResult {
  const startColor = performance.now();
  for (let i = 0; i < iterations; i++) {
    pixelmatchColorDelta(image, image, 0, 4, true);
  }
  const timeColor = performance.now() - startColor;

  const startGreen = performance.now();
  for (let i = 0; i < iterations; i++) {
    luminanceDeltaGreen(image, image, 0, 4);
  }
  const timeGreen = performance.now() - startGreen;

  const startAccurate = performance.now();
  for (let i = 0; i < iterations; i++) {
    luminanceDeltaAccurate(image, image, 0, 4);
  }
  const timeAccurate = performance.now() - startAccurate;

  return {
    colorDelta: { time: timeColor },
    greenChannel: { time: timeGreen },
    accurateLuminance: { time: timeAccurate },
    greenChannelSpeedup: timeColor / timeGreen,
    accurateLuminanceSpeedup: timeColor / timeAccurate,
  };
}

function hasManySiblings(
  image32: Uint32Array,
  x1: number,
  y1: number,
  width: number,
  height: number
): boolean {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const val = image32[y1 * width + x1];
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      zeroes += +(val === image32[y * width + x]);
      if (zeroes > 2) return true;
    }
  }
  return false;
}

export const runBenchmark = async (
  imagePairs: ImagePair[],
  iterations: number
) => {
  const results: AntialiasingBenchmarkResult[] = [];
  for (const pair of imagePairs) {
    const { a, b, name } = pair;
    const [imageA, imageB] = await Promise.all([
      transformer.transform(a),
      transformer.transform(b),
    ]);
    const a32 = new Uint32Array(imageA.data);
    const b32 = new Uint32Array(imageB.data);
    const result = benchmarkAntialiasing(
      imageA.data,
      imageA.width,
      imageA.height,
      a32,
      b32,
      iterations
    );
    results.push({ ...result, name });
  }


  return { results, averages: calculateAverages(results) };
};

const calculateAverages = (results: AntialiasingBenchmarkResult[]) => {
  return {
    pixelmatch: {
      time:
        results.map((r) => r.pixelmatch.time).reduce((a, b) => a + b, 0) /
        results.length,
      detections:
        results.map((r) => r.pixelmatch.detections).reduce((a, b) => a + b, 0) /
        results.length,
    },
    green: {
      time:
        results.map((r) => r.green.time).reduce((a, b) => a + b, 0) /
        results.length,
      detections:
        results.map((r) => r.green.detections).reduce((a, b) => a + b, 0) /
        results.length,
    },
    accurate: {
      time:
        results.map((r) => r.accurate.time).reduce((a, b) => a + b, 0) /
        results.length,
      detections:
        results.map((r) => r.accurate.detections).reduce((a, b) => a + b, 0) /
        results.length,
    },
    greenSpeedup:
      results.map((r) => r.greenSpeedup).reduce((a, b) => a + b, 0) /
      results.length,
    accurateSpeedup:
      results.map((r) => r.accurateSpeedup).reduce((a, b) => a + b, 0) /
      results.length,
  };
};
