#!/usr/bin/env node

import blazeDiffBin from "./index";
import type { BlazeDiffTransformer } from "@blazediff/types";

function printUsage(): void {
  console.log(`
Usage: blazediff <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
  -o, --output <path>       Output path for the diff image
  -t, --threshold <num>     Matching threshold (0 to 1, default: 0.1)
  -a, --alpha <num>         Opacity of original image in diff (default: 0.1)
  --aa-color <r,g,b>        Color for anti-aliased pixels (default: 255,255,0)
  --diff-color <r,g,b>      Color for different pixels (default: 255,0,0)
  --diff-color-alt <r,g,b>  Alternative color for dark differences (default: same as diff-color)
  --include-aa              Include anti-aliasing detection
  --diff-mask               Draw diff over transparent background
  --transformer <name>      Specify transformer to use (e.g. pngjs, sharp)
  -h, --help                Show this help message

Examples:
  blazediff image1.png image2.png
  blazediff image1.png image2.png -o diff.png -t 0.05
  blazediff image1.png image2.png --threshold 0.2 --alpha 0.3
`);
}

function parseRGB(colorStr: string): [number, number, number] {
  const parts = colorStr.split(",").map((s) => parseInt(s.trim()));
  if (parts.length !== 3 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error(
      `Invalid RGB color format: ${colorStr}. Expected format: r,g,b (e.g., 255,0,0)`
    );
  }
  return [parts[0], parts[1], parts[2]];
}

function parseArgs(): {
  image1: string;
  image2: string;
  options: {
    outputPath?: string;
    threshold?: number;
    alpha?: number;
    aaColor?: [number, number, number];
    diffColor?: [number, number, number];
    diffColorAlt?: [number, number, number];
    includeAA?: boolean;
    diffMask?: boolean;
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
          i++; // Skip next argument
        }
        break;
      case "-t":
      case "--threshold":
        if (nextArg) {
          const threshold = parseFloat(nextArg);
          if (isNaN(threshold) || threshold < 0 || threshold > 1) {
            throw new Error(
              `Invalid threshold: ${nextArg}. Must be between 0 and 1`
            );
          }
          options.threshold = threshold;
          i++;
        }
        break;
      case "-a":
      case "--alpha":
        if (nextArg) {
          const alpha = parseFloat(nextArg);
          if (isNaN(alpha) || alpha < 0 || alpha > 1) {
            throw new Error(
              `Invalid alpha: ${nextArg}. Must be between 0 and 1`
            );
          }
          options.alpha = alpha;
          i++;
        }
        break;
      case "--aa-color":
        if (nextArg) {
          options.aaColor = parseRGB(nextArg);
          i++;
        }
        break;
      case "--diff-color":
        if (nextArg) {
          options.diffColor = parseRGB(nextArg);
          i++;
        }
        break;
      case "--diff-color-alt":
        if (nextArg) {
          options.diffColorAlt = parseRGB(nextArg);
          i++;
        }
        break;
      case "--include-aa":
        options.includeAA = true;
        break;
      case "--diff-mask":
        options.diffMask = true;
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
    const result = await blazeDiffBin(image1, image2, {
      outputPath: options.outputPath,
      transformer,
      coreOptions: {
        threshold: options.threshold,
        alpha: options.alpha,
        aaColor: options.aaColor,
        diffColor: options.diffColor,
        diffColorAlt: options.diffColorAlt,
        includeAA: options.includeAA,
        diffMask: options.diffMask,
      },
    });

    console.log(`matched in: ${result.duration.toFixed(2)}ms`);
    console.log(`dimensions: ${result.width}x${result.height}`);
    console.log(`different pixels: ${result.diffCount}`);
    console.log(
      `error: ${(
        (result.diffCount / (result.width * result.height)) *
        100
      ).toFixed(2)}%`
    );

    if (options.outputPath && result.outputData) {
      await transformer.write(
        {
          data: result.outputData,
          width: result.width,
          height: result.height,
        },
        options.outputPath
      );
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
