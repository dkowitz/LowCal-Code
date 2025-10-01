# Qwen Code - Project Context

## Project Overview

Qwen Code is an AI-powered command-line workflow tool designed to enhance developer productivity. It is an adaptation of the Gemini CLI, specifically optimized for Qwen3-Coder models to provide advanced code understanding, intelligent editing, and workflow automation directly within the terminal.

The project is structured as a monorepo with the main CLI at its core, supported by multiple internal packages. It leverages modern JavaScript/TypeScript tooling and can run with or without a sandbox for enhanced security.

## Key Technologies

- **Core Language**: TypeScript (with strict type checking)
- **Build & Bundle**: esbuild
- **Testing**: Vitest (unit and integration tests)
- **Linting & Formatting**: ESLint + Prettier
- **Package Management**: npm + Workspaces
- **Sandboxing**: Docker, Podman, or macOS Seatbelt (optional)
- **CLI Framework**: Built with Node.js (v20+)

## Building and Running

### Prerequisites
- Node.js 20.0.0 or higher

### Installation
```bash
npm install
```

### Build Commands
- **Build the project**: `npm run build`
- **Build the CLI and sandbox container**: `npm run build:all`
- **Bundle assets**: `npm run bundle`

### Running the CLI
```bash
npm start
```

### Running in Debug Mode
```bash
npm run debug
```

## Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests (End-to-End)
```bash
npm run test:e2e
```

### Comprehensive Check (Lint, Format, Test, Build)
```bash
npm run preflight
```

### Run Tests for a Specific Target
```bash
# Run only terminal benchmark tests for Qwen model
npm run test:terminal-bench:qwen

# Run only integration tests with Docker sandbox
npm run test:integration:sandbox:docker
```

## Development Conventions

### Coding Style
- Follow the ESLint and Prettier rules defined in `eslint.config.js` and `.prettierrc` (inferred).
- Use `npm run format` to auto-format code before committing.
- Use `npm run lint` and `npm run lint:ci` to ensure code quality.
- Strict TypeScript configuration enforced via `tsconfig.json`.

### Project Structure
- `packages/`: Contains sub-packages (`cli/`, `core/`, `vscode-ide-companion/`)
- `scripts/`: Build, test, and utility scripts
- `integration-tests/`: End-to-end test suite
- `docs/`: Detailed project documentation
- `bundle/`: Generated output from esbuild (contains the CLI executable)

### Contribution Guidelines
- All changes must be submitted via GitHub pull requests.
- Link every PR to an existing issue.
- Keep PRs small and focused on a single change.
- Ensure all tests pass (`npm run preflight`) before submitting.
- Update documentation if user-facing features or behavior change.
- Follow Conventional Commits for commit messages.

### Authorization
The CLI supports two primary authentication methods:
1. **Qwen OAuth (Recommended)**: Use `qwen` command and follow browser auth flow (free, 2,000 requests/day).
2. **OpenAI-Compatible API**: Set `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` environment variables.

### Sandbox
The tool can run in a sandboxed environment for enhanced security:
- Enable automatically with `GEMINI_SANDBOX=true`
- Uses Docker, Podman, or macOS Seatbelt
- Builds a minimal container image during `npm run build:all`

### Development Workflow
1. Clone the repo.
2. Run `npm install`.
3. Run `npm run build`.
4. Run `npm start` to launch the CLI.
5. Use `npm run preflight` to verify code quality.

For development with VS Code, use `npm run debug` and attach the debugger, or use the built-in VS Code launch configuration.

## Key Files

- `README.md`: Main project documentation and usage guide
- `package.json`: Project configuration and all npm scripts
- `esbuild.config.js`: Build configuration for the CLI bundle
- `vitest.config.ts`: Test configuration
- `eslint.config.js`: ESLint rules for the entire monorepo
- `tsconfig.json`: TypeScript compiler options
- `CONTRIBUTING.md`: Detailed contribution guidelines
- `Makefile`: Convenience commands for common tasks

> **Note**: This file (`QWEN.md`) serves as the central instructional context for AI agents working on this project. Always refer to it before making changes.