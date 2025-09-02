# Contributing to BlazeDiff

Thank you for your interest in contributing to BlazeDiff! This guide will help you get started with contributing to our high-performance image comparison library.

## Quick Start

1. **Fork** the repository
2. **Clone** your fork locally
3. **Install** dependencies with `pnpm install`
4. **Create** a feature branch
5. **Make** your changes
6. **Test** your changes
7. **Submit** a pull request

## Development Setup

### Prerequisites

- Node.js 22+ 
- pnpm
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/blazediff.git
cd blazediff

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Testing

### Running Benchmarks

```bash
# Run all benchmarks
pnpm benchmark

# Run specific benchmark
pnpm benchmark --target=bin
```

## Submitting Changes

### Pull Request Guidelines

1. **Title**: Use a clear, descriptive title
2. **Description**: Explain what the PR does and why
3. **Tests**: Include test results and benchmarks
4. **Breaking Changes**: Clearly mark any breaking changes
5. **Related Issues**: Link to related issues or discussions

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `perf`: Performance improvement
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(core): add new color space option
fix(bin): resolve CLI argument parsing issue
perf(core): optimize block-based algorithm
docs: update API documentation
```

## Reporting Issues

When reporting issues, please include:

1. **Description**: Clear description of the problem
2. **Reproduction**: Steps to reproduce the issue
3. **Expected vs Actual**: What you expected vs what happened
4. **Environment**: OS, Node.js version, package versions
5. **Screenshots**: If applicable
6. **Code Example**: Minimal code to reproduce the issue

## Additional Resources

- [README.md](README.md) - Project overview and usage
- [LICENSE](LICENSE) - Project license
- [Issues](https://github.com/teimurjan/blazediff/issues) - Bug reports and feature requests
- [Discussions](https://github.com/teimurjan/blazediff/discussions) - Community discussions

## Thank You

Thank you for contributing to BlazeDiff! Your contributions help make image comparison faster and more accessible for everyone.

---

**Questions?** Feel free to open an issue or start a discussion!
