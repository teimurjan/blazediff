import { execSync } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";
import { BenchmarkArgs, ImagePair, ImagePairLoaded } from "./types";
import transformer from "@blazediff/pngjs-transformer";

export async function safeExecSync(command: string): Promise<string> {
  try {
    const stdout = execSync(command).toString();
    return stdout;
  } catch (error: any) {
    if (!error.stdout) {
      throw error;
    }
    return error.stdout.toString();
  }
}

export function getImagePairs(
  fixturesDir: string,
  fixturesSubDir: string
): Array<ImagePair> {
  const pairs: Array<ImagePair> = [];

  // Look for pairs like 1a.png, 1b.png
  const dir = join(fixturesDir, fixturesSubDir);
  const files = readdirSync(dir);
  const pngFiles = files.filter((f: string) => f.endsWith(".png"));

  const pairMap = new Map<string, { a?: string; b?: string }>();

  for (const file of pngFiles) {
    const baseName = file.replace(/[ab]\.png$/, "");
    if (!pairMap.has(baseName)) {
      pairMap.set(baseName, {});
    }

    if (file.endsWith("a.png")) {
      pairMap.get(baseName)!.a = file;
    } else if (file.endsWith("b.png")) {
      pairMap.get(baseName)!.b = file;
    }
  }

  for (const [name, pair] of pairMap) {
    if (pair.a && pair.b) {
      pairs.push({
        a: join(fixturesDir, fixturesSubDir, pair.a),
        b: join(fixturesDir, fixturesSubDir, pair.b),
        name: `${fixturesSubDir}/${name}`,
      });
    }
  }

  return pairs;
}

export async function loadImagePairs(
  pairs: ImagePair[]
): Promise<ImagePairLoaded[]> {
  return Promise.all(
    pairs.map(async (pair) => {
      const { a, b, name } = pair;
      const [imageA, imageB] = await Promise.all([
        transformer.transform(a),
        transformer.transform(b),
      ]);
      return {
        a: imageA,
        b: imageB,
        name,
      };
    })
  );
}

export function parseBenchmarkArgs(): BenchmarkArgs {
  const args = process.argv.slice(2);
  const iterationsStr = args
    .find((arg) => arg.startsWith("--iterations="))
    ?.split("=")[1];
  const iterations = iterationsStr ? parseInt(iterationsStr, 10) : 25;
  const target =
    args.find((arg) => arg.startsWith("--target="))?.split("=")[1] ??
    "blazediff";
  const variant =
    args.find((arg) => arg.startsWith("--variant="))?.split("=")[1] ??
    "algorithm";

  return { iterations, target, variant };
}
