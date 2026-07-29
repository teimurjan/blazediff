import type { ImageSource } from "./types";

export interface ImageSourceUrl {
	url: string;
	revoke(): void;
}

export interface ImageSourceBinding {
	update(source?: ImageSource): void;
	destroy(): void;
}

function asBlobPart(source: Uint8Array): Uint8Array<ArrayBuffer> {
	if (source.buffer instanceof ArrayBuffer) {
		return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
	}
	return Uint8Array.from(source);
}

export function createImageSourceUrl(source: ImageSource): ImageSourceUrl {
	if (typeof source === "string") {
		return { url: source, revoke() {} };
	}

	const url = URL.createObjectURL(new Blob([asBlobPart(source)]));
	return {
		url,
		revoke() {
			URL.revokeObjectURL(url);
		},
	};
}

export function bindImageSource(
	image: HTMLImageElement,
	initialSource?: ImageSource,
): ImageSourceBinding {
	let currentSource = initialSource;
	let currentUrl: ImageSourceUrl | undefined;

	const apply = (source?: ImageSource) => {
		const previousUrl = currentUrl;
		currentUrl =
			source === undefined ? undefined : createImageSourceUrl(source);
		if (currentUrl) image.src = currentUrl.url;
		else image.removeAttribute("src");
		previousUrl?.revoke();
	};

	apply(initialSource);

	return {
		update(source) {
			if (source === currentSource) return;
			currentSource = source;
			apply(source);
		},
		destroy() {
			currentUrl?.revoke();
			currentUrl = undefined;
		},
	};
}

export interface LoadImageOptions {
	crossOrigin?: string | null;
}

export function loadImageElement(
	source: ImageSource,
	options: LoadImageOptions = {},
): Promise<HTMLImageElement> {
	const { crossOrigin = "anonymous" } = options;
	const sourceUrl = createImageSourceUrl(source);
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		if (crossOrigin !== null) img.crossOrigin = crossOrigin;
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = sourceUrl.url;
	}).finally(sourceUrl.revoke);
}

export function getImageData(img: HTMLImageElement): ImageData {
	const canvas = document.createElement("canvas");
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Could not get canvas context");
	ctx.drawImage(img, 0, 0);
	return ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
}
