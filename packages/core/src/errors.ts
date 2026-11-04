export type BlazeDiffErrorCode =
	| "invalid-image"
	| "invalid-output"
	| "invalid-mask"
	| "invalid-option";

/** Thrown for invalid arguments. Comparable images never throw. */
export class BlazeDiffError extends Error {
	readonly code: BlazeDiffErrorCode;

	constructor(code: BlazeDiffErrorCode, message: string) {
		super(message);
		this.name = "BlazeDiffError";
		this.code = code;
	}
}
