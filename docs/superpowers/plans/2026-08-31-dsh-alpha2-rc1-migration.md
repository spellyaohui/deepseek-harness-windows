# DeepSeek Harness Alpha.2 RC1 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Windows wrapper to the exact official `dsh-v0.1.2-alpha.2` source closure while preserving every registered local capability, especially provider-neutral per-model image/text and reasoning-effort probing, and produce a locally verified `v0.1.2-rc.1` Windows package without publishing it.

**Architecture:** The official Alpha.2 source is prepared in the ignored `upstream/dsh-v0.1.2-alpha.2/` directory and is packed through its independent `vendor` and `dsh` release families. The wrapper consumes only validated local tarballs through stable ignored `file:` paths; local plugins remain separate owners and are adapted through Alpha.2 Remote/slot and Cordis boundaries. AgentTeams experimental packages are not installed directly; their wait/scoped/CAS/event behavior is reapplied to the maintained AgentTeams fork.

**Tech Stack:** Node.js `^22.19.0 || >=24.0.0`, pnpm `11.7.0`, Electron 43, TypeScript, React 18, Cordis, Typert Remote, pi-ai, Electron Builder, PowerShell, Node test runner, GitHub CLI for read-only upstream inspection.

## Global Constraints

- Fixed official source: tag `dsh-v0.1.2-alpha.2`, commit `0a53fb55bea101816fa226bb964ae2bed71c343b`.
- Current baseline: wrapper `0.1.1-rc.32`, HEAD `641881cdfb91871ec674682978138bbf0bd67514`; retain any live user changes if discovered.
- `npm run verify:upstream` remains offline, non-installing, non-packaging, and must pass before provenance or release metadata is accepted.
- Never commit credentials, `.env`, `.agent-teams`, sessions, logs, screenshots, exports, `node_modules`, `dist`, upstream checkouts, tarballs, installers, or runtime state.
- Do not use an Alpha.2/rc.2 dual runtime, compatibility migration layer for historical Teams/conversations, or AUTO restoration.
- Do not move CPA/OpenCode/WOYAOPRO/CommandCode rules into the provider-neutral Models fork.
- Preserve `auto`, `text-only`, and `image` model input choices, exact protocol, context/output capacities, reasoning metadata, and `compat` fields.
- A successful probe may update only the unsaved draft; existing fields are not overwritten unless the user explicitly selects overwrite.
- Authentication, proxy authentication, transient HTTP, timeout, rate-limit, 5xx, and network outcomes remain `inconclusive`.
- A missing or late capability Remote must not blank the Models page or block ordinary editing and saving.
- `explicit` AgentTeams roles must use their configured Provider/model/effort; only `target-default` and `route-aware` may inherit captain/route decisions.
- User override on 2026-08-31: Stop That Shit was uninstalled and must not be integrated; no Guard package, dependency, patch, prompt, or documentation may be added.
- Alpha.2 runtime boundary: `@deepseek-ai/node-addon-landlock-run` belongs to the official `native/` release sequence, not the required `vendor`/`dsh` tarball families. Preserve the existing locked `0.1.1` registry dependency and integrity; do not add a new native tarball or allow arbitrary missing packages.
- No commit, push, tag, GitHub Release, deployment, or asset upload is allowed in this task.

---

## Task 1: Capture baseline and write migration evidence

**Files:**
- Create: `docs/superpowers/plans/2026-08-31-dsh-alpha2-rc1-migration.md`
- Read: `AGENTS.md`, `docs/UPSTREAM_MAINTENANCE.md`
- Test: `win-desktop/scripts/verify-upstream-regressions.mjs`

**Interfaces:**
- Consumes: current checkout, official tag lookup, installed Node/pnpm, and current regression command.
- Produces: a baseline record in the execution log; no source behavior changes.

- [x] **Step 1: Record checkout and toolchain facts**

Run from `D:\Trae\其他\deepseek-harness`:

```powershell
git status --short --branch
git rev-parse HEAD
git log -1 --format='%H%n%cI%n%s'
node --version
npm --version
pnpm --version
Get-Item -LiteralPath 'win-desktop\node_modules' -Force | Select-Object FullName,Attributes,LinkType,Mode
```

Expected: clean `codex/unified-model-capability-compatibility`, HEAD `641881cdfb91871ec674682978138bbf0bd67514`, Node `v26.7.0`, npm `11.19.0`, pnpm `11.19.0`, and a real directory rather than a Junction or symlink.

- [x] **Step 2: Run the pre-migration gate**

Run from `D:\Trae\其他\deepseek-harness\win-desktop`:

```powershell
npm run verify:upstream
```

Expected: exit code 0; Models 37/37, CPA 26/26, Session Markdown 41/41, Wrapper 108/108, and all AgentTeams offline/lifecycle/quality/stress/build-path checks pass. Record generated ignored `lib` and installed local-artifact synchronization as command side effects; do not treat them as source changes.

## Task 2: Prepare and validate the exact Alpha.2 source closure

**Files:**
- Create outside tracked source ownership: `upstream/dsh-v0.1.2-alpha.2/source/`
- Create outside tracked source ownership: `upstream/dsh-v0.1.2-alpha.2/tarballs/vendor/`
- Create outside tracked source ownership: `upstream/dsh-v0.1.2-alpha.2/tarballs/dsh/`
- Create: `win-desktop/scripts/prepare-alpha2-source.mjs`
- Create: `win-desktop/scripts/verify-alpha2-source.mjs`
- Modify: `win-desktop/package.json` only after Task 2 validation succeeds

**Interfaces:**
- `prepare-alpha2-source.mjs`: no arguments; resolves the official tag, checks the peeled commit, downloads/clones into the fixed ignored directory, installs official dependencies only inside that checkout, runs `pnpm build:official`, packs `vendor` then `dsh`, and writes a machine-readable manifest under the ignored directory.
- `verify-alpha2-source.mjs`: reads the manifest and tarballs, checks fixed tag/commit, package identities, versions, SHA-256 values, and packed-install closure; exits nonzero on any mismatch.
- Manifest fields: `tag`, `commit`, `node`, `pnpm`, `sourcePath`, `vendorTarballPath`, `dshTarballPath`, `packages[]`, `sha256`, `createdAt`.

- [x] **Step 1: Assert the official tag before any import**

Run:

```powershell
$expected='0a53fb55bea101816fa226bb964ae2bed71c343b'
$actual=(git ls-remote https://github.com/deepseek-ai/deepseek-harness.git 'refs/tags/dsh-v0.1.2-alpha.2^{}').Split("`t")[0]
if($actual -ne $expected){throw "Alpha.2 peeled commit mismatch: $actual"}
gh api repos/deepseek-ai/deepseek-harness/releases/tags/dsh-v0.1.2-alpha.2 --jq '{tag_name,published_at,target_commitish,assets:[.assets[].name]}'
```

Expected: exact commit and an empty Release asset list; source construction is required.

- [x] **Step 2: Add the isolated source-preparation script**

The script must create only `upstream/dsh-v0.1.2-alpha.2/` after confirming it is absent or already contains the same manifest. It must reject a nonempty directory with a different commit instead of deleting or overwriting it. It must clone with `--no-checkout`, checkout the fixed commit, run official package-manager commands in the source directory, and leave the wrapper checkout untouched.

- [x] **Step 3: Run the official build and pack commands**

Run inside the isolated source directory:

```powershell
pnpm install --frozen-lockfile
pnpm build:official
pnpm tsx scripts/release/pack.ts --family vendor --out dist/release/vendor --concurrency 1
pnpm tsx scripts/release/pack.ts --family dsh --out dist/release/dsh --concurrency 1
```

Expected: official build succeeds; the `vendor` family and `dsh` family each produce the exact tarball set defined by the Alpha.2 `scripts/release/families.ts` implementation. No experimental AgentTeam package is in either family.

- [x] **Step 4: Verify each packed family outside the source checkout**

Run:

```powershell
pnpm tsx scripts/release/verify-packed-install.ts --family vendor --from dist/release/vendor
pnpm tsx scripts/release/verify-packed-install.ts --family dsh --from dist/release/vendor --from dist/release/dsh
```

Expected: the installed package reports `0.1.2-alpha.2`; the throwaway consumer is outside the repository and is removed by the official verifier.

- [x] **Step 5: Record package identity and hashes**

The verifier must enumerate every `.tgz`, extract package name/version from its manifest, calculate SHA-256 with Node `crypto`, and write `alpha2-source-manifest.json` only after packed-install success. Any package version, commit, family membership, or hash mismatch must stop the migration.

## Task 3: Switch the wrapper to the validated Alpha.2 runtime

**Files:**
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/src/dsh-service.js`
- Modify: `win-desktop/scripts/sync-local-plugin-artifacts.mjs`
- Create: `win-desktop/scripts/verify-alpha2-runtime-closure.mjs`
- Modify: `.gitignore` only if the existing `/upstream/` rule does not cover the fixed directory

**Interfaces:**
- `package.json` points only at the validated ignored tarball directory through stable relative `file:` references; it never references the temporary checkout.
- `verify-alpha2-runtime-closure.mjs` accepts `--from dist/win-unpacked` and validates Node resolution from `resources/app/src/dsh-service.js`.
- Runtime closure verification checks at least `@deepseek-ai/dsh-app-boot`, `@deepseek-ai/cordis`, Cordis loader/include runtime packages, `js-yaml`, `argparse`, and every Alpha.2 package imported by `dsh-service.js`.

- [x] **Step 1: Add the fixed tarball resolver**

Resolve `upstream/dsh-v0.1.2-alpha.2/tarballs/vendor` and `upstream/dsh-v0.1.2-alpha.2/tarballs/dsh` from the wrapper root. Reject paths outside the repository `upstream` directory, missing tarballs, and manifests whose versions do not match the recorded Alpha.2 manifest.

- [x] **Step 2: Replace all rc.2 core runtime entries atomically**

Update every official `@deepseek-ai/dsh*` entry required by Alpha.2 together with lockfile metadata. Keep local plugins as `file:` packages. Do not leave a mixture of official rc.2 runtime packages and Alpha.2 runtime packages.

- [x] **Step 3: Rebuild dependency state only through the validated source workflow**

Use the validated tarballs to refresh the wrapper's installed dependency tree. Do not edit `node_modules` by hand and do not use `npm run verify:upstream` as an installer. Confirm the wrapper package can import the Alpha.2 service before continuing.

- [x] **Step 4: Run wrapper syntax and closure checks**

Run:

```powershell
node --check src/dsh-service.js
npm run sync:local-plugin-artifacts
node scripts/verify-alpha2-runtime-closure.mjs --from node_modules
```

Expected: every required module resolves from the wrapper's actual installed tree and no temporary absolute path appears in package metadata.

## Task 4: Reapply the provider-neutral Models capability layer

**Files:**
- Modify: `win-desktop/models-settings-plugin/src/capability-contract.ts`
- Modify: `win-desktop/models-settings-plugin/src/capability-probe-service.ts`
- Modify: `win-desktop/models-settings-plugin/src/remote.ts`
- Modify: `win-desktop/models-settings-plugin/src/client/ModelsSection.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/ProviderEditor.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/ModelListEditor.tsx`
- Preserve tests: `win-desktop/models-settings-plugin/tests/capability-probe.test.js`, `capability-contract.test.js`, `model-input.test.js`, `model-input-ui.test.js`, `capability-ui.test.js`, `models-section-availability.test.js`, `output-link-safety.test.js`

**Interfaces:**
- `CapabilityProbeRequest` carries `modelId`, explicit `protocol`, `baseURL`, credential reference or one-shot draft key, candidate metadata, and `AbortSignal`.
- `CapabilityStatus` remains `supported | unsupported | inconclusive | not-applicable`.
- `ModelCapabilityPatch` may contain only `input`, `reasoningEfforts`, and `compat`.
- `readImageInputChoice()` and `applyImageInputChoice()` retain `auto`, `image`, `text-only` semantics exactly.
- Remote lookup is late-bound with `ctx.get('remote.model-capabilities')` at action time; Remote availability never controls page rendering.

- [x] **Step 1: Add/retain failing Alpha.2 contract tests before implementation**

Add tests for: Alpha.2 Remote mounting after page render; unknown protocol no fallback; text/image probes on all supported protocols; exact `none` rejection with omitted reasoning accepted; partial effort success; malformed input blocking save; preservation of protocol/capacity/cost/compat fields; draft-key precedence without credential persistence.

- [x] **Step 2: Adapt the Remote contribution to Alpha.2 slots**

Mount the provider-neutral capability contribution through the official Models provider-card/footer slot contract. The Models package must not import CPA, OpenCode, WOYAOPRO, CommandCode, or model-name heuristics.

- [x] **Step 3: Reapply image/text normalization**

Persist `auto` by deleting model-level `input`; persist `text-only` as `['text']`; persist `image` as `['text','image']`; reject any malformed list without filtering or silent downgrade. Unedited model fields must be copied verbatim into the next draft.

- [x] **Step 4: Reapply sequential capability probing**

Probe selected rows sequentially against their current explicit protocol and draft endpoint. Use a fixed 1x1 image request. Keep completed draft results on cancellation. Apply successful/explicitly unsupported results only to unset fields unless overwrite is enabled.

- [x] **Step 5: Reapply per-model reasoning probing**

Use catalog `reasoningEfforts` wire values when present. Otherwise probe `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, omitted reasoning, and `none`. Store exact successful wire values; store `off: null` when `none` is rejected but omission succeeds; set `false` only when all candidate efforts and omission are explicitly unsupported. Never infer unsupported from transient failures.

- [x] **Step 6: Run the Models gate**

Run from `win-desktop/models-settings-plugin`:

```powershell
pnpm typecheck
pnpm test
```

Expected: all existing and new capability tests pass; the Models page remains renderable without a capability Remote.

## Task 5: Reapply CPA, OpenCode, and third-party route compatibility

**Files:**
- Modify: `win-desktop/cpa-provider-plugin/src/*` only where Alpha.2 contracts require it
- Modify: `win-desktop/opencode-capabilities-plugin/src/*` only where Alpha.2 contracts require it
- Modify: `win-desktop/src/model-fetcher.js`
- Modify: `win-desktop/src/win-hide-console-rewrite.js`
- Modify: `win-desktop/src/win-hide-console-loader.mjs`
- Preserve tests: CPA suite, `model-fetcher.test.js`, `opencode-capabilities-integration.test.js`, `opencode-stream-rewrite.test.js`, and capability probe integration tests

**Interfaces:**
- CPA remains the only native `CPA / CLIProxyAPI` Models row and owns address/credential/discovery/reasoning normalization.
- OpenCode catalog preparation owns documented protocol/image corrections, Kimi tool compatibility, stream recovery, and `x-opencode-session` injection.
- Provider-neutral capability probe owns actual per-model testing; provider adapters only supply protocol/address/credential/catalog facts.

- [x] **Step 1: Add failing route-integration tests**

Cover CPA, OpenCode, CommandCode, WOYAOPRO, and an arbitrary custom OpenAI-compatible route using the same capability contract. Include a model that rejects `none`, a model with no reasoning support, a model with image support absent from `/models`, and a model whose catalog exposes exact reasoning wire values.

- [x] **Step 2: Adapt CPA discovery without duplicate UI**

Preserve profile normalization, capacities, credentials, model selection, `input`, reasoning, and compat fields. Discovery metadata populates the draft and never writes provider settings before Save.

- [x] **Step 3: Adapt OpenCode and third-party routes**

Keep documented static/persisted/live catalog reconciliation, unknown-model text-only fallback, no 500 protocol retry, Kimi K3 strict-field removal/schema normalization/deferred-tool/reasoning-content behavior, and session affinity only for `opencode-go`.

- [x] **Step 4: Run route gates**

Run each changed plugin's `pnpm test`, then run the focused wrapper tests. Do not proceed to AgentTeams until the unified model directory and capability contract are green.

## Task 6: Migrate AgentTeams behavior without installing experimental packages

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/tools.ts`
- Modify: `win-desktop/agent-teams-plugin/src/members.ts`
- Modify: `win-desktop/agent-teams-plugin/src/scheduler.ts`
- Modify: `win-desktop/agent-teams-plugin/src/status-render.ts`
- Modify: `win-desktop/agent-teams-plugin/src/selection-policy.ts`
- Modify: `win-desktop/agent-teams-plugin/src/profiles.ts`
- Modify: `win-desktop/agent-teams-plugin/src/client/*`
- Preserve tests: all AgentTeams `scripts/*.mjs`, lifecycle, quality, stress, build-path, wrapper integration, and profile-store tests

**Interfaces:**
- Add `agent_teams_wait({ timeout_ms? })`, backed by an activity waiter that observes only post-call member/team changes and never wakes or acknowledges.
- Keep compact `agent_teams_status`, explicit `detail='full'`, explicit `acknowledge=true`, and captain-only `wake='recover'`.
- Keep role policy fields `provider`, `model`, `reasoning_mode`, and explicit-only `reasoning_effort`.
- Keep task `revision`/expected-revision compare-and-set, quality fields, dependency gates, attempt IDs, reassignment, halt/resume, and V2 strict rejection.

- [x] **Step 1: Add failing wait/scoping/CAS tests**

Cover no-active-peer immediate `noProgress`, timeout without side effects, changes after waiter registration, no member wake, no mailbox acknowledgement, Team-only tool visibility, stale task revision rejection, and role-specific model selection from the shared verified catalog.

- [x] **Step 2: Implement wait on the current activity service**

Use a bounded timeout from 10 seconds through 1 hour, default 30 seconds. Register the waiter synchronously with the active-peer check so a single status edge cannot be lost. Re-list only after wake/timeout.

- [x] **Step 3: Keep the local role model contract authoritative**

Do not restore a global member-model override. `explicit` sends configured provider/model/effort; a model with no supported reasoning effort remains selectable and simply receives no effort. `target-default` and `route-aware` resolve at runtime without materializing explicit editor state.

- [x] **Step 4: Keep quality and lifecycle gates intact**

No optimization may remove requirements pass, implementation acceptance evidence, test/review/repair, inScope/deliverables, coverage, delivery blockers, attempts, recovery, or deployment confirmation. Preserve all previous error regressions.

- [x] **Step 5: Run AgentTeams gates**

Run from `win-desktop/agent-teams-plugin`:

```powershell
pnpm test
```

Expected: all settings, lifecycle, quality, stress, and build-path checks pass, including the new wait/scoped/CAS tests.

## Task 7: Stop That Shit integration is excluded by user override

This task is intentionally not executed. The user explicitly requested uninstalling `stop-that-shit` because it has bugs and confirmed it must not be integrated. The wrapper retains only the existing AgentTeams quality gates and compact tool-call guidance; no replacement Guard is introduced.

## Task 8: Adapt remaining local plugins and wrapper startup

**Files:**
- Modify: `win-desktop/desktop-settings-plugin/src/*` only for Alpha.2 settings-shell API changes
- Modify: `win-desktop/session-markdown-export-plugin/src/*` only for Alpha.2 session/Remote changes
- Modify: `win-desktop/tool-call-guidance-plugin/src/*` only for Alpha.2 prompt API changes
- Modify: `win-desktop/src/preload.cjs`
- Modify: `win-desktop/src/settings-window.js`
- Modify: `win-desktop/src/dsh-service.js`
- Preserve existing desktop/session/guidance tests

**Interfaces:**
- Desktop Settings owns immediate-save `桌面` behavior with no Save button.
- Session Markdown owns continuation ordering, lineage, sanitization, and header action.
- Tool-call guidance owns only its compact order-110 prompt section at or below 500 characters.
- Startup keeps Windows console hiding, plugin healing, OpenCode preparation, and late-bound Remote behavior.

- [x] **Step 1: Add failing Alpha.2 integration assertions**

Assert all local plugins mount through official patch/`file:`/Cordis mechanisms, plugin-specific sections appear once, AUTO is absent, and the capability Remote remains optional at initial render.

- [x] **Step 2: Adapt startup and UI seams**

Update only the changed Alpha.2 service names/signatures. Preserve restart-required model capability loading, immediate desktop save rollback, session export behavior, console hiding, and no real user configuration mutation.

- [x] **Step 3: Run focused local plugin gates**

Run each affected `pnpm test` and the wrapper tests covering plugin mounting, healing, session export, desktop settings, tool-call guidance, grep normalization, OpenCode rewrites, and absence of AUTO.

## Task 9: Synchronize versions, provenance, README, and release notes after proof

**Files:**
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: every changed local plugin `package.json`
- Modify: every changed local plugin `UPSTREAM.md`/`README*.md`
- Modify: `README.md`, `win-desktop/README.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Create: `docs/UPSTREAM_ALPHA2_SOURCE_MANIFEST.md`
- Create: `win-desktop/release-notes/v0.1.2-rc.1.md`

**Interfaces:**
- Wrapper version is `0.1.2-rc.1`.
- Provenance records Alpha.2 tag/commit, build toolchain, package families, tarball hashes, owner classifications, and actual passing evidence.
- Each owner is classified as `UPSTREAM_EQUIVALENT`, `REAPPLY`, or `SUPERSEDED_BY_DESIGN`; no row is advanced before source and regressions prove it.

- [x] **Step 1: Update owner classifications from actual comparison**

Record Harness core as `UPSTREAM_EQUIVALENT`; Models capability layer as `SUPERSEDED_BY_DESIGN + REAPPLY`; CPA, OpenCode, Desktop Settings, Session Markdown, Windows rewrites, tool-call guidance, and Guard as `REAPPLY`; AgentTeams official execution pieces as `UPSTREAM_EQUIVALENT` only where the maintained fork proves equivalent behavior and local role/quality seams as `REAPPLY`.

- [x] **Step 2: Synchronize all version assertions and local package metadata**

Update wrapper dependencies, local package versions, lockfile entries, integration assertions, and generated-artifact identity checks together. Do not claim Alpha.2 in documentation while any required gate is failing.

- [x] **Step 3: Document the compatibility contract**

Explicitly document per-model `auto/text-only/image`, sequential image probing, exact reasoning wire-value probing, inconclusive failure policy, protocol selection, capacities, compat preservation, draft-only writes, late Remote behavior, and AgentTeams shared-catalog consumption.

## Task 10: Run the final regression and Windows packaging closure

**Files:**
- Modify only generated ignored output under `win-desktop/dist/`
- Read: `win-desktop/dist/win-unpacked/resources/app/src/dsh-service.js`
- Read: final Git status and ignored-file report

**Interfaces:**
- `npm run verify:upstream` is the final offline gate.
- `npm run dist:win` produces `win-unpacked`, NSIS EXE, ZIP, and blockmap for `0.1.2-rc.1`.
- `verify-alpha2-runtime-closure.mjs` proves real Node `createRequire` resolution from the unpacked application and package manifests inside the ZIP.

- [x] **Step 1: Run the final offline gate**

Run from `D:\Trae\其他\deepseek-harness\win-desktop`:

```powershell
npm run verify:upstream
```

Expected: exit code 0 with all local and wrapper regressions green. If it fails, diagnose and rerun only the affected gate after the fix.

- [x] **Step 2: Build from the real checkout**

Confirm `win-desktop/node_modules` is a real directory, close any running installed copy, and run:

```powershell
npm run dist:win
```

Expected: exit code 0 and actual output under `win-desktop/dist/` for `win-unpacked`, NSIS EXE, ZIP, and blockmap.

- [x] **Step 3: Verify unpacked dependency closure**

Run:

```powershell
node scripts/verify-alpha2-runtime-closure.mjs --from dist/win-unpacked
```

Expected: `createRequire` resolves every required runtime package from `resources/app/src/dsh-service.js`; filesystem presence alone is insufficient.

- [x] **Step 4: Verify ZIP payload and hashes**

Inspect the ZIP archive for the same package manifests and calculate:

```powershell
Get-FileHash 'dist\DeepSeek-Harness-0.1.2-rc.1-windows-x64.exe' -Algorithm SHA256
Get-FileHash 'dist\DeepSeek-Harness-0.1.2-rc.1-windows-x64.zip' -Algorithm SHA256
Get-FileHash 'dist\DeepSeek-Harness-0.1.2-rc.1-windows-x64.exe.blockmap' -Algorithm SHA256
```

Record absolute paths, byte sizes, and hashes in the final report. Code-signing status is reported separately and never inferred from packaging success.

- [x] **Step 5: Verify repository cleanliness**

Run:

```powershell
git status --short --branch
git ls-files --others --exclude-standard
git status --short --ignored | Select-String 'upstream|node_modules|dist|tar|exe|zip|blockmap|log|session|credential|agent-teams'
```

Expected: no forbidden generated artifact is tracked or unignored; the only allowed untracked source changes are implementation/tests/docs required by this task. Do not delete unknown files to make this check pass.

## Completion Conditions

The task is complete only when the exact Alpha.2 tag/commit, official build, vendor/dsh pack, packed-install checks, all owner regressions, final `npm run verify:upstream`, final `npm run dist:win`, unpacked `createRequire` closure, ZIP dependency manifests, and EXE/ZIP/blockmap existence all pass. The final report must include branch, HEAD, dirty/untracked state, package paths/sizes/SHA-256, owner classifications, and a manual installation acceptance checklist. The task stops before commit, push, tag, GitHub Release, or upload.

## Assumptions and Defaults

- Node `v26.7.0` satisfies the official Alpha.2 engine range and pnpm `11.19.0` can execute the pinned `pnpm@11.7.0` workspace after the official checkout's package-manager resolution is verified; if the official package-manager check rejects this, stop and report the exact toolchain choice required.
- The existing real `win-desktop/node_modules` is the packaging source; no Junction/symlink-based worktree will be used.
- Existing user Provider/model/Profile settings remain untouched; only code, tests, documentation, dependency metadata, ignored source preparation, and build output are in scope.
- If Alpha.2 changes an interface with no safe local adaptation, preserve the current rc.32 branch and report the concrete blocker instead of weakening a regression or introducing an undocumented compatibility layer.
