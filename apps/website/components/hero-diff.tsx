"use client";

import blazediff from "@blazediff/core";
import { IconArrowRight } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { imageToCanvas, loadImage } from "../utils/image";

interface HeroDiffProps {
	fixtureA: string;
	fixtureB: string;
}

export default function HeroDiff({ fixtureA, fixtureB }: HeroDiffProps) {
	const [diffImageUrl, setDiffImageUrl] = useState<string | null>(null);
	const [stats, setStats] = useState<{
		diff: number;
		total: number;
		percentage: number;
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const [img1, img2] = await Promise.all([
				loadImage(fixtureA),
				loadImage(fixtureB),
			]);
			if (cancelled) return;

			const canvas1 = imageToCanvas(img1);
			const canvas2 = imageToCanvas(img2);
			const ctx1 = canvas1.getContext("2d");
			const ctx2 = canvas2.getContext("2d");
			if (!ctx1 || !ctx2) return;

			const data1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
			const data2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);

			const diffCanvas = document.createElement("canvas");
			diffCanvas.width = canvas1.width;
			diffCanvas.height = canvas1.height;
			const diffCtx = diffCanvas.getContext("2d");
			if (!diffCtx) return;

			const output = diffCtx.createImageData(canvas1.width, canvas1.height);
			const diffPixels = blazediff(
				data1.data,
				data2.data,
				output.data,
				canvas1.width,
				canvas1.height,
			);
			diffCtx.putImageData(output, 0, 0);

			const total = canvas1.width * canvas1.height;
			setDiffImageUrl(diffCanvas.toDataURL());
			setStats({
				diff: diffPixels,
				total,
				percentage: Number(((diffPixels / total) * 100).toFixed(2)),
			});
		})();
		return () => {
			cancelled = true;
		};
	}, [fixtureA, fixtureB]);

	return (
		<div>
			<div className="flex items-center gap-3 md:gap-5">
				{/* Source images */}
				<div className="flex gap-2 md:gap-3 min-w-0 flex-[2]">
					<div className="flex-1 min-w-0">
						{/* biome-ignore lint/performance/noImgElement: needs raw img for canvas compat */}
						<img src={fixtureA} alt="Original" className="w-full rounded-lg" />
						<p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 text-center">
							Original
						</p>
					</div>
					<div className="flex-1 min-w-0">
						{/* biome-ignore lint/performance/noImgElement: needs raw img for canvas compat */}
						<img src={fixtureB} alt="Modified" className="w-full rounded-lg" />
						<p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 text-center">
							Modified
						</p>
					</div>
				</div>

				{/* Arrow */}
				<div className="flex items-center justify-center shrink-0 w-8 md:w-12">
					<IconArrowRight className="w-5 h-5 md:w-6 md:h-6 text-gray-400 dark:text-gray-500" />
				</div>

				{/* Result */}
				<div className="flex-1 min-w-0">
					{diffImageUrl ? (
						<>
							{/* biome-ignore lint/performance/noImgElement: data URL from canvas */}
							<img
								src={diffImageUrl}
								alt="Diff result"
								className="w-full rounded-lg"
							/>
							<p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 text-center">
								Diff Result
							</p>
						</>
					) : (
						<div className="w-full rounded-lg bg-gray-100 dark:bg-gray-800 aspect-square" />
					)}
				</div>
			</div>

			{/* Stats */}
			<div className="h-8 mt-4 flex items-center justify-center">
				{stats && (
					<p className="text-sm text-gray-600 dark:text-gray-400">
						<span className="font-semibold">{stats.diff.toLocaleString()}</span>{" "}
						different pixels ({stats.percentage}%)
					</p>
				)}
			</div>
		</div>
	);
}
