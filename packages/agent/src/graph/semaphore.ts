export interface Semaphore {
	run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

interface Waiter {
	start: () => void;
}

function abortReason(signal: AbortSignal): Error {
	return signal.reason instanceof Error
		? signal.reason
		: new Error("operation aborted");
}

export function createSemaphore(limit: number): Semaphore {
	if (limit < 1) throw new Error(`semaphore limit must be >= 1 (got ${limit})`);

	let current = 0;
	const queue: Waiter[] = [];

	async function run<T>(
		fn: () => Promise<T>,
		signal?: AbortSignal,
	): Promise<T> {
		if (signal?.aborted) throw abortReason(signal);

		if (current >= limit) {
			await new Promise<void>((resolve, reject) => {
				const onAbort = () => {
					const index = queue.indexOf(waiter);
					if (index >= 0) queue.splice(index, 1);
					reject(abortReason(signal as AbortSignal));
				};
				const waiter: Waiter = {
					start: () => {
						signal?.removeEventListener("abort", onAbort);
						if (signal?.aborted) {
							reject(abortReason(signal));
							return;
						}
						current++;
						resolve();
					},
				};
				signal?.addEventListener("abort", onAbort, { once: true });
				queue.push(waiter);
			});
		} else {
			current++;
		}

		try {
			return await fn();
		} finally {
			current--;
			queue.shift()?.start();
		}
	}

	return { run };
}
