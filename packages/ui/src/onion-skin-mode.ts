import { BaseElement } from "./base-element";

export class OnionSkinMode extends BaseElement {
	private container: HTMLDivElement | null = null;
	private imageContainer: HTMLDivElement | null = null;
	private img1: HTMLImageElement | null = null;
	private img2: HTMLImageElement | null = null;
	private sliderContainer: HTMLDivElement | null = null;
	private slider: HTMLInputElement | null = null;
	private sliderLabel: HTMLLabelElement | null = null;

	static get observedAttributes() {
		return [
			"src1",
			"src2",
			"opacity",
			"class-container",
			"class-image-container",
			"class-image",
			"class-slider-container",
			"class-slider",
			"class-slider-label",
			"text-slider-label",
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
			case "opacity":
				this.updateOpacity();
				break;
			case "class-container":
				if (this.container) this.applyClassName(this.container, "container");
				break;
			case "class-image-container":
				if (this.imageContainer)
					this.applyClassName(this.imageContainer, "image-container");
				break;
			case "class-image":
				if (this.img1) this.applyClassName(this.img1, "image");
				if (this.img2) this.applyClassName(this.img2, "image");
				break;
			case "class-slider-container":
				if (this.sliderContainer)
					this.applyClassName(this.sliderContainer, "slider-container");
				break;
			case "class-slider":
				if (this.slider) this.applyClassName(this.slider, "slider");
				break;
			case "class-slider-label":
				if (this.sliderLabel)
					this.applyClassName(this.sliderLabel, "slider-label");
				break;
			case "text-slider-label":
				if (this.sliderLabel)
					this.sliderLabel.textContent =
						this.getAttribute("text-slider-label") || "Opacity: ";
				break;
		}
	}

	private render() {
		this.container = document.createElement("div");
		this.applyClassName(this.container, "container");

		this.imageContainer = document.createElement("div");
		this.applyClassName(this.imageContainer, "image-container");

		this.img1 = document.createElement("img");
		this.img1.crossOrigin = "anonymous";
		this.applyClassName(this.img1, "image");

		this.img2 = document.createElement("img");
		this.img2.crossOrigin = "anonymous";
		this.applyClassName(this.img2, "image");
		this.img2.style.position = "absolute";
		this.img2.style.top = "0";
		this.img2.style.left = "0";

		this.imageContainer.style.position = "relative";
		this.imageContainer.appendChild(this.img1);
		this.imageContainer.appendChild(this.img2);

		this.sliderContainer = document.createElement("div");
		this.applyClassName(this.sliderContainer, "slider-container");

		this.sliderLabel = document.createElement("label");
		this.sliderLabel.textContent =
			this.getAttribute("text-slider-label") || "Opacity:";
		this.applyClassName(this.sliderLabel, "slider-label");

		this.slider = document.createElement("input");
		this.slider.type = "range";
		this.slider.min = "0";
		this.slider.max = "100";
		this.slider.value = this.getAttribute("opacity") || "50";
		this.applyClassName(this.slider, "slider");

		this.slider.addEventListener("input", (e) => {
			const value = (e.target as HTMLInputElement).value;
			this.setAttribute("opacity", value);
			this.dispatchEvent(
				new CustomEvent("opacity-change", {
					detail: { opacity: Number(value) },
				}),
			);
		});

		this.sliderContainer.appendChild(this.sliderLabel);
		this.sliderContainer.appendChild(this.slider);

		this.container.appendChild(this.imageContainer);
		this.container.appendChild(this.sliderContainer);

		this.appendChild(this.container);

		this.updateOpacity();
	}

	private updateOpacity() {
		if (!this.img2 || !this.slider) return;

		const opacity = this.getAttribute("opacity") || "50";
		this.img2.style.opacity = (Number(opacity) / 100).toString();

		if (this.slider.value !== opacity) {
			this.slider.value = opacity;
		}
	}

	private async loadImages() {
		const src1 = this.getAttribute("src1");
		const src2 = this.getAttribute("src2");

		if (!src1 || !src2 || !this.img1 || !this.img2) return;

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

			this.dispatchEvent(
				new CustomEvent("images-loaded", {
					detail: {
						image1: {
							width: this.img1.naturalWidth,
							height: this.img1.naturalHeight,
						},
						image2: {
							width: this.img2.naturalWidth,
							height: this.img2.naturalHeight,
						},
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

customElements.define("blazediff-onionskin", OnionSkinMode);
