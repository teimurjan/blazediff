"use client";

import blazediff, { type Difference } from "@blazediff/object";
import { useCallback, useEffect, useState } from "react";

interface ImageComparisonProps {
  newObject: any;
  oldObject: any;
}

export default function ImageComparison({
  newObject,
  oldObject,
}: ImageComparisonProps) {
  const [result, setResult] = useState<Difference[]>([]);

  const compare = useCallback(async () => {
    setResult(blazediff(newObject, oldObject));
  }, [newObject, oldObject]);

  useEffect(() => {
    compare();
  }, [compare]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col">
          <div className="flex-1 overflow-y-auto max-h-80">
            <pre>{JSON.stringify(oldObject, null, 2)}</pre>
          </div>
          <p className="mt-auto text-sm text-gray-600 text-center">
            Old Object
          </p>
        </div>
        <div className="flex flex-col">
          <div className="flex-1 overflow-y-auto max-h-80">
            <pre>{JSON.stringify(newObject, null, 2)}</pre>
          </div>
          <p className="mt-auto text-sm text-gray-600 text-center">
            New Object
          </p>
        </div>
        <div>
          <div className="flex-1 overflow-y-auto max-h-80">
            {result.length > 0 ? (
              <pre>{JSON.stringify(result, null, 2)}</pre>
            ) : (
              <div className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 flex-1" />
            )}
          </div>
          <p className="text-sm text-gray-600 mt-2 text-center">Result</p>
        </div>
      </div>
    </div>
  );
}
