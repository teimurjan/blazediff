export abstract class BaseElement extends HTMLElement {
	protected getClassName(name: string): string {
		return this.getAttribute(`class-${name}`) || "";
	}

	protected applyClassName(element: HTMLElement, name: string): void {
		const className = this.getClassName(name);
		if (className) {
			element.className = className;
		}
	}
}
