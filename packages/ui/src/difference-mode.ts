import blazediff, { type CoreOptions } from "@blazediff/core";
import { BaseElement } from "./base-element";

export class DifferenceMode extends BaseElement {
	private container: HTMLDivElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;

	static get observedAttributes() {
		return [
			"src1",
			"src2",
			"threshold",
			"include-aa",
			"alpha",
			"class-container",
			"class-canvas",
		];
	}

	connectedCallback() {
		this.render();
		this.loadAndCompare();
	}

	attributeChangedCallback(name: string, oldValue: string, newValue: string) {
		if (oldValue === newValue) return;

		switch (name) {
			case "src1":
			case "src2":
			case "threshold":
			case "include-aa":
			case "alpha":
				this.loadAndCompare();
				break;
			case "class-container":
				if (this.container) this.applyClassName(this.container, "container");
				break;
			case "class-canvas":
				if (this.canvas) this.applyClassName(this.canvas, "canvas");
				break;
		}
	}

	private render() {
		this.container = document.createElement("div");
		this.applyClassName(this.container, "container");

		this.canvas = document.createElement("canvas");
		this.applyClassName(this.canvas, "canvas");
		this.ctx = this.canvas.getContext("2d");

		this.container.appendChild(this.canvas);
		this.appendChild(this.container);
	}

	private async loadAndCompare() {
		const src1 = this.getAttribute("src1");
		const src2 = this.getAttribute("src2");

		if (!src1 || !src2 || !this.canvas || !this.ctx) return;

		try {
			const [img1, img2] = await Promise.all([
				this.loadImage(src1),
				this.loadImage(src2),
			]);

			if (img1.width !== img2.width || img1.height !== img2.height) {
				throw new Error(
					`Image dimensions do not match. Image 1: ${img1.width}x${img1.height}, Image 2: ${img2.width}x${img2.height}`,
				);
			}

			const width = img1.width;
			const height = img1.height;

			this.canvas.width = width;
			this.canvas.height = height;

			const imageData1 = this.getImageData(img1);
			const imageData2 = this.getImageData(img2);

			const output = new Uint8ClampedArray(width * height * 4);

			const options: CoreOptions = {
				threshold: Number(this.getAttribute("threshold")) || 0.1,
				includeAA: this.getAttribute("include-aa") === "true",
				alpha: Number(this.getAttribute("alpha")) || 0.1,
			};

			const diffCount = blazediff(
				imageData1.data,
				imageData2.data,
				output,
				width,
				height,
				options,
			);

			const outputImageData = new ImageData(output, width, height);
			this.ctx.putImageData(outputImageData, 0, 0);

			this.dispatchEvent(
				new CustomEvent("diff-complete", {
					detail: {
						diffCount,
						totalPixels: width * height,
						percentage: (diffCount / (width * height)) * 100,
					},
				}),
			);
		} catch (error) {
			this.dispatchEvent(
				new CustomEvent("diff-error", {
					detail: { error },
				}),
			);
		}
	}

	private loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	private getImageData(img: HTMLImageElement): ImageData {
		const canvas = document.createElement("canvas");
		canvas.width = img.width;
		canvas.height = img.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Could not get canvas context");
		ctx.drawImage(img, 0, 0);
		return ctx.getImageData(0, 0, img.width, img.height);
	}
}

customElements.define("blazediff-difference", DifferenceMode);
