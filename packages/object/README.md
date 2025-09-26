# @blazediff/object

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fobject)](https://www.npmjs.com/package/@blazediff/object)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fobject)](https://www.npmjs.com/package/@blazediff/object)
</div>

Lightning-fast structural object comparison with detailed change tracking.

## Features

- **High Performance**: Optimized algorithm with intelligent key lookup strategies for large objects
- **Precise Tracking**: Detailed path tracking for nested object modifications
- **Comprehensive Types**: Handles primitives, objects, arrays, dates, regex, and circular references
- **Memory Efficient**: Minimal overhead with consistent object shapes for V8 optimization
- **Cycle Detection**: Built-in circular reference handling with configurable detection
- **Rich Output**: Detailed difference objects with type, path, value, and oldValue information

## Installation

```bash
npm install @blazediff/object
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

## Usage

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
