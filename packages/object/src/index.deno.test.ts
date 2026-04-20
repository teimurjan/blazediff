import { assertEquals } from "jsr:@std/assert";
import { DifferenceType, diff } from "./index.ts";

Deno.test("object diff: identical objects report no changes", () => {
	assertEquals(diff({ a: 1, b: 2 }, { a: 1, b: 2 }).length, 0);
});

Deno.test("object diff: added key is CREATE", () => {
	const [change] = diff({ a: 1 }, { a: 1, b: 2 });
	assertEquals(change.type, DifferenceType.CREATE);
	assertEquals(change.path, ["b"]);
	assertEquals(change.value, 2);
});

Deno.test("object diff: removed key is REMOVE", () => {
	const [change] = diff({ a: 1, b: 2 }, { a: 1 });
	assertEquals(change.type, DifferenceType.REMOVE);
	assertEquals(change.path, ["b"]);
});

Deno.test("object diff: changed value is CHANGE", () => {
	const [change] = diff({ a: 1 }, { a: 2 });
	assertEquals(change.type, DifferenceType.CHANGE);
	assertEquals(change.path, ["a"]);
	assertEquals(change.value, 2);
	assertEquals((change as { oldValue: number }).oldValue, 1);
});
