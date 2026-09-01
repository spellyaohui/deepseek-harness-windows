# AgentTeams 232a338 Selective Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selectively migrate PR #109 and PR #110 from fixed AgentTeams commit `232a338fc9a0d393f118912386f67e7f3a6c67d6` into the Windows fork while preserving every registered local capability.

**Architecture:** Keep the existing `0.1.14-desktop.12` fork as Owner. Add one tool-input normalizer that is never used for durable reads, then add a final-error attempt bridge at the existing member spawn boundary and resume scheduling only after real child idleness. Version and provenance advance only after focused and repository-wide gates pass.

**Tech Stack:** TypeScript, Cordis, DeepSeek Harness `0.1.2-alpha.2`, Node.js verification scripts, pnpm, npm wrapper gate.

## Global Constraints

- Upstream source is fixed at `232a338fc9a0d393f118912386f67e7f3a6c67d6`; never consume floating `@latest`.
- Do not replace the local AgentTeams fork or remove Profiles, role Provider/model/reasoning, strict V2, trusted approval, CAS, quality gates, compact status, wait, halt/resume, or native Subagent spawning.
- Blank optional values are normalized only for new tool input. Malformed/old Team state remains rejected and receives no migration layer.
- Non-string optional list entries must reach strict validation and fail closed; never filter them into a partial update.
- A member attempt may fail only from final `agent/error`, never from an intermediate request-error/retry event.
- Failure settlement must be stale-safe for Team, member, task, attempt and `attemptId` identity.
- `@deepseek-ai/dsh-llm-retry` may be a fixed Alpha.2 dev dependency only; no new runtime dependency is allowed.
- Do not package, publish, push, tag, create a GitHub Release, upload assets, or modify real user configuration.

---

### Task 1: Close the current trusted-approval slice and establish baseline

**Files:**
- Read: `.superpowers/sdd/task-1-3-report.md`
- Read: `.superpowers/sdd/progress.md`
- Test: `win-desktop/agent-teams-plugin/scripts/staging-approval-tdd.mjs`
- Test: `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`

**Interfaces:**
- Consumes: commits `f924e1d..44d5314` and the existing independent review package.
- Produces: a clean reviewed baseline before upstream behavior is added.

- [ ] **Step 1: Receive the independent Task 1+3 review**

Accept only a report containing explicit spec-compliance and code-quality
verdicts. Fix every Critical/Important finding before continuing.

- [ ] **Step 2: Run the focused baseline**

Run from `win-desktop/agent-teams-plugin`:

```powershell
pnpm build
node scripts/alpha2-contract-tdd.mjs
node scripts/staging-approval-tdd.mjs
node scripts/quality-gates-tdd.mjs
node scripts/lifecycle-verify.mjs
node scripts/stress-verify.mjs
```

Expected: every command exits `0` before Task 2 tests are introduced.

### Task 2: Reapply PR #109 only at new tool-input boundaries

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/quality-gates.ts`
- Modify: `win-desktop/agent-teams-plugin/src/tools.ts`
- Modify: `win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/verify.mjs`
- Preserve: `win-desktop/agent-teams-plugin/src/state.ts`

**Interfaces:**
- Produces: `normalizeBlankOptionalTaskFields<T extends object>(task: T): T`.
- Consumes: existing `validateCreateTask`, `evaluateQualityCompletion`, `parseFindings`, and strict `writeTeam` validation.

- [ ] **Step 1: Write failing tool regressions**

Add tests proving:

```typescript
normalizeBlankOptionalTaskFields({
  objective: '   ',
  reviewedTaskId: '',
  inScope: ['', 'src/a.ts', 42],
})
```

returns an object without the blank scalar fields, with `inScope` equal to
`['src/a.ts', 42]`, so later validation can reject `42`.

Exercise real tools to prove blank `description`, `objective`,
`reviewedTaskId`, `sourceTaskId`, `changedPaths` entries and finding `file`
values are not persisted. Add a durable-state test proving the same malformed
legacy Team input is still rejected rather than repaired.

- [ ] **Step 2: Run RED verification**

```powershell
pnpm build
node scripts/quality-gates-tdd.mjs
node scripts/verify.mjs
```

Expected: the new assertions fail against the current source for missing
normalization; existing assertions remain green up to the new checks.

- [ ] **Step 3: Add the pure normalizer**

Implement the upstream-compatible shape without durable-read use:

```typescript
const BLANK_SENSITIVE_STRING_FIELDS = [
  'description', 'objective', 'reviewedTaskId', 'sourceTaskId',
] as const

const BLANK_SENSITIVE_STRING_LIST_FIELDS = [
  'inScope', 'outOfScope', 'acceptance', 'verify', 'deliverables',
  'nonGoals', 'changedPaths', 'sourceFindingIds', 'coverageOf',
] as const

export function normalizeBlankOptionalTaskFields<T extends object>(task: T): T {
  const next = { ...task } as Record<string, unknown>
  for (const key of BLANK_SENSITIVE_STRING_FIELDS) {
    if (typeof next[key] === 'string' && next[key].trim() === '') delete next[key]
  }
  for (const key of BLANK_SENSITIVE_STRING_LIST_FIELDS) {
    const value = next[key]
    if (!Array.isArray(value)) continue
    const kept = value.filter(item => !(typeof item === 'string' && item.trim() === ''))
    if (kept.length === 0) delete next[key]
    else next[key] = kept
  }
  return next as T
}
```

- [ ] **Step 4: Apply the helper to model-facing writes**

Normalize `agent_teams_create_task` input before validation and construction.
Normalize completion input before quality evaluation and `changedPaths`
persistence. Trim or omit optional finding `file`. Do not call the helper from
`coerceTeamState`, `readTeam`, profile loading, or Web staged-plan mutation.

- [ ] **Step 5: Run GREEN verification and commit**

```powershell
pnpm build
node scripts/quality-gates-tdd.mjs
node scripts/verify.mjs
pnpm typecheck
```

Expected: all commands exit `0`; commit one logical PR #109 slice.

### Task 3: Reapply PR #110 final member-failure bridging

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/members.ts`
- Modify: `win-desktop/agent-teams-plugin/src/tools.ts`
- Modify: `win-desktop/agent-teams-plugin/src/scheduler.ts` only if the existing public kick interface is insufficient
- Create: `win-desktop/agent-teams-plugin/scripts/member-failure-tdd.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/package.json` only for the fixed dev dependency/test command

**Interfaces:**
- Produces: `FailedMemberAttempt` and `failMemberOpenAttempt(...) => Promise<boolean>`.
- Extends: `spawnMember(..., onFailureSettled?)` with a callback that asks the existing scheduler to continue after child idleness.
- Consumes: `withTeamLock`, `readTeam`/`readTeamSync`, `writeTeam`, current task attempt identity, mailbox/event helpers and `TeamScheduler.kickTeam`/`kickMember`.

- [ ] **Step 1: Write the failing member-failure suite**

Cover these independent cases:

1. intermediate request recovery does not fail an attempt;
2. final `agent/error` fails the matching attempt and releases the member;
3. duplicate event for the same turn writes once;
4. reassigned/retried/stale `attemptId` event is a no-op;
5. removed member or replaced Team generation is a no-op;
6. Captain mailbox and injected message contain a bounded sanitized summary;
7. no stack, credential, prompt or raw provider payload is persisted;
8. scheduler kick happens only after `child.whenIdle()` and does not retry the
   failed task automatically;
9. unrelated ready work may continue while dependents remain blocked.

- [ ] **Step 2: Run RED verification**

```powershell
pnpm build
node scripts/member-failure-tdd.mjs
```

Expected: failure because the final-error bridge/API is absent.

- [ ] **Step 3: Implement stale-safe failure settlement**

Capture the current attempt synchronously in the `agent/error` listener. Under
the Team lock, compare Captain id, member id/name, task id, attempt number and
`attemptId`; return `false` without writes on any mismatch. On a match, make a
single terminal failure transition, release the member, write activity/mail,
and return `true`.

- [ ] **Step 4: Wait for real idleness and resume scheduling**

After a successful settlement, await `child.whenIdle()`. Recheck Team/member
identity and `child.status === 'idle'`, then invoke the supplied failure-settled
callback. The callback uses the existing scheduler and current Captain; it
must not create a replacement attempt for the failed task.

- [ ] **Step 5: Run GREEN and lifecycle verification**

```powershell
pnpm build
node scripts/member-failure-tdd.mjs
node scripts/lifecycle-verify.mjs
node scripts/stress-verify.mjs
pnpm typecheck
```

Expected: all commands exit `0`; commit one logical PR #110 slice.

### Task 4: Synchronize package identity and provenance

**Files:**
- Modify: `win-desktop/agent-teams-plugin/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/tests/agent-teams-integration.test.js`
- Modify: `win-desktop/tests/desktop-settings-plugin.test.js`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`
- Modify: `win-desktop/tests/local-plugin-artifacts.test.js`
- Modify: `win-desktop/agent-teams-plugin/UPSTREAM.md`
- Modify: `win-desktop/agent-teams-plugin/README.md`
- Modify: `win-desktop/agent-teams-plugin/README_ZH.md`
- Create: `win-desktop/agent-teams-plugin/release-notes/v0.1.15-desktop.1.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces local identity `0.1.15-desktop.1` based on fixed upstream
  `232a338fc9a0d393f118912386f67e7f3a6c67d6`.
- Records the four Owner classifications from the design.

- [ ] **Step 1: Update all version assertions atomically**

Change package, lockfile and integration expectations together. Do not update
the wrapper version and do not create an installer.

- [ ] **Step 2: Record provenance and user impact**

Document Alpha.2 equivalence, input-boundary-only PR #109 treatment, deliberate
absence of durable migration, and PR #110 final-error behavior. Update the
AgentTeams invariant heading without weakening its content.

- [ ] **Step 3: Run documentation/version regressions and commit**

```powershell
node --test tests/agent-teams-integration.test.js tests/desktop-settings-plugin.test.js tests/local-capability-manifest.test.js tests/local-plugin-artifacts.test.js
```

Expected: all tests pass against `0.1.15-desktop.1`.

### Task 5: Complete regression and repository hygiene

**Files:**
- Verify only; no package output is created.

- [ ] **Step 1: Run the full AgentTeams gate**

```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop\agent-teams-plugin
pnpm test
```

Expected: every settings, selection, approval, fallback, member-failure,
quality, lifecycle, stress, build-path and Skill check exits `0`.

- [ ] **Step 2: Run the mandatory wrapper gate**

```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop
npm run verify:upstream
```

Expected: exit code `0`; no network, dependency installation or packaging.

- [ ] **Step 3: Review the branch and forbidden artifacts**

```powershell
git diff --check
git status --short --branch
git ls-files --others --exclude-standard
```

Expected: only planned source/tests/docs changes; no tarball, upstream checkout,
installer, log, session, credential or runtime state is tracked or unignored.

## Completion Conditions

- PR #109 new-input behavior passes while old malformed Team state remains
  rejected.
- PR #110 final failure settles only the current attempt, not request retries.
- All registered local AgentTeams capabilities and trusted approval regressions
  remain green.
- Package identity and provenance consistently report `0.1.15-desktop.1` and
  fixed upstream `232a338`.
- `pnpm test` and `npm run verify:upstream` exit `0`.
- No installer, push, tag, GitHub Release or asset upload occurs.
