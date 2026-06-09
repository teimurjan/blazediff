/** Sets `element.className` from an optional class string (no-op when undefined). */
export function applyClassName(
	element: HTMLElement,
	className: string | undefined,
): void {
	element.className = className ?? "";
}

type StyleMap = Partial<CSSStyleDeclaration> & Record<string, string>;

export function createElement<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options: { className?: string; style?: StyleMap } = {},
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	if (options.className) element.className = options.className;
	if (options.style) Object.assign(element.style, options.style);
	return element;
}
