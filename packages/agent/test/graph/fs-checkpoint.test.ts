import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
	type Checkpoint,
	type CheckpointMetadata,
	emptyCheckpoint,
	type PendingWrite,
	uuid6,
} from "@langchain/langgraph-checkpoint";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsCheckpointSaver } from "../../src/graph/checkpoint";

let dir: string;
let saver: FsCheckpointSaver;

function meta(): CheckpointMetadata {
	return {
		source: "input",
		step: 0,
		parents: {},
	} as CheckpointMetadata;
}

function newCheckpoint(): Checkpoint {
	const c = emptyCheckpoint();
	c.id = uuid6(-3);
	c.ts = new Date().toISOString();
	c.channel_values = { foo: "bar" };
	c.channel_versions = { foo: 1 };
	c.versions_seen = {};
	return c;
}

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "blazediff-ckpt-"));
	saver = new FsCheckpointSaver(dir);
});

afterEach(async () => {
	if (dir) await rm(dir, { recursive: true, force: true });
});

describe("FsCheckpointSaver", () => {
	it("round-trips put and getTuple", async () => {
		const config: RunnableConfig = {
			configurable: { thread_id: "t1", checkpoint_ns: "" },
		};
		const ckpt = newCheckpoint();
		const returned = await saver.put(config, ckpt, meta());
		expect(returned.configurable?.checkpoint_id).toBe(ckpt.id);

		const tuple = await saver.getTuple({
			configurable: { thread_id: "t1", checkpoint_ns: "" },
		});
		expect(tuple).toBeDefined();
		expect(tuple?.checkpoint.id).toBe(ckpt.id);
		expect(tuple?.checkpoint.channel_values).toEqual({ foo: "bar" });
	});

	it("getTuple returns latest checkpoint when no id is given", async () => {
		const config: RunnableConfig = {
			configurable: { thread_id: "t2", checkpoint_ns: "" },
		};
		const older = newCheckpoint();
		await saver.put(config, older, meta());
		// uuid6 is monotonic by clock; ensure ordering
		await new Promise((r) => setTimeout(r, 5));
		const newer = newCheckpoint();
		await saver.put(
			{ configurable: { thread_id: "t2", checkpoint_id: older.id } },
			newer,
			meta(),
		);

		const tuple = await saver.getTuple({
			configurable: { thread_id: "t2" },
		});
		expect(tuple?.checkpoint.id).toBe(newer.id);
		expect(tuple?.parentConfig?.configurable?.checkpoint_id).toBe(older.id);
	});

	it("attaches pending writes from putWrites to getTuple", async () => {
		const ckpt = newCheckpoint();
		const cfg: RunnableConfig = {
			configurable: { thread_id: "t3", checkpoint_ns: "" },
		};
		await saver.put(cfg, ckpt, meta());

		const writes: PendingWrite[] = [
			["foo", "x"],
			["bar", { n: 1 }],
		];
		await saver.putWrites(
			{
				configurable: {
					thread_id: "t3",
					checkpoint_ns: "",
					checkpoint_id: ckpt.id,
				},
			},
			writes,
			"task-1",
		);

		const tuple = await saver.getTuple({
			configurable: { thread_id: "t3", checkpoint_id: ckpt.id },
		});
		expect(tuple?.pendingWrites?.length).toBe(2);
		const byChannel = new Map(
			tuple?.pendingWrites?.map(([, ch, v]) => [ch, v]) ?? [],
		);
		expect(byChannel.get("foo")).toBe("x");
		expect(byChannel.get("bar")).toEqual({ n: 1 });
	});

	it("putWrites is idempotent for the same (taskId, channel index)", async () => {
		const ckpt = newCheckpoint();
		const cfg: RunnableConfig = {
			configurable: { thread_id: "t4", checkpoint_ns: "" },
		};
		await saver.put(cfg, ckpt, meta());
		const ckptCfg: RunnableConfig = {
			configurable: {
				thread_id: "t4",
				checkpoint_ns: "",
				checkpoint_id: ckpt.id,
			},
		};

		await saver.putWrites(ckptCfg, [["foo", 1]], "task-A");
		await saver.putWrites(ckptCfg, [["foo", 2]], "task-A");

		const tuple = await saver.getTuple({
			configurable: { thread_id: "t4", checkpoint_id: ckpt.id },
		});
		const pw = tuple?.pendingWrites ?? [];
		expect(pw.length).toBe(1);
		expect(pw[0][2]).toBe(1);
	});

	it("list yields checkpoints in descending id order and honors limit", async () => {
		const cfg: RunnableConfig = {
			configurable: { thread_id: "t5", checkpoint_ns: "" },
		};
		const ids: string[] = [];
		let parentCfg = cfg;
		for (let i = 0; i < 3; i++) {
			const c = newCheckpoint();
			await saver.put(parentCfg, c, meta());
			ids.push(c.id);
			await new Promise((r) => setTimeout(r, 2));
			parentCfg = {
				configurable: { thread_id: "t5", checkpoint_id: c.id },
			};
		}

		const collected: string[] = [];
		for await (const t of saver.list(
			{ configurable: { thread_id: "t5" } },
			{
				limit: 2,
			},
		)) {
			collected.push(t.checkpoint.id);
		}
		expect(collected.length).toBe(2);
		const sortedDesc = [...ids].sort((a, b) => b.localeCompare(a));
		expect(collected).toEqual(sortedDesc.slice(0, 2));
	});

	it("deleteThread removes the thread directory", async () => {
		const cfg: RunnableConfig = {
			configurable: { thread_id: "t6", checkpoint_ns: "" },
		};
		const c = newCheckpoint();
		await saver.put(cfg, c, meta());
		const before = await readdir(dir);
		expect(before).toContain("t6");

		await saver.deleteThread("t6");
		const after = await readdir(dir);
		expect(after).not.toContain("t6");
	});
});
