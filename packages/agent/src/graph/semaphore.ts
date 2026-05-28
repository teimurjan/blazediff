export interface Semaphore {
	run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createSemaphore(limit: number): Semaphore {
	if (limit < 1) throw new Error(`semaphore limit must be >= 1 (got ${limit})`);

	let current = 0;
	const queue: Array<() => void> = [];

	async function run<T>(fn: () => Promise<T>): Promise<T> {
		if (current >= limit) {
			await new Promise<void>((resolve) => queue.push(resolve));
		}
		current++;
		try {
			return await fn();
		} finally {
			current--;
			const next = queue.shift();
			if (next) next();
		}
	}

	return { run };
}
