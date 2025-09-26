import { BaseElement } from "./base-element";

export class TwoUpMode extends BaseElement {
	private container: HTMLDivElement | null = null;
	private containerInner: HTMLDivElement | null = null;
	private leftPanel: HTMLDivElement | null = null;
	private rightPanel: HTMLDivElement | null = null;
	private img1: HTMLImageElement | null = null;
	private img2: HTMLImageElement | null = null;
	private dimensionInfo: HTMLDivElement | null = null;

	static get observedAttributes() {
		return [
			"src1",
			"src2",
			"class-container",
			"class-container-inner",
			"class-panel",
			"class-image",
			"class-dimension-info",
		];
	}

	connectedCallback() {
		this.render();
		this.loadImages();
	}

	attributeChangedCallback(name: string, oldValue: string, newValue: string) {
		if (oldValue === newValue) return;

		switch (name) {
			case "src1":
			case "src2":
				this.loadImages();
				break;
			case "class-container":
				if (this.container) this.applyClassName(this.container, "container");
				break;
			case "class-container-inner":
				if (this.containerInner)
					this.applyClassName(this.containerInner, "container-inner");
				break;
			case "class-panel":
				if (this.leftPanel) this.applyClassName(this.leftPanel, "panel");
				if (this.rightPanel) this.applyClassName(this.rightPanel, "panel");
				break;
			case "class-image":
				if (this.img1) this.applyClassName(this.img1, "image");
				if (this.img2) this.applyClassName(this.img2, "image");
				break;
			case "class-dimension-info":
				if (this.dimensionInfo)
					this.applyClassName(this.dimensionInfo, "dimension-info");
				break;
		}
	}

	private render() {
		this.container = document.createElement("div");
		this.applyClassName(this.container, "container");

		this.containerInner = document.createElement("div");
		this.applyClassName(this.containerInner, "container-inner");

		this.leftPanel = document.createElement("div");
		this.applyClassName(this.leftPanel, "panel");

		this.rightPanel = document.createElement("div");
		this.applyClassName(this.rightPanel, "panel");

		this.img1 = document.createElement("img");
		this.img1.crossOrigin = "anonymous";
		this.applyClassName(this.img1, "image");

		this.img2 = document.createElement("img");
		this.img2.crossOrigin = "anonymous";
		this.applyClassName(this.img2, "image");

		this.dimensionInfo = document.createElement("div");
		this.applyClassName(this.dimensionInfo, "dimension-info");

		this.leftPanel.appendChild(this.img1);
		this.rightPanel.appendChild(this.img2);

		this.containerInner.appendChild(this.leftPanel);
		this.containerInner.appendChild(this.rightPanel);

		this.container.appendChild(this.containerInner);
		this.container.appendChild(this.dimensionInfo);

		this.appendChild(this.container);
	}

	private async loadImages() {
		const src1 = this.getAttribute("src1");
		const src2 = this.getAttribute("src2");

		if (!src1 || !src2 || !this.img1 || !this.img2 || !this.dimensionInfo)
			return;

		try {
			this.img1.src = src1;
			this.img2.src = src2;

			await Promise.all([
				new Promise((resolve, reject) => {
					if (!this.img1) return reject();
					this.img1.onload = resolve;
					this.img1.onerror = reject;
				}),
				new Promise((resolve, reject) => {
					if (!this.img2) return reject();
					this.img2.onload = resolve;
					this.img2.onerror = reject;
				}),
			]);

			const width1 = this.img1.naturalWidth;
			const height1 = this.img1.naturalHeight;
			const width2 = this.img2.naturalWidth;
			const height2 = this.img2.naturalHeight;

			if (width1 !== width2 || height1 !== height2) {
				const widthDiff = width2 - width1;
				const heightDiff = height2 - height1;

				this.dimensionInfo.textContent = `Dimensions changed: ${width1}×${height1} → ${width2}×${height2} (${widthDiff > 0 ? "+" : ""}${widthDiff}×${heightDiff > 0 ? "+" : ""}${heightDiff})`;
				this.dimensionInfo.style.display = "block";
			} else {
				this.dimensionInfo.textContent = `${width1}×${height1}`;
				this.dimensionInfo.style.display = "block";
			}

			this.dispatchEvent(
				new CustomEvent("images-loaded", {
					detail: {
						image1: { width: width1, height: height1 },
						image2: { width: width2, height: height2 },
					},
				}),
			);
		} catch (error) {
			this.dispatchEvent(
				new CustomEvent("load-error", {
					detail: { error },
				}),
			);
		}
	}
}

customElements.define("blazediff-twoup", TwoUpMode);
