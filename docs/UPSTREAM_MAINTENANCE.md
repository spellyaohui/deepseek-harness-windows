# Upstream maintenance and local capability registry

This document is the canonical map of behavior that must survive every
DeepSeek Harness or AgentTeams upstream refresh. Root `AGENTS.md` defines the
binding rules; this registry records who owns each capability and which tests
prove it still exists.

## Current local identities

- Official Harness source closure: `dsh-v0.2.0-rc.2` at `639ed015397290b3745d163aafe02ffee4aa3f84`
- Windows desktop wrapper: `0.2.0-rc.2`
- Desktop Electron runtime: exactly `44.0.0`, matching the official host's desktop lockfile
- Tool-call guidance plugin: `0.1.0`
- OpenCode capability validation plugin: `0.1.2`
- AgentTeams fork: `0.1.22-desktop.1`, based on upstream `v0.1.22` at fixed commit
  `9cba4fe4171f27c019991cafd2a107f87ef3517b`
- CPA provider plugin: `0.1.10`
- Models settings fork: `0.2.0-rc.2-desktop.1`
- Desktop Settings plugin: `0.1.2`

## Harness 0.2.0-rc.2 / AgentTeams 0.1.22 refresh classification — 2026-09-30

This is the active classification. The 0.1.7 and earlier sections below are
historical evidence. AgentTeams stable `v0.1.22` recommends Harness
`0.2.0-rc.2`; its previous seven supported hosts remain peer-compatible, but
this wrapper installs only the recommended cohort. The fixed official source
closure contains 9 vendor and 318 DSH tarballs with exact SHA-256 identities
in `UPSTREAM_020_SOURCE_MANIFEST.md`. A fresh real `node_modules` resolves 891
production packages with no old DSH cohort mixed in.

| Registered capability/owner | Classification | Migration and retained proof |
| --- | --- | --- |
| Official Harness runtime and new client behavior | `UPSTREAM_EQUIVALENT` | Use the entire fixed 0.2.0 graph, including plan review, model-selector search, file-sidebar actions, terminal fixes, plugin guidance, updated model catalog and opt-in async questions. Do not reimplement these in the wrapper. Exact host-cohort, manifest-hash, closure and isolated authenticated Electron startup checks pass. |
| AgentTeams lifecycle, mailbox, workspace, report evidence and official release contract | `UPSTREAM_EQUIVALENT` | The v0.1.22 runtime `src/` has no delta from v0.1.21; retain its scheduler, child recovery, workspace UI, report/evidence checks and eight-host compatibility/doctor behavior. The full plugin suite passes. Upstream prebuilt Git entrypoints remain upstream distribution-owned; the bundled local fork still builds from source. |
| AgentTeams role policy, strict V2, quality, Profiles, Team/Native, Web auth/CAS and compact status/prompt | `REAPPLY` | None is replaced by the v0.1.22 source. Retain the single local policy/tool layer and all selection, HMR, quality, routing and Web regressions. A saved unavailable model ID remains explicit and unresolved rather than silently rerouted. |
| Durable child-operation gateway | `REAPPLY` | Retain exact live-Agent admission and per-child serialization for start, queue/steer, interrupt, retirement and drain. Existing gateway and member-failure regressions pass; no direct bypass is added. |
| Provider-neutral Models editor and capability probing | `UPSTREAM_EQUIVALENT + REAPPLY` | Consume the complete official 0.2.0 Models source and reapply only image-input choice, strict malformed-input save behavior, draft-only capability/reasoning probes, late Remote fallback, and output detachment. Models 50/50 pass; no provider-specific rule enters the fork. |
| CPA provider | `REAPPLY` | Pin the new host/Models cohort while retaining one native editor row, credentials, capacities, reasoning and path-scoped migration. CPA 27/27 and wrapper integration pass. |
| Official Native Subagent versus Team settings | `SUPERSEDED_BY_DESIGN` | Keep both user-approved surfaces and their separate authority; the old native-card hiding rewrite stays removed. Initial/HMR client snapshot and both client-module regressions pass. |
| Wrapper boot, profile resolution and authenticated Web | `UPSTREAM_EQUIVALENT + REAPPLY` | Use the official Host graph and in-memory plugin resolution; retain the desktop installation anchor, full-token loopback handoff and bounded Cookie recovery. Real native-loader and isolated authenticated Electron startup pass. |
| Hidden Windows console, shell validation, grep alias, bounded-period QUOTA and OpenCode transport | `UPSTREAM_EQUIVALENT + REAPPLY` | Keep upstream hidden subprocess/STARTUPINFO behavior; reapply only runner preload, current validator normalization, exact grep repair, quota classification, Kimi schema/stream and OpenCode session affinity. The 0.2.0 pi-ai transcript/client anchors were updated without changing upstream modules; actual installed-module regressions pass. |
| Desktop Settings and compact tool guidance | `REAPPLY` | Keep autosave/rollback and the independent bounded prompt section; wrapper integration passes. |
| Windows `dsh` command ownership | `UPSTREAM_EQUIVALENT + REAPPLY` | Reuse the official PowerShell HKCU PATH ownership/CAS worker and adapt the installed wrapper launcher plus explicit Electron tray confirmation. A local read-only machine-PATH classification guard rejects an install that cannot take precedence over an existing system command. Tests cover cancellation, stale fingerprint, occupied command, machine precedence, missing launcher, owned removal and quoted arguments. No actual PATH write or installed-EXE execution was performed. |
| Retired local Session Markdown and AUTO plugins | Remain removed | Do not restore them or alter stale user data. |

The full offline, install-free `win-desktop/npm run verify:upstream` gate passes:
Models 50/50, CPA 27/27, complete AgentTeams suites, wrapper 149/149 and the
real dependency closure. The isolated Electron instance displayed the new
first-run Web UI without loading existing user configuration. The two settings
clients were verified in source/bundle integration, not manually rendered in
that first-run window. Live provider calls, overnight endurance, installed
launcher execution and user acceptance remain untested. A later user-authorized
local build produced unsigned EXE, ZIP and blockmap assets and passed both packed
dependency closures. Actual installation now matches all 25,783 unpacked files
by size and SHA-256, with the installed dependency closure passing. An interrupted
installation succeeded with the same EXE after the user paused Kaspersky; the
specific interception rule is unconfirmed. The user has authorized a source-only
commit/push checkpoint, not a tag, GitHub Release or asset upload. Generated
AgentTeams, Models and CPA `lib` output remains on disk but is no longer tracked;
the offline gate rebuilds and synchronizes it before packaging. The npm 11 install
reports an unreviewed script for the official `dsh-subprocess-local` `file:`
tarball on Windows; its install script only chmods the POSIX node-pty spawn
helper, which is absent on this platform. The official package is unmodified.

## Harness 0.1.7-rc.2 / AgentTeams 0.1.21 refresh classification — 2026-09-28

This is a historical classification. All dated 0.1.5/0.1.2 entries below are
historical evidence, not current runtime identities. AgentTeams stable
`v0.1.21` recommends Harness `0.1.7-rc.2`; `0.1.22-rc.1` is a separate npm
`next` prerelease and is not used here. The official closure contains 9 vendor
and 314 DSH tarballs, packed from the fixed source using pnpm 11.7.0 and
verified with the official packed-install checks before import. Artifact
identities and SHA-256 are recorded in `UPSTREAM_017_SOURCE_MANIFEST.md`.

| Registered capability/owner | Classification | Migration and retained proof |
| --- | --- | --- |
| Harness runtime and new product features | `UPSTREAM_EQUIVALENT` | Use the official 0.1.7 graph, plugin manager, Agent preset registry, shortcuts, custom API/account onboarding, file/Office preview and Session format v4. Obsolete host packages are replaced by their official PTC/settings/preset successors; official tarballs are not edited. Actual installed dependency closure and isolated Electron startup/client-bundle checks pass. |
| AgentTeams lifecycle, delivery, recovery, workspace/sidebar and report evidence | `UPSTREAM_EQUIVALENT` | Adopt v0.1.21 workspace/tab integration, addressed member navigation, owner-scoped historical cards and bounded open events; retain upstream stale/foreign report rejection, evidence deduplication, fresh-attempt evidence reset, terminal evidence supplementation and pre-start member setup. The lifecycle, quality, `issue-159`, workspace-activity and host-contract checks remain active. |
| AgentTeams complete member tool surface and policy lifecycle | `UPSTREAM_EQUIVALENT` | Adopt the upstream captain-only tool set and existing/new/legacy Agent attachment within the existing policy owner, without a second capabilities/prompt listener. Members expose only claim/update/send/status. Use `onAgentReady` plus existing-Agent hydration, exact-once attachment and Agent/root disposal; retain the real ToolRuntime assembly and `routing-policy-lifecycle-verify.mjs` regressions. |
| AgentTeams role policy, strict V2, numbered inheritance, compact status/prompt, task-input normalization, Profile editor, Team/Native and authenticated Web/CAS | `REAPPLY` | Preserve the existing independent owner and all registered regressions. Register the complete tools before existing-member hydration; pair root/child cleanup for frozen route/effort, admission, fallback and failure hooks. `hmr-member-runtime-verify.mjs` exercises the real plugin entry, remount and malformed-role rejection. No global member model override, legacy Team/Profile migration, second tool set or new scheduler is introduced. The local section is labelled `AgentTeams 团队` / `AgentTeams`. |
| Durable child-operation gateway | `REAPPLY` | Admit the new upstream pre-start setup and continuation primitives through the same exact-live-Agent identity boundary and per-child lock for start, queue/steer, interrupt, retirement and drain. Upstream mailbox/task semantics remain authoritative; no direct `ctx.subagents.*` bypass is added. |
| CPA | `REAPPLY` | Update only host/Models peers and locked development artifacts to the new cohort; retain the single native row, independent credential/address/reasoning/capacity ownership, path-scoped legacy-provider migration and malformed-input pass-through. CPA 27/27 and wrapper integration pass. |
| Models settings | `UPSTREAM_EQUIVALENT + REAPPLY` | Rebase on official custom API onboarding, account-first order, shared ModelRow, per-model catalog input fallback and model-candidate search. Keep only provider-neutral normalization, auto/image/text-only, invalid save rejection, sequential cancellable draft-only probe, overwrite/effort/compat contracts, stored-credential Host seam, late Remote availability and output detachment. Models 50/50 pass. |
| Native Subagent settings visibility | `SUPERSEDED_BY_DESIGN` | User explicitly chose separate Native and Team responsibilities. Delete the old settings-card hiding transformer; official initial/HMR client snapshots remain byte-identical. Native depth/concurrency/allowed-model controls remain on the official Plugins page; Team role routes remain in the local settings section. Preserve and migrate `subagent-settings-card-visibility.test.js`; both entries render in an isolated actual Electron window. |
| Local plugin startup resolution | `SUPERSEDED_BY_DESIGN + REAPPLY` | Replace obsolete physical profile fallback healing with official in-memory `createRuntimeResolution` / PluginPackages. The scoped desktop preload changes only the official profile-launcher's installation anchor to the wrapper package; profile paths and user data are not rewritten. Retain `heal-desktop-plugins.test.js`, including the real Electron native loader/anchor check. |
| Hidden console and shell/filesystem escalation | `UPSTREAM_EQUIVALENT + REAPPLY` | Use official Windows Node-subprocess hiding and hidden CreateProcess STARTUPINFO; remove duplicate Win32 flag rewriting. Reapply preload inheritance for production and tsx development ACL runners and the existing argument normalization before actual current Pwsh/Bash/fs validators. Real runtime validation/approval and runner-hook regressions pass. |
| Authentication handoff/Cookie recovery, exact grep alias, bounded-period QUOTA and OpenCode compatibility/validation | `REAPPLY` | Retain each narrow wrapper-owned boundary, including Kimi first-request Schema lowering, stream recovery, exact session affinity and provider-neutral manual catalog validation. No provider-specific code is moved into Models. Existing installed-module and IPC regressions pass. |
| Desktop Settings and compact tool-call guidance | `REAPPLY` | Keep immediate autosave/rollback, window bridge and the independent ≤500-character guidance section with no additional tools. Their wrapper regressions pass. |
| Retired local Session Markdown and AUTO plugins | Remain removed | Do not restore the retired local plugins or migrate/clear their stale user data. Official host optional/experimental packages are not default-mounted as replacements. |

The supported host peers enumerate `0.1.7-rc.2 || 0.1.5-rc.3 ||
0.1.5-rc.2 || 0.1.5-rc.1 || 0.1.2-rc.1 || 0.1.2-alpha.5 ||
0.1.2-alpha.2`; runtime and development pins use only 0.1.7. A fresh real
`win-desktop/node_modules` install was prepared outside the offline gate,
without `--force` or `--legacy-peer-deps`. Electron 43.4.1 was rejected by the
new official native loader; the supported official 44.0.0 cohort passes the
new real-runtime regression instead of bypassing the fingerprint check.

Acceptance: full offline `npm run verify:upstream` passes (Models 50/50,
CPA 27/27, AgentTeams complete suites, wrapper 134/134); production closure
contains 625 resolved packages and zero old RC.1 packages. An isolated
Electron host serves the 68-entry/3-batch client graph and both Native and Team
settings without client errors. No live provider/model request or overnight
endurance test is claimed. No commit, push, tag, installer or Release is part
of this source refresh.

## Harness 0.1.5-rc.1 / AgentTeams 0.1.19 refresh classification — 2026-09-17

This is a historical AgentTeams classification. Earlier AgentTeams rows remain
historical release evidence.

- `UPSTREAM_EQUIVALENT`: v0.1.19 supplies member-start recovery after an
  explicit host tool-filter rejection, repair-scope inference, and captain-only
  task amendment. Keep the imported-path regressions for all three behaviors.
- `REAPPLY`: retain the unified durable child-operation gateway and all local
  strict V2, role routing, Team/Native, quality, Profile, authenticated Web/CAS,
  desktop-inject, and routing-policy behavior.
- `REAPPLY`: preserve the official `dsh-v0.1.5-rc.1` closure, its fixed tarball
  identities, and all host peer ranges; this refresh changes no Harness package.

## Windows wrapper rc.4 loopback authentication hardening — 2026-09-15

- `REAPPLY`: the official 0.1.5 client stores one 30-day `dsh-auth-*` Cookie
  per random loopback authority, while browser Cookie scoping does not isolate
  ports. The wrapper clears only stale `127.0.0.1` DSH authentication Cookies
  before loading the canonical token URL so the aggregated plugin request
  cannot grow past Node's request-header limit across restarts.
- `REAPPLY`: a current-origin `/plugins/` HTTP 431 triggers the same cleanup
  and canonical token-URL reload once. Other origins, routes, statuses,
  Cookies, storage, settings, and session data are untouched; the one-shot
  guard prevents a recovery loop.
- The Harness source closure remains `dsh-v0.1.5-rc.1`, and AgentTeams remains
  `0.1.18-desktop.1`. This wrapper hardening does not alter either upstream
  package or their registered capability ownership.

## Harness 0.1.5-rc.1 / AgentTeams 0.1.18 refresh classification — 2026-09-13

This is a historical classification. The 2026-09-11 AgentTeams 0.1.17 and
earlier entries below remain historical release evidence.

- `REAPPLY`: the desktop.1 model-call boundary reuses the existing optional
  string normalizer so blank captain `claim_task.assignee` is equivalent to an
  omitted property, while non-empty names are trimmed. `assignee="captain"`,
  unknown members, and unauthorized claims remain strict no-write failures.
- `REAPPLY`: the captain prompt distinguishes create/reassign ownership from
  claim syntax within the existing 3,500-character budget. No second tool set
  or prompt plugin is introduced; Team mode still cannot bypass AgentTeams,
  and every continuable child operation still crosses the durable gateway.

- `UPSTREAM_EQUIVALENT`: AgentTeams 0.1.18 supplies atomic roster/DAG
  planning, lazy member start, next-step message delivery, obsolete-message
  deduplication, descendant and queued-input cleanup, retired cold-restore
  rejection, missing-attempt recovery, and the `memberMaxDepth: 0` default.
  The retained regressions must exercise those behaviors against the imported
  upstream implementation.
- `REAPPLY`: retain Windows role-level Provider/model/reasoning routing,
  strict V2 Profile and Team persistence, quality extensions, Profiles,
  Team/Native delegation, authenticated Web `planRevision`/CAS boundaries,
  and the durable-session child-operation admission gateway. Upstream 0.1.18
  does not provide these Windows-specific persistence, route-authority,
  authenticated Web, or single-gateway guarantees.
- `REAPPLY`: preserve the existing 0.1.5-rc.1 host closure and all fixed
  Harness identity/tarball references. This AgentTeams-only update must not
  alter the Harness version, peer ranges, or tarball paths.
- `SUPERSEDED_BY_DESIGN + REAPPLY`: Harness 0.1.5 registers official
  `subagent` as scope-local, so its schema cannot be hidden through the
  global-only `tools.restrict()` API. Preserve Team/Native authority by
  restricting only globally registered native delegation tools and reapplying
  the Team-scoped execution guard for every native delegation name, including
  scope-local `subagent`; Native routing remains executable. Default-depth
  member startup must likewise omit `subagent` from its child `toolFilter` and
  rely on the existing durable depth guard. Retain the real ToolRuntime and
  child-start regressions that prove admission, rejection, startup, and
  disposer restoration.
- `REAPPLY`: retain strict quality evidence and captain task-ownership
  recovery. implementation/repair completion must keep one passed
  `commandsRun` record per declared `verify` command. `claim_task` must reject
  `assignee="captain"` with actionable guidance: omit `assignee` for an
  existing captain-owned task, or use `reassign_task(assignee="captain")` to
  take over member-owned work. Retain the quality-gate and lifecycle
  regressions; neither error is grounds to weaken validation.

## Harness 0.1.5-rc.1 / AgentTeams 0.1.17 refresh classification — 2026-09-11

This is a historical classification; dated 0.1.2 / 0.1.16 rows below remain
historical evidence only.

- `UPSTREAM_EQUIVALENT`: use the complete fixed Harness 0.1.5 release family,
  including Session format v3, file/resource/sidebar/Web/proxy additions, its
  current client settings architecture, and the Node subprocess `windowsHide`
  implementation. `REAPPLY`: the Windows Job runner starts a separate Node
  process before its native `CreateProcessW` call, so the wrapper passes the
  existing preload into that runner; the runner then receives the established
  hidden STARTUPINFO rewrite without changing upstream Job ownership.
- `UPSTREAM_EQUIVALENT`: use AgentTeams 0.1.17's supported-host declaration,
  current conversation/activity behavior, and semantic light/dark theme source
  with Harness 0.1.5. The recommended host is `0.1.5-rc.1`; explicitly
  enumerated 0.1.2 targets remain legacy compatibility lines, never a runtime
  fallback.
- `REAPPLY`: adapt AgentTeams' gateway only at the new `deliverPrompt`
  queue/steer and Session v3 marker boundaries, while retaining one durable
  child-session admission lock for start, delivery, interrupt, retirement, and
  drain. Role-level selection, strict V2 state, quality contracts, Profile
  integration, Team/Native routing, and authenticated Web boundaries remain
  local because upstream does not provide equivalents.
- `REAPPLY`: retain provider-neutral model input/capability behavior, CPA
  normalization, narrow grep argument repair, bounded-period QUOTA
  classification, and verified OpenCode compatibility only where the pinned
  upstream runtime lacks an equivalent. These owners retain all regressions.
- `REAPPLY`: the wrapper declares the exact runtime modules compiled into
  official UI primitives because their published package exposes those imports
  as development dependencies; this is a flat-install closure repair, not a
  fork of upstream UI behavior.

## RC.1 refresh classification — 2026-09-04

The official Harness release `dsh-v0.1.2-rc.1` resolves to
`a66e4702047846cdaa10c66c9d3df3951f5ea70d`. Its fixed local closure contains
9 vendor tarballs and 242 DSH tarballs; the Windows wrapper now consumes only
those 251 validated RC.1 artifacts. AgentTeams uses the RC.1 `sendMessage`,
`agent/created`, and `Session.ownEvents()` contracts while retaining its local
role-policy, V2 persistence, quality-gate, and lifecycle ownership. Models,
Models, CPA, and wrapper integrations were rebuilt against RC.1 and
passed `npm run verify:upstream` before this provenance update.

## AgentTeams v0.1.16-rc.1 refresh classification — 2026-09-07

Imported upstream `@nanmicoder/dsh-agent-teams@0.1.16-rc.1` at `d659e5b`. Local
role-policy, strict V2, quality-gate, shared catalog, compact prompt, Team/Native,
durable-session gateway, Profile editor, extra settings injects, and offline RC.1
`file:` tarball host pins remain `REAPPLY`. Host adapter/`harness-compat`, FIFO
continuation, fallback persistence, notification-driven coordination, bounded JSON
Web bodies, parked member recovery, activity-panel UI, and the RC.1 release
contract (compatibility policy, doctor, `publishConfig.tag=next`, bounded peers)
are `UPSTREAM_EQUIVALENT`.

## AgentTeams v0.1.16-rc.3 refresh classification — 2026-09-10

The recommended Harness host matrix is unchanged: `0.1.2-rc.1` remains the
baseline, with `0.1.2-alpha.5` and `0.1.2-alpha.2` also supported. This refresh
upgrades only the AgentTeams source to upstream `v0.1.16-rc.3` at
`bf17f93d35ef75964e96333ff644ab2c9c57b3cb`.

- `UPSTREAM_EQUIVALENT`: existing-Team continuation guidance, the fixed
  AgentTeams prompt/tool exposure contract, Web approval wake-up, and settled
  Team lock cleanup.
- `REAPPLY`: Windows role-level Provider/model/reasoning policy, strict V2,
  quality gates, Team/Native routing, RC.1 compatibility adapters, and the
  durable-session subagent gateway remain local owners. The member-scoped
  prompt is integrated through `routing-policy.ts` so the RC.1 lifecycle and
  per-child gateway are not bypassed.
- External upstream benchmark/evidence dumps, skills, screenshots, logs and
  package artifacts are intentionally not imported into this Windows source
  tree.

## AgentTeams owner

The file-level owner tables below retain their 0.1.7-era wording and test
paths as historical registration detail. The 0.2.0 classification above is
authoritative for current versions, source identities and ownership decisions.

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Harness-native `AgentTeams 团队` section, shared Provider/model catalog including CPA and OpenCode, role-level `provider`/`model`/`reasoning_mode` policy, compact lifecycle-first captain prompt, blank optional Profile normalization, strict unknown Profile rejection, Team/Native routing markers, native-tool suppression, member claim compatibility, captain/shared-pool task ownership, clean inactive status probes, quality-preserving read-only status summaries, explicit mailbox acknowledgement, captain-only recovery wake-up, requirements-dependent implementation queueing, staged complete-contract editing, actionable deliverable scope validation, explicit no-change evidence, V2-safe task-input normalization, durable task/member/attempt lifecycle, the durable-session subagent gateway, and the RC.1 release contract | `win-desktop/agent-teams-plugin` | `UPSTREAM_EQUIVALENT + REAPPLY`: v0.1.21 owns atomic roster/task planning, dormant lazy-start members, mailbox de-duplication and receipts, stale-attempt filtering, descendant/queued-input cleanup, retired cold-restore rejection, missing-attempt recovery, delivery guards, explicit depth defaults, host adapter/`harness-compat`, workspace/sidebar activity, addressed member and historical-card navigation, stale report/evidence rejection and deduplication, pre-start setup, member-start recovery, repair-scope inference, captain-only task amendment, and the publish/compatibility/doctor contract; the Windows fork reapplies role-policy, prompt budget, Profile input, catalog, quality extensions, strict V2, compact status, Team/Native, authenticated Web CAS, the durable-session gateway admission seam, extra settings injects, and offline `0.1.7-rc.2` `file:` tarball host pins | `src/index.ts`, `src/web-routes.ts`, `src/harness-compat.ts`, `src/mailbox.ts`, `src/settings.ts`, `src/selection-policy.ts`, `src/routing-policy.ts`, `src/host-model-catalog.ts`, `src/quality-gates.ts`, `src/tools.ts`, `src/status-render.ts`, `src/members.ts`, `src/scheduler.ts`, `src/subagent-gateway.ts`, `src/agent-identity.ts`, `src/client/AgentTeamsSettingsSection.tsx`, `src/client/WorkspaceActivity.tsx`, `src/client/workspace-state.ts`, `src/client/session-navigation.ts`, `src/tool-names.ts`, `compatibility.json`, `scripts/compatibility.mjs`, `scripts/doctor.mjs`, `scripts/release-metadata.mjs`, `UPSTREAM.md` | `pnpm test`; plugin `scripts/verify.mjs`, `scripts/stability-tdd.mjs`, `scripts/subagent-gateway-tdd.mjs`, `scripts/harness-compat-tdd.mjs`, `scripts/workspace-activity.test.mjs`, `scripts/issue-159.test.mjs`, `scripts/lifecycle-verify.mjs`, `scripts/quality-gates-tdd.mjs`, `scripts/web-routes-verify.mjs`, `scripts/compatibility.mjs`, `scripts/compatibility.test.mjs`, `scripts/release-metadata.test.mjs`, and `scripts/doctor.mjs`; wrapper `tests/agent-teams-integration.test.js`, `tests/heal-desktop-plugins.test.js`, `tests/win-hide-console.test.js` |
| Persisted named Profiles, built-in `software-delivery` role cards, strict Profile/Team `schemaVersion: 2`, old-data rejection without migration, profile editor and restart-required startup injection | `win-desktop` host bridge plus `win-desktop/agent-teams-plugin` | `REAPPLY`: upstream owns profile execution semantics; the Windows fork owns local V2 persistence, editor UX, validation boundary, restart-required injection, and the shared Harness catalog boundary | `src/agent-teams-profile-store.js`, `src/desktop-settings.js`, `src/settings-window.js`, `src/preload.cjs`, `src/dsh-service.js`, `config/agent-teams.patch.yml`, `src/client/TeamProfilesEditor.tsx`, `src/client/profile-editor.ts`, `src/client/desktop-bridge.ts` | `tests/agent-teams-profile-store.test.js`, `tests/agent-teams-integration.test.js`, `tests/desktop-settings-plugin.test.js`; plugin `scripts/profile-editor-verify.mjs` and `scripts/settings-client-verify.mjs` |

## CPA owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| CLIProxyAPI address and Token flow, `/v1/models` discovery, `openai-responses` profile, text/image input modalities, current-profile `auto` preservation, invalid-input pass-through to the shared save gate, revision-guarded migration limited to legacy CPA defaults, seven-level R vocabulary, GPT-5.6 effort filtering, per-model raw context/output capacities, redacted persistence, exactly one native Models provider row, and Windows-safe generated-output detachment before compilation | `win-desktop/cpa-provider-plugin` | Independent local Provider plugin; native editor is rendered by the Models fork through a provider-profile normalization seam. The seam sets the Provider default but must not reinterpret current missing/empty model input or hide malformed input. | `src/index.ts`, `src/migration.ts`, `src/address.ts`, `src/profile.ts`, `src/reasoning.ts`, `src/client/index.tsx`, `src/client/capacity.ts`, `src/client/controller.ts`, `scripts/detach-output-links.mjs`, `tests/output-link-safety.test.js` | `pnpm test`; wrapper `tests/cpa-provider-integration.test.js` and `tests/agent-teams-integration.test.js` |

## Models settings owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Official 0.1.7 custom API onboarding, account-first ordering, shared ModelRow/inputTypes and `settings.models.provider-card`/footer slot integration, provider-neutral profile normalization seam, native expandable provider rows, per-model `auto`/`text+image`/`text-only` input controls, invalid-input save gate, provider-scoped draft bulk actions, field-preserving model normalization, one sequential cancellable capability probe with explicit overwrite, and page-level degradation when that Remote is absent or late | `win-desktop/models-settings-plugin` | `UPSTREAM_EQUIVALENT + REAPPLY`: use the complete 0.1.7 native Models architecture and reapply only provider-neutral image/reasoning capability contracts, profile normalization and the late Remote seam. CPA, OpenCode, WOYAOPRO, CommandCode, and custom route details stay outside this fork. | `src/client/ModelsSection.tsx`, `src/client/models-section-availability.ts`, `src/client/ProviderEditor.tsx`, `src/client/ModelListEditor.tsx`, `src/client/model-input.ts`, `src/client/model-capabilities.ts`, `src/capability-contract.ts`, `src/capability-probe-service.ts`, `src/remote.ts`, `scripts/detach-output-links.mjs`, `tests/upstream-v017-models.test.js`, `tests/model-list-upstream-runtime.test.js`, `tests/alpha2-base.test.js`, `tests/models-section-availability.test.js`, `tests/model-input.test.js`, `tests/model-input-ui.test.js`, `tests/capability-contract.test.js`, `tests/capability-probe.test.js`, `tests/capability-ui.test.js`, `tests/output-link-safety.test.js`, `UPSTREAM.md` | `pnpm typecheck`; `pnpm test`; wrapper `tests/alpha2-client-contract.test.js`, `tests/cpa-provider-integration.test.js`, `tests/model-fetcher.test.js`, `tests/model-capability-probe-integration.test.js`, `tests/local-plugin-artifacts.test.js`, and the local capability manifest |

## Desktop Settings owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Harness-native `桌面` settings section, theme-consistent window behavior UI, IPC bridge without a separate settings window, and immediate close-behavior autosave with rollback | `win-desktop/desktop-settings-plugin` plus wrapper bridge | Independent local desktop integration | `desktop-settings-plugin/lib/client.js`, `src/settings-window.js`, `src/desktop-settings.js`, `src/preload.cjs`, `config/agent-teams.patch.yml` | wrapper `tests/desktop-settings-plugin.test.js` and `tests/desktop-settings.test.js` |

## Windows wrapper owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Wrapper-wide tool-call guidance: derive arguments from current schemas/context, omit unknown or blank optional properties unless empty is explicitly meaningful, and never repeat failed invalid arguments unchanged | `win-desktop/tool-call-guidance-plugin` | Independent local system-prompt plugin. It registers no tools, settings, Provider behavior, or lifecycle state and stays at or below 500 characters. | `tool-call-guidance-plugin/lib/index.js`, `package.json`, `src/dsh-service.js`, `config/agent-teams.patch.yml`, `scripts/sync-local-plugin-artifacts.mjs` | `tests/tool-call-guidance.test.js`, `tests/local-plugin-artifacts.test.js`, and the local capability manifest test |
| Shell and filesystem-mutation escalation normalization without weakening validation or real widening approval, hidden Node/sandbox console windows, loader injection and child-process guard | `win-desktop` | `UPSTREAM_EQUIVALENT + REAPPLY`: official Node hiding and hidden Win32 STARTUPINFO replace duplicate flags; retain only runner preload inheritance and validator-first argument normalization | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs`, `src/win-hide-console.mjs`, `src/dsh-service.js` | `tests/win-hide-console.test.js`, including real Pwsh/Bash and `dsh-tool-fs` runtime fixtures, plus `tests/dsh-service-syntax.test.js` |
| Keep the official native Subagent plugin settings card and the local AgentTeams section separately visible, while retaining Host namespaces, saved settings, official runtime closure and AgentTeams spawn | Official Native client plus `win-desktop/agent-teams-plugin` | `SUPERSEDED_BY_DESIGN`: the user chose separate Native/Team responsibilities for 0.1.7. The old hiding transformer is removed; official initial and HMR bundle snapshots are unmodified. | `agent-teams-plugin/src/client/index.tsx`, `agent-teams-plugin/src/client/locales.ts`, `src/win-hide-console-rewrite.js` | `tests/subagent-settings-card-visibility.test.js`, `tests/agent-teams-integration.test.js`, and the local capability manifest test |
| Alpha.2 authenticated startup URL handoff and bounded loopback Cookie recovery: retain the complete canonical `http://127.0.0.1:<port>/?token=...` readiness URL, reject a bare loopback origin, never persist or document the process token, clear only stale `127.0.0.1` `dsh-auth-*` Cookies before the initial authenticated load, and recover once from a current-origin `/plugins/` HTTP 431 without a reload loop | `win-desktop` | `UPSTREAM_EQUIVALENT + REAPPLY`: Alpha.2 owns token issuance, cookie exchange, and clean-root redirect; the wrapper owns lossless capture of the official `dsh web:` URL plus the narrow cleanup required because Cookie scope does not isolate random ports. | `src/dsh-service.js`, `src/main.js`, `src/loopback-auth-cookies.js` | `tests/dsh-web-auth-url.test.js`, `tests/loopback-auth-cookies.test.js`, and the local capability manifest test |
| Provider-neutral `grep` argument alias normalization at the `dsh-llm-pi-ai` durable tool-call boundary, limited to a missing `pattern` plus an exact single-line `description: "pattern: <non-empty value>"` shape | `win-desktop` | `REAPPLY` until upstream performs an equivalent deterministic normalization. No provider/model routing or optional settings toggle owns this behavior; existing `pattern` values and every ambiguous malformed call remain under the strict upstream Schema. | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs` | `tests/grep-tool-argument-compatibility.test.js` and the local capability manifest test |
| Explicit bounded-period usage-limit exhaustion is classified as terminal `QUOTA` at the official `dsh-llm` boundary, while transient `RATE_LIMIT` and standalone reset notices remain non-terminal | `win-desktop` | `REAPPLY`: RC.1 recognizes unqualified `usage limit` wording but misses provider messages such as `weekly usage limit`; the wrapper adds only this narrow loader rewrite and retains the upstream classifier for every other phrase. | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs` | `tests/win-hide-console.test.js` and the local capability manifest test |
| Recovery of non-empty OpenCode tool streams that end without `finish_reason`, while incomplete streams still fail | `win-desktop` | Narrow compatibility rewrite over the installed OpenCode stream module | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs` | `tests/opencode-stream-rewrite.test.js` |
| Local plugin installation, patch graph, official in-memory profile resolution with a scoped wrapper installation anchor, compiled-local-plugin artifact synchronization, OpenCode model-catalog preparation, verified OpenCode protocol/image-capability reconciliation (static, persisted and live catalogs), including Kimi K3's tool-compatible first-request profile, official-client Schema lowering, provider-wide OpenCode Go session affinity, and the narrow manual validation bridge | `win-desktop` plus `opencode-capabilities-plugin` | `SUPERSEDED_BY_DESIGN + REAPPLY` for startup (official runtime resolver replaces physical profile links); `REAPPLY` for OpenCode until the pinned DSH/Pi catalog demonstrates equivalent per-model transport/capability coverage; known legacy modality mappings may correct only input capability, while unknown models retain text-only fallback. Every OpenCode Go model must receive `x-opencode-session` from the active Harness session, including with `cacheRetention: "none"`; generic providers remain unchanged. Kimi K3 must keep `supportsStrictMode: false`, reasoning-content replay, deferred-tool handling, and Kimi Schema normalization for ref siblings and tuple-style `items`. Do not infer an unknown model's protocol or retry a 500 over another endpoint. | `package.json`, `package-lock.json`, `scripts/sync-local-plugin-artifacts.mjs`, `config/agent-teams.patch.yml`, `src/dsh-service.js`, `src/model-fetcher.js`, `src/win-hide-console-rewrite.js`, `src/preload.cjs`, `src/settings-window.js`, `opencode-capabilities-plugin/lib/client.js` | `tests/heal-desktop-plugins.test.js`, `tests/local-plugin-artifacts.test.js`, `tests/model-fetcher.test.js`, `tests/opencode-stream-rewrite.test.js`, `tests/opencode-capabilities-integration.test.js`, and the local capability manifest test |

OpenCode 官方客户端在其请求准备代码中会为 `providerID` 以 `opencode` 开头的请求设置
`x-opencode-session`；OpenCode Go 网关也以该头作为会话粘性标识。Windows 包装器
只在 `opencode-go` 的 Pi Completions/Responses 请求中补这一头，Muse Spark 原有的
`openai-responses` 模型档案保持不变。依据：[OpenCode 请求准备源码](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/llm/request.ts)、[OpenCode Go 会话粘性说明](https://github.com/anomalyco/opencode/issues/35402)。

## Historical Alpha.2 migration classification — 2026-08-31

The superseded Harness tag `dsh-v0.1.2-alpha.2` resolved exactly to
`0a53fb55bea101816fa226bb964ae2bed71c343b`. The source was built with the
official pnpm `11.7.0` contract, packed as 9 vendor plus 245 dsh tarballs, and
verified in a temporary packed-install environment. The wrapper consumes only
those stable ignored tarball paths; the checked-in
`UPSTREAM_ALPHA2_SOURCE_MANIFEST.md` records all package identities and hashes.

This historical classification is retained for provenance; the active runtime
identity is the 0.1.7 refresh recorded above.

The Alpha.2-era migration classification was:

| Registered owner row | Result | Refresh action |
| --- | --- | --- |
| Harness core runtime | `UPSTREAM_EQUIVALENT` | Use the complete fixed Alpha.2 release families and their official app boot, Remote, session, Web, tool, and Windows package graph; do not maintain an rc.2 fallback runtime. |
| AgentTeams | `UPSTREAM_EQUIVALENT + REAPPLY` | Retain upstream v0.1.15 execution semantics from fixed commit `232a338`; adapt to Alpha.2 client seams and migrate only verified wait/scoped identity/Revision-CAS/event behavior from experimental source without installing experimental packages. Reapply role-level Provider/model/reasoning, strict V2, quality, compact status, shared catalog, Team/Native and desktop editor contracts. |
| CPA | `REAPPLY` | Retain the independent Provider plugin, native single-row editor seam, revision-guarded migration, image default, capacity and reasoning vocabulary against Alpha.2 Models APIs. |
| Models settings | `SUPERSEDED_BY_DESIGN + REAPPLY` | Rebase onto Alpha.2 provider-card/footer, Onboarding and Remote architecture, then reapply provider-neutral image modes, reasoning/capability probes, late Remote availability and output-link safety. |
| Desktop Settings | `REAPPLY` | Retain the Harness-native desktop section and immediate-save IPC bridge on the Alpha.2 settings slot. |
| Session Markdown | Removed 2026-09-07 | The local continuation-export plugin is retired. User-exported Markdown files stay on disk. |
| Windows wrapper | `SUPERSEDED_BY_DESIGN + REAPPLY` | Move CreateProcess hiding to Alpha.2's `dsh-win32-process` owner boundary; retain provider-neutral grep normalization, OpenCode/Kimi rewrites, stream recovery, session affinity, plugin healing and startup integration. |
| Tool-call guidance | `REAPPLY` | Retained the independent compact system-prompt plugin and its 500-character contract before AgentTeams. |

AUTO remains intentionally removed. It is not an Owner, dependency, Patch
entry, prompt section, settings surface, or migration target. Stale user data
is left untouched and inert.

AgentTeams' mixed upstream/local capability row is further split here so that
an upstream-equivalent behavior is not mistaken for ownership of the local
fork's settings contract:

| AgentTeams capability | Result | Evidence/action |
| --- | --- | --- |
| v0.1.15 staged plans, atomic approval, halt/resume, profiles, quality gates, fallback, and activity controls | `UPSTREAM_EQUIVALENT` | Imported the upstream implementation from fixed commit `232a338` and retained its offline, lifecycle, quality-gate, and stress regressions. |
| Strict Profile/Team `schemaVersion: 2`, required role routes, and rejection of older on-disk data without migration | `REAPPLY` | Kept V2-only validation, explicit role cards, old-data error handling, restart-required injection, and profile/store/YAML regressions. |
| Local `子智能体` settings, shared catalog including CPA/OpenCode, role-level `target-default`/`route-aware`/`explicit` reasoning, and explicit route authority | `REAPPLY` | Kept the local settings runtime, shared Harness catalog, role selection policy, and settings-client regressions; global member-model/reasoning controls are absent. |
| Generic numbered role-family inheritance for dynamically added members | `REAPPLY` | The wrapper matches any unnumbered role in the current Team plus a positive numeric suffix (with optional separators), keeps the base role ahead of numbered members, preserves explicit override precedence, and retains selection/lifecycle regressions. |
| Team/Native durable markers, native-tool suppression, member claim compatibility, and local desktop mounting | `REAPPLY` | Kept the routing policy, tolerant claim behavior, client injection, and wrapper integration regressions. |
| Durable task/member/attempt recovery core plus Alpha.2-compatible wait, identity scope, revision/CAS and activity events | `UPSTREAM_EQUIVALENT + REAPPLY` | Keep upstream v0.1.15 lifecycle behavior, use the verified Alpha.2 architecture where equivalent, and retain local lifecycle/quality/stress/build-path regressions without installing experimental packages. The desktop fork additionally applies final-error stale-safety and post-idle scheduling recovery from the fixed upstream change set. |

### AgentTeams incidents that must not recur

| Observed symptom | Required behavior after rc.26 | Regression evidence |
| --- | --- | --- |
| `you are not leading any team yet — call agent_teams_create first` during cleanup | `agent_teams_delete` returns an idempotent no-op when no captain Team exists | `tdd.delete.without-active-team-is-idempotent.tool` |
| `you do not lead or belong to any active team yet` during a status probe | `agent_teams_status` returns `active: false`; participant mutation and messaging remain strict | `tdd.status.without-active-team-is-a-clean-probe.tool` plus lifecycle identity checks |
| A member model copied captain-only `wake="recover"` into `agent_teams_status` and the retry loop repeated the same invalid call | A member status request with `wake="recover"` degrades to read-only, does not invoke recovery scheduling, and returns `wake_ignored="recover"` with `recovery_started=false`; captain recovery remains unchanged | `tdd.status.member-captain-wake-degrades-to-read-only`, `member recovery wake degrades to read-only without scheduling recovery`, and the member persona recovery-wake rule |
| `you are not leading any team yet — call agent_teams_create first` during an approval-like “继续/确认” turn | `agent_teams_approve` requires a freshly observed staged Team; without one it returns an inactive no-op and the create next step, without writing state | `tdd.approve.without-active-team-is-a-clean-noop.tool` and `usage prompt preserves approval preflight` |
| A non-GPT model supplied blank optional strings and the newly written Team then failed strict V2 loading | Blank optional task strings are omitted before persistence; V2 validation remains strict and no compatibility migration is added | `tdd.create.blank-optional-strings-do-not-corrupt-v2-team.tool` and strict-state verification |
| `implementation is blocked until a requirements task completes with verdict=pass` while constructing a safe running DAG | Implementation may be queued only when it explicitly depends on the open requirements task; dispatch still waits for `completed + verdict=pass` | `tdd.create.running-implementation-can-queue-behind-requirements` and requirements scheduling checks |
| `team ... is already running; its plan can no longer be edited` surfaced as a red tool error | `agent_teams_edit_plan` returns structured `already_running` guidance and performs no write; only staged plans can be edited atomically | `tdd.edit-plan.running-team-returns-guidance-without-tool-error` and staged atomic lifecycle checks |
| Ordinary delegation opened a zero-task staged Web plan and asked the user to invent a task name and confirm startup | Default ordinary delegation omits the Team name, uses `approval="automatic"`, and makes the Captain create captain-planned task names/contracts itself. `approval="required"` is reserved for an explicit user request to review before startup. | `ordinary delegation defaults to automatic startup and model-owned naming/planning`, generated-name lifecycle checks, and the 3,500-character usage budget |
| Web task edits failed with `staged plan update requires revision-aware options`, while raw Alpha.2 routes lacked the upstream Host/Origin fence | Activity snapshots expose `planRevision`; every Web member/task mutation and Web approval carries the observed revision; Host enforces CAS and consumes a one-time approval credential. Raw state/plan/halt/artwork/model-catalog routes use Alpha.2 Connection authentication and fail closed for missing auth, hostile origins, or unavailable Connection. | `browser staged task payload forwards the observed plan revision`, `staged Web edits and approval use the current snapshot revision end to end`, and `scripts/web-routes-verify.mjs` |
| The staged Web editor dropped `reasoningMode`, replayed a materialized non-explicit effort, or retained an old explicit effort after switching to inheritance/routing | Snapshots require all three reasoning modes; only `explicit` sends effort, and an old explicit effort is retained only when the target mode remains `explicit` | `staged plan browser persists all three member reasoning policies without leaking non-explicit effort`, `tdd.plan-http.member-policy-modes-preserve-authority`, `browser staged member edit can switch explicit policy to target-default without retaining explicit effort`, `model-facing staged member edit can switch explicit policy to route-aware without retaining explicit effort`, and strict V2 reasoning-mode checks |
| The model-facing tool supported the full quality contract but the Web editor/Host route silently kept only basic task fields or filtered malformed list items into accidental clears | Snapshot, browser-shaped Host payload, and durable mutation round-trip every quality field; empty lists clear fields, while lists containing any non-string item are rejected | `staged plan browser and host preserve the complete quality task contract`, `tdd.plan-http.task-contract-round-trips-completely`, `tdd.plan-http.rejects-non-string-list-items-instead-of-clearing-fields`, `snapshot and browser-shaped Host payload persist the complete staged task contract`, and `browser-shaped empty lists and strings clear every optional staged task field durably` |
| Implementation/repair claimed delivery with uncovered deliverables or `changedPaths: []` | Deliverables must be inside `inScope`; empty changed paths need `noChangesReason` and cannot hide declared deliverables | `tdd.create.implementation-deliverable-must-be-in-scope`, `tdd.complete.empty-changed-paths-requires-no-change-reason`, and `tdd.complete.empty-changed-paths-cannot-hide-deliverables` |
| A model used a prose label as a deliverable, selected `server/.env.example`, or sent `captain` / an empty string as a task assignee | Keep the scope and protected-path gates strict, but return actionable guidance: concrete deliverable paths belong in `inScope`, abstract outcomes belong in subject/description/acceptance, `captain` is a valid captain-owned alias, and blank assignee means the shared pool | `tdd.create.undeclared-deliverable-explains-concrete-path-repair`, `tdd.create.protected-env-deliverable-explains-safe-boundary`, `tdd.create.blank-assignee-normalizes-to-shared-pool`, plus lifecycle captain/shared-pool boundary checks |
| A model sent `profile: ""` and Team creation failed although Profile is optional | Missing, empty, and whitespace-only Profile input all create an ad-hoc Team; an unknown non-empty name still fails before any durable write or member spawn and lists configured names | `create without Profile produces an ad-hoc Team`, `blank Profile normalizes to the same ad-hoc Team shape`, `unknown non-empty Profile rejects before state write or member spawn`, and the dynamic schema-description check |
| The captain prompt grew past 7,000 characters yet models still repeated invalid lifecycle calls | Keep the built-in `software-delivery` output at or below 3,500 characters, start with unknown/inactive/staged/running/halted state rules, and retain every registered reasoning, dependency, attempt, quality, resume/delete, and deployment-confirmation marker | `usage prompt stays within the software-delivery budget` plus all `usage prompt preserves ...` checks in `scripts/verify.mjs` |

These are release-blocking observable contracts, not historical notes. During
an upstream refresh, classify the implementation owner and keep each listed
regression active even if the local code is replaced by an upstream equivalent.

Record one result for every row above during a refresh:

- `UPSTREAM_EQUIVALENT`: upstream owns equivalent observable behavior and the
  retained regression passes against it.
- `REAPPLY`: the capability is still local and its smallest compatible patch is
  reapplied.
- `SUPERSEDED_BY_DESIGN`: implementation ownership changes, but the requirement
  and regression are migrated before the old code is removed.

An upstream implementation can replace local code, but it cannot replace the
regression evidence. Tests survive ownership moves.

## Seven-step upstream refresh workflow

1. Create a fresh isolated worktree and record the current branch, HEAD, dirty
   state, upstream tag/commit, and affected package versions.
2. Run the current `npm run verify:upstream` gate before importing anything; a
   failing baseline must be diagnosed separately.
3. Compare the new upstream source with every registry row and assign one of
   the three classifications above. Do not resolve conflicts by deletion.
4. Import upstream changes, then reapply or migrate each local capability in
   its existing ownership boundary.
5. Update package versions, local `file:` dependencies, lockfile entries,
   README text, provenance records, and integration assertions together.
6. Run `npm run verify:upstream`; fix the implementation rather than weakening,
   deleting, or skipping a regression.
7. Review the public-repository diff for credentials, runtime state, logs,
   screenshots, exports, installers, generated output, and local upstream
   checkouts. Only after the gate and review pass may provenance be finalized
   or release packaging begin.

## Gate contract

From `win-desktop`:

```powershell
npm run verify:upstream
```

The command runs the Models, CPA, AgentTeams, and desktop
test suites sequentially, then synchronizes each local plugin `lib` directory
and package manifest into its existing `file:` dependency before wrapper tests
verify the packed runtime surface. It must not install dependencies, publish
packages, build installers, access the network, or mutate live session/team
state. pnpm's automatic dependency-state repair is disabled for the gate;
missing or unusable dependencies must fail through the requested build/test
command and be repaired separately before rerunning the gate.

## Packaging closure incident — 2026-08-29

The rc.28 installer initially started with `ERR_MODULE_NOT_FOUND` for
`@deepseek-ai/cordis`. The source package was present in the development
workspace, but the installer had been built from an isolated worktree whose
`node_modules` was a Junction to another checkout. Electron Builder's npm
dependency scan followed that layout incompletely and omitted transitive
runtime packages from `resources/app/node_modules`.

This is a build-environment failure, not a reason to keep adding arbitrary
transitive packages to the wrapper's root dependencies. Preserve the following
release-blocking procedure:

1. Build from the real `win-desktop` checkout with an actual `node_modules`
   directory; do not package from a worktree whose dependency directory is a
   Junction or symlink.
2. After `electron-builder --win dir`, verify the unpacked application contains
   `@deepseek-ai/dsh-app-boot`, `@deepseek-ai/cordis`, its Cordis loader/include
   runtime packages, `js-yaml`, and `argparse`.
3. Resolve those packages with Node `createRequire` from
   `dist/win-unpacked/resources/app/src/dsh-service.js`; filesystem presence
   alone is insufficient.
4. Run `scripts/verify-alpha2-zip-closure.mjs` against the ZIP and
   `win-unpacked`; it must reject unsafe archive paths, resolve the same
   release-critical runtime packages, and match every package/app manifest by
   SHA-256. Then record SHA-256 for the EXE, ZIP, and blockmap. Code-signing
   status is an independent release property and must not be confused with
   dependency closure.
5. Do not hot-overwrite an installed running copy. Close old processes before
   installing the verified artifact; the screenshot path of an old install is
   not evidence about the newly built package.
6. Upload installers as GitHub Release assets, never as tracked source files.

The direct `dsh-app-boot`, `js-yaml`, and `argparse` declarations remain part of
the checked-in runtime closure. They complement the real-checkout packaging
requirement; they do not replace it. Future upstream refreshes must rerun the
full `npm run verify:upstream` gate before package generation and repeat these
closure checks before release publication.

## Generated-output mapping incident — 2026-08-30 / 2026-08-31

The Models and CPA plugin builds intermittently failed on Windows with TypeScript
`TS5033` or Rolldown `os error 1224` while writing files under `lib/`. The
generated files were hardlinked into another local plugin's installed
`node_modules`, and a consumer/indexer could hold a user-mapped section over
one of those directory entries. This was a build-environment race, not a
provider or model capability failure.

Both packages now run their own
`scripts/detach-output-links.mjs` before TypeScript/Rolldown. It recursively
replaces each existing regular `lib` output with a byte-identical private copy,
never follows symlinks, and leaves the consumer's old inode untouched. The
`output-link-safety.test.js` regressions prove the bytes and unrelated hardlink
remain intact. Future refreshes must retain this prebuild step and regression;
do not solve the error by deleting generated outputs, weakening the upstream
gate, or killing user processes.
