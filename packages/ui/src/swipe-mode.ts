import { BaseElement } from "./base-element";

export class SwipeMode extends BaseElement {
	private container: HTMLDivElement | null = null;
	private image1: HTMLImageElement | null = null;
	private image2: HTMLImageElement | null = null;
	private divider: HTMLDivElement | null = null;
	private isDragging = false;
	private currentPosition = 50;

	static get observedAttributes() {
		return [
			"src1",
			"src2",
			"alt1",
			"alt2",
			"class-container",
			"class-image1",
			"class-image2",
			"class-divider",
		];
	}

	connectedCallback() {
		this.render();
		this.setupEventListeners();
	}

	disconnectedCallback() {
		this.removeEventListeners();
	}

	attributeChangedCallback(name: string, oldValue: string, newValue: string) {
		if (oldValue === newValue) return;

		switch (name) {
			case "src1":
				if (this.image1) this.image1.src = newValue;
				break;
			case "src2":
				if (this.image2) this.image2.src = newValue;
				break;
			case "alt1":
				if (this.image1) this.image1.alt = newValue;
				break;
			case "alt2":
				if (this.image2) this.image2.alt = newValue;
				break;
			case "class-container":
				if (this.container) this.applyClassName(this.container, "container");
				break;
			case "class-image1":
				if (this.image1) this.applyClassName(this.image1, "image1");
				break;
			case "class-image2":
				if (this.image2) this.applyClassName(this.image2, "image2");
				break;
			case "class-divider":
				if (this.divider) this.applyClassName(this.divider, "divider");
				break;
		}
	}

	private render() {
		this.container = document.createElement("div");
		this.applyClassName(this.container, "container");
		this.container.style.position = "relative";
		this.container.style.overflow = "hidden";
		this.container.style.cursor = "ew-resize";
		// @ts-expect-error
		this.container.style.webkitTapHighlightColor = "transparent";
		// @ts-expect-error
		this.container.style.webkitTouchCallout = "none";
		this.container.style.webkitUserSelect = "none";
		// @ts-expect-error
		this.container.style.khtmlUserSelect = "none";
		// @ts-expect-error
		this.container.style.mozUserSelect = "none";
		// @ts-expect-error
		this.container.style.msUserSelect = "none";
		this.container.style.userSelect = "none";

		this.image1 = document.createElement("img");
		this.applyClassName(this.image1, "image1");
		this.image1.src = this.getAttribute("src1") || "";
		this.image1.alt = this.getAttribute("alt1") || "Before";
		this.image1.style.width = "100%";
		this.image1.style.height = "100%";
		this.image1.style.objectFit = "contain";
		this.image1.style.pointerEvents = "none";

		this.image2 = document.createElement("img");
		this.applyClassName(this.image2, "image2");
		this.image2.src = this.getAttribute("src2") || "";
		this.image2.alt = this.getAttribute("alt2") || "After";
		this.image2.style.position = "absolute";
		this.image2.style.top = "0";
		this.image2.style.left = "0";
		this.image2.style.width = "100%";
		this.image2.style.height = "100%";
		this.image2.style.objectFit = "contain";
		this.image2.style.clipPath = `inset(0 0 0 ${this.currentPosition}%)`;
		this.image2.style.pointerEvents = "none";

		this.divider = document.createElement("div");
		this.applyClassName(this.divider, "divider");
		this.divider.style.position = "absolute";
		this.divider.style.top = "0";
		this.divider.style.bottom = "0";
		this.divider.style.left = `${this.currentPosition}%`;
		this.divider.style.width = "2px";
		this.divider.style.backgroundColor = "white";
		this.divider.style.cursor = "ew-resize";
		this.divider.style.zIndex = "10";

		this.container.appendChild(this.image1);
		this.container.appendChild(this.image2);
		this.container.appendChild(this.divider);
		this.appendChild(this.container);
	}

	private setupEventListeners() {
		this.handleMouseDown = this.handleMouseDown.bind(this);
		this.handleMouseMove = this.handleMouseMove.bind(this);
		this.handleMouseUp = this.handleMouseUp.bind(this);
		this.handleTouchStart = this.handleTouchStart.bind(this);
		this.handleTouchMove = this.handleTouchMove.bind(this);
		this.handleTouchEnd = this.handleTouchEnd.bind(this);

		this.container?.addEventListener("mousedown", this.handleMouseDown);
		this.container?.addEventListener("touchstart", this.handleTouchStart);
	}

	private removeEventListeners() {
		this.container?.removeEventListener("mousedown", this.handleMouseDown);
		this.container?.removeEventListener("touchstart", this.handleTouchStart);
		document.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseup", this.handleMouseUp);
		document.removeEventListener("touchmove", this.handleTouchMove);
		document.removeEventListener("touchend", this.handleTouchEnd);
	}

	private handleMouseDown(e: MouseEvent) {
		this.isDragging = true;
		document.addEventListener("mousemove", this.handleMouseMove);
		document.addEventListener("mouseup", this.handleMouseUp);
		this.updatePosition(e.clientX);
	}

	private handleMouseMove(e: MouseEvent) {
		if (!this.isDragging) return;
		this.updatePosition(e.clientX);
	}

	private handleMouseUp() {
		this.isDragging = false;
		document.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseup", this.handleMouseUp);
	}

	private handleTouchStart(e: TouchEvent) {
		this.isDragging = true;
		document.addEventListener("touchmove", this.handleTouchMove);
		document.addEventListener("touchend", this.handleTouchEnd);
		const touch = e.touches[0];
		this.updatePosition(touch.clientX);
	}

	private handleTouchMove(e: TouchEvent) {
		if (!this.isDragging) return;
		const touch = e.touches[0];
		this.updatePosition(touch.clientX);
	}

	private handleTouchEnd() {
		this.isDragging = false;
		document.removeEventListener("touchmove", this.handleTouchMove);
		document.removeEventListener("touchend", this.handleTouchEnd);
	}

	private updatePosition(clientX: number) {
		if (!this.container || !this.image2 || !this.divider) return;

		const rect = this.container.getBoundingClientRect();
		const x = clientX - rect.left;
		const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

		this.currentPosition = percentage;
		this.image2.style.clipPath = `inset(0 0 0 ${percentage}%)`;
		this.divider.style.left = `${percentage}%`;

		this.dispatchEvent(
			new CustomEvent("position-change", {
				detail: { position: percentage },
			}),
		);
	}
}

customElements.define("blazediff-swipe", SwipeMode);
