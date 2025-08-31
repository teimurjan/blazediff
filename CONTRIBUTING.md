# Contributing to BlazeDiff 🔥

Thank you for your interest in contributing to BlazeDiff! This guide will help you get started with contributing to our blazing-fast image comparison library.

## 🚀 Quick Start

1. **Fork** the repository
2. **Clone** your fork locally
3. **Install** dependencies with `pnpm install`
4. **Create** a feature branch
5. **Make** your changes
6. **Test** your changes
7. **Submit** a pull request

## 🛠️ Development Setup

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

## 🧪 Testing

### Running Benchmarks

```bash
# Run all benchmarks
pnpm benchmark

# Run specific benchmark
pnpm benchmark --target=bin
```

### Adding Test Images

Place new test images in the appropriate fixture directories:
- `packages/benchmark/fixtures/pixelmatch/` - For pixelmatch compatibility tests
- `packages/benchmark/fixtures/4k/` - For high-resolution performance tests

## 📝 Code Style

- **TypeScript**: All code should be written in TypeScript
- **Naming**: Use descriptive variable and function names
- **Error Handling**: Include proper error handling and validation

## 🔧 Making Changes

### Adding New Features

1. **Create** a feature branch: `git checkout -b feature/your-feature-name`
2. **Implement** your feature following the code style guidelines
3. **Add** appropriate tests and benchmarks
4. **Update** documentation if needed
5. **Test** your changes thoroughly

### Fixing Bugs

1. **Create** a bug fix branch: `git checkout -b fix/issue-description`
2. **Reproduce** the issue with a test case
3. **Fix** the bug
4. **Add** regression tests
5. **Verify** the fix works

### Performance Improvements

1. **Benchmark** the current performance
2. **Implement** your optimization
3. **Benchmark** again to verify improvement
4. **Document** the performance gain
5. **Ensure** accuracy is maintained


## 📤 Submitting Changes

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

## 🐛 Reporting Issues

When reporting issues, please include:

1. **Description**: Clear description of the problem
2. **Reproduction**: Steps to reproduce the issue
3. **Expected vs Actual**: What you expected vs what happened
4. **Environment**: OS, Node.js version, package versions
5. **Screenshots**: If applicable
6. **Code Example**: Minimal code to reproduce the issue

## 🤝 Community Guidelines

- **Be respectful** and inclusive
- **Help others** learn and grow
- **Provide constructive** feedback
- **Follow** the project's code of conduct
- **Ask questions** if you're unsure about something

## 📚 Additional Resources

- [README.md](README.md) - Project overview and usage
- [LICENSE](LICENSE) - Project license
- [Issues](https://github.com/teimurjan/blazediff/issues) - Bug reports and feature requests
- [Discussions](https://github.com/teimurjan/blazediff/discussions) - Community discussions

## 🙏 Thank You

Thank you for contributing to BlazeDiff! Your contributions help make image comparison faster and more accessible for everyone.

---

**Questions?** Feel free to open an issue or start a discussion!
