# Harness Tool Guidance, AgentTeams Prompt Compaction, and AUTO Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the AUTO permission plugin, add a compact wrapper-wide tool-call discipline prompt, compress the AgentTeams protocol, and treat blank optional Team Profiles as omitted without weakening strict lifecycle or Profile validation.

**Architecture:** The Windows wrapper mounts a new host-only local plugin, `@deepseek-ai/dsh-tool-call-guidance`, before AgentTeams in both static and generated desktop patches. AgentTeams keeps ownership of its lifecycle protocol and create boundary: `usageSectionText()` becomes a compact state machine, while `agent_teams_create` trims a supplied Profile and treats an empty result as absent. AUTO is removed from distribution composition with no session or cache migration.

**Tech Stack:** Node.js ESM, TypeScript, Cordis/DSH system-prompt sections, Node test runner, pnpm package scripts, Electron wrapper patch YAML.

## Global Constraints

- Wrapper version advances from `0.1.1-rc.27` to `0.1.1-rc.28`.
- AgentTeams version advances from `0.1.14-desktop.9` to `0.1.14-desktop.10`.
- Tool-call guidance plugin starts at `0.1.0` and its prompt text is at most 500 characters.
- AgentTeams output for the built-in `software-delivery` Profile is at most 3,500 characters.
- Do not alter the 394-tool catalog, Provider protocols, image capability settings, reasoning metadata, or grep compatibility.
- Do not migrate old AUTO sessions, old AgentTeams state, or stale user Profile caches.
- Do not install packages, access the network, publish, deploy, or build an installer during this implementation.
- Preserve and never commit the main worktree's CPA declaration edits and conflict document.
- Final acceptance command is `npm run verify:upstream` from `win-desktop`.

---

### Task 1: Remove AUTO from runtime composition

**Files:**
- Modify: `win-desktop/tests/heal-desktop-plugins.test.js`
- Modify: `win-desktop/src/dsh-service.js`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`

**Interfaces:**
- Consumes: `buildDshArgs(entry, options)` and `healDesktopPluginFallback(options)`.
- Produces: launch arguments containing only the Windows picker and generated desktop patch; no `@nanmicoder/dsh-auto-mode` dependency or patch resolver.

- [ ] **Step 1: Change the integration test to require AUTO absence**

Replace the launch assertion with checks equivalent to:

```js
const args = buildDshArgs('dsh-entry', {
  platform: 'win32',
  windowsPickerPatch: 'picker.patch.yml',
  agentTeamsPatch: 'desktop.patch.yml',
  winHideConsoleImport: 'hide-console.mjs',
})
assert.deepEqual(args.filter(value => value.endsWith('.patch.yml')), [
  'picker.patch.yml',
  'desktop.patch.yml',
])
assert.doesNotMatch(JSON.stringify(args), /auto-mode/i)
```

Also assert both `package.json` and `package-lock.json` contain no `@nanmicoder/dsh-auto-mode` key.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/heal-desktop-plugins.test.js`

Expected: FAIL because the current arguments still include the AUTO patch and the dependency still exists.

- [ ] **Step 3: Remove the runtime and dependency touchpoints**

Delete `resolveAutoModePatch()`, remove `autoModePatch` from `buildDshArgs()` options and output, and rewrite the healing comment to refer to wrapper-owned desktop plugins generally. Remove the dependency and its lockfile package entries without changing unrelated package versions.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `node --test tests/heal-desktop-plugins.test.js`

Expected: PASS with no AUTO launch or dependency expectations.

- [ ] **Step 5: Verify and commit the removal slice**

Run: `rg -n "@nanmicoder/dsh-auto-mode|resolveAutoModePatch|autoModePatch" win-desktop/package.json win-desktop/package-lock.json win-desktop/src win-desktop/tests`

Expected: no matches.

Commit: `refactor: remove auto permission plugin integration`

---

### Task 2: Add the wrapper-owned tool-call guidance plugin

**Files:**
- Create: `win-desktop/tool-call-guidance-plugin/package.json`
- Create: `win-desktop/tool-call-guidance-plugin/lib/index.js`
- Create: `win-desktop/tests/tool-call-guidance.test.js`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/src/dsh-service.js`
- Modify: `win-desktop/config/agent-teams.patch.yml`
- Modify: `win-desktop/scripts/sync-local-plugin-artifacts.mjs`
- Modify: `win-desktop/tests/local-plugin-artifacts.test.js`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`

**Interfaces:**
- Produces: `TOOL_CALL_GUIDANCE: string`, `name = 'tool-call-guidance'`, and `apply(ctx)` registering `desktop:tool-call-guidance` at order `110`.
- Consumes: DSH `ctx.systemPrompt.section({ name, order, text })`.

- [ ] **Step 1: Add the failing prompt and composition regressions**

Create a Node test that imports `TOOL_CALL_GUIDANCE` and `apply`, captures the registered section, and asserts:

```js
assert.ok(TOOL_CALL_GUIDANCE.length <= 500)
assert.match(TOOL_CALL_GUIDANCE, /current tool schema/i)
assert.match(TOOL_CALL_GUIDANCE, /unknown or blank/i)
assert.match(TOOL_CALL_GUIDANCE, /empty value.*meaningful/i)
assert.match(TOOL_CALL_GUIDANCE, /do not repeat.*unchanged/i)
assert.deepEqual(section, {
  name: 'desktop:tool-call-guidance',
  order: 110,
  text: TOOL_CALL_GUIDANCE,
})
```

Extend composition tests to require the local file dependency, source directory, artifact synchronization row, and a patch row before AgentTeams.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --test tests/tool-call-guidance.test.js tests/local-plugin-artifacts.test.js tests/local-capability-manifest.test.js tests/agent-teams-integration.test.js`

Expected: FAIL because the plugin files, dependency, artifact row, and patch row do not exist.

- [ ] **Step 3: Implement the minimal host-only plugin**

Use this package identity and interface:

```json
{
  "name": "@deepseek-ai/dsh-tool-call-guidance",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js", "./package.json": "./package.json" }
}
```

```js
export const name = 'tool-call-guidance'
export const inject = ['systemPrompt']
export const TOOL_CALL_GUIDANCE = 'Tool calls: build arguments from the current tool schema and explicit context. Omit optional properties whose values are unknown or blank, unless the tool explicitly says an empty value is meaningful. After a failure, read the error or structured next-step guidance; do not repeat the same invalid arguments unchanged.'

export function apply(ctx) {
  return ctx.systemPrompt.section({
    name: 'desktop:tool-call-guidance',
    order: 110,
    text: TOOL_CALL_GUIDANCE,
  })
}
```

Mount `@deepseek-ai/dsh-tool-call-guidance` before `@nanmicoder/dsh-agent-teams` in both static and generated patches. Add the `file:tool-call-guidance-plugin` dependency, lockfile package metadata, and sync/artifact ownership assertions.

- [ ] **Step 4: Bootstrap only the ignored installed copy and run GREEN**

Because this repository's gate never installs packages, create the ignored `win-desktop/node_modules/@deepseek-ai/dsh-tool-call-guidance` directory from the local package solely for this worktree, then run:

`node --test tests/tool-call-guidance.test.js tests/local-plugin-artifacts.test.js tests/local-capability-manifest.test.js tests/agent-teams-integration.test.js`

Expected: PASS; the source and installed copies expose the same `0.1.0` identity.

- [ ] **Step 5: Commit the plugin slice**

Commit: `feat: add compact tool call guidance`

---

### Task 3: Compact AgentTeams protocol into a lifecycle state machine

**Files:**
- Modify: `win-desktop/agent-teams-plugin/scripts/verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts`

**Interfaces:**
- Consumes: `policyMarker()`, `delegationPolicyUsagePreamble()`, `qualityPlanningPrompt()`, tool names, and formatted Profile text.
- Produces: `usageSectionText(...)` preserving policy and Profile interpolation while meeting the 3,500-character budget.

- [ ] **Step 1: Add failing prompt-budget and invariant tests**

Construct the real `software-delivery` Profile prompt and assert `usage.length <= 3500`. Require markers for `unknown`, `inactive`, `staged`, `running`, `halted`, status/create/edit-plan/resume/delete actions, `approval=required`, Profile omission, all three reasoning modes, Provider/model pairing, dependencies, scheduler, `attempt_id`, reassignment, requirements-before-implementation with `verdict=pass`, review/repair, `inScope`, deliverables, verification evidence, cleanup, and explicit deployment confirmation. Assert the obsolete numbered eleven-step prose and duplicated full field descriptions are absent.

- [ ] **Step 2: Run AgentTeams prompt checks and confirm RED**

Run: `node scripts/verify.mjs && node scripts/quality-gates-tdd.mjs`

Expected: FAIL because the existing prompt is about 7,300 characters and lacks the compact state-machine shape.

- [ ] **Step 3: Rewrite `usageSectionText()` as compact protocol text**

The replacement must begin with policy marker and preamble, then include this state contract in compact prose:

```text
State first: unknown -> status once; inactive -> create one Team; staged -> edit roster/DAG or wait for explicit approval, never self-approve; running -> status/create-task/message/reassign/resume/delete, never create a replacement, edit-plan, or approve; halted -> resume(reason) before new work.
```

Follow with compact paragraphs for approval/Profile/reasoning ownership, DAG scheduling/attempt safety, quality contracts, result collection, cleanup, and deployment confirmation. Keep field-level details in tool schemas.

- [ ] **Step 4: Run prompt checks and build**

Run: `node scripts/verify.mjs && node scripts/quality-gates-tdd.mjs && pnpm build`

Expected: PASS and built `lib/index.js` contains the compact state markers.

- [ ] **Step 5: Commit the prompt slice**

Commit: `refactor: compact agent teams lifecycle guidance`

---

### Task 4: Normalize blank optional Profiles at create

**Files:**
- Modify: `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/tools.ts`

**Interfaces:**
- Consumes: optional `args.profile?: string` and `config.profiles`.
- Produces: `profileName: string | undefined`, where missing/blank creates an ad-hoc Team and non-empty unknown names remain strict with zero durable writes or spawns.

- [ ] **Step 1: Add failing lifecycle regressions**

Add one test sequence creating and deleting an ad-hoc Team with omitted Profile, then another with `profile: '   '`. Assert both snapshots omit `profile`, have the same ad-hoc roster/task shape, and the blank call does not error. Add an unknown non-empty Profile case and assert the error lists configured names while the Team directory and child count remain unchanged.

- [ ] **Step 2: Run lifecycle verification and confirm RED**

Run: `node scripts/lifecycle-verify.mjs`

Expected: FAIL with `AgentTeams profile name must not be empty`.

- [ ] **Step 3: Implement normalization and dynamic schema guidance**

Replace the empty-name throw with:

```ts
const normalizedProfile = args.profile?.trim()
const profileName = normalizedProfile === '' ? undefined : normalizedProfile
```

Keep `profile` an optional string. Build its description from `listConfiguredProfiles(config.profiles)` so it names current configured Profiles and says to omit the property otherwise. Do not add an enum or select a default Profile.

- [ ] **Step 4: Run lifecycle and quality verification**

Run: `node scripts/lifecycle-verify.mjs && node scripts/quality-gates-tdd.mjs && pnpm typecheck`

Expected: PASS; blank Profile is ad-hoc, unknown Profile remains pre-write strict, and V2 quality/lifecycle rules remain intact.

- [ ] **Step 5: Commit the create-boundary fix**

Commit: `fix: treat blank team profile as omitted`

---

### Task 5: Synchronize versions, release notes, and maintenance ownership

**Files:**
- Create: `win-desktop/agent-teams-plugin/release-notes/v0.1.14-desktop.10.md`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/agent-teams-plugin/package.json`
- Modify: `win-desktop/agent-teams-plugin/README.md`
- Modify: `win-desktop/agent-teams-plugin/README_ZH.md`
- Modify: `win-desktop/agent-teams-plugin/UPSTREAM.md`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `AGENTS.md`
- Modify: `win-desktop/tests/local-plugin-artifacts.test.js`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`

**Interfaces:**
- Produces: synchronized wrapper `0.1.1-rc.28`, AgentTeams `0.1.14-desktop.10`, tool guidance `0.1.0`, ownership records, and consumer-facing change notes.

- [ ] **Step 1: Add failing version and documentation assertions**

Require the three exact versions, the new release note, tool-guidance ownership markers, blank-Profile semantics, compact prompt budget, and no AUTO advertising. Keep all existing unrelated capability markers.

- [ ] **Step 2: Run manifest/artifact tests and confirm RED**

Run: `node --test tests/local-plugin-artifacts.test.js tests/local-capability-manifest.test.js`

Expected: FAIL on old versions and missing ownership/release markers.

- [ ] **Step 3: Update package provenance and user documentation**

Describe user-visible effects: official permission modes only, shorter system guidance, blank optional Profile accepted as omission, unknown Profiles still rejected, role-level model/reasoning behavior unchanged, and no change to the tool catalog. Remove every claim that AUTO remains integrated. Record the explicit product-removal decision rather than classifying AUTO as an upstream equivalent.

- [ ] **Step 4: Run documentation and identity checks**

Run: `node --test tests/local-plugin-artifacts.test.js tests/local-capability-manifest.test.js`

Expected: PASS with all versions and provenance aligned.

- [ ] **Step 5: Commit the synchronization slice**

Commit: `docs: record rc28 prompt and permission changes`

---

### Task 6: Full regression, scope audit, and branch completion

**Files:**
- Verify all changed files; no new implementation files are introduced in this task.

**Interfaces:**
- Consumes: all prior commits.
- Produces: fresh acceptance evidence and a clean, reviewable feature branch.

- [ ] **Step 1: Run textual removal and scope checks**

Run:

```powershell
rg -n "@nanmicoder/dsh-auto-mode|resolveAutoModePatch|autoModePatch" win-desktop README.md docs AGENTS.md
rg -n "tool catalog|394" win-desktop/src win-desktop/agent-teams-plugin/src
git diff --check
git status --short
```

Expected: no AUTO integration references; no tool-catalog implementation changes; no whitespace errors; only planned files changed.

- [ ] **Step 2: Run the mandatory acceptance gate**

Run: `npm run verify:upstream`

Expected: every local plugin build/verification and all wrapper tests PASS with zero failures.

- [ ] **Step 3: Review the complete diff for capability preservation and secrets**

Run:

```powershell
git diff 82aba53..HEAD --stat
git diff 82aba53..HEAD -- win-desktop/package.json win-desktop/src/dsh-service.js win-desktop/agent-teams-plugin/src/index.ts win-desktop/agent-teams-plugin/src/tools.ts
git status --short --branch
```

Confirm no credentials, runtime state, installer, logs, screenshots, cache files, CPA source changes, Provider behavior, image settings, grep compatibility, or tool-catalog pruning entered the branch.

- [ ] **Step 4: Commit any verification-owned metadata only if required**

If generated tracked plugin artifacts changed as part of the repository's required build, stage only the owning source/artifact/version files and commit them with `chore: synchronize rc28 local plugin artifacts`. Otherwise leave no extra commit.

- [ ] **Step 5: Hand off the completed branch**

Report the worktree path, branch, commit list, exact test counts, the installer omission, and the untouched dirty main-worktree files. Offer fast-forward integration or further user testing before packaging.
