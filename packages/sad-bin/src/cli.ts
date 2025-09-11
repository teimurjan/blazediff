#!/usr/bin/env node

import sadBin from "./index";
import type { BlazeDiffTransformer } from "@blazediff/types";

function printUsage(): void {
  console.log(`
Usage: blazediff <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
  -o, --output <path>           Output path for the diff image
  --tile-size <num>             Tile size for SAD computation (default: 64)
  --downsample-factor <num>     Downsample factor (default: 2)
  --enable-blur                 Enable Gaussian blur for noise robustness (default: true)
  --early-exit-threshold <num>  Early exit threshold for SAD (default: 10000)
  --transformer <name>          Specify transformer to use (e.g. pngjs, sharp)
  -h, --help                    Show this help message

Examples:
  blazediff image1.png image2.png
  blazediff image1.png image2.png -o diff.png --tile-size 32
  blazediff image1.png image2.png --downsample-factor 4 --enable-blur
`);
}

function parseArgs(): {
  image1: string;
  image2: string;
  options: {
    outputPath?: string;
    tileSize?: number;
    downsampleFactor?: number;
    enableBlur?: boolean;
    earlyExitThreshold?: number;
    transformer?: string;
  };
} {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  if (args.length < 2) {
    console.error("Error: Two image paths are required");
    printUsage();
    process.exit(1);
  }

  const image1 = args[0];
  const image2 = args[1];
  const options: any = {};

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "-o":
      case "--output":
        if (nextArg) {
          options.outputPath = nextArg;
          i++;
        }
        break;
      case "--tile-size":
        if (nextArg) {
          const tileSize = parseInt(nextArg);
          if (isNaN(tileSize) || tileSize <= 0) {
            throw new Error(
              `Invalid tile size: ${nextArg}. Must be a positive integer`
            );
          }
          options.tileSize = tileSize;
          i++;
        }
        break;
      case "--downsample-factor":
        if (nextArg) {
          const downsampleFactor = parseInt(nextArg);
          if (isNaN(downsampleFactor) || downsampleFactor <= 0) {
            throw new Error(
              `Invalid downsample factor: ${nextArg}. Must be a positive integer`
            );
          }
          options.downsampleFactor = downsampleFactor;
          i++;
        }
        break;
      case "--enable-blur":
        options.enableBlur = true;
        break;
      case "--disable-blur":
        options.enableBlur = false;
        break;
      case "--early-exit-threshold":
        if (nextArg) {
          const earlyExitThreshold = parseInt(nextArg);
          if (isNaN(earlyExitThreshold) || earlyExitThreshold < 0) {
            throw new Error(
              `Invalid early exit threshold: ${nextArg}. Must be a non-negative integer`
            );
          }
          options.earlyExitThreshold = earlyExitThreshold;
          i++;
        }
        break;
      case "--transformer":
        if (nextArg) {
          options.transformer = nextArg;
          i++;
        }
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }

  return { image1, image2, options };
}

const getTransformer = async (
  transformer?: string
): Promise<BlazeDiffTransformer> => {
  if (!transformer || transformer === "pngjs") {
    const { default: transformer } = await import(
      "@blazediff/pngjs-transformer"
    );
    return transformer;
  }
  if (transformer === "sharp") {
    const { default: transformer } = await import(
      "@blazediff/sharp-transformer"
    );
    return transformer;
  }
  throw new Error(`Unknown transformer: ${transformer}`);
};

async function main(): Promise<void> {
  try {
    const { image1, image2, options } = parseArgs();

    const transformer = await getTransformer(options.transformer);
    const result = await sadBin(image1, image2, {
      outputPath: options.outputPath,
      transformer,
      sadOptions: {
        tileSize: options.tileSize,
        downsampleFactor: options.downsampleFactor,
        enableBlur: options.enableBlur,
        earlyExitThreshold: options.earlyExitThreshold,
      },
    });

    console.log(`SAD computed in: ${result.duration.toFixed(2)}ms`);
    console.log(`dimensions: ${result.width}x${result.height}`);
    console.log(`SAD value: ${result.diffCount.toFixed(6)}`);
    console.log(
      `difference percentage: ${(result.diffCount * 100).toFixed(2)}%`
    );

    if (result.diffCount > 0 && result.outputData) {
      console.log(`diff image: ${options.outputPath}`);
    }

    // Exit with non-zero code if there are differences
    if (result.diffCount > 0) {
      process.exit(1);
    } else {
      console.log(`Images are identical!`);
      process.exit(0);
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Check if this file is being run directly (not imported)
// Since we're building as CommonJS, use require.main check
if (typeof require !== "undefined" && require.main === module) {
  main();
}
