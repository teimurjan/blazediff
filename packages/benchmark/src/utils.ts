import { exec } from "child_process";
import { readdirSync } from "fs";
import { join } from "path";

export async function safeExec(command: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    exec(command, (error, stdout, _stderr) => {
      if (error && !stdout) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

export type ImagePair = {
  a: string;
  b: string;
  name: string;
};

export async function getImagePairs(
  fixturesDir: string,
  fixturesSubDir: string
): Promise<Array<ImagePair>> {
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
