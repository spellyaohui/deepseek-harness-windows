# Desktop Shell Escalation Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make redundant same/narrower Pwsh and Bash sandbox requests execute under the existing policy while preserving strict real escalation.

**Architecture:** Add one pure argument normalizer to the existing desktop import rewrite and inject its standalone function source into the official Pwsh/Bash execute blocks. Exact-source integration tests pin both installed official modules. The official validators, approval service, sandbox executor, and schema remain unchanged.

**Tech Stack:** JavaScript ESM loader rewrite, Node test runner, Electron desktop wrapper.

## Global Constraints

- Normalize only equal-or-narrower requested modes.
- Never lower the active policy and never grant a wider policy.
- Genuine widening keeps official justification and approval behavior.
- Cover Pwsh and Bash only; do not change filesystem tools.
- A future upstream source mismatch must fail tests before packaging.

---

### Task 1: Prove the normalization policy and real-module rewrite

**Files:**
- Modify: `win-desktop/tests/win-hide-console.test.js`
- Modify: `win-desktop/src/win-hide-console-rewrite.js`

**Interfaces:**
- Produces: `normalizeRedundantEscalationArgs(args, currentMode)` and Pwsh/Bash source rewriting through `rewriteDesktopConsoleSource()`.

- [ ] **Step 1: Write failing unit and integration tests**

Import the new helper, load the installed Pwsh/Bash sources, and assert:

```js
assert.deepEqual(normalizeRedundantEscalationArgs({
  sandbox_permissions: 'workspace-write', justification: '', command: 'Get-Location',
}, 'danger-full-access'), {
  sandbox_permissions: undefined, justification: undefined, command: 'Get-Location',
})

assert.deepEqual(normalizeRedundantEscalationArgs({
  sandbox_permissions: 'danger-full-access', justification: 'Need wider access.',
}, 'workspace-write'), {
  sandbox_permissions: 'danger-full-access', justification: 'Need wider access.',
})
```

Cover danger→danger, danger→workspace, workspace→workspace, workspace→danger,
and read-only→workspace. Rewrite both real module sources and assert the
injected normalizer appears before `validatePwshArgs(args)` /
`validateBashArgs(args)`. Assert rewriting twice is idempotent.

- [ ] **Step 2: Run focused test to prove RED**

Run: `node --test tests/win-hide-console.test.js`

Expected: FAIL because the helper/export and shell rewrite do not exist.

- [ ] **Step 3: Implement the standalone pure normalizer**

```js
export function normalizeRedundantEscalationArgs(args, currentMode) {
  const requested = args?.sandbox_permissions
  const redundant = requested !== undefined && (
    currentMode === 'danger-full-access'
    || (currentMode === 'workspace-write' && requested === 'workspace-write')
  )
  return redundant
    ? { ...args, sandbox_permissions: undefined, justification: undefined }
    : args
}
```

This intentionally leaves all advertised requests wider from `read-only`, and
`danger-full-access` from `workspace-write`, untouched.

- [ ] **Step 4: Inject the helper into official execute blocks**

For each module, match exactly:

```js
async execute(args, exec) {
  validatePwshArgs(args);
  const standingPolicy = resolveSandboxPolicy(exec);
```

and rewrite it to resolve policy first, call an inline copy of
`normalizeRedundantEscalationArgs.toString()`, then call the original validator.
Use `validateBashArgs` for Bash. Leave unmatched source unchanged so the real
module integration assertions fail visibly.

- [ ] **Step 5: Run focused and complete wrapper tests**

Run:

```powershell
node --test tests/win-hide-console.test.js
npm test
```

Expected: all tests pass, including existing console, OpenCode, and AgentTeams
rewrite checks.

- [ ] **Step 6: Commit**

```powershell
git add win-desktop/src/win-hide-console-rewrite.js win-desktop/tests/win-hide-console.test.js
git commit -m "fix: ignore redundant shell escalation"
```

### Task 2: Package and verify the combined Windows release

**Files:**
- Generated only: `win-desktop/dist/**`

**Interfaces:**
- Consumes: completed CPA provider and shell rewrite changes.
- Produces: refreshed NSIS installer and ZIP carrying both fixes.

- [ ] **Step 1: Run both component suites and the desktop suite fresh**

Run:

```powershell
pnpm test
```

in `win-desktop/cpa-provider-plugin`, then run `npm test` in `win-desktop`.

- [ ] **Step 2: Build Windows artifacts**

Run: `npm run dist:win`

Expected: Electron Builder creates the NSIS installer and ZIP without publishing.

- [ ] **Step 3: Inspect packaged behavior**

Verify the unpacked application contains CPA package `0.1.1`, the CPA client
bundle contains both raw capacity field keys, and the packaged desktop rewrite
contains `normalizeRedundantEscalationArgs` plus Pwsh/Bash module matching.

- [ ] **Step 4: Hash artifacts and verify Git state**

Run:

```powershell
Get-FileHash dist\*.exe,dist\*.zip -Algorithm SHA256
git status --short --branch
```

Expected: hashes are reported, generated artifacts stay ignored, and the feature
worktree is clean.
