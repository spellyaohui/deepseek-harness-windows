# Upstream Regression Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local plugin ownership and regression preservation mandatory and executable before any future upstream refresh can be packaged.

**Architecture:** Root `AGENTS.md` defines binding refresh behavior, `docs/UPSTREAM_MAINTENANCE.md` is the human capability registry, a fast Node test detects deleted integration edges, and `verify-upstream-regressions.mjs` runs every owning plugin suite plus desktop tests. Existing behavioral tests remain the source of truth; the new manifest test only prevents silent deletion and ownership drift.

**Tech Stack:** Markdown, Node.js ESM, Node test runner, npm, pnpm, PowerShell/Windows.

## Global Constraints

- Never delete a local capability solely to resolve an upstream conflict.
- Remove local implementation only after upstream-equivalent behavior and regression evidence exist.
- Keep AgentTeams, CPA, Models slot, Desktop Settings, and Session Markdown ownership separated.
- The upstream gate must not install, publish, package, use the network, or mutate live `.agent-teams`/session state.
- Keep public-repository secrets, sessions, logs, exports, screenshots, installers, and local upstream checkouts excluded.

---

### Task 1: Add binding rules and the capability registry

**Files:**
- Create: `AGENTS.md`
- Create: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `win-desktop/agent-teams-plugin/UPSTREAM.md`

**Interfaces:**
- Produces: always-loaded upstream rules and the canonical feature ownership/regression matrix.
- Consumes: current plugin provenance files, package versions, and existing verification commands.

- [ ] **Step 1: Write `AGENTS.md`**

Include exact sections for repository safety, upstream refresh classification
(`UPSTREAM_EQUIVALENT`, `REAPPLY`, `SUPERSEDED_BY_DESIGN`), forbidden conflict
resolutions, required version/provenance synchronization, and mandatory
`npm run verify:upstream` acceptance.

- [ ] **Step 2: Write `docs/UPSTREAM_MAINTENANCE.md`**

Create one table per owner with these columns:

```text
Capability | Owner | Upstream relationship | Critical files | Required regression
```

Cover AgentTeams, CPA, Models slot, Desktop Settings, Session Markdown, desktop
shell rewrites, console hiding, and OpenCode stream recovery. Add the seven-step
upstream refresh workflow and the rule that regressions survive even when
implementation ownership moves upstream.

- [ ] **Step 3: Correct current version/provenance text**

Replace stale desktop `0.1.1-rc.6`/AgentTeams `.desktop.1` and `.desktop.2`
statements with desktop `0.1.1-rc.7` and AgentTeams `0.1.13-desktop.3`.
Record `.desktop.3` member claim compatibility in AgentTeams `UPSTREAM.md`.

- [ ] **Step 4: Verify documentation**

Run:

```powershell
rg -n "0\.1\.1-rc\.6|0\.1\.13-desktop\.[12]" README.md win-desktop/README.md win-desktop/agent-teams-plugin/UPSTREAM.md
git diff --check
```

Expected: no stale-version matches and no whitespace errors.

- [ ] **Step 5: Commit**

```powershell
git commit -m "docs: preserve local capabilities across upstream updates"
```

### Task 2: Add the fast capability manifest regression

**Files:**
- Create: `win-desktop/tests/local-capability-manifest.test.js`
- Modify: `win-desktop/package.json`

**Interfaces:**
- Produces: deletion/drift sentry included automatically by `npm test`.
- Consumes: package manifests, lockfile, plugin source, integration test files, and desktop rewrite source.

- [ ] **Step 1: Write the failing test**

Use `node:test`, `node:assert/strict`, `existsSync`, `readFileSync`, and
`createRequire`. Assert:

```js
const localDependencies = {
  '@deepseek-ai/dsh-client-ui-settings-models': 'models-settings-plugin',
  '@deepseek-ai/dsh-cpa-provider': 'cpa-provider-plugin',
  '@deepseek-ai/dsh-desktop-settings': 'desktop-settings-plugin',
  '@deepseek-ai/dsh-session-markdown-export': 'session-markdown-export-plugin',
  '@nanmicoder/dsh-agent-teams': 'agent-teams-plugin',
}
```

For each dependency, require `file:<directory>`, a matching lockfile `resolved`,
an existing package manifest, and build/test scripts. Assert the required
behavioral gate files exist. Assert source markers for the Models card slot,
CPA registration/capacity, AgentTeams shared catalog/explicit routing/member
claim compatibility, Session Markdown mount, and shell/OpenCode rewrites.
Finally assert `packageJson.scripts['verify:upstream']` exists.

- [ ] **Step 2: Run the new test to prove RED**

Run:

```powershell
node --test tests/local-capability-manifest.test.js
```

Expected: FAIL because `verify:upstream` and its runner do not exist.

- [ ] **Step 3: Register the upstream gate command**

Add to `win-desktop/package.json`:

```json
"verify:upstream": "node scripts/verify-upstream-regressions.mjs"
```

- [ ] **Step 4: Run the fast test and desktop suite**

Run:

```powershell
node --test tests/local-capability-manifest.test.js
npm test
```

Expected: the manifest and full desktop suite pass after Task 3 adds the runner.

### Task 3: Add the complete upstream regression runner

**Files:**
- Create: `win-desktop/scripts/verify-upstream-regressions.mjs`
- Test: `win-desktop/tests/local-capability-manifest.test.js`

**Interfaces:**
- Produces: `npm run verify:upstream`.
- Consumes: local plugin `pnpm test` commands and desktop `npm test`.

- [ ] **Step 1: Implement a Windows-safe sequential runner**

Define:

```js
const gates = [
  ['models-settings-plugin', 'pnpm', ['test']],
  ['cpa-provider-plugin', 'pnpm', ['test']],
  ['agent-teams-plugin', 'pnpm', ['test']],
  ['session-markdown-export-plugin', 'pnpm', ['test']],
  ['.', 'npm', ['test']],
]
```

Resolve `pnpm.cmd`/`npm.cmd` on Windows and `pnpm`/`npm` elsewhere. Run each
with `spawnSync`, `stdio: 'inherit'`, the gate directory as `cwd`, and inherited
environment. Print a stable `[upstream-regression] START/PASS/FAIL` line and
exit immediately with the failing status or `1` for spawn errors.

- [ ] **Step 2: Run the fast manifest test**

Run: `node --test tests/local-capability-manifest.test.js`

Expected: PASS and the runner source is present.

- [ ] **Step 3: Run the complete upstream gate**

Run: `npm run verify:upstream`

Expected: all four plugin suites and desktop tests pass without packaging or
network access.

- [ ] **Step 4: Inspect and commit**

Run:

```powershell
git diff --check
git status --short
```

Commit all Task 2/3 files:

```powershell
git commit -m "test: gate upstream updates on local capabilities"
```
