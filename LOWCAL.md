# LowCal Code – Project Context

---

## 📖 Project Overview

LowCal Code (formerly **Qwen Code**) is an AI‑powered command‑line workflow tool that brings large language model capabilities directly into the terminal. It enables developers to:

- Explore and understand unfamiliar codebases.
- Generate, refactor, and test code on demand.
- Automate repetitive tasks such as changelog creation, git analysis, file manipulation, and more.
- Debug performance or security issues with natural‑language prompts.

The repository is a **monorepo** built with Node 20+ using Yarn/PNPM workspaces (`packages/*`). The two core packages are:

1. `packages/cli` – the user‑facing REPL, command parsing, UI rendering, and history management.
2. `packages/core` – backend that talks to the LLM (Google Gemini or OpenRouter), orchestrates tool execution, and maintains session state.

---

## 🛠️ Primary Technologies & Stack

- **Node.js** (>= 20) – runtime for both CLI and core.
- **TypeScript** – source language across all packages.
- **ESBuild** – fast bundling of the final executable (`bundle/gemini.js`).
- **Vitest** – test runner & coverage.
- **ESLint + Prettier** – linting/formatting conventions.
- **Google Gemini / OpenRouter** – default LLM back‑ends (configurable).
- **Docker** – optional sandbox image for isolated execution (`sandboxImageUri`).

---

## 🏗️ Architecture Summary

See `docs/architecture.md` for a full diagram. In brief:

1. **CLI Package** receives user input, handles history/compression, and forwards the request to Core.
2. **Core Package** builds the prompt, calls the LLM API, and interprets tool requests.
3. **Tools** (file system, shell, web fetch/search, memory) are implemented under `packages/core/src/tools/`. Execution of potentially destructive tools requires explicit user approval.
4. The response from the model (or tool result) is sent back to CLI for pretty‑printing in the terminal.

---

## 🚀 Building & Running

The project follows standard npm scripts defined in `package.json`:
| Script | Description |
|--------|-------------|
| `npm run start` | Launch the REPL (`LowCal`). |
| `npm run debug` | Start with Node inspector and DEBUG=1. |
| `npm run build` | Compile TypeScript, bundle with ESBuild, copy assets. |
| `npm run bundle` | Generate commit info, run ESBuild, copy bundled assets (used by `prepare`). |
| `npm run test` | Run all workspace tests (`vitest`). |
| `npm run lint` / `lint:fix` | Lint source and integration‑tests; auto‑fix with `--fix`. |
| `npm run format` | Prettier formatting across the repo. |
| `npm run typecheck` | Run TypeScript type checking for workspaces. |
| `npm run preflight` | Clean, install, format, lint (CI level), build, type‑check, and test – useful before a release. |

**Typical development flow**:

```bash
# Install dependencies
git clone https://github.com/QwenLM/qwen-code.git && cd qwen-code
npm ci               # or npm install if you prefer
npm run preflight    # ensure everything passes
npm run start        # launch LowCal REPL
```

---

## 🧪 Testing & Quality Gates

- **Unit / integration tests** live under `packages/*/tests` and `integration-tests/`. Run with `npm test`.
- **Coverage** is collected via `@vitest/coverage-v8` (`npm run test:ci`).
- Linting enforces **ESLint 9**, **Prettier 3**, and the project's custom rules (e.g., license‑header).
- CI scripts (`test:ci`, `lint:ci`) treat any warning as a failure.

---

## 📐 Development Conventions

1. **Code style** – Follow the ESLint configuration; run `npm run format` before committing.
2. **Commit messages** – Use conventional commits (type(scope): description). The `scripts/generate-git-commit-info.js` helps create changelogs.
3. **Workspace isolation** – Add new packages under `packages/` and reference them via the monorepo workspaces array.
4. **Tool usage** – When a tool that mutates the filesystem or runs a shell command is requested, LowCal will display the command and await user approval.
5. **Testing** – New features should include unit tests in the same package; run `npm run test` locally.

---

## 📚 Documentation Quick Links

- **Architecture:** `docs/architecture.md`
- **CLI Commands & Configuration:** `docs/cli/commands.md`, `docs/cli/configuration.md`
- **Core Tools API:** `docs/core/tools-api.md`
- **Troubleshooting:** `docs/troubleshooting.md`
- **Contribution Guide:** `CONTRIBUTING.md`

---

## 🤝 Contributing

Please read the full **Contributing** guide for setup, branching strategy, and PR requirements. In short:

1. Fork the repo.
2. Create a feature branch (`git checkout -b feat/your-feature`).
3. Run `npm run preflight` to ensure all checks pass.
4. Submit a PR with clear description; CI will automatically run lint, tests, and type‑checking.

---

## 📦 Release Process (maintainers)

1. Update version via `npm run release:version` (automatically bumps package versions).
2. Run `npm run preflight` to verify the build.
3. Publish the bundled CLI (`npm publish`) and optionally push Docker sandbox image.

---

## 📜 License & Legal

The project is licensed under the **MIT License** – see `LICENSE`. See also `SECURITY.md` for vulnerability reporting.

---

_Generated by LowCal Code’s automated context generation._

## Qwen Added Memories
- Browser_control tool tips: 1) Text extraction (textContent) works reliably - use it to extract content from pages. 2) Clicking is problematic due to overlay elements on modern sites - use direct URL navigation (goto) instead of click when possible. 3) When clicking is needed, navigate directly to post/article URLs rather than trying to click through overlays. 4) Use getByRole/getByText to find elements, but be aware clicking may still fail due to overlay intercepts. 5) Many sites (NYTimes) use geo-blocking/CAPTCHA that blocks automated browsers - Reddit works well for text extraction.
- Updated docs/browser-control-spec.md with best practices section in Usage notes (around line 304) to help future instances with browser_control tool usage tips including: text extraction reliability, preferring direct navigation over clicking, dealing with overlay elements, site blocking issues, and workarounds for click failures.
