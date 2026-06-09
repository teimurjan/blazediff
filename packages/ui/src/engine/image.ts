export interface LoadImageOptions {
	crossOrigin?: string | null;
}

export function loadImageElement(
	src: string,
	options: LoadImageOptions = {},
): Promise<HTMLImageElement> {
	const { crossOrigin = "anonymous" } = options;
	return new Promise((resolve, reject) => {
		const img = new Image();
		if (crossOrigin !== null) img.crossOrigin = crossOrigin;
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
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
