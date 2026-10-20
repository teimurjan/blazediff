/// <reference lib="webworker" />

// Decoding, measuring and interpreting all run here, so the reader's images
// never leave the browser and the slow work never blocks paint.

import { diff, initBlazediff } from "@blazediff/core-wasm";
import gmsd from "@blazediff/gmsd";
import {
	type InterpretResult,
	initInterpret,
	interpret,
} from "@blazediff/interpret-wasm";
import { initMilo, milo } from "@blazediff/milo-wasm";
import hitchhikersSSIM from "@blazediff/ssim/hitchhikers-ssim";
import msssim from "@blazediff/ssim/msssim";
import ssim from "@blazediff/ssim/ssim";
import { type DecodedImage, decodeRgba, fetchWasm } from "../image-decode";
import type { Algorithm } from "./algorithms";
import { type Size, sniffType } from "./image-header";

export type ComparePhase = "decoding" | "measuring" | "interpreting";

/** Wasm URLs come from the caller for the reason given in `interpret.worker.ts`. */
export interface CompareRequest {
	a: Blob;
	b: Blob;
	algorithm: Algorithm;
	threshold: number;
	interpret: boolean;
	wasmUrls: { core: string; interpret: string; milo: string };
}

export interface MetricResult extends Size {
	algorithm: Algorithm;
	/** Differing pixels for `pixel`, the score for every other algorithm. */
	value: number;
	/** MILO's score on the 1-5 opinion scale. */
	mos?: number;
	map: Blob;
}

export type CompareResponse =
	| { type: "phase"; phase: ComparePhase }
	| { type: "size-mismatch"; a: Size; b: Size }
	| { type: "metric"; result: MetricResult }
	| { type: "interpret"; result: InterpretResult }
	| { type: "done" }
	| { type: "error"; message: string };

interface Measurement {
	value: number;
	mos?: number;
}

const post = (message: CompareResponse) => self.postMessage(message);

async function decodeBlob(blob: Blob): Promise<DecodedImage> {
	const bytes = await blob.arrayBuffer();
	const type = sniffType(
		new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength)),
	);
	if (!type) throw new Error("Unsupported format. Use PNG, JPEG or WebP.");
	return decodeRgba(bytes, type);
}

/** MILO's error map, white where nothing differs and red at the worst pixel. */
function paintErrorMap(errorMap: Float32Array, output: Uint8ClampedArray) {
	let max = 0;
	for (const error of errorMap) max = Math.max(max, error);
	const scale = max > 0 ? 255 / max : 0;
	for (let i = 0; i < errorMap.length; i++) {
		const fade = 255 - errorMap[i] * scale;
		const offset = i * 4;
		output[offset] = 255;
		output[offset + 1] = fade;
		output[offset + 2] = fade;
		output[offset + 3] = 255;
	}
}

async function measure(
	request: CompareRequest,
	a: DecodedImage,
	b: DecodedImage,
	output: Uint8ClampedArray<ArrayBuffer>,
): Promise<Measurement> {
	const { width, height } = a;
	switch (request.algorithm) {
		case "pixel":
			await initBlazediff(await fetchWasm(request.wasmUrls.core));
			return {
				value: await diff(
					a.data,
					b.data,
					width,
					height,
					new Uint8Array(output.buffer),
					{
						threshold: request.threshold,
					},
				),
			};
		case "ssim":
			return { value: ssim(a.data, b.data, output, width, height) };
		case "msssim":
			return { value: msssim(a.data, b.data, output, width, height) };
		case "hitchhikers-ssim":
			return { value: hitchhikersSSIM(a.data, b.data, output, width, height) };
		case "gmsd":
			return { value: gmsd(a.data, b.data, output, width, height) };
		case "milo": {
			await initMilo(await fetchWasm(request.wasmUrls.milo));
			const result = await milo(a.data, b.data, width, height, {
				returnMaps: true,
			});
			if (result.errorMap) paintErrorMap(result.errorMap, output);
			return { value: result.rawError, mos: result.mos };
		}
	}
}

async function encodePng(
	rgba: Uint8ClampedArray<ArrayBuffer>,
	{ width, height }: Size,
): Promise<Blob> {
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext("2d");
	if (!context) throw new Error("could not get a 2d canvas context");
	context.putImageData(new ImageData(rgba, width, height), 0, 0);
	return canvas.convertToBlob({ type: "image/png" });
}

async function compare(request: CompareRequest): Promise<void> {
	post({ type: "phase", phase: "decoding" });
	const [a, b] = await Promise.all([
		decodeBlob(request.a),
		decodeBlob(request.b),
	]);
	if (a.width !== b.width || a.height !== b.height) {
		post({
			type: "size-mismatch",
			a: { width: a.width, height: a.height },
			b: { width: b.width, height: b.height },
		});
		return;
	}
	const size = { width: a.width, height: a.height };

	post({ type: "phase", phase: "measuring" });
	const output = new Uint8ClampedArray(size.width * size.height * 4);
	const measurement = await measure(request, a, b, output);
	const map = await encodePng(output, size);
	post({
		type: "metric",
		result: { ...size, ...measurement, algorithm: request.algorithm, map },
	});

	if (!request.interpret) return;
	post({ type: "phase", phase: "interpreting" });
	await initInterpret(await fetchWasm(request.wasmUrls.interpret));
	const result = await interpret(
		a.data,
		b.data,
		size.width,
		size.height,
		undefined,
		{ threshold: request.threshold },
	);
	post({ type: "interpret", result });
}

self.onmessage = async (event: MessageEvent<CompareRequest>) => {
	try {
		await compare(event.data);
		post({ type: "done" });
	} catch (error) {
		post({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
