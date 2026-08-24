# AgentTeams Member Claim Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent harmless member `assignee` argument noise from blocking the scheduler's idempotent claim handshake while preserving cross-identity rejection.

**Architecture:** Normalize member-only empty/whitespace/self `assignee` values at the existing authorization boundary, keep captain semantics unchanged, and make both assignment prompts state the exact task-id-only call. Release the local AgentTeams fork as `0.1.13-desktop.3` and verify the installed desktop copy.

**Tech Stack:** TypeScript, Node.js verification scripts, pnpm, Electron Builder.

## Global Constraints

- Keep scheduler pre-claim and member idempotent claim confirmation.
- Accept only omitted, empty/whitespace, or exact self-assignee for members.
- Reject `captain` and all other member identities.
- Preserve captain assignment, attempt-id, stale-attempt, race, and reassignment behavior.
- Do not mutate live `.agent-teams` state.

---

### Task 1: Guard the member claim compatibility contract

**Files:**
- Modify: `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/tools.ts`
- Modify: `win-desktop/agent-teams-plugin/src/members.ts`
- Modify: `win-desktop/agent-teams-plugin/src/scheduler.ts`

**Interfaces:**
- Consumes: existing `agent_teams_claim_task` tool and scheduler dispatch ticket.
- Produces: member-safe claim normalization and exact task-id-only prompt guidance.

- [ ] **Step 1: Add failing lifecycle assertions**

After the existing scheduler auto-claim, call the tool as the assigned member
with `assignee: ''`, whitespace, and the member's own name; each must return the
same scheduler `attempt_id`. Calls with `assignee: 'captain'` and another member
must reject with the member-assignee authorization error. Assert delivered
assignment text contains `agent_teams_claim_task` with `task_id` only and an
explicit instruction to omit `assignee`.

- [ ] **Step 2: Run lifecycle verification to prove RED**

Run:

```powershell
pnpm build
node scripts/lifecycle-verify.mjs
```

Expected: FAIL when empty/self member assignee values hit the current blanket
rejection and when the prompt lacks the exact omission instruction.

- [ ] **Step 3: Implement minimal normalization and prompt changes**

For member callers, treat `args.assignee` as omitted only when its trimmed value
is empty or its exact untrimmed value equals `identity.name`; otherwise retain
the existing error. Keep captain handling unchanged. Update member persona and
`assignmentPrompt()` to show `agent_teams_claim_task({"task_id":"<id>"})` and
state that members must omit `assignee` entirely.

- [ ] **Step 4: Run plugin suite**

Run: `pnpm test`

Expected: build and all AgentTeams verification scripts pass.

- [ ] **Step 5: Commit**

```powershell
git commit -m "fix: tolerate harmless member claim assignee"
```

### Task 2: Release and package AgentTeams desktop.3

**Files:**
- Modify: `win-desktop/agent-teams-plugin/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/tests/desktop-settings-plugin.test.js`
- Modify: `win-desktop/tests/agent-teams-integration.test.js`

**Interfaces:**
- Produces: installed local package `0.1.13-desktop.3` and refreshed Windows artifacts.

- [ ] **Step 1: Change version assertions to `0.1.13-desktop.3` and prove RED**

Update source, lockfile, and installed-package expectations, then run the two
desktop integration tests before synchronizing `node_modules`; the installed
version assertion must fail on `.2`.

- [ ] **Step 2: Build and synchronize published package files**

Run the plugin build, then copy `package.json`, `lib`, published assets,
`cordis.patch.yml`, release notes, and README files into
`win-desktop/node_modules/@nanmicoder/dsh-agent-teams`. Do not copy development
dependencies, credentials, or live team state.

- [ ] **Step 3: Verify and package**

Run:

```powershell
npm test
npm run dist:win
```

Inspect `dist/win-unpacked` for AgentTeams `0.1.13-desktop.3`, the updated
member claim logic, and prompt text. Compute SHA256 for the EXE and ZIP.

- [ ] **Step 4: Commit**

```powershell
git commit -m "chore: release AgentTeams desktop.3"
```

