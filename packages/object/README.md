# @blazediff/object

[![NPM Version](https://img.shields.io/npm/v/%40blazediff%2Fobject)](https://www.npmjs.com/package/@blazediff/object)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Lightning-fast structural object comparison with detailed change tracking. Part of the [BlazeDiff](https://github.com/teimurjan/blazediff) ecosystem for high-performance difference detection.

## Features

- **🚀 High Performance**: Optimized algorithm with intelligent key lookup strategies for large objects
- **📍 Precise Tracking**: Detailed path tracking for nested object modifications
- **🔧 Comprehensive Types**: Handles primitives, objects, arrays, dates, regex, and circular references
- **💾 Memory Efficient**: Minimal overhead with consistent object shapes for V8 optimization
- **🔄 Cycle Detection**: Built-in circular reference handling with configurable detection
- **📊 Rich Output**: Detailed difference objects with type, path, value, and oldValue information

## Installation

```bash
npm install @blazediff/object
```

```bash
yarn add @blazediff/object
```

```bash
pnpm add @blazediff/object
```

## Quick Start

```typescript
import diff from '@blazediff/object';

const oldObj = {
  name: "John",
  age: 30,
  city: "NYC",
  skills: ["JavaScript", "TypeScript"]
};

const newObj = {
  name: "John",
  age: 31,
  city: "San Francisco",
  skills: ["JavaScript", "TypeScript", "Go"],
  active: true
};

const changes = diff(oldObj, newObj);
console.log(changes);
```

**Output:**
```json
[
  {
    "type": 2,
    "path": ["age"],
    "value": 31,
    "oldValue": 30
  },
  {
    "type": 2,
    "path": ["city"],
    "value": "San Francisco",
    "oldValue": "NYC"
  },
  {
    "type": 0,
    "path": ["skills", 2],
    "value": "Go",
    "oldValue": undefined
  },
  {
    "type": 0,
    "path": ["active"],
    "value": true,
    "oldValue": undefined
  }
]
```

## API Reference

### `diff(oldObj, newObj, options?)`

Compares two objects and returns an array of differences.

**Parameters:**
- `oldObj` (any): The original object to compare from
- `newObj` (any): The new object to compare to
- `options` (object, optional): Configuration options
  - `detectCycles` (boolean): Enable circular reference detection (default: `true`)

**Returns:**
- `Difference[]`: Array of difference objects

### Difference Types

The diff function returns an array of difference objects with the following structure:

```typescript
interface Difference {
  type: DifferenceType;
  path: (string | number)[];
  value: any;
  oldValue: any;
}

enum DifferenceType {
  CREATE = 0,  // Property or array element was added
  REMOVE = 1,  // Property or array element was deleted
  CHANGE = 2   // Property or array element value was modified
}
```

**Difference Types:**
- `0` (CREATE) - Property or array element was added
- `1` (REMOVE) - Property or array element was deleted
- `2` (CHANGE) - Property or array element value was modified

All difference objects maintain consistent shape with `type`, `path`, `value`, and `oldValue` fields for optimal V8 performance.

## Usage Examples

### Basic Object Comparison

```typescript
import diff from '@blazediff/object';

// Simple property changes
const result = diff(
  { a: 1, b: 2, c: 3 },
  { a: 1, b: 20, d: 4 }
);
// Returns changes for modified 'b', removed 'c', and added 'd'
```

### Nested Objects

```typescript
// Deep nested changes
const oldData = {
  user: {
    profile: {
      settings: { theme: 'dark', notifications: true }
    }
  }
};

const newData = {
  user: {
    profile: {
      settings: { theme: 'light', notifications: true }
    }
  }
};

const changes = diff(oldData, newData);
// Returns: [{ type: 2, path: ['user', 'profile', 'settings', 'theme'], value: 'light', oldValue: 'dark' }]
```

### Array Comparison

```typescript
// Array modifications
const changes = diff(
  { items: ['a', 'b', 'c'] },
  { items: ['a', 'x', 'c', 'd'] }
);
// Detects element changes and additions
```

### Handling Different Data Types

```typescript
// Mixed data types
const oldObj = {
  date: new Date('2024-01-01'),
  regex: /test/g,
  nested: { count: 5 },
  list: [1, 2, 3]
};

const newObj = {
  date: new Date('2024-01-02'),
  regex: /test/i,
  nested: { count: 10 },
  list: [1, 2, 3, 4]
};

const changes = diff(oldObj, newObj);
// Handles Date objects, RegExp, nested objects, and arrays
```

### Circular Reference Handling

```typescript
// Objects with circular references
const obj1 = { name: 'A' };
obj1.self = obj1;

const obj2 = { name: 'B' };
obj2.self = obj2;

const changes = diff(obj1, obj2, { detectCycles: true });
// Safely handles circular references
```

### Large Object Performance

```typescript
// Optimized for large objects
const largeObj1 = {};
const largeObj2 = {};

// Create objects with many properties
for (let i = 0; i < 10000; i++) {
  largeObj1[`key${i}`] = i;
  largeObj2[`key${i}`] = i === 5000 ? 'changed' : i;
}

const changes = diff(largeObj1, largeObj2);
// Efficiently processes large objects with Set-based key lookup
```

## Configuration Options

### Cycle Detection

```typescript
// Enable/disable circular reference detection
const changes = diff(obj1, obj2, { detectCycles: true }); // Default
const changes = diff(obj1, obj2, { detectCycles: false }); // Faster for acyclic objects
```

Disabling cycle detection can improve performance for objects guaranteed to not have circular references.

## Performance Characteristics

The algorithm is optimized for real-world usage patterns:

- **Small Objects (< 8 properties)**: Direct array operations without Set overhead
- **Large Objects (≥ 8 properties)**: Set-based key lookup for O(1) contains operations
- **Reference Equality**: Early exit for identical object references
- **Type Mismatches**: Fast detection of incompatible types (array vs object, primitives vs objects)
- **Memory Efficient**: Consistent object shapes help V8 create stable hidden classes

## Edge Cases Handled

- **Primitive Types**: Strings, numbers, booleans, null, undefined
- **Special Numbers**: NaN, Infinity, -Infinity, +0, -0
- **Rich Types**: Date objects, RegExp objects, String/Number objects
- **Sparse Arrays**: Proper handling of arrays with holes
- **Property Names**: Empty strings, unicode keys, special property names
- **Circular References**: Safe traversal with cycle detection
- **Type Coercion**: Proper comparison without unexpected coercion
- **Large Datasets**: Efficient processing of objects with thousands of properties

## TypeScript Support

Full TypeScript definitions included:

```typescript
import diff, { Difference, DifferenceType, DifferenceCreate, DifferenceRemove, DifferenceChange } from '@blazediff/object';

// Type-safe difference handling
const changes: Difference[] = diff(obj1, obj2);

changes.forEach((change) => {
  switch (change.type) {
    case DifferenceType.CREATE:
      console.log(`Added ${change.path.join('.')}: ${change.value}`);
      break;
    case DifferenceType.REMOVE:
      console.log(`Removed ${change.path.join('.')}: ${change.oldValue}`);
      break;
    case DifferenceType.CHANGE:
      console.log(`Changed ${change.path.join('.')}: ${change.oldValue} → ${change.value}`);
      break;
  }
});
```

## Testing

The package includes a comprehensive test suite covering:

- ✅ 68 test cases with 100% statement coverage
- ✅ Primitive type comparisons
- ✅ Object and array diffing scenarios
- ✅ Nested structure handling
- ✅ Type conversion edge cases
- ✅ Circular reference detection
- ✅ Performance optimization verification
- ✅ Large dataset processing
- ✅ Unicode and special property handling

Run tests:
```bash
npm test
```

Run with coverage:
```bash
npm run test:coverage
```

## Integration with BlazeDiff Ecosystem

`@blazediff/object` works seamlessly with other BlazeDiff packages:

- **[@blazediff/react](../react#readme)** - React components for visualizing object diffs
- **[@blazediff/ui](../ui#readme)** - Web components for diff display
- **[@blazediff/core](../core#readme)** - Image comparison capabilities

## Contributing

Contributions are welcome! Please see the [Contributing Guide](../../CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](../../LICENSE) file for details.

---

**Part of the [BlazeDiff](https://github.com/teimurjan/blazediff) ecosystem for high-performance difference detection**