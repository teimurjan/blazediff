// Numeric enum for faster comparisons and better V8 optimization
export enum DifferenceType {
	CREATE = 0,
	REMOVE = 1,
	CHANGE = 2,
}

// Consistent shape for all difference objects (helps V8 create stable hidden classes)
export interface DifferenceCreate {
	type: DifferenceType.CREATE;
	path: (string | number)[];
	value: any;
	oldValue: undefined; // Always present for shape consistency
}

export interface DifferenceRemove {
	type: DifferenceType.REMOVE;
	path: (string | number)[];
	value: undefined; // Always present for shape consistency
	oldValue: any;
}

export interface DifferenceChange {
	type: DifferenceType.CHANGE;
	path: (string | number)[];
	value: any;
	oldValue: any;
}

export type Difference = DifferenceCreate | DifferenceRemove | DifferenceChange;

interface Options {
	detectCycles: boolean;
}

// Pre-cached constructor references for monomorphic comparisons
const DateConstructor = Date;
const RegExpConstructor = RegExp;
const StringConstructor = String;
const NumberConstructor = Number;

// Combined rich type check (V8 can inline this effectively)
function isRichType(obj: any): boolean {
	if (obj == null) return false;
	const ctor = obj.constructor;
	return (
		ctor === DateConstructor ||
		ctor === RegExpConstructor ||
		ctor === StringConstructor ||
		ctor === NumberConstructor
	);
}

// Optimized difference creation with consistent shapes using numeric enum
function createDifference(
	type: DifferenceType.CREATE,
	path: (string | number)[],
	value: any,
): DifferenceCreate;
function createDifference(
	type: DifferenceType.REMOVE,
	path: (string | number)[],
	oldValue: any,
): DifferenceRemove;
function createDifference(
	type: DifferenceType.CHANGE,
	path: (string | number)[],
	value: any,
	oldValue: any,
): DifferenceChange;
function createDifference(
	type: DifferenceType,
	path: (string | number)[],
	valueOrOld: any,
	oldValue?: any,
): Difference {
	// Ensure path is always a proper array
	const pathArray = Array.isArray(path) ? path : [path];

	// Consistent object shape regardless of type (numeric comparison is faster)
	if (type === DifferenceType.CREATE) {
		return {
			type: DifferenceType.CREATE,
			path: pathArray,
			value: valueOrOld,
			oldValue: undefined,
		};
	} else if (type === DifferenceType.REMOVE) {
		return {
			type: DifferenceType.REMOVE,
			path: pathArray,
			value: undefined,
			oldValue: valueOrOld,
		};
	} else {
		return {
			type: DifferenceType.CHANGE,
			path: pathArray,
			value: valueOrOld,
			oldValue: oldValue,
		};
	}
}

// Specialized array differ (monomorphic - only handles arrays)
function diffArrays(
	oldArr: any[],
	newArr: any[],
	options: Options,
	stack: WeakSet<object>,
): Difference[] {
	const diffs: Difference[] = [];
	const oldLen = oldArr.length;
	const newLen = newArr.length;
	const maxLen = Math.max(oldLen, newLen);

	// Traditional for loop with cached length (best JIT optimization)
	for (let i = 0; i < maxLen; i = i + 1) {
		if (i >= newLen) {
			// Element removed
			diffs[diffs.length] = createDifference(
				DifferenceType.REMOVE,
				[i],
				oldArr[i],
			);
			continue;
		}

		if (i >= oldLen) {
			// Element added
			diffs[diffs.length] = createDifference(
				DifferenceType.CREATE,
				[i],
				newArr[i],
			);
			continue;
		}

		const oldVal = oldArr[i];
		const newVal = newArr[i];

		// Early exit for identical values (including NaN case)
		if (oldVal === newVal) continue;
		if (Number.isNaN(oldVal) && Number.isNaN(newVal)) continue;

		compareAndAddDifferences(oldVal, newVal, i, options, stack, diffs);
	}

	return diffs;
}

// Specialized object differ (monomorphic - only handles objects)
function diffObjects(
	oldObj: Record<string, any>,
	newObj: Record<string, any>,
	isOldArray: boolean,
	options: Options,
	stack: WeakSet<object>,
): Difference[] {
	const diffs: Difference[] = [];
	const oldKeys = Object.keys(oldObj);
	const newKeys = Object.keys(newObj);
	const oldKeysLen = oldKeys.length;
	const newKeysLen = newKeys.length;

	// Use Set only for larger objects (avoid overhead for small objects)
	let newKeySet: Set<string> | null = null;
	let oldKeySet: Set<string> | null = null;

	if (Math.min(oldKeysLen, newKeysLen) > 8) {
		newKeySet = new Set(newKeys);
		oldKeySet = new Set(oldKeys);
	}

	// Process existing keys (traditional for loop for JIT optimization)
	for (let i = 0; i < oldKeysLen; i = i + 1) {
		const key = oldKeys[i];
		const oldVal = oldObj[key];
		const pathKey = isOldArray ? +key : key;

		// Optimized key existence check
		const hasNewKey =
			newKeySet !== null ? newKeySet.has(key) : newKeys.indexOf(key) !== -1;

		if (!hasNewKey) {
			diffs[diffs.length] = createDifference(
				DifferenceType.REMOVE,
				[pathKey],
				oldVal,
			);
			continue;
		}

		const newVal = newObj[key];

		// Early exit for identical values
		if (oldVal === newVal) continue;
		if (Number.isNaN(oldVal) && Number.isNaN(newVal)) continue;

		compareAndAddDifferences(oldVal, newVal, pathKey, options, stack, diffs);
	}

	// Process new keys (additions)
	const isNewArray = Array.isArray(newObj);
	for (let i = 0; i < newKeysLen; i = i + 1) {
		const key = newKeys[i];

		// Optimized key existence check
		const hasOldKey =
			oldKeySet !== null ? oldKeySet.has(key) : oldKeys.indexOf(key) !== -1;

		if (!hasOldKey) {
			const pathKey = isNewArray ? +key : key;
			diffs[diffs.length] = createDifference(
				DifferenceType.CREATE,
				[pathKey],
				newObj[key],
			);
		}
	}

	return diffs;
}

// Specialized value comparison that directly adds to diffs array (avoids return overhead)
function compareAndAddDifferences(
	oldVal: any,
	newVal: any,
	pathElement: string | number,
	options: Options,
	stack: WeakSet<object>,
	diffs: Difference[],
): void {
	const oldType = typeof oldVal;
	const newType = typeof newVal;

	// Handle primitives first (most common case, optimize for this path)
	if (
		oldType !== "object" ||
		newType !== "object" ||
		oldVal === null ||
		newVal === null
	) {
		diffs[diffs.length] = createDifference(
			DifferenceType.CHANGE,
			[pathElement],
			newVal,
			oldVal,
		);
		return;
	}

	// Type compatibility check with separate boolean variables (helps JIT)
	const oldIsArray = Array.isArray(oldVal);
	const newIsArray = Array.isArray(newVal);
	const oldIsRich = isRichType(oldVal);
	const newIsRich = isRichType(newVal);

	// Handle type mismatches
	if (oldIsArray !== newIsArray || oldIsRich || newIsRich) {
		diffs[diffs.length] = createDifference(
			DifferenceType.CHANGE,
			[pathElement],
			newVal,
			oldVal,
		);
		return;
	}

	// Cycle detection (only when enabled)
	if (options.detectCycles && stack.has(oldVal)) {
		return;
	}

	// Recursion with proper stack management
	if (options.detectCycles) {
		stack.add(oldVal);
	}

	let subDiffs: Difference[];
	if (oldIsArray && newIsArray) {
		subDiffs = diffArrays(oldVal as any[], newVal as any[], options, stack);
	} else {
		subDiffs = diffObjects(oldVal, newVal, false, options, stack);
	}

	if (options.detectCycles) {
		stack.delete(oldVal);
	}

	// Add sub-differences with updated paths (traditional for loop for JIT)
	const subDiffsLen = subDiffs.length;
	for (let i = 0; i < subDiffsLen; i = i + 1) {
		const subDiff = subDiffs[i];
		subDiff.path.unshift(pathElement);
		diffs[diffs.length] = subDiff;
	}
}

// Main entry point with adaptive strategy selection
export default function diff(
	obj: any,
	newObj: any,
	options: Options = { detectCycles: true },
	_stack: WeakSet<object> = new WeakSet(),
): Difference[] {
	// Early exit for reference equality
	if (obj === newObj) {
		return [];
	}

	// Handle NaN case
	if (Number.isNaN(obj) && Number.isNaN(newObj)) {
		return [];
	}

	const objType = typeof obj;
	const newObjType = typeof newObj;

	// Handle primitive types or type mismatches
	if (
		objType !== "object" ||
		newObjType !== "object" ||
		obj === null ||
		newObj === null
	) {
		return [
			createDifference(DifferenceType.CHANGE, [], newObj, obj)
		];
	}

	const isObjArray = Array.isArray(obj);
	const isNewObjArray = Array.isArray(newObj);

	// Handle type mismatch between array and non-array
	if (isObjArray !== isNewObjArray) {
		return [
			createDifference(DifferenceType.CHANGE, [], newObj, obj)
		];
	}

	// Handle rich types
	if (isRichType(obj) || isRichType(newObj)) {
		return [
			createDifference(DifferenceType.CHANGE, [], newObj, obj)
		];
	}

	// Route to specialized functions based on types (monomorphic optimization)
	if (isObjArray && isNewObjArray) {
		return diffArrays(obj, newObj, options, _stack);
	}

	// For objects, use object differ
	return diffObjects(obj, newObj, false, options, _stack);
}
