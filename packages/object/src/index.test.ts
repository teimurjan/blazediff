import { describe, expect, it } from "vitest";
import diff, { DifferenceType } from "./index";

describe("diff", () => {
	describe("primitives", () => {
		it("should detect changes in strings", () => {
			const result = diff("old", "new");
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: "new",
					oldValue: "old",
				},
			]);
		});

		it("should detect changes in numbers", () => {
			const result = diff(42, 100);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: 100,
					oldValue: 42,
				},
			]);
		});

		it("should detect changes in booleans", () => {
			const result = diff(true, false);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: false,
					oldValue: true,
				},
			]);
		});

		it("should detect changes from null to undefined", () => {
			const result = diff(null, undefined);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: undefined,
					oldValue: null,
				},
			]);
		});

		it("should return empty array for identical primitives", () => {
			expect(diff(42, 42)).toEqual([]);
			expect(diff("test", "test")).toEqual([]);
			expect(diff(true, true)).toEqual([]);
			expect(diff(null, null)).toEqual([]);
			expect(diff(undefined, undefined)).toEqual([]);
		});

		it("should handle NaN comparisons correctly", () => {
			expect(diff(NaN, NaN)).toEqual([]);
			const result = diff(NaN, 42);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: 42,
					oldValue: NaN,
				},
			]);
		});

		it("should handle Infinity", () => {
			expect(diff(Infinity, Infinity)).toEqual([]);
			expect(diff(-Infinity, -Infinity)).toEqual([]);
			const result = diff(Infinity, -Infinity);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: -Infinity,
					oldValue: Infinity,
				},
			]);
		});

		it("should handle zero and negative zero", () => {
			expect(diff(0, -0)).toEqual([]);
			expect(diff(-0, 0)).toEqual([]);
		});
	});

	describe("simple objects", () => {
		it("should detect added properties", () => {
			const result = diff({ a: 1 }, { a: 1, b: 2 });
			expect(result).toEqual([
				{
					type: DifferenceType.CREATE,
					path: ["b"],
					value: 2,
					oldValue: undefined,
				},
			]);
		});

		it("should detect removed properties", () => {
			const result = diff({ a: 1, b: 2 }, { a: 1 });
			expect(result).toEqual([
				{
					type: DifferenceType.REMOVE,
					path: ["b"],
					value: undefined,
					oldValue: 2,
				},
			]);
		});

		it("should detect changed properties", () => {
			const result = diff({ a: 1, b: 2 }, { a: 1, b: 3 });
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["b"],
					value: 3,
					oldValue: 2,
				},
			]);
		});

		it("should handle multiple changes", () => {
			const result = diff(
				{ a: 1, b: 2, c: 3 },
				{ a: 10, c: 3, d: 4 },
			);
			expect(result).toHaveLength(3);
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: ["a"],
				value: 10,
				oldValue: 1,
			});
			expect(result).toContainEqual({
				type: DifferenceType.REMOVE,
				path: ["b"],
				value: undefined,
				oldValue: 2,
			});
			expect(result).toContainEqual({
				type: DifferenceType.CREATE,
				path: ["d"],
				value: 4,
				oldValue: undefined,
			});
		});

		it("should return empty array for identical objects", () => {
			const obj = { a: 1, b: "test", c: true };
			expect(diff(obj, { ...obj })).toEqual([]);
		});

		it("should handle empty objects", () => {
			expect(diff({}, {})).toEqual([]);
			const result = diff({}, { a: 1 });
			expect(result).toEqual([
				{
					type: DifferenceType.CREATE,
					path: ["a"],
					value: 1,
					oldValue: undefined,
				},
			]);
		});

		it("should handle objects with undefined values", () => {
			const result = diff(
				{ a: undefined, b: 1 },
				{ a: null, b: 1 },
			);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["a"],
					value: null,
					oldValue: undefined,
				},
			]);
		});

		it("should handle objects with NaN values", () => {
			expect(diff({ a: NaN }, { a: NaN })).toEqual([]);
			const result = diff({ a: NaN }, { a: 42 });
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["a"],
					value: 42,
					oldValue: NaN,
				},
			]);
		});
	});

	describe("arrays", () => {
		it("should detect added elements", () => {
			const result = diff([1, 2], [1, 2, 3]);
			expect(result).toEqual([
				{
					type: DifferenceType.CREATE,
					path: [2],
					value: 3,
					oldValue: undefined,
				},
			]);
		});

		it("should detect removed elements", () => {
			const result = diff([1, 2, 3], [1, 2]);
			expect(result).toEqual([
				{
					type: DifferenceType.REMOVE,
					path: [2],
					value: undefined,
					oldValue: 3,
				},
			]);
		});

		it("should detect changed elements", () => {
			const result = diff([1, 2, 3], [1, 5, 3]);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [1],
					value: 5,
					oldValue: 2,
				},
			]);
		});

		it("should handle empty arrays", () => {
			expect(diff([], [])).toEqual([]);
			const result = diff([], [1]);
			expect(result).toEqual([
				{
					type: DifferenceType.CREATE,
					path: [0],
					value: 1,
					oldValue: undefined,
				},
			]);
		});

		it("should handle arrays with undefined and null", () => {
			const result = diff([undefined, null], [null, undefined]);
			expect(result).toHaveLength(2);
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: [0],
				value: null,
				oldValue: undefined,
			});
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: [1],
				value: undefined,
				oldValue: null,
			});
		});

		it("should handle sparse arrays", () => {
			const arr1 = new Array(3);
			arr1[0] = 1;
			arr1[2] = 3;
			const arr2 = [1, undefined, 3];
			expect(diff(arr1, arr2)).toEqual([]);
		});

		it("should handle arrays with NaN", () => {
			expect(diff([NaN], [NaN])).toEqual([]);
			const result = diff([NaN, 1], [42, 1]);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [0],
					value: 42,
					oldValue: NaN,
				},
			]);
		});
	});

	describe("nested structures", () => {
		it("should handle nested objects", () => {
			const result = diff(
				{ a: { b: { c: 1 } } },
				{ a: { b: { c: 2 } } },
			);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["a", "b", "c"],
					value: 2,
					oldValue: 1,
				},
			]);
		});

		it("should handle nested arrays", () => {
			const result = diff(
				[[1, 2], [3, 4]],
				[[1, 2], [3, 5]],
			);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [1, 1],
					value: 5,
					oldValue: 4,
				},
			]);
		});

		it("should handle objects in arrays", () => {
			const result = diff(
				[{ a: 1 }, { b: 2 }],
				[{ a: 1 }, { b: 3 }],
			);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [1, "b"],
					value: 3,
					oldValue: 2,
				},
			]);
		});

		it("should handle arrays in objects", () => {
			const result = diff(
				{ data: [1, 2, 3] },
				{ data: [1, 2, 4] },
			);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["data", 2],
					value: 4,
					oldValue: 3,
				},
			]);
		});

		it("should handle deeply nested mixed structures", () => {
			const old = {
				level1: {
					level2: {
						array: [
							{ id: 1, value: "a" },
							{ id: 2, value: "b" },
						],
						object: {
							deep: {
								deeper: {
									value: 100,
								},
							},
						},
					},
				},
			};

			const newObj = {
				level1: {
					level2: {
						array: [
							{ id: 1, value: "a" },
							{ id: 2, value: "c" },
						],
						object: {
							deep: {
								deeper: {
									value: 200,
								},
							},
						},
					},
				},
			};

			const result = diff(old, newObj);
			expect(result).toHaveLength(2);
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: ["level1", "level2", "array", 1, "value"],
				value: "c",
				oldValue: "b",
			});
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: ["level1", "level2", "object", "deep", "deeper", "value"],
				value: 200,
				oldValue: 100,
			});
		});
	});

	describe("type changes", () => {
		it("should detect type change from object to array", () => {
			const result = diff({ a: 1 }, [1]);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: [1],
					oldValue: { a: 1 },
				},
			]);
		});

		it("should detect type change from array to object", () => {
			const result = diff([1, 2], { 0: 1, 1: 2 });
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: { 0: 1, 1: 2 },
					oldValue: [1, 2],
				},
			]);
		});

		it("should detect type change from object to primitive", () => {
			const result = diff({ a: 1 }, "string");
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: "string",
					oldValue: { a: 1 },
				},
			]);
		});

		it("should detect type change from primitive to object", () => {
			const result = diff(42, { value: 42 });
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: { value: 42 },
					oldValue: 42,
				},
			]);
		});

		it("should handle nested type changes", () => {
			const result = diff(
				{ data: { value: 1 } },
				{ data: [1] },
			);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["data"],
					value: [1],
					oldValue: { value: 1 },
				},
			]);
		});
	});

	describe("rich types", () => {
		it("should detect changes in Date objects", () => {
			const date1 = new Date("2024-01-01");
			const date2 = new Date("2024-01-02");
			const result = diff(date1, date2);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: date2,
					oldValue: date1,
				},
			]);
		});

		it("should handle identical dates", () => {
			const date = new Date("2024-01-01");
			expect(diff(date, date)).toEqual([]);
		});

		it("should detect changes in RegExp objects", () => {
			const regex1 = /test/g;
			const regex2 = /test/i;
			const result = diff(regex1, regex2);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: regex2,
					oldValue: regex1,
				},
			]);
		});

		it("should handle identical regexes", () => {
			const regex = /test/gi;
			expect(diff(regex, regex)).toEqual([]);
		});

		it("should handle String objects", () => {
			const str1 = new String("hello");
			const str2 = new String("world");
			const result = diff(str1, str2);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: str2,
					oldValue: str1,
				},
			]);
		});

		it("should handle Number objects", () => {
			const num1 = new Number(42);
			const num2 = new Number(100);
			const result = diff(num1, num2);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: num2,
					oldValue: num1,
				},
			]);
		});

		it("should detect type change from Date to string", () => {
			const date = new Date("2024-01-01");
			const result = diff(date, "2024-01-01");
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [],
					value: "2024-01-01",
					oldValue: date,
				},
			]);
		});
	});

	describe("cycle detection", () => {
		it("should handle circular references with detectCycles enabled", () => {
			const obj1: any = { a: 1 };
			obj1.self = obj1;

			const obj2: any = { a: 2 };
			obj2.self = obj2;

			const result = diff(obj1, obj2, { detectCycles: true });
			// Should detect the change in 'a' property
			const changeInA = result.find(d => d.path.length === 1 && d.path[0] === "a");
			expect(changeInA).toBeDefined();
			expect(changeInA?.type).toBe(DifferenceType.CHANGE);
			expect(changeInA?.value).toBe(2);
			expect(changeInA?.oldValue).toBe(1);
		});

		it("should handle circular references in arrays", () => {
			const arr1: any[] = [1, 2];
			arr1.push(arr1);

			const arr2: any[] = [1, 3];
			arr2.push(arr2);

			const result = diff(arr1, arr2, { detectCycles: true });
			// Should detect the change in index 1
			const changeAt1 = result.find(d => d.path.length === 1 && d.path[0] === 1);
			expect(changeAt1).toBeDefined();
			expect(changeAt1?.type).toBe(DifferenceType.CHANGE);
			expect(changeAt1?.value).toBe(3);
			expect(changeAt1?.oldValue).toBe(2);
		});

		it("should handle deeply nested circular references", () => {
			const obj1: any = { level1: { level2: {} } };
			obj1.level1.level2.circular = obj1;

			const obj2: any = { level1: { level2: {} } };
			obj2.level1.level2.circular = obj2;

			const result = diff(obj1, obj2, { detectCycles: true });
			expect(result).toEqual([]);
		});

		it("should handle mutual circular references", () => {
			const a1: any = { name: "a" };
			const b1: any = { name: "b" };
			a1.ref = b1;
			b1.ref = a1;

			const a2: any = { name: "a2" };
			const b2: any = { name: "b2" };
			a2.ref = b2;
			b2.ref = a2;

			const result = diff(a1, a2, { detectCycles: true });
			expect(result.find(d => d.path[0] === "name")).toEqual({
				type: DifferenceType.CHANGE,
				path: ["name"],
				value: "a2",
				oldValue: "a",
			});
		});
	});

	describe("edge cases", () => {
		it("should handle properties with special names", () => {
			const result = diff(
				{ "": 1, "constructor": 2, "hasOwnProperty": 4 },
				{ "": 10, "constructor": 20, "hasOwnProperty": 40 },
			);
			expect(result).toHaveLength(3);
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: [""],
				value: 10,
				oldValue: 1,
			});
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: ["constructor"],
				value: 20,
				oldValue: 2,
			});
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: ["hasOwnProperty"],
				value: 40,
				oldValue: 4,
			});
		});

		it("should handle objects with numeric string keys", () => {
			const result = diff(
				{ "0": "a", "1": "b", "2": "c" },
				{ "0": "a", "1": "d", "3": "e" },
			);
			expect(result).toHaveLength(3);
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: ["1"],
				value: "d",
				oldValue: "b",
			});
			expect(result).toContainEqual({
				type: DifferenceType.REMOVE,
				path: ["2"],
				value: undefined,
				oldValue: "c",
			});
			expect(result).toContainEqual({
				type: DifferenceType.CREATE,
				path: ["3"],
				value: "e",
				oldValue: undefined,
			});
		});

		it("should handle very large objects efficiently", () => {
			const size = 10000;
			const obj1: any = {};
			const obj2: any = {};

			for (let i = 0; i < size; i++) {
				obj1[`key${i}`] = i;
				obj2[`key${i}`] = i === 5000 ? "changed" : i;
			}

			const result = diff(obj1, obj2);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				type: DifferenceType.CHANGE,
				path: ["key5000"],
				value: "changed",
				oldValue: 5000,
			});
		});

		it("should handle very large arrays efficiently", () => {
			const size = 10000;
			const arr1 = Array.from({ length: size }, (_, i) => i);
			const arr2 = Array.from({ length: size }, (_, i) => i === 5000 ? "changed" : i);

			const result = diff(arr1, arr2);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				type: DifferenceType.CHANGE,
				path: [5000],
				value: "changed",
				oldValue: 5000,
			});
		});

		it("should handle Symbol properties", () => {
			const sym = Symbol("test");
			const obj1 = { [sym]: "value1" };
			const obj2 = { [sym]: "value2" };
			// Symbols are not enumerable with Object.keys
			const result = diff(obj1, obj2);
			expect(result).toEqual([]);
		});

		it("should handle frozen objects", () => {
			const obj1 = Object.freeze({ a: 1, b: 2 });
			const obj2 = Object.freeze({ a: 1, b: 3 });
			const result = diff(obj1, obj2);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["b"],
					value: 3,
					oldValue: 2,
				},
			]);
		});

		it("should handle objects with getters", () => {
			const obj1 = {
				_value: 1,
				get value() { return this._value; },
			};
			const obj2 = {
				_value: 2,
				get value() { return this._value; },
			};
			const result = diff(obj1, obj2);
			expect(result.find(d => d.path[0] === "_value")).toEqual({
				type: DifferenceType.CHANGE,
				path: ["_value"],
				value: 2,
				oldValue: 1,
			});
		});

		it("should handle array-like objects", () => {
			const obj1 = { 0: "a", 1: "b", length: 2 };
			const obj2 = { 0: "a", 1: "c", length: 2 };
			const result = diff(obj1, obj2);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["1"],
					value: "c",
					oldValue: "b",
				},
			]);
		});

		it("should handle null prototype objects", () => {
			const obj1 = Object.create(null);
			obj1.a = 1;
			obj1.b = 2;

			const obj2 = Object.create(null);
			obj2.a = 1;
			obj2.b = 3;

			const result = diff(obj1, obj2);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["b"],
					value: 3,
					oldValue: 2,
				},
			]);
		});

		it("should handle mixed types in arrays", () => {
			const result = diff(
				[1, "string", true, null, undefined, { a: 1 }],
				[2, "string", false, undefined, null, { a: 2 }],
			);
			expect(result).toHaveLength(5);
		});

		it("should handle empty string keys", () => {
			const result = diff(
				{ "": "empty1", a: 1 },
				{ "": "empty2", a: 1 },
			);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: [""],
					value: "empty2",
					oldValue: "empty1",
				},
			]);
		});

		it("should handle unicode keys", () => {
			const result = diff(
				{ "🔥": 1, "中文": 2 },
				{ "🔥": 10, "中文": 20 },
			);
			expect(result).toHaveLength(2);
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: ["🔥"],
				value: 10,
				oldValue: 1,
			});
		});
	});

	describe("performance optimizations", () => {
		it("should use efficient key lookup for large objects", () => {
			// This tests that the Set optimization kicks in for objects with >8 keys
			const obj1: any = {};
			const obj2: any = {};

			for (let i = 0; i < 20; i++) {
				obj1[`key${i}`] = i;
				obj2[`key${i}`] = i;
			}
			obj2.key10 = "changed";
			obj2.newKey = "added";
			delete obj2.key15;

			const result = diff(obj1, obj2);
			expect(result).toHaveLength(3);
			expect(result).toContainEqual({
				type: DifferenceType.CHANGE,
				path: ["key10"],
				value: "changed",
				oldValue: 10,
			});
			expect(result).toContainEqual({
				type: DifferenceType.REMOVE,
				path: ["key15"],
				value: undefined,
				oldValue: 15,
			});
			expect(result).toContainEqual({
				type: DifferenceType.CREATE,
				path: ["newKey"],
				value: "added",
				oldValue: undefined,
			});
		});

		it("should handle small objects without Set overhead", () => {
			// This tests that small objects (<8 keys) don't use Set
			const result = diff(
				{ a: 1, b: 2, c: 3 },
				{ a: 1, b: 20, d: 4 },
			);
			expect(result).toHaveLength(3);
		});

		it("should handle reference equality efficiently", () => {
			const sharedObj = { shared: true };
			const obj1 = { a: sharedObj, b: 1 };
			const obj2 = { a: sharedObj, b: 2 };

			const result = diff(obj1, obj2);
			expect(result).toEqual([
				{
					type: DifferenceType.CHANGE,
					path: ["b"],
					value: 2,
					oldValue: 1,
				},
			]);
		});
	});

	describe("coercion handling", () => {
		it("should detect differences in objects with custom toString", () => {
			const obj1 = { toString: () => "same" };
			const obj2 = { toString: () => "same" };
			// Functions are different references even if they return same value
			const result = diff(obj1, obj2);
			expect(result.length).toBe(1);
			expect(result[0].type).toBe(DifferenceType.CHANGE);
			expect(result[0].path).toEqual(["toString"]);
		});

		it("should detect differences in objects with custom valueOf", () => {
			const obj1 = { valueOf: () => 42 };
			const obj2 = { valueOf: () => 42 };
			// Functions are different references even if they return same value
			const result = diff(obj1, obj2);
			expect(result.length).toBe(1);
			expect(result[0].type).toBe(DifferenceType.CHANGE);
			expect(result[0].path).toEqual(["valueOf"]);
		});

		it("should handle objects that coerce to same string", () => {
			// Objects that naturally coerce to the same string via String()
			// Note: the implementation compares object properties, not coerced values
			const obj1 = { value: 1 };
			const obj2 = { value: 1 };
			expect(diff(obj1, obj2)).toEqual([]);
		});

		it("should detect differences when functions differ", () => {
			const fn1 = () => "value1";
			const fn2 = () => "value2";
			const obj1 = { toString: fn1 };
			const obj2 = { toString: fn2 };
			const result = diff(obj1, obj2);
			// Functions are compared by reference, not by their return values
			expect(result.length).toBe(1);
			expect(result[0].type).toBe(DifferenceType.CHANGE);
			expect(result[0].path).toEqual(["toString"]);
		});
	});

	describe("path accuracy", () => {
		it("should maintain correct paths for deeply nested changes", () => {
			const obj1 = {
				a: {
					b: {
						c: {
							d: {
								e: {
									value: 1,
								},
							},
						},
					},
				},
			};

			const obj2 = {
				a: {
					b: {
						c: {
							d: {
								e: {
									value: 2,
								},
							},
						},
					},
				},
			};

			const result = diff(obj1, obj2);
			expect(result[0].path).toEqual(["a", "b", "c", "d", "e", "value"]);
		});

		it("should use numeric paths for array indices", () => {
			const result = diff(
				{ arr: ["a", "b", "c"] },
				{ arr: ["a", "x", "c"] },
			);
			expect(result[0].path).toEqual(["arr", 1]);
			expect(typeof result[0].path[1]).toBe("number");
		});

		it("should use string paths for object keys that look like numbers", () => {
			const result = diff(
				{ "123": "value1" },
				{ "123": "value2" },
			);
			expect(result[0].path).toEqual(["123"]);
			expect(typeof result[0].path[0]).toBe("string");
		});
	});

	describe("consistent shapes", () => {
		it("should always include all fields in difference objects", () => {
			const result1 = diff({ a: 1 }, { a: 1, b: 2 });
			expect(result1[0]).toHaveProperty("type");
			expect(result1[0]).toHaveProperty("path");
			expect(result1[0]).toHaveProperty("value");
			expect(result1[0]).toHaveProperty("oldValue");

			const result2 = diff({ a: 1, b: 2 }, { a: 1 });
			expect(result2[0]).toHaveProperty("type");
			expect(result2[0]).toHaveProperty("path");
			expect(result2[0]).toHaveProperty("value");
			expect(result2[0]).toHaveProperty("oldValue");

			const result3 = diff({ a: 1 }, { a: 2 });
			expect(result3[0]).toHaveProperty("type");
			expect(result3[0]).toHaveProperty("path");
			expect(result3[0]).toHaveProperty("value");
			expect(result3[0]).toHaveProperty("oldValue");
		});

		it("should use consistent enum values", () => {
			const create = diff({}, { a: 1 })[0];
			expect(create.type).toBe(DifferenceType.CREATE);
			expect(create.type).toBe(0);

			const remove = diff({ a: 1 }, {})[0];
			expect(remove.type).toBe(DifferenceType.REMOVE);
			expect(remove.type).toBe(1);

			const change = diff({ a: 1 }, { a: 2 })[0];
			expect(change.type).toBe(DifferenceType.CHANGE);
			expect(change.type).toBe(2);
		});
	});
});