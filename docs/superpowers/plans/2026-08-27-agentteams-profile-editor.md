# AgentTeams Profile Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, restart-aware AgentTeams profile editor to the existing Windows settings page, expose the built-in `software-delivery` profile, preserve the upstream profile runtime, and ship a verified Windows EXE/NSIS/ZIP release.

**Architecture:** The Windows main process owns a small profile store under the existing Electron `desktop-settings.json`; its narrow IPC bridge returns a cloned profile snapshot and saves a validated profile map. The startup service injects that snapshot into the AgentTeams patch, while the AgentTeams plugin owns the browser editor, editor validation, and upstream profile semantics. The existing live `agent-teams` settings namespace remains limited to delegation and member-route defaults, and profile edits take effect after restart.

**Tech Stack:** Electron 43, Node.js ESM, React 18/TSX, existing AgentTeams v0.1.14 fork, `yaml` 2.9.0, TypeScript, pnpm, Node test runner, electron-builder NSIS/ZIP.

## Global Constraints

- The current release invariants in `AGENTS.md` are acceptance criteria; do not remove or weaken an existing regression.
- AgentTeams owns profile/member defaults, routing, catalogs and lifecycle; Desktop Settings owns only the Harness-native `桌面` section and bridge; CPA-specific behavior stays in CPA/Models owners.
- The ordinary no-profile `agent_teams_create` path must remain unchanged; never emit `profile=""`, `default`, `none`, or `captain` as placeholders.
- Built-in profile edits are stored locally and must survive upgrades; the built-in profile cannot be deleted through the editor and can be restored explicitly.
- Profile changes are restart-required and must not mutate already-running sessions, teams, members, tokens, credentials, or `.agent-teams` state.
- Do not add dependencies; reuse the existing `yaml`, React, primitives, and model catalog.
- Do not commit `node_modules`, `lib` artifacts unless this repository's existing local-plugin sync convention requires them, `.agent-teams`, logs, screenshots, installers, package output, credentials, or runtime sessions.
- From `win-desktop`, `npm run verify:upstream` must pass before provenance acceptance or release packaging; the gate must not install packages, access the network, or package artifacts.
- Use only the existing isolated worktree `D:\Trae\其他\deepseek-harness\.worktrees\agentteams-v014-refresh`; do not modify `main` or merge/push without a separate request.

---

### Task 1: Define and test the host profile store contract

**Files:**
- Create: `win-desktop/src/agent-teams-profile-store.js`
- Modify: `win-desktop/src/desktop-settings.js`
- Create: `win-desktop/tests/agent-teams-profile-store.test.js`

**Interfaces:**
- Produces `BUILTIN_AGENT_TEAMS_PROFILES`, `BUILTIN_AGENT_TEAMS_PROFILE_NAMES`, `cloneAgentTeamsProfiles(value)`, `readAgentTeamsProfiles(settings)`, `writeAgentTeamsProfiles(profiles, options)`, and `getAgentTeamsProfileSnapshot(options)`.
- `getAgentTeamsProfileSnapshot()` returns `{ profiles: Record<string, object>, builtInNames: string[] }` and never returns the mutable internal default object.
- `writeAgentTeamsProfiles()` persists the full profile map through the existing desktop settings store and returns the same snapshot shape.

- [ ] **Step 1: Write the failing store tests.**

Add Node tests that inject an in-memory `load`/`flush` pair so they never depend on Electron or the real userData directory. Assert the exact built-in roster, no hard-coded `provider`/`model`/`reasoning_effort`, first-read default merging, preservation of unknown desktop fields, preservation of a user-edited `software-delivery`, protected reinsertion when a caller omits the built-in, custom profile retention, and deep-clone isolation:

```js
const customProfile = { members: [{ name: 'custom', role: 'custom role' }] }

test('first snapshot exposes the four-role captain-planning software profile', () => {
  const snapshot = getAgentTeamsProfileSnapshot({ settings: {} })
  assert.deepEqual(snapshot.builtInNames, ['software-delivery'])
  assert.equal(snapshot.profiles['software-delivery'].taskPlanning, 'captain')
  assert.deepEqual(
    snapshot.profiles['software-delivery'].members.map((member) => member.name),
    ['analyst', 'implementer', 'tester', 'reviewer'],
  )
  assert.ok(snapshot.profiles['software-delivery'].members.every((member) => (
    member.provider === undefined && member.model === undefined && member.reasoning_effort === undefined
  )))
})

test('saving an edited built-in preserves the edit and unrelated settings', () => {
  const settings = { closeBehavior: 'tray', futureSetting: { keep: true } }
  let flushed
  const edited = { ...BUILTIN_AGENT_TEAMS_PROFILES['software-delivery'], description: 'edited' }
  const result = writeAgentTeamsProfiles({ 'software-delivery': edited, custom: customProfile }, {
    load: () => settings,
    flush: (next) => { flushed = next },
  })
  assert.equal(result.profiles['software-delivery'].description, 'edited')
  assert.equal(flushed.closeBehavior, 'tray')
  assert.deepEqual(flushed.futureSetting, { keep: true })
})
```

- [ ] **Step 2: Run the focused test to confirm RED.**

Run from `win-desktop`:

```powershell
node --test tests/agent-teams-profile-store.test.js
```

Expected: FAIL because the new store module and exports do not exist.

- [ ] **Step 3: Implement the smallest safe store.**

Define the built-in profile with only JSON-safe strings/arrays. Export `cloneAgentTeamsProfiles` using a JSON round-trip after checking the input is a plain object. `readAgentTeamsProfiles` must merge built-in entries only when absent, retain valid-looking user entries, reject arrays/non-objects, and never mutate the source. `writeAgentTeamsProfiles` must enforce at most 16 profiles, non-empty invocation-safe keys, object values, 1–8 members, non-empty member names, and JSON-safe scalar/array/object data; it must merge the protected built-in before calling the injected `flush` function. Add `getAgentTeamsProfiles()` and `setAgentTeamsProfiles()` to `desktop-settings.js` as thin store-backed functions that preserve all unrelated settings.

- [ ] **Step 4: Run the focused test to confirm GREEN and check the diff.**

Run:

```powershell
node --test tests/agent-teams-profile-store.test.js
git diff --check
```

Expected: all focused tests pass and only the store/settings files plus their test are changed.

- [ ] **Step 5: Commit the host store slice.**

```powershell
git add win-desktop/src/agent-teams-profile-store.js win-desktop/src/desktop-settings.js win-desktop/tests/agent-teams-profile-store.test.js
git commit -m "feat: add persistent AgentTeams profile store"
```

---

### Task 2: Add IPC, preload, and startup patch injection

**Files:**
- Modify: `win-desktop/src/settings-window.js`
- Modify: `win-desktop/src/preload.cjs`
- Modify: `win-desktop/src/dsh-service.js`
- Modify: `win-desktop/config/agent-teams.patch.yml`
- Modify: `win-desktop/tests/agent-teams-integration.test.js`
- Modify: `win-desktop/tests/heal-desktop-plugins.test.js`
- Modify: `win-desktop/tests/desktop-settings-plugin.test.js`

**Interfaces:**
- IPC handlers: `agent-teams-profiles:get` and `agent-teams-profiles:set`.
- Preload methods: `window.dshDesktop.getAgentTeamsProfiles()` and `window.dshDesktop.setAgentTeamsProfiles(profiles)`.
- `generateAgentTeamsPatch({ getSettings, getProfiles, ... })` writes `profiles` into the AgentTeams config using a JSON-safe YAML flow value; default `getProfiles` reads the host store.

- [ ] **Step 1: Add RED assertions for the bridge and patch.**

Extend integration tests to parse the generated YAML and assert the `software-delivery` profile, a special-character round trip, and user profile injection. Extend source-contract tests to require the two IPC channels, preload methods, and static patch profile. Add a malformed-profile case that passes an invalid value through the injected profile reader and asserts generation falls back to the built-in map rather than throwing.

```js
test('runtime patch injects the persisted profile without corrupting YAML', () => {
  const patchPath = generateAgentTeamsPatch({
    getSettings: () => ({}),
    getProfiles: () => ({
      profiles: {
        'software-delivery': {
          taskPlanning: 'captain',
          protocol: 'colon: hash# quote" newline\\n',
          members: [{ name: 'analyst', role: '分析' }],
        },
      },
    }),
    getUserDataPath: () => tempDir,
  })
  const agentTeams = yaml.load(readFileSync(patchPath, 'utf8'))
    .flatMap((item) => item.insert ?? [])
    .find((entry) => entry.id === 'agent-teams')
  assert.equal(agentTeams.config.profiles['software-delivery'].protocol, 'colon: hash# quote" newline\\n')
})
```

- [ ] **Step 2: Run the focused wrapper tests to confirm RED.**

Run:

```powershell
node --test tests/agent-teams-integration.test.js tests/heal-desktop-plugins.test.js tests/desktop-settings-plugin.test.js
```

Expected: FAIL on missing profile fields/channels while existing legacy assertions identify any accidental change to `legacyDesktopSettings`.

- [ ] **Step 3: Implement the narrow bridge and patch injection.**

Register IPC handlers once, call `getAgentTeamsProfileSnapshot()`/`setAgentTeamsProfiles()`, broadcast the existing `desktop-settings:changed` event after successful persistence, and expose only the two new methods from preload. In `dsh-service.js`, keep the existing hand-written patch lines and append `profiles: ${JSON.stringify(safeProfiles)}` under AgentTeams config. Use a dedicated `safeAgentTeamsProfiles` helper that accepts only plain JSON objects with invocation-safe keys, valid member arrays and non-empty member names; it must merge `software-delivery` and discard malformed custom entries. Preserve every legacy setting branch and every existing plugin entry/order. Add the same built-in profile to `config/agent-teams.patch.yml` for static callers.

- [ ] **Step 4: Run the wrapper focused tests and syntax check.**

Run:

```powershell
node --test tests/agent-teams-profile-store.test.js tests/agent-teams-integration.test.js tests/heal-desktop-plugins.test.js tests/desktop-settings-plugin.test.js tests/dsh-service-syntax.test.js
```

Expected: all selected tests pass; the YAML parser returns the exact persisted strings; legacy provider/model/reasoning fields remain unchanged.

- [ ] **Step 5: Commit the host integration slice.**

```powershell
git add win-desktop/src/settings-window.js win-desktop/src/preload.cjs win-desktop/src/dsh-service.js win-desktop/config/agent-teams.patch.yml win-desktop/tests/agent-teams-integration.test.js win-desktop/tests/heal-desktop-plugins.test.js win-desktop/tests/desktop-settings-plugin.test.js
git commit -m "feat: inject persisted AgentTeams profiles at startup"
```

---

### Task 3: Build and test the pure browser profile editor model

**Files:**
- Create: `win-desktop/agent-teams-plugin/src/client/profile-editor.ts`
- Create: `win-desktop/agent-teams-plugin/scripts/profile-editor-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/package.json`

**Interfaces:**
- `TeamProfileDraft`, `AgentTeamsProfilesSnapshot`, `createEmptyProfile(name)`, `cloneProfileMap(profiles)`, `normalizeProfileMapForEditor(value, builtInNames)`, `validateProfileMap(profiles)`, `renameProfile(profiles, oldName, newName)`, `removeCustomProfile(profiles, name)`, and `profileSavePayload(profiles)`.
- `validateProfileMap` returns `{ ok: true, value }` with normalized JSON-safe config or `{ ok: false, message }`; it never throws for renderer input.
- `profileSavePayload` returns a deep-cloned plain object suitable for `window.dshDesktop.setAgentTeamsProfiles` and never includes empty optional fields.

- [ ] **Step 1: Add the verification script and package hook before implementation.**

Create `scripts/profile-editor-verify.mjs` importing `../lib/client/profile-editor.js`. Add it to the existing `verify` script after `settings-client-verify.mjs`. Include tests for built-in normalization, custom add/rename/delete, provider/model pair validation, fallback pair validation, member duplicate/reserved-name validation, seed-task unknown dependency/cycle/assignee validation, review-round ordering, omission of empty fields, and clone isolation.

- [ ] **Step 2: Run the new verification to confirm RED.**

Run from `win-desktop/agent-teams-plugin`:

```powershell
pnpm verify
```

Expected: FAIL because `lib/client/profile-editor.js` and its source implementation do not exist.

- [ ] **Step 3: Implement pure editor normalization and validation.**

Use `import type` only for upstream profile types so the browser bundle receives no Node imports. Keep the editor name rule invocation-safe (`^[\\p{L}\\p{N}][\\p{L}\\p{N}._-]{0,63}$`), reject `captain`, cap maps/members/tasks at 16/8/32, trim strings, preserve non-empty unavailable model IDs, require provider/model together for explicit routes, validate fallback pairs, validate task references and a deterministic topological cycle check, and normalize review policy positive integers. Keep `taskPlanning: 'captain'` task data in drafts but omit no fields until save; the runtime resolver remains final authority.

- [ ] **Step 4: Build the plugin and rerun the verification.**

Run:

```powershell
pnpm build
pnpm verify
```

Expected: build succeeds, the profile-editor verification passes, and all existing plugin verification checks remain green.

- [ ] **Step 5: Commit the pure editor slice.**

```powershell
git add win-desktop/agent-teams-plugin/src/client/profile-editor.ts win-desktop/agent-teams-plugin/scripts/profile-editor-verify.mjs win-desktop/agent-teams-plugin/package.json
git commit -m "feat: validate AgentTeams profile editor drafts"
```

---

### Task 4: Implement the integrated settings UI

**Files:**
- Create: `win-desktop/agent-teams-plugin/src/client/desktop-bridge.ts`
- Create: `win-desktop/agent-teams-plugin/src/client/TeamProfilesEditor.tsx`
- Modify: `win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.tsx`
- Modify: `win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.module.css`
- Modify: `win-desktop/agent-teams-plugin/src/client/locales.ts`
- Modify: `win-desktop/agent-teams-plugin/scripts/profile-editor-verify.mjs`

**Interfaces:**
- `desktop-bridge.ts` declares the renderer-only `window.dshDesktop` profile methods and returns `undefined` when the bridge is absent.
- `TeamProfilesEditor` props: `{ t, catalog, writable }`; it owns loading, selected profile, draft, save/cancel/reset, and error/status state, and does not touch the Harness settings writer.
- The existing `AgentTeamsSettingsSection` passes its catalog and write-disabled state into `<TeamProfilesEditor />` between the model/reasoning controls and scope card.

- [ ] **Step 1: Add source-contract RED checks for the UI.**

Extend `profile-editor-verify.mjs` to read the source files and require the existing settings section registration plus `TeamProfilesEditor`, `getAgentTeamsProfiles`, `setAgentTeamsProfiles`, `role="alert"`, `aria-live`, real `<label>`/`htmlFor` pairs, built-in protection, and restart-required copy. The checks must also assert the existing settings section still does not call `settings.set`/`settings.unset` directly.

- [ ] **Step 2: Run the plugin verification to confirm RED.**

Run:

```powershell
pnpm build
pnpm verify
```

Expected: FAIL on the missing editor source/bridge references.

- [ ] **Step 3: Implement the bridge declaration and focused editor component.**

Create the bridge type with the exact snapshot contract. In `TeamProfilesEditor`, load the snapshot once on mount, initialize a deep-cloned draft, and show an unavailable state if the bridge is absent. Render a visually distinct `section` with profile list, built-in badge, Add/Duplicate/Delete/Restore controls, basic textareas, captain/seed radio controls, member rows, fallback controls, seed task rows, and review-policy fields. Use the existing catalog for provider/model/reasoning suggestions while preserving unavailable values. Save only after `validateProfileMap` succeeds; disable controls while saving; on success replace committed state with the returned Host snapshot and announce restart-required; on failure preserve the draft and show `role="alert"`. Cancel restores the last committed snapshot. Do not render secrets or issue network calls.

- [ ] **Step 4: Add localized copy and design-system CSS.**

Add matching Simplified Chinese and English keys for profile title, restart hint, loading/unavailable, list actions, built-in/custom labels, all fields, validation/save/reset/delete errors, and task/member controls. Keep locale key sets and placeholders identical. Extend the existing CSS with the current Harness tokens, compact list/detail layout, keyboard focus states, responsive single-column behavior at 560px, and visible status/error styles. Avoid inline styles, raw colors, excessive rounding, and click-only non-button controls.

- [ ] **Step 5: Build and verify the UI slice.**

Run:

```powershell
pnpm build
pnpm verify
```

Expected: the client bundle compiles, locale parity passes, source checks pass, the profile editor is included under the existing `agent-teams` settings registration, and all staged-plan/activity regressions remain green.

- [ ] **Step 6: Commit the UI slice.**

```powershell
git add win-desktop/agent-teams-plugin/src/client/desktop-bridge.ts win-desktop/agent-teams-plugin/src/client/TeamProfilesEditor.tsx win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.tsx win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.module.css win-desktop/agent-teams-plugin/src/client/locales.ts win-desktop/agent-teams-plugin/scripts/profile-editor-verify.mjs
git commit -m "feat: add AgentTeams profile editor to settings"
```

---

### Task 5: Synchronize version/provenance and add end-to-end compatibility checks

**Files:**
- Modify: `win-desktop/agent-teams-plugin/package.json`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/tests/agent-teams-integration.test.js`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`
- Modify: `win-desktop/agent-teams-plugin/UPSTREAM.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Create or modify: `win-desktop/agent-teams-plugin/release-notes/0.1.14-desktop.2.md`

**Interfaces:**
- Plugin identity becomes `0.1.14-desktop.2`; wrapper release becomes `0.1.1-rc.19`.
- Integration assertions require the new versions and the same installed local-package file dependency.
- Provenance records the profile editor as a local desktop capability layered on upstream v0.1.14, with `REAPPLY` ownership because upstream runtime profiles exist but this desktop editor/persistence bridge does not.

- [ ] **Step 1: Add version/provenance RED assertions.**

Update integration tests to assert the planned versions and profile editor source/bundle contract before changing metadata. Run the relevant tests and record the expected version mismatch failures.

- [ ] **Step 2: Update metadata and documentation.**

Bump the two package versions, the local package entry in `package-lock.json`, README release/version text, plugin `UPSTREAM.md`, root `docs/UPSTREAM_MAINTENANCE.md`, and a concise release note. State that profile edits are local, built-in defaults are protected and upgrade-preserving, changes require restart, and all prior AgentTeams capabilities remain retained. Do not alter upstream baseline identity or claim upstream owns the desktop editor.

- [ ] **Step 3: Run metadata and integration checks.**

Run from `win-desktop`:

```powershell
node --test tests/agent-teams-integration.test.js tests/local-capability-manifest.test.js tests/desktop-settings-plugin.test.js
```

Expected: all version, manifest, package, patch, and UI ownership assertions pass.

- [ ] **Step 4: Commit metadata/provenance.**

```powershell
git add win-desktop/agent-teams-plugin/package.json win-desktop/package.json win-desktop/package-lock.json win-desktop/tests/agent-teams-integration.test.js win-desktop/tests/local-capability-manifest.test.js win-desktop/agent-teams-plugin/UPSTREAM.md docs/UPSTREAM_MAINTENANCE.md README.md win-desktop/README.md win-desktop/agent-teams-plugin/release-notes/0.1.14-desktop.2.md
git commit -m "docs: record AgentTeams profile editor capability"
```

---

### Task 6: Run the complete regression gate and build the Windows release

**Files:**
- Modify only if verification identifies a concrete failure: the smallest owning source/test file.
- Do not stage generated installers, ZIPs, `dist/`, runtime sessions, logs, or screenshots.

**Interfaces:**
- Final command contract is the existing `npm run dist:win`, which first runs `npm run verify:upstream` and then electron-builder with NSIS and ZIP x64 targets.

- [ ] **Step 1: Run the plugin test once after the final source change.**

From `win-desktop/agent-teams-plugin` run:

```powershell
pnpm test
```

Expected: build and every plugin verification script pass, including profile validation and locale parity.

- [ ] **Step 2: Run the mandatory upstream gate.**

From `win-desktop` run:

```powershell
npm run verify:upstream
```

Expected: all six gate stages pass, including synchronization of the locally built plugin lib into the already-installed file dependency and the wrapper Node test suite. If it fails, classify the failure first; do not weaken a regression or install dependencies inside the gate.

- [ ] **Step 3: Run the release build.**

After the gate passes, from `win-desktop` run:

```powershell
npm run dist:win
```

Expected: electron-builder exits 0 and creates one x64 NSIS installer and one x64 ZIP under `win-desktop/dist/` with version `0.1.1-rc.19`.

- [ ] **Step 4: Verify package contents without committing them.**

Run a read-only PowerShell inspection that checks both artifacts exist, lists their sizes, verifies the ZIP contains the configured unpacked app layout, confirms the packaged `package.json` version, and confirms no credential-like filenames are present. Start the generated executable only if the existing release smoke procedure can be run without changing user settings; otherwise report the exact manual acceptance still required.

- [ ] **Step 5: Run final status/diff hygiene.**

Run:

```powershell
git diff --check
git status --short --branch
git diff HEAD~6..HEAD --stat
```

Expected: source/docs/tests/metadata only are tracked; build output remains ignored/untracked; no secrets or runtime state are staged.

- [ ] **Step 6: Complete quality review and handoff.**

Review the full diff for correctness, simplicity, architecture, security, and performance. Confirm every design acceptance criterion, report exact test/build exit codes, link the source and artifacts with absolute paths, and list any manual choice still needed. Do not claim completion until fresh verification output supports it.
