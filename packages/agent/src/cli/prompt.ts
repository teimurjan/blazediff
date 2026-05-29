import { createInterface } from "node:readline/promises";

export interface Choice<T> {
	label: string;
	value: T;
	/** trailing hint shown dimmed after the label */
	hint?: string;
}

/** A readline bound to stdin/stderr so prompts never pollute stdout (`--json`). */
async function ask(question: string): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	try {
		return (await rl.question(question)).trim();
	} finally {
		rl.close();
	}
}

/**
 * Numbered single-select prompt. Empty input picks `defaultIndex`. Returns the
 * chosen option's `value`.
 */
export async function promptChoice<T>(
	question: string,
	choices: Choice<T>[],
	defaultIndex = 0,
): Promise<T> {
	if (choices.length === 0) throw new Error("promptChoice: no choices");
	const lines = [
		question,
		...choices.map(
			(c, i) => `  [${i + 1}] ${c.label}${c.hint ? `  ${c.hint}` : ""}`,
		),
		"",
	];
	process.stderr.write(`${lines.join("\n")}`);
	const answer = await ask(`Choice (default ${defaultIndex + 1}): `);
	if (!answer) return choices[defaultIndex].value;
	const idx = Number(answer);
	if (!Number.isInteger(idx) || idx < 1 || idx > choices.length) {
		throw new Error(`invalid choice "${answer}"; expected 1-${choices.length}`);
	}
	return choices[idx - 1].value;
}

/** Yes/no prompt. Empty input returns `defaultYes`. */
export async function promptYesNo(
	question: string,
	defaultYes = true,
): Promise<boolean> {
	const suffix = defaultYes ? "(Y/n)" : "(y/N)";
	const answer = (await ask(`${question} ${suffix} `)).toLowerCase();
	if (!answer) return defaultYes;
	return answer === "y" || answer === "yes";
}
