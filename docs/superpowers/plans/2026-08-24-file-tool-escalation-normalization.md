# File Tool Escalation Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent redundant `write` and `edit` sandbox escalation requests from failing when the current session already has the requested or a wider mode.

**Architecture:** Extend the existing Windows ESM source loader rewrite for the official `@deepseek-ai/dsh-tool-fs` bundle. Reuse the existing rank-aware normalizer before official validation, and verify the actual registered tools through a runtime fixture.

**Tech Stack:** Node.js ESM loader hooks, Node test runner, official DeepSeek Harness RC2 packages, npm.

## Global Constraints

- Keep official strict-wider validation and user approval for real escalation.
- Preserve unknown modes for official validation.
- Do not patch files inside `node_modules` or the installed application.
- Do not modify OHIF or live session/team state.
- Release as desktop wrapper `0.1.1-rc.8`; AgentTeams stays `0.1.13-desktop.3`.

---

### Task 1: Reproduce the missing file-tool rewrite

**Files:**
- Create: `win-desktop/tests/fixtures/fs-escalation-runtime.mjs`
- Modify: `win-desktop/tests/win-hide-console.test.js`

**Interfaces:**
- Consumes: `rewriteDesktopConsoleSource()` and the real `@deepseek-ai/dsh-tool-fs` package.
- Produces: source-level and runtime regressions for `write` and `edit`.

- [ ] **Step 1: Add the failing source rewrite assertion**

Load `@deepseek-ai/dsh-tool-fs`, pass its source and module URL to
`rewriteDesktopConsoleSource()`, and assert that the original validation-first
sequence is replaced by standing-policy resolution, normalization, then
validation.

- [ ] **Step 2: Add the real runtime fixture**

Register `win-hide-console-loader.mjs`, import `@deepseek-ai/dsh-tool-fs`, and
provide a minimal in-memory context that records `writeText`, `editText`, and
approval calls. Execute both tools for:

```text
danger-full-access -> danger-full-access: mutation runs, no approval
danger-full-access -> workspace-write: mutation runs, no approval
workspace-write -> danger-full-access with blank justification: rejected before approval
workspace-write with justification only: rejected before approval
workspace-write -> danger-full-access with valid justification: one approval before mutation
```

- [ ] **Step 3: Prove RED**

Run:

```powershell
node --test tests/win-hide-console.test.js
```

Expected: FAIL because `dsh-tool-fs` still retains the original
validation-first `resolvePolicy()` sequence.

### Task 2: Extend the loader rewrite

**Files:**
- Modify: `win-desktop/src/win-hide-console-rewrite.js`
- Test: `win-desktop/tests/win-hide-console.test.js`
- Test: `win-desktop/tests/fixtures/fs-escalation-runtime.mjs`

**Interfaces:**
- Produces: `rewriteFsEscalationSource(source)` used by
  `rewriteDesktopConsoleSource()` for `@deepseek-ai/dsh-tool-fs` URLs.

- [ ] **Step 1: Implement the minimal rewrite**

Match the exact upstream `FsSandboxController.resolvePolicy()` prefix and
replace it with:

```js
const standingPolicy = this.policy?.resolve(...)
args = normalizeRedundantEscalationArgs(args, standingPolicy?.mode)
validateEscalationArgs(args.sandbox_permissions, args.justification)
```

Leave the remaining official approval and mutation code unchanged.

- [ ] **Step 2: Prove GREEN**

Run:

```powershell
node --test tests/win-hide-console.test.js
npm test
```

Expected: the new file-tool cases and all desktop tests pass.

### Task 3: Release identity and full regression

**Files:**
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`

**Interfaces:**
- Produces: wrapper release identity `0.1.1-rc.8` and documented ownership.

- [ ] **Step 1: Synchronize version text**

Update the wrapper package and root lockfile version to `0.1.1-rc.8`, update
README artifact examples, and record file-tool escalation normalization under
the Windows wrapper owner.

- [ ] **Step 2: Run the complete gate**

Run from `win-desktop`:

```powershell
npm run verify:upstream
```

Expected: Models, CPA, AgentTeams, Session Markdown, and desktop tests pass.

- [ ] **Step 3: Inspect and commit**

Run `git diff --check`, inspect for credentials and generated build noise, then
commit the implementation and release metadata without installers or runtime
state.
