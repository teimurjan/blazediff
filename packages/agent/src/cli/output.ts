export interface RootOpts {
	json?: boolean;
	quiet?: boolean;
}

export interface Output {
	isJson(): boolean;
	isQuiet(): boolean;
	isTTY(): boolean;
	emit(payload: unknown, human: string): void;
}

export function makeOutput(getRootOpts: () => RootOpts): Output {
	const isJson = () => Boolean(getRootOpts().json);
	const isQuiet = () => Boolean(getRootOpts().quiet);
	const isTTY = () => Boolean(process.stdout.isTTY);
	const emit = (payload: unknown, human: string) => {
		if (isQuiet()) return;
		if (isJson()) {
			process.stdout.write(`${JSON.stringify(payload)}\n`);
			return;
		}
		if (human) process.stdout.write(`${human}\n`);
	};
	return { isJson, isQuiet, isTTY, emit };
}
