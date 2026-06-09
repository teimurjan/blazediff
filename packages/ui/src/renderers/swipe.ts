import { createSwipeEngine } from "../engine/swipe";
import type { MountHandle, SwipeMountOptions } from "../types";
import { applyClassName, createElement } from "./dom";

export function mountSwipe(
	target: HTMLElement,
	options: SwipeMountOptions,
): MountHandle<SwipeMountOptions> {
	let opts = options;

	const root = createElement("div", { className: opts.className });
	const container = createElement("div", {
		className: opts.containerClassName,
		style: {
			position: "relative",
			overflow: "hidden",
			cursor: "ew-resize",
			userSelect: "none",
			WebkitUserSelect: "none",
		},
	});

	const sharedImageStyle = {
		width: "100%",
		height: "100%",
		objectFit: "contain",
		pointerEvents: "none",
	} as const;

	const image1 = createElement("img", {
		className: opts.image1ClassName,
		style: { ...sharedImageStyle },
	});
	image1.src = opts.src1;
	image1.alt = opts.alt1 ?? "Before";

	const image2 = createElement("img", {
		className: opts.image2ClassName,
		style: {
			...sharedImageStyle,
			position: "absolute",
			top: "0",
			left: "0",
		},
	});
	image2.src = opts.src2;
	image2.alt = opts.alt2 ?? "After";

	const divider = createElement("div", {
		className: opts.dividerClassName,
		style: {
			position: "absolute",
			top: "0",
			bottom: "0",
			width: "2px",
			backgroundColor: "white",
			cursor: "ew-resize",
			zIndex: "10",
		},
	});

	container.append(image1, image2, divider);
	root.appendChild(container);
	target.appendChild(root);

	const engine = createSwipeEngine(opts.initialPosition ?? 50);
	let lastPosition = engine.getState().position;

	function renderState() {
		const { position } = engine.getState();
		image2.style.clipPath = `inset(0 0 0 ${position}%)`;
		divider.style.left = `${position}%`;
		if (position !== lastPosition) {
			lastPosition = position;
			opts.onPositionChange?.(position);
		}
	}
	renderState();

	const unsubscribe = engine.subscribe(renderState);

	const percentFromClientX = (clientX: number) => {
		const rect = container.getBoundingClientRect();
		if (rect.width === 0) return 0;
		return ((clientX - rect.left) / rect.width) * 100;
	};

	const onMouseMove = (e: MouseEvent) =>
		engine.actions.move(percentFromClientX(e.clientX));
	const onMouseUp = () => {
		engine.actions.end();
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
	};
	const onMouseDown = (e: MouseEvent) => {
		engine.actions.start(percentFromClientX(e.clientX));
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};

	const onTouchMove = (e: TouchEvent) =>
		engine.actions.move(percentFromClientX(e.touches[0].clientX));
	const onTouchEnd = () => {
		engine.actions.end();
		document.removeEventListener("touchmove", onTouchMove);
		document.removeEventListener("touchend", onTouchEnd);
	};
	const onTouchStart = (e: TouchEvent) => {
		engine.actions.start(percentFromClientX(e.touches[0].clientX));
		document.addEventListener("touchmove", onTouchMove);
		document.addEventListener("touchend", onTouchEnd);
	};

	container.addEventListener("mousedown", onMouseDown);
	container.addEventListener("touchstart", onTouchStart);

	const removeDocumentListeners = () => {
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
		document.removeEventListener("touchmove", onTouchMove);
		document.removeEventListener("touchend", onTouchEnd);
	};

	return {
		update(next) {
			opts = { ...opts, ...next };
			applyClassName(root, opts.className);
			applyClassName(container, opts.containerClassName);
			applyClassName(image1, opts.image1ClassName);
			applyClassName(image2, opts.image2ClassName);
			applyClassName(divider, opts.dividerClassName);
			if (image1.src !== opts.src1) image1.src = opts.src1;
			if (image2.src !== opts.src2) image2.src = opts.src2;
			image1.alt = opts.alt1 ?? "Before";
			image2.alt = opts.alt2 ?? "After";
		},
		destroy() {
			unsubscribe();
			container.removeEventListener("mousedown", onMouseDown);
			container.removeEventListener("touchstart", onTouchStart);
			removeDocumentListeners();
			engine.destroy();
			root.remove();
		},
	};
}
