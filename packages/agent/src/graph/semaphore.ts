export class Semaphore {
	private current = 0;
	private readonly queue: Array<() => void> = [];

	constructor(private readonly limit: number) {
		if (limit < 1)
			throw new Error(`semaphore limit must be >= 1 (got ${limit})`);
	}

	async run<T>(fn: () => Promise<T>): Promise<T> {
		if (this.current >= this.limit) {
			await new Promise<void>((resolve) => this.queue.push(resolve));
		}
		this.current++;
		try {
			return await fn();
		} finally {
			this.current--;
			const next = this.queue.shift();
			if (next) next();
		}
	}
}
