"use client";

import Image from "next/image";
import { useState } from "react";
import InterpretSummary from "./interpret-summary";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ChangeRegion {
  bbox: BoundingBox;
  pixelCount: number;
  percentage: number;
  position: string;
  shape: string;
  changeType: string;
  confidence: number;
}

interface CompactRegion {
  position: string;
  changeType: string;
  confidence: number;
  percentage: number;
}

interface InterpretResult {
  summary: string;
  totalRegions: number;
  regions: ChangeRegion[];
  severity: string;
  diffPercentage: number;
  width: number;
  height: number;
}

interface CompactResult {
  summary: string;
  severity: string;
  diffPercentage: number;
  regions: CompactRegion[];
}

type Mode = "full" | "compact";

interface InterpretComparisonProps {
  fixtureA: string;
  fixtureB: string;
  fullResult: InterpretResult;
  compactResult: CompactResult;
}

function RegionHighlight({
  bbox,
  imageWidth,
  imageHeight,
}: {
  bbox: BoundingBox;
  imageWidth: number;
  imageHeight: number;
}) {
  return (
    <div
      className="absolute pointer-events-none border-2 border-white/80 rounded-sm transition-all duration-150"
      style={{
        left: `${(bbox.x / imageWidth) * 100}%`,
        top: `${(bbox.y / imageHeight) * 100}%`,
        width: `${(bbox.width / imageWidth) * 100}%`,
        height: `${(bbox.height / imageHeight) * 100}%`,
        boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
      }}
    />
  );
}

export default function InterpretComparison({
  fixtureA,
  fixtureB,
  fullResult,
  compactResult,
}: InterpretComparisonProps) {
  const [mode, setMode] = useState<Mode>("full");
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activeResult = mode === "full" ? fullResult : compactResult;

  const hoveredBbox =
    hoveredIndex !== null && hoveredIndex < fullResult.regions.length
      ? fullResult.regions[hoveredIndex].bbox
      : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="relative overflow-hidden rounded-lg">
            <Image
              src={fixtureA}
              alt="Image 1"
              className="w-full"
              width={400}
              height={400}
            />
            {hoveredBbox && (
              <RegionHighlight
                bbox={hoveredBbox}
                imageWidth={fullResult.width}
                imageHeight={fullResult.height}
              />
            )}
          </div>
          <p className="text-sm text-gray-600 mt-2 text-center">Image 1</p>
        </div>
        <div>
          <div className="relative overflow-hidden rounded-lg">
            <Image
              src={fixtureB}
              alt="Image 2"
              className="w-full"
              width={400}
              height={400}
            />
            {hoveredBbox && (
              <RegionHighlight
                bbox={hoveredBbox}
                imageWidth={fullResult.width}
                imageHeight={fullResult.height}
              />
            )}
          </div>
          <p className="text-sm text-gray-600 mt-2 text-center">Image 2</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("full")}
            className={`px-3 py-1 rounded text-sm ${mode === "full" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}
          >
            Full
          </button>
          <button
            type="button"
            onClick={() => setMode("compact")}
            className={`px-3 py-1 rounded text-sm ${mode === "compact" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}
          >
            Compact
          </button>
        </div>

        <InterpretSummary
          severity={activeResult.severity}
          diffPercentage={activeResult.diffPercentage}
        >
          <p className="text-sm whitespace-pre-line">{activeResult.summary}</p>
        </InterpretSummary>

        {activeResult.regions.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            <p className="text-sm font-medium">
              Regions ({activeResult.regions.length})
            </p>
            {mode === "full"
              ? (activeResult.regions as ChangeRegion[]).map((region, i) => (
                  // biome-ignore lint/a11y/noStaticElementInteractions: hover highlight
                  <div
                    key={`${region.position}-${i}`}
                    className={`p-3 rounded-lg border text-sm cursor-pointer transition-colors ${hoveredIndex === i ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-gray-200 dark:border-gray-700"}`}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{region.position}</span>
                      <span className="text-gray-500">·</span>
                      <span>{region.changeType}</span>
                      <span className="text-gray-500">·</span>
                      <span className="text-gray-500">{region.shape}</span>
                      <span className="text-gray-500">·</span>
                      <span className="text-xs text-gray-400">
                        ({region.bbox.x}, {region.bbox.y},{" "}
                        {region.bbox.width}×{region.bbox.height}) ·{" "}
                        {region.percentage.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))
              : (activeResult.regions as CompactRegion[]).map((region, i) => (
                  // biome-ignore lint/a11y/noStaticElementInteractions: hover highlight
                  <div
                    key={`${region.position}-${i}`}
                    className={`p-3 rounded-lg border text-sm cursor-pointer transition-colors ${hoveredIndex === i ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-gray-200 dark:border-gray-700"}`}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{region.position}</span>
                      <span className="text-gray-500">·</span>
                      <span>{region.changeType}</span>
                      <span className="text-gray-500">·</span>
                      <span className="text-xs text-gray-400">
                        {region.percentage.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setJsonExpanded(!jsonExpanded)}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            {jsonExpanded ? "Hide" : "Show"} raw JSON
          </button>
          {jsonExpanded && (
            <pre className="mt-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs overflow-x-auto max-h-80">
              {JSON.stringify(activeResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
