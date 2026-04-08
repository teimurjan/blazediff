import blazediff from "@blazediff/core";
import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

export interface DiffResult {
	diffImageUrl: string;
	diffPixels: number;
	totalPixels: number;
	percentage: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

function extractImageData(img: HTMLImageElement): ImageData {
	const canvas = document.createElement("canvas");
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get 2d context");
	ctx.drawImage(img, 0, 0);
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function useDiffComputation(
	fixtureA: string,
	fixtureB: string,
): DiffResult | null {
	const [result, setResult] = useState<DiffResult | null>(null);
	const [handle] = useState(() => delayRender("Computing diff..."));

	useEffect(() => {
		let cancelled = false;

		(async () => {
			const [img1, img2] = await Promise.all([
				loadImage(staticFile(fixtureA)),
				loadImage(staticFile(fixtureB)),
			]);
			if (cancelled) return;

			const data1 = extractImageData(img1);
			const data2 = extractImageData(img2);

			const outputCanvas = document.createElement("canvas");
			outputCanvas.width = img1.width;
			outputCanvas.height = img1.height;
			const outputCtx = outputCanvas.getContext("2d");
			if (!outputCtx) throw new Error("Failed to get 2d context");
			const output = outputCtx.createImageData(img1.width, img1.height);

			const diffPixels = blazediff(
				data1.data,
				data2.data,
				output.data,
				img1.width,
				img1.height,
			);

			outputCtx.putImageData(output, 0, 0);
			const totalPixels = img1.width * img1.height;

			setResult({
				diffImageUrl: outputCanvas.toDataURL(),
				diffPixels,
				totalPixels,
				percentage: Number(((diffPixels / totalPixels) * 100).toFixed(2)),
			});

			continueRender(handle);
		})();

		return () => {
			cancelled = true;
		};
	}, [fixtureA, fixtureB, handle]);

	return result;
}
