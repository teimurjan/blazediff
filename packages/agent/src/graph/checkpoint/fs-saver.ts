import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
	BaseCheckpointSaver,
	type Checkpoint,
	type CheckpointListOptions,
	type CheckpointMetadata,
	type CheckpointPendingWrite,
	type CheckpointTuple,
	copyCheckpoint,
	getCheckpointId,
	maxChannelVersion,
	type PendingWrite,
	type SerializerProtocol,
	TASKS,
	WRITES_IDX_MAP,
} from "@langchain/langgraph-checkpoint";

const ROOT_NS_SENTINEL = "_root";

interface CkptFile {
	checkpoint: string;
	metadata: string;
	parentCheckpointId?: string;
}

type WritesFile = Record<string, [string, string, string]>;

function nsDir(ns: string): string {
	return ns === "" ? ROOT_NS_SENTINEL : ns;
}

function encode(buf: Uint8Array): string {
	return Buffer.from(buf).toString("base64");
}

function decode(s: string): Uint8Array {
	return Buffer.from(s, "base64");
}

async function readJson<T>(file: string): Promise<T | undefined> {
	try {
		const raw = await readFile(file, "utf8");
		return JSON.parse(raw) as T;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw err;
	}
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
	const tmp = `${file}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
	await writeFile(tmp, JSON.stringify(value), "utf8");
	await rename(tmp, file);
}

export class FsCheckpointSaver extends BaseCheckpointSaver {
	private readonly root: string;
	private readonly locks = new Map<string, Promise<unknown>>();

	constructor(root: string, serde?: SerializerProtocol) {
		super(serde);
		this.root = root;
	}

	private threadDir(thread: string): string {
		return path.join(this.root, thread);
	}

	private nsPath(thread: string, ns: string): string {
		return path.join(this.threadDir(thread), nsDir(ns));
	}

	private ckptFile(thread: string, ns: string, id: string): string {
		return path.join(this.nsPath(thread, ns), `${id}.ckpt.json`);
	}

	private writesFile(thread: string, ns: string, id: string): string {
		return path.join(this.nsPath(thread, ns), `${id}.writes.json`);
	}

	private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const prev = this.locks.get(key) ?? Promise.resolve();
		const next = prev.then(fn, fn);
		this.locks.set(key, next);
		try {
			return await next;
		} finally {
			if (this.locks.get(key) === next) this.locks.delete(key);
		}
	}

	private async listCheckpointIds(
		thread: string,
		ns: string,
	): Promise<string[]> {
		try {
			const names = await readdir(this.nsPath(thread, ns));
			const suffix = ".ckpt.json";
			return names
				.filter((n) => n.endsWith(suffix))
				.map((n) => n.slice(0, -suffix.length));
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw err;
		}
	}

	private async listNamespaces(thread: string): Promise<string[]> {
		try {
			return await readdir(this.threadDir(thread));
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw err;
		}
	}

	private async listThreads(): Promise<string[]> {
		try {
			return await readdir(this.root);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw err;
		}
	}

	private decodeNs(nsDirName: string): string {
		return nsDirName === ROOT_NS_SENTINEL ? "" : nsDirName;
	}

	private async loadPendingWrites(
		thread: string,
		ns: string,
		ckptId: string,
	): Promise<CheckpointPendingWrite[]> {
		const data = await readJson<WritesFile>(
			this.writesFile(thread, ns, ckptId),
		);
		if (!data) return [];
		const out: CheckpointPendingWrite[] = [];
		for (const [taskId, channel, serialized] of Object.values(data)) {
			const value = await this.serde.loadsTyped("json", decode(serialized));
			out.push([taskId, channel, value]);
		}
		return out;
	}

	private async migratePendingSends(
		checkpoint: Checkpoint,
		thread: string,
		ns: string,
		parentCheckpointId: string,
	): Promise<void> {
		const data = await readJson<WritesFile>(
			this.writesFile(thread, ns, parentCheckpointId),
		);
		const pendingSends = data
			? await Promise.all(
					Object.values(data)
						.filter(([, channel]) => channel === TASKS)
						.map(([, , serialized]) =>
							this.serde.loadsTyped("json", decode(serialized)),
						),
				)
			: [];
		const m = checkpoint as Checkpoint & {
			channel_values: Record<string, unknown>;
			channel_versions: Record<string, unknown>;
		};
		m.channel_values ??= {};
		m.channel_values[TASKS] = pendingSends;
		m.channel_versions ??= {};
		const versions = Object.values(m.channel_versions);
		m.channel_versions[TASKS] =
			versions.length > 0
				? maxChannelVersion(...(versions as (string | number)[]))
				: this.getNextVersion(undefined);
	}

	private async readTuple(
		thread: string,
		ns: string,
		ckptId: string,
		config: RunnableConfig,
	): Promise<CheckpointTuple | undefined> {
		const data = await readJson<CkptFile>(this.ckptFile(thread, ns, ckptId));
		if (!data) return undefined;
		const checkpoint = (await this.serde.loadsTyped(
			"json",
			decode(data.checkpoint),
		)) as Checkpoint;
		const metadata = (await this.serde.loadsTyped(
			"json",
			decode(data.metadata),
		)) as CheckpointMetadata;
		if (checkpoint.v < 4 && data.parentCheckpointId !== undefined) {
			await this.migratePendingSends(
				checkpoint,
				thread,
				ns,
				data.parentCheckpointId,
			);
		}
		const pendingWrites = await this.loadPendingWrites(thread, ns, ckptId);
		const tuple: CheckpointTuple = {
			config,
			checkpoint,
			metadata,
			pendingWrites,
		};
		if (data.parentCheckpointId !== undefined) {
			tuple.parentConfig = {
				configurable: {
					thread_id: thread,
					checkpoint_ns: ns,
					checkpoint_id: data.parentCheckpointId,
				},
			};
		}
		return tuple;
	}

	async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
		const thread = config.configurable?.thread_id as string | undefined;
		if (!thread) return undefined;
		const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
		const explicitId = getCheckpointId(config);
		if (explicitId) {
			return this.readTuple(thread, ns, explicitId, config);
		}
		const ids = (await this.listCheckpointIds(thread, ns)).sort((a, b) =>
			b.localeCompare(a),
		);
		if (ids.length === 0) return undefined;
		const ckptId = ids[0];
		return this.readTuple(thread, ns, ckptId, {
			configurable: {
				thread_id: thread,
				checkpoint_ns: ns,
				checkpoint_id: ckptId,
			},
		});
	}

	async *list(
		config: RunnableConfig,
		options?: CheckpointListOptions,
	): AsyncGenerator<CheckpointTuple> {
		const filter = options?.filter;
		const before = options?.before;
		let limit = options?.limit;
		const configThread = config.configurable?.thread_id as string | undefined;
		const configNs = config.configurable?.checkpoint_ns as string | undefined;
		const configCkptId = config.configurable?.checkpoint_id as
			| string
			| undefined;
		const threads = configThread ? [configThread] : await this.listThreads();
		for (const thread of threads) {
			const nsNames = await this.listNamespaces(thread);
			for (const nsName of nsNames) {
				const ns = this.decodeNs(nsName);
				if (configNs !== undefined && ns !== configNs) continue;
				const ids = (await this.listCheckpointIds(thread, ns)).sort((a, b) =>
					b.localeCompare(a),
				);
				for (const ckptId of ids) {
					if (configCkptId && ckptId !== configCkptId) continue;
					if (
						before?.configurable?.checkpoint_id &&
						ckptId >= (before.configurable.checkpoint_id as string)
					)
						continue;
					const tuple = await this.readTuple(thread, ns, ckptId, {
						configurable: {
							thread_id: thread,
							checkpoint_ns: ns,
							checkpoint_id: ckptId,
						},
					});
					if (!tuple) continue;
					if (filter) {
						const md = tuple.metadata as Record<string, unknown> | undefined;
						const matches = Object.entries(filter).every(
							([k, v]) => md?.[k] === v,
						);
						if (!matches) continue;
					}
					if (limit !== undefined) {
						if (limit <= 0) return;
						limit -= 1;
					}
					yield tuple;
				}
			}
		}
	}

	async put(
		config: RunnableConfig,
		checkpoint: Checkpoint,
		metadata: CheckpointMetadata,
	): Promise<RunnableConfig> {
		const thread = config.configurable?.thread_id as string | undefined;
		if (!thread) {
			throw new Error(
				'FsCheckpointSaver: missing "thread_id" in configurable. Pass `{ configurable: { thread_id } }` when streaming.',
			);
		}
		const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
		const parentCheckpointId = config.configurable?.checkpoint_id as
			| string
			| undefined;
		const prepared = copyCheckpoint(checkpoint);
		const [[, serializedCheckpoint], [, serializedMetadata]] =
			await Promise.all([
				this.serde.dumpsTyped(prepared),
				this.serde.dumpsTyped(metadata),
			]);
		await mkdir(this.nsPath(thread, ns), { recursive: true });
		const file = this.ckptFile(thread, ns, checkpoint.id);
		const body: CkptFile = {
			checkpoint: encode(serializedCheckpoint),
			metadata: encode(serializedMetadata),
			parentCheckpointId,
		};
		await writeJsonAtomic(file, body);
		return {
			configurable: {
				thread_id: thread,
				checkpoint_ns: ns,
				checkpoint_id: checkpoint.id,
			},
		};
	}

	async putWrites(
		config: RunnableConfig,
		writes: PendingWrite[],
		taskId: string,
	): Promise<void> {
		const thread = config.configurable?.thread_id as string | undefined;
		if (!thread) {
			throw new Error(
				'FsCheckpointSaver: missing "thread_id" in configurable for putWrites.',
			);
		}
		const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
		const ckptId = config.configurable?.checkpoint_id as string | undefined;
		if (!ckptId) {
			throw new Error(
				'FsCheckpointSaver: missing "checkpoint_id" in configurable for putWrites.',
			);
		}
		const key = `${thread}|${ns}|${ckptId}`;
		await this.withLock(key, async () => {
			const existing =
				(await readJson<WritesFile>(this.writesFile(thread, ns, ckptId))) ?? {};
			let mutated = false;
			for (let idx = 0; idx < writes.length; idx++) {
				const [channel, value] = writes[idx];
				const writeIdx = WRITES_IDX_MAP[channel] ?? idx;
				const innerKey = `${taskId},${writeIdx}`;
				if (writeIdx >= 0 && innerKey in existing) continue;
				const [, serialized] = await this.serde.dumpsTyped(value);
				existing[innerKey] = [taskId, channel, encode(serialized)];
				mutated = true;
			}
			if (!mutated) return;
			await mkdir(this.nsPath(thread, ns), { recursive: true });
			await writeJsonAtomic(this.writesFile(thread, ns, ckptId), existing);
		});
	}

	async deleteThread(threadId: string): Promise<void> {
		await rm(this.threadDir(threadId), { recursive: true, force: true });
	}
}
