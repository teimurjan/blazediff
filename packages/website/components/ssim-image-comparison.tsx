"use client";

import hitchhikersSSIM from "@blazediff/ssim/hitchhikers-ssim";
import ssim from "@blazediff/ssim/ssim";
import { useCallback, useEffect, useState } from "react";
import { imageToCanvas, loadImage } from "../utils/image";

interface ComparisonResult {
  score?: number;
  error?: string;
}

interface SsimImageComparisonProps {
  fixtureA: string;
  fixtureB: string;
  variant: "ssim" | "hitchhikers-ssim";
}

export default function SsimImageComparison({
  fixtureA,
  fixtureB,
  variant,
}: SsimImageComparisonProps) {
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [diffImageUrl, setDiffImageUrl] = useState<string | null>(null);

  const compare = useCallback(async () => {
    setDiffImageUrl(null);
    try {
      const [img1, img2] = await Promise.all([
        loadImage(fixtureA),
        loadImage(fixtureB),
      ]);

      const canvas1 = imageToCanvas(img1);
      const canvas2 = imageToCanvas(img2);

      const ctx1 = canvas1.getContext("2d");
      const ctx2 = canvas2.getContext("2d");

      if (!ctx1 || !ctx2) {
        throw new Error("Could not get canvas context");
      }

      const data1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
      const data2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);

      const diffCanvas = document.createElement("canvas");
      diffCanvas.width = canvas1.width;
      diffCanvas.height = canvas1.height;
      const diffCtx = diffCanvas.getContext("2d");

      if (!diffCtx) {
        throw new Error("Could not get canvas context");
      }

      const diffData = diffCtx.createImageData(canvas1.width, canvas1.height);

      const score =
        variant === "ssim"
          ? ssim(
              data1.data,
              data2.data,
              diffData.data,
              canvas1.width,
              canvas1.height
            )
          : hitchhikersSSIM(
              data1.data,
              data2.data,
              diffData.data,
              canvas1.width,
              canvas1.height
            );

      diffCtx.putImageData(diffData, 0, 0);
      setDiffImageUrl(diffCanvas.toDataURL());

      setResult({
        score,
      });
    } catch (error) {
      setResult({ error: (error as Error).message });
    }
  }, [fixtureA, fixtureB, variant]);

  useEffect(() => {
    compare();
  }, [compare]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <img src={fixtureA} alt="Fixture A" className="w-full rounded-lg" />
          <p className="text-sm text-gray-600 mt-2 text-center">Image 1</p>
        </div>
        <div>
          <img src={fixtureB} alt="Fixture B" className="w-full rounded-lg" />
          <p className="text-sm text-gray-600 mt-2 text-center">Image 2</p>
        </div>
        <div className="flex flex-col">
          {diffImageUrl ? (
            <img
              src={diffImageUrl}
              alt="SSIM map visualization"
              className="w-full rounded-lg"
            />
          ) : (
            <div className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 flex-1" />
          )}

          <p className="text-sm text-gray-600 mt-2 text-center">SSIM Map</p>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
            {result.error ? (
              <p className="text-red-600">Error: {result.error}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">
                  {variant === "ssim" ? "SSIM score" : "Coefficient of Variation"}: {result.score?.toFixed(6)}
                </p>
                <p className="text-sm text-gray-500">
                  (1.0 = identical, 0.0 = completely different)
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
