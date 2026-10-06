# Upstream maintenance and local capability registry

This document is the canonical map of behavior that must survive every
DeepSeek Harness or AgentTeams upstream refresh. Root `AGENTS.md` defines the
binding rules; this registry records who owns each capability and which tests
prove it still exists.

## Current local identities

- Official Harness source closure: `dsh-v0.2.0-rc.2` at `639ed015397290b3745d163aafe02ffee4aa3f84`
- Windows desktop wrapper: `0.2.0-rc.16` (locally packaged and verified; not published)
- Desktop Electron runtime: exactly `44.0.0`, matching the official host's desktop lockfile
- Tool-call guidance plugin: `0.1.0`
- Output-limit finish plugin: `dsh-output-limit-finish@0.1.0`
- OpenCode compatibility: manual validation retired at desktop `0.2.0-rc.4`; all remaining OpenCode rewrites and `model-fetcher` retired at `0.2.0-rc.16` by user request
- AgentTeams fork: `0.1.22-desktop.9`, based on upstream `v0.1.22` at fixed commit
  `9cba4fe4171f27c019991cafd2a107f87ef3517b`
- CPA provider plugin: `0.1.11`
- Models settings fork: `0.2.0-rc.2-desktop.4`
- Desktop Settings plugin: `0.1.5`

## Desktop 0.2.0-rc.16 session-audit fixes, gateway truncation and OpenCode retirement — 2026-10-06

Harness `0.2.0-rc.2` and upstream AgentTeams `v0.1.22` pins are unchanged. The
fixes come from the exported 2026-10-03/06 Team session (main session plus 11
member sessions) and were reproduced against current code before changing it.

AgentTeams `0.1.22-desktop.9`, all REAPPLY. Three of these defects exist in
upstream v0.1.22 itself (captain idle requeue in `scheduler.ts`, count-based
evidence fallback in `quality-gates.ts`, silent `amend_task` field drop). No
upstream PR is planned. On every future AgentTeams refresh, check these three
spots first: if upstream still has them, reapply the local fix; if upstream
changed them, classify the new behavior and keep the regressions below:

- Captain takeover is retained across the captain's idle edge. The previous
  "unfinished captain takeover returns to a member" regression asserted the
  defect (t2 was handed to analyst after the captain finished it) and is
  replaced by retention plus later captain completion.
- Contract evidence matches by normalized text identity. The former
  `tdd.complete.ordered-evidence-tolerates-model-paraphrase` check accepted an
  unrelated verify command and is replaced by explicit rejection checks.
- Git working-tree snapshots audit implementation/repair `changedPaths`
  (`src/workspace-audit.ts`); t6's dropped `package.json` edits and
  directory-for-files report are reproduced by `tdd.audit.*.tool`.
- Numbered members inherit the base role prompt; `amend_task` rejects unknown
  fields with zero writes; `integration` waits for every Team review
  (t10 deploy versus later-created final review t11); `max-tokens` member turns
  report their cause to the captain.

Gateway truncation, new wrapper-owned plugin `dsh-output-limit-finish`: member
18f8345c used `outputTokens=16000` of a 16000 limit on reasoning, while the
`cli2api` gateway reported `stop`. Four configured gateways (cli2api,
workbuddy2api, cursor-api-proxy, CPA) report finish reasons differently, so the
fix is one provider-neutral official `llm/stream` listener instead of a
per-gateway rewrite. `tests/output-limit-finish.test.js` runs the real
AgentLoop/LlmRuntime and proves `completed` without and `max-tokens` with the
plugin. The low declared output limit itself is user configuration.

OpenCode compatibility is removed by user request (no longer used): the pi-ai
finish/session-affinity/Kimi Schema rewrites, `src/model-fetcher.js`, their
tests and fixtures. The OpenCode rows in the owner tables below are historical;
`local-capability-manifest.test.js` now asserts absence.

Evidence: the complete offline `npm run verify:upstream` gate passes (189
wrapper tests). Local rc.16 EXE/ZIP/blockmap were built after it; unpacked and
ZIP closures resolve 869/868 production packages (one more than rc.15: the new
plugin) and match 1,042 manifests; changed runtime files match source bytes and
the EXE keeps the official whale icon. Sizes and SHA-256 are in
`win-desktop/release-notes/v0.2.0-rc.16.md`. No live provider request, NSIS
installation or publication is claimed.

## Desktop 0.2.0-rc.15 explicit scope retry guidance — 2026-10-06

REAPPLY under AgentTeams. Implementation/repair require top-level non-empty
inScope/verify arrays; description and deliverables do not declare write scope.
Exact files retain exact matching, directory entries must end in /, including
outOfScope. The shared validator explains missing fields and an exact parent entry
with a concrete slash-directory retry; it never silently widens the scope.
Exclusions still win and protected paths remain excluded. Create-task, staged-plan
and amendment schemas share this convention. No durable-state migration is added.

Evidence: quality-gates-tdd.mjs covers the reported summary-report path, correction,
exact-file and sibling boundaries, exclusion priority, JSON-wire schema guidance
and zero durable writes on rejected tool calls. The complete offline verify:upstream
gate passes, including 205 wrapper tests. Harness and upstream AgentTeams pins remain
unchanged. rc.15 EXE/ZIP/blockmap have been built, source/lib parity and both runtime closures pass, and isolated fresh launch/settings/import/restart succeeds. No live provider call or local NSIS installation is claimed.

Clean Windows rebuild and actual NSIS installation/first-run acceptance both pass on GitHub run 37455992912 for runtime source commit 40a1201615a397dd33ebef3fa216d4576c1ea2c5. Release rc.15 includes SHA-256 and sanitized local/clean-runner evidence. No live model request is claimed.

## Desktop 0.2.0-rc.14 session-audit fixes — 2026-10-06

Harness and upstream AgentTeams remain at the same fixed revisions. The following
Windows AgentTeams behaviors are REAPPLY and must retain their regressions:

- Pending captain assignments remain owned on idle; active abandoned attempts still
  use the existing recovery policy. Captain takeover retains the in-flight fence.
- A captain may append terminal evidence without replacing results, or cancel an
  unstarted pending task without first resolving its dependencies. Running member
  ownership and stale-attempt validation remain strict.
- Team-owned native-tool suppression applies to own-scope lookup and actual model
  request assembly, including official continuation return guidance. Captain
  compatible subagent calls and Native adjacent-Agent authorization remain intact.
  Normal HMR and failed existing-Agent hydration release all policy effects.
- Review/requirements completion matches evidence to every current acceptance and
  verify item. Scope changes use the audited contract-amendment boundary; mail alone
  is not an amendment. Ordinary work-task compatibility remains unchanged.
- Coverage and delivery use the same recursive failed-task recovery, retaining
  historical IDs, ignoring cancelled replacements and failing closed on cycles.
- An idle member with an unfinished attempt reports once per attempt to its captain,
  retaining the task and capability without automatic retry or false completion.

Evidence: `agent-teams-plugin/scripts/team-return-guidance.test.mjs`,
`coverage-contract-consistency.test.mjs`, `lifecycle-verify.mjs` and the complete
offline `npm run verify:upstream` gate. No user-state migration or live provider
request is part of this verification. Package and integration versions are synchronized.

Windows verification scripts also explicitly hide their Node and PowerShell child
launches. `tests/console-chain-observation.test.js` checks real Electron GUI to
PowerShell/npm shim/Node/CMD descendants with filtered environments. This is REAPPLY
under the wrapper console owner; it does not identify the user's intermittent visible
window, alter global environments or rewrite third-party MCP commands.
Local EXE, ZIP and blockmap were built after the offline gate. Unpacked/ZIP closures,
125 source/artifact file comparisons, packaged Electron console/port regressions,
isolated fresh startup, configuration save/import and restart passed. See
`win-desktop/release-notes/v0.2.0-rc.14.md` for sizes, SHA-256 and sandbox limitations.
No NSIS installation, second-machine test or GitHub publication is claimed.

## Locally packaged desktop 0.2.0-rc.13 encrypted configuration backup — 2026-10-03

Desktop Settings owns the `扩展设置 → 配置备份` UI and authenticated Host
operation. The wrapper owns trusted-main-frame file dialogs and atomic encrypted
file writes. Both are REAPPLY; no official package, user YAML, global environment
or vendor source is patched to introduce a second settings writer.

The versioned `.dshbackup` envelope uses fixed-cost scrypt (N=32768, r=8, p=1),
random 16-byte salt, random 12-byte IV and AES-256-GCM with authenticated format
metadata. Plaintext API keys stay in the Host; the form holds only its password
input temporarily. Passwords and API keys are never written to logs or backup
metadata. The encrypted file has a 6 MB limit and plaintext a 4 MB limit. Unknown
versions, malformed envelopes, executable YAML expression objects and prototype
keys fail before any writes.

The payload includes only the effective volatile forms of pi-ai/API-key DeepSeek
providers, AgentTeams, native Subagent and its model-selection owner. It retains
model input/effort mappings, capacities, temporary routes and all Profile role
prompts. Credential references are resolved only for those provider declarations;
pi-ai API-key records include catalog-native keys without manual declarations.
OAuth/account grants, runtime Teams, sessions, unrelated plugins and desktop
preferences are excluded. Provider configuration and credentials replace the
backed-up entries; unrelated credential records are retained.

Import uses one official SettingsForms root-set mutation with revision CAS per
namespace; `replace()` is intentionally unsuitable because it recursively merges
the inherited form and would resurrect removed providers or explicit effort.
ConfigEditor schema, volatile-field and Home/CLI override checks are preserved.
Writes are serialized on the Host backup route and use guarded compensation for
already committed namespaces and credentials. This is not a cross-file crash
transaction: interruption or concurrent external edits may prevent full recovery;
the UI must explicitly report incomplete rollback rather than silently overwrite
another writer or claim success. Successful import instructs the user to exit
and restart the application; it does not restart or discard active work itself.

Evidence: `tests/configuration-backup.test.js` exercises real ConfigEditor,
SettingsForms and LocalCredentials across isolated source/target homes and
restart, native/temporary/team routes, prompt whitespace, catalog-native keys,
late credential failures, overlay refusal, invalid declarations, authenticated
Connection Host/Origin restrictions, tamper detection and encrypted size limits.
The full offline `npm run verify:upstream` passes (199 wrapper tests). A real
Electron/DSH UI fixture exercised production preload file IPC, encrypted file
export/import, wrong password, restart notice and 800/600/420 px viewports without
renderer errors. Backup buttons match the official `打开配置文件` button's computed
font family, 12px/18px typography and 28px height. The backup helper is exported
through the installed Desktop Settings package; the main process never imports
the source-only owner directory. The EXE, ZIP and blockmap are locally built,
with sizes and SHA-256 recorded in `win-desktop/release-notes/v0.2.0-rc.13.md`.
Packaged Electron passes 3 native console overload groups, 15 descendant console
regressions and 7 loopback-port/diagnostic regressions. Fresh isolated packaged
launches preserve temporary/Profile routes and encrypted-import credentials,
manual image declarations and reasoning mappings after restart. The unpacked
closure resolves 868 production packages; ZIP resolves 867 and matches all
1,041 package/app manifests against unpacked. This does not claim an actual
second-machine installation, live model request or published release.

## Pending desktop 0.2.0-rc.12 settings and descendant console protection — 2026-10-02

Harness 0.2.0-rc.2 and AgentTeams upstream v0.1.22 remain pinned to the same
source revisions. Official release information was checked separately from
the offline gate; neither floating dependencies nor upstream archives change.

AgentTeams classification: REAPPLY for temporary member defaults; the browser
Schema now uses declarative branches instead of a transform whose module-local
closure cannot survive official JSON hydration. Real Host and browser tests
cover Save, readback, cold restart, invalid writes, revision and Home/CLI refusal.

Profile persistence classification: SUPERSEDED_BY_DESIGN. The independent
desktop JSON writer and generated default map could diverge from the official
profile patch, whose config replaces the complete inherited object. Profile
editing now displays official effective settings and uses one SettingsForms /
ConfigEditor CAS write. Profiles are live Volatile values; creation freezes one
snapshot, so existing teams and numbered roles do not change after a save.
The JSON cache remains intact as an explicit V2 draft-import source, never an
automatic migration or a second write destination. Only an actual saved V2
record enables import. Dirty editor baselines reject external Profile changes;
Home/CLI and stale-revision guards remain official and unmodified. Empty maps
can be saved or reloaded. Protocol and execution prompt whitespace survives
read, unrelated saves and import; cached reviewer arrays retain strict validation.

Windows classification: REAPPLY. Passive WinEvent/EnumWindows evidence caught
Windows Terminal and Git pseudo-console events in the Codex-owned CodeGraph
chain while DSH was stopped. Installed CodeGraph 1.6.1 has two execFileSync Git
calls without windowsHide in extraction/index.js (core.excludesFile and
ls-files ignore discovery). Its npm shim does not forward parent execArgv to
the bundled Node. The wrapper's dependency-free CommonJS preload propagates
through local NODE_OPTIONS, including MCP-filtered child environments, without
copying unrelated parent flags into those environments. It updates ESM builtin
exports and does not register the Harness loader in descendants or Workers.
Explicit visibility, native argument validation and caller options are retained.
No system environment variable, global CodeGraph package or Codex configuration
is changed by this DSH implementation; unrelated hosts require their own setup.
Diagnostic visibility tests record the original native options then hide the
actual probe process; the regression runner itself also sets windowsHide.

The requirements dependency guard remains unchanged: the exported conversation
shows a missing dependency followed by a successful retry with the real task ID.
Its error now lists requirement states and an actionable retry/status next step.

Startup classification: REAPPLY. Real isolated GUI acceptance selected port
6697 and Chromium rejected it with ERR_UNSAFE_PORT. TCP availability alone is
insufficient; the wrapper now probes loopback sockets, closes every probe,
skips Chromium's restricted ports and passes the selected port explicitly to
Harness. It does not add unsafe browser flags. Diagnostics redact process
tokens while authenticated readiness retains the original URL. Seven focused
regressions cover restricted ports, bounded retries, bind failures, socket
release, CLI forwarding and token redaction. Fresh source GUI launches pass
temporary/Profile Save and restart, Web opt-out and legacy preset activation.

Evidence: complete standard offline npm run verify:upstream passed, including
195 wrapper tests with zero skips. tests/agent-teams-profile-layering.test.js
and tests/agent-teams-settings-save.test.js cover real official saves/restarts;
21 real AgentLoop compatibility tests include new/old Team route freezing.
Actual Electron 44 UI with official JSON Schema hydration and real Host saves
passes temporary defaults, four role routes, draft import, zero cache writes,
conflict retention, last-profile deletion, retry/cancel and 320/560/800px layouts
with zero renderer errors. Fifteen descendant regressions pass under Node 24.19,
Node 26.7 and Electron 44; real CodeGraph buildScopeIgnore through its bundled
Node receives windowsHide=true for both Git calls. No external model request or
current clean-machine installation is claimed by these local fixtures.

Local rc.12 packaging completed after the full offline gate. Unpacked and ZIP
runtime closure checks resolve 868 and 867 production packages and compare
1,041 matching manifests; 124 wrapper/local-plugin runtime files match source.
Packaged Electron passes the three selected native console groups, all fifteen
descendant tests and all seven browser-port/diagnostic tests. Three real GUI
launches with isolated DSH_HOME and Electron user-data-dir prove temporary and
Profile Save/readback/restart, Models availability, Web opt-out, healthy legacy
disabled-Web presets and unchanged user Patch bytes, with zero renderer errors.
The rc.12 Release notes contain artifact sizes and SHA-256 values; binary assets
remain ignored, and no rc.12 Release or clean-machine installation is claimed.

## Desktop 0.2.0-rc.11 console guard coverage — 2026-10-02

Classification: REAPPLY. The Windows wrapper owns this provider/tool-neutral
preload change; Harness stays pinned to 0.2.0-rc.2. The installed rc.10 process
already loads the preload, and a real isolated Electron 44 / modular MCP client
handshake with CodeGraph through its npm .cmd shim reaches cmd.exe with
windowsHide=true. This evidence does not establish the source of an observed
visible-window flash; process count and a shim title command are not causal
proof.

Red regressions found two actual gaps: execSync calls Node's internal lexical
spawnSync and bypasses the exported-method patch; explicit undefined/null
options slots were incorrectly handled by the generic argument appender.
The guard now covers execSync and locates each method's legal options slot.
Asynchronous exec remains covered through the exported execFile. Explicit
windowsHide=false, illegal values/overloads, callbacks, stdio, output and
non-zero exit errors retain their native semantics. Options are copied even
for explicit visibility, preventing Electron fork from mutating caller input.

tests/win-hide-console.test.js has 19 passing tests under Windows Node 24.19,
Node 26.7 and Electron 44. Native process options/flags are observed while real
children execute; invalid-type cases compare against each runtime's unpatched
baseline and prove rejection before spawning. The full offline, install-free
verify:upstream gate passed before this record (167 wrapper tests, zero skips).
Independent review passed. The published rc.10 installer and upstream
provenance remain unchanged.

Local rc.11 packaging completed on 2026-10-02 after the full offline gate.
win-unpacked resolves 868 production packages; the ZIP resolves 867 and
matches 1,041 package/app manifests. The actual packaged Electron passes the
three new native child-process regression groups, and 121 wrapper/local-plugin
runtime files match source bytes. Sizes/hashes belong to the rc.11 Release
notes and ignored SHA256SUMS output. The build workflow reads the source
version for ZIP/hash names; installed acceptance strictly compares the same
version, with explicit rc.10 retained for its historical workflow. No current
rc.11 clean-machine installation or published Release is claimed here.

## Pending AgentTeams desktop.5 temporary subagent defaults — 2026-10-02

AgentTeams owns this REAPPLY capability through settings.ts, the settings client
and subagent-compat.ts. A separate optional temporaryMember policy applies only
to Team-mode captain subagent calls without explicit tool route/effort. It does
not select a Profile or override its roles, and keeps Native settings separate.
The shared model catalog and role-selection contract own provider/model and
target-default, route-aware or explicit reasoning. The existing tool schema and
Session allowlists still govern model-supplied overrides; trusted saved defaults
are not advertised as tool parameters. Invalid/unavailable defaults fail before
durable admission, never silently falling back to the captain.

Repeated and concurrent calls retain member limits, running-child exclusion and
the single durable gateway. Existing members stay frozen; only compatible idle
temporary members can be reused for a selected default. One CAS write persists
the complete policy, with cancellation/editing clearing stale failed retries.
The twenty real-runtime offline team-subagent-compat tests cover concurrent
description/prompt-only calls, explicit defaults, unavailable routes, original
role inheritance and Native restrictions. Settings normalization tests check
all reasoning modes and live default changes. Settings/client tests and
tests/agent-teams-settings-save.test.js retain save/
restart, atomic validation, stale revision and Home/CLI refusal evidence. The
full offline source gate passed before provenance update. This local capability
does not change the pinned Harness or AgentTeams upstream revision and is not
included in the already-published rc.10 installer.

Actual Electron 44 checks exercise Save/retry, cancel/edit after a failed Save,
explicit-effort clearing and Native isolation, with no renderer errors. At
320/560/800px, the page and controls have no horizontal overflow; browser
screenshots verify the actual component layout. External LLM calls are not used.

## Desktop 0.2.0-rc.10 preset dependency repair and portable build inputs — 2026-10-01

Classification: REAPPLY. The wrapper's exact dsh-tool-web rewrite removes the
required web dependency only when the startup snapshot disables both official
web tools. A legacy home patch disabling the Web service no longer leaves
standard/PTC/Cordis presets pending. The enabled suite retains its required
service diagnostic; user YAML and independent tools remain untouched.

The red regression reported tool-web: waiting for web. The real Loader/
AgentPresetRegistry test in tests/desktop-web-preset.test.js exercises both
startup flags, both service states, the three affected presets and minimal.
The real Host roster is also healthy with the legacy disabled-Web home patch.
The full offline source gate passed before this entry.

Clean wrapper builds restore the exact 650 already-registered upstream archives
from the hash-pinned Release input asset. Neither upstream revision nor existing
archive hashes change. scripts/prepare-build-inputs.mjs checks bundle identity,
complete path membership, all per-package hashes and refuses differing existing
files. Dependency installation is an explicit separate preparation phase.
The Windows workflow builds without developer caches and installs its own EXE
on a second disposable runner; completion evidence belongs to the Release notes.

Cloud build b3c7e8d passed the full offline gate (164 wrapper tests), produced
the release EXE/ZIP and passed both packaged closures (868/867 production
packages, 1,041 matching manifests). A second clean Windows runner installed
that exact EXE and passed real desktop startup, Models catalogue, AgentTeams
save/restart, web opt-out restart and legacy disabled-Web preset checks. The
renderer reported zero exceptions; no live model request was made. Installer
path and DOM-readiness corrections affect only the acceptance harness.
Evidence: Actions runs 36823482174 (build) and 36825551884 (installed acceptance).

## Desktop 0.2.0-rc.9 built-in web tools preference — 2026-10-01

Classification: REAPPLY. Desktop Settings owns the native 扩展设置 section,
the stable desktop slot, official Switch and autosave/rollback presentation.
The wrapper owns boolean IPC persistence, the startup environment snapshot and
the exact installed dsh-tool-web activation rewrite in src/desktop-web-tools.js.
Upstream provides search/fetch registration flags; it does not provide this
desktop preference or its application to all current and future preset mounts.
Only the official tool suite is changed. ctx.web, provider services, user YAML,
explicit preset disables and independent tools are preserved. No provider,
credential, SSRF or AgentTeams routing policy is changed.

Evidence: full offline source verify:upstream passed before this record, and
tests/desktop-web-tools.test.js has seven real-store/loader/Cordis regressions.
Real Electron 44 renderer plus production preload/IPC/store verifies automatic
save, process restart persistence, write-failure rollback, keyboard Space and
320/560/800px layouts without overflow or console errors. No live model or
external web request is part of these tests.

Release audit: the official [Harness releases](https://github.com/deepseek-ai/deepseek-harness/releases)
still list dsh-v0.2.0-rc.2 (639ed01), and [AgentTeams releases](https://github.com/NanmiCoder/dsh-agent-teams/releases)
still list v0.1.22 (9cba4fe). Existing fixed source revisions remain unchanged.

## Desktop 0.2.0-rc.8 captain subagent compatibility — 2026-10-01

AgentTeams owns this REAPPLY capability in src/subagent-compat.ts and the
scoped routing-policy adapter. Captain subagent calls use real Team members,
assigned tasks, the durable scheduler and the existing subagent gateway. Native
mode, member-only restrictions, Session allowlists, role reasoning, user review,
halts, member caps and cold state are preserved. Background success means
durable admission; foreground success means an actual completed task.

Regression: agent-teams-plugin/scripts/team-subagent-compat.test.mjs contains
14 real-runtime offline tests and runs in pnpm verify / verify:upstream. The full
source gate passes before provenance update. The upstream pinned index.ts and
capabilities.ts own agent_teams_* collaboration; the former local unconditional
captain native guard caused this rejection before the gateway was called.
No upstream revision or provider-specific Models behavior changes.

## Desktop 0.2.0-rc.7 settings typography — 2026-10-01

Ownership remains REAPPLY: Desktop Settings owns its native section, and
AgentTeams owns its Profile editor. Both inherit the pinned official global
font; regular text uses 14px, helper text 12px and form controls/labels 13px.
The textarea line height is 19.5px. Official form height, surface and radius
tokens replace independent control sizing. Desktop removes its extra card
inset so the text aligns with the native settings content column.

Source changes passed the full install-free offline verify:upstream gate
before these records were updated. The actual official and local components
were compared under the same theme; computed typography matches, four viewport
widths have no control overflow and keyboard focus remains visible. All saved
prompts, explicit built-in restore, retry behavior and routing remain unchanged.
Harness remains 0.2.0-rc.2; Models and CPA are unchanged.

After version synchronization, dist:win's full offline gate passes again.
Packaged Electron authentication/save/restart and compiled client byte identity
checks pass. Unpacked/ZIP closures resolve 868/867 production packages with no
RC.1 packages, and 1,041 manifests match. Sizes and SHA-256 values are recorded
in win-desktop/release-notes/v0.2.0-rc.7.md. No install or publication was performed.

## Desktop 0.2.0-rc.6 Chinese role guidance and settings controls — 2026-10-01

Ownership remains `REAPPLY`: AgentTeams owns single-line buttons, wrapping
save errors and explicit draft-only built-in restoration; the wrapper owns the
Chinese software-delivery description, protocol and role-specific instructions.
All four member identifiers, role reasoning modes and V2 contracts remain.
Stored user instructions are never overwritten on read. Users can explicitly
restore the current built-in and Save before restarting for new Teams.

The profile-store regressions cover V2 save/reload, preserved custom prompts,
current built-in snapshots and exact static/generated default parity. The
integration regression resolves the actual Profile and verifies each role's
Chinese prompt reaches its member persona. The full captain prompt is 3,424
characters. Serialized write/recovery regressions are retained; real isolated
browser checks verify failure/retry/success, busy state, 400px layout and
old-saved-default restoration without an unrelated draft edit. The complete
install-free verify:upstream gate passes with wrapper 155/155, Models 25/25,
CPA 27/27 and the full AgentTeams suites. The pinned Harness remains 0.2.0-rc.2.

The packaged Electron Host passes authenticated save/restart/save and provider
listing in a fresh isolated Home. All four Chinese role prompts are injected
through the packaged persona code, and wrapper default/config/compiled client
bytes match source. Unpacked/ZIP closures resolve 868/867 production packages
with no RC.1 packages; 1,041 package/app manifests match. Artifact hashes are
recorded in `win-desktop/release-notes/v0.2.0-rc.6.md`.

## Desktop 0.2.0-rc.5 editable default-layer repair — 2026-10-01

Wrapper startup integration remains `REAPPLY`. The desktop previously inserted
AgentTeams after the profile user patch as a CLI overlay. A SettingsForms save
therefore targeted an entry not yet inserted; the official ConfigEditor correctly
refused the composed result. The wrapper now contributes exactly its four owned
plugin insertions as the final default layer, before profile, Home and CLI edits.
The guard targets the pinned app-boot `loadProfileDirectory` output and rejects
source drift or a non-owned insertion list. It is idempotent, scoped to Web and
does not modify the installed upstream bytes, user patches or profile manifests.
The normal overlay refusal, stale-revision checks and each plugin owner remain.

The original error was reproduced before the repair with the real Loader,
ConfigEditor, SettingsForms and AgentTeams Config schema. The same offline
regression now proves Save/restart, unrelated fields/profiles, revision conflicts,
Home/CLI refusal, narrow default-layer admission and source-drift rejection.
The complete install-free `verify:upstream` passes: Models 25/25, CPA 27/27,
full AgentTeams suites, wrapper 152/152, and 890 production packages with no RC.1
cohort. Outside the gate, a fresh isolated Electron Host saves through the
authenticated settings Remote, retains Native after restart, saves Team again,
and reads the provider list without a live model request. The exact packaged
Electron program passed those same isolated checks; unpacked/ZIP closures pass
(868/867 packages, no RC.1 cohort, 1,041 matching manifests) and changed wrapper
modules match source bytes. Artifact hashes and sizes are recorded in
`win-desktop/release-notes/v0.2.0-rc.5.md`.

## Desktop 0.2.0-rc.4 manual model settings — 2026-10-01

The user explicitly replaces capability probing and automatic image input with manual declarations (SUPERSEDED_BY_DESIGN). Models owns seven choices, per-model reasoning subsets, image/text-only input, text defaults and draft-only edits. CPA owns its adapter seam and must preserve manual reasoningEfforts, false, explicit images, invalid data, credentials and raw capacities. OpenCode's manual card, plugin, dependency and IPC are removed; startup protocol/schema/session compatibility remains wrapper-owned. Discovery still lists models without running capability test requests. The Models page layout groups list operations, bulk input actions and expandable per-model fields.

Replacement regressions: Models model-reasoning, model-input, model-input-ui and native page/source suites; CPA profile/reasoning/migration; wrapper manual-model integration through the official PiAiAdapter, retired-module absence checks, installed artifact identity, and unchanged OpenCode transport regressions. The complete offline, install-free `verify:upstream` gate passes: Models 25/25, CPA 27/27, full AgentTeams suites, wrapper 149/149, and 890 production packages with no RC.1 cohort.

The rc.4 artifacts also pass unpacked/ZIP runtime closure checks (868/867 packages, no RC.1 cohort, 1,041 matching package/app manifests), compiled Models/CPA artifact identity, retired-module absence, and authenticated fresh-Home Host startup with the normal provider-list RPC. Real browser checks cover seven choices without an extra Off entry, per-model subsets, image/text defaults, Save/Cancel, light/dark themes and a 400px viewport. No live model request is needed for these checks. Local artifact hashes and sizes are recorded in `win-desktop/release-notes/v0.2.0-rc.4.md`.

Historical sections below describe earlier releases and do not restore removed controls.

## Desktop 0.2.0-rc.3 capability Remote repair — 2026-09-30

Harness and AgentTeams keep the fixed revisions above. Models retains ownership
of the provider-neutral capability probe (`REAPPLY`): its hand-written Remote
contribution now uses the official strict-codec `create()` contract, with no
descriptor or mount cast hiding incompatibility. The real Client Gateway and
TypertRegistry regression covers mount, late lookup, routing, cancellation,
disposal, and strict request/result validation. No provider-specific rule or
settings-write behavior is added to Models.

The complete offline, install-free acceptance gate passes: Models 52/52,
CPA 27/27, full AgentTeams suites, wrapper 150/150, and a runtime closure of
891 production packages with no RC.1 cohort. The extra wrapper regression
pins the immutable original archive identity documents. Current archive
identities and lock integrities were restored from the same fixed source with
the user-authorized recovery procedure in
[`SOURCE_ARCHIVE_REBUILD_20260930.md`](SOURCE_ARCHIVE_REBUILD_20260930.md).
The local rc.3 EXE, ZIP and blockmap were built after that gate passed. The
unpacked closure resolves 869 production packages; the ZIP resolves 868 and
matches all 1,042 package/app manifests with the unpacked build. A fresh isolated
Host successfully started and served an authenticated capability-probe RPC
using a non-applicable protocol, without a live provider request. The wrapper,
Harness, Models, AgentTeams, compiled codec factories and icon assets were
checked in the packed output. Artifact hashes and unsigned status are recorded
in the rc.3 release notes. No installation or publication is implied.

## Harness 0.2.0-rc.2 / AgentTeams 0.1.22 refresh classification — 2026-09-30

This remains the upstream migration classification; the rc.3 repair and its
current acceptance evidence are recorded above. The 0.1.7 and earlier sections below are
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
that first-run window. No additional live-provider, overnight-endurance or
installed-launcher acceptance results are claimed here. A later user-authorized
local build produced unsigned EXE, ZIP and blockmap assets and passed both packed
dependency closures. Actual installation now matches all 25,783 unpacked files
by size and SHA-256, with the installed dependency closure passing. An interrupted
installation succeeded with the same EXE after the user paused Kaspersky; the
specific interception rule is unconfirmed. After the source-only commit/push
checkpoint, the user confirmed the local build was ready and authorized a
GitHub prerelease on 2026-09-30. The same tested EXE, ZIP and blockmap are reused,
not rebuilt; their hashes, unsigned status and remote-asset verification belong
to `win-desktop/release-notes/v0.2.0-rc.2.md`. The full offline gate and both
packaged dependency closures were rerun before publication. Generated
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
| Native Models onboarding, account ordering, provider-card/footer slots, manual image/text-only choices, seven default reasoning choices and per-model subsets, invalid-value Save gates, draft-only bulk input and field preservation | `win-desktop/models-settings-plugin` | `UPSTREAM_EQUIVALENT + REAPPLY`; probes and automatic input are `SUPERSEDED_BY_DESIGN` by the 2026-10-01 user request. Provider-specific behavior stays outside Models. | `src/client/ModelRow.tsx`, `src/client/ModelReasoningLevels.tsx`, `src/client/model-reasoning.ts`, `src/client/model-input.ts`, `tests/model-reasoning.test.js`, `tests/model-input.test.js`, `tests/model-input-ui.test.js`, `tests/provider-profile.test.js`, `tests/output-link-safety.test.js`, `UPSTREAM.md` | `pnpm test`; wrapper manual model integration, installed artifacts, CPA integration and capability manifest |

## Desktop Settings owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Harness-native `扩展设置` section with stable desktop slot, theme-consistent window behavior and built-in web-tools Switch, immediate autosave/rollback and restart-required tool preference; password-encrypted portable provider/API-key and native/temporary/team configuration backup, authenticated Host operation, official Settings/CAS writes, guarded rollback and restart notice | `win-desktop/desktop-settings-plugin` plus wrapper bridge | Independent local desktop integration; wrapper activation and encrypted backup are REAPPLY | `desktop-settings-plugin/lib/client.js`, `desktop-settings-plugin/lib/backup.js`, `desktop-settings-plugin/lib/index.js`, `src/settings-window.js`, `src/desktop-settings.js`, `src/desktop-web-tools.js`, `src/win-hide-console-loader.mjs`, `src/dsh-service.js`, `src/preload.cjs` | wrapper `tests/desktop-settings-plugin.test.js`, `tests/desktop-settings.test.js`, `tests/desktop-web-tools.test.js`, `tests/configuration-backup.test.js` |

## Windows wrapper owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Wrapper-wide tool-call guidance: derive arguments from current schemas/context, omit unknown or blank optional properties unless empty is explicitly meaningful, and never repeat failed invalid arguments unchanged | `win-desktop/tool-call-guidance-plugin` | Independent local system-prompt plugin. It registers no tools, settings, Provider behavior, or lifecycle state and stays at or below 500 characters. | `tool-call-guidance-plugin/lib/index.js`, `package.json`, `src/dsh-service.js`, `config/agent-teams.patch.yml`, `scripts/sync-local-plugin-artifacts.mjs` | `tests/tool-call-guidance.test.js`, `tests/local-plugin-artifacts.test.js`, and the local capability manifest test |
| Shell and filesystem-mutation escalation normalization without weakening validation or real widening approval, hidden Node/sandbox console windows, loader injection and child-process guard | `win-desktop` | `UPSTREAM_EQUIVALENT + REAPPLY`: official Node hiding and hidden Win32 STARTUPINFO replace duplicate flags; retain runner preload inheritance, validator-first normalization, execSync/overload handling and process-local descendant inheritance through MCP-filtered environments. Preserve explicit visibility, native validation/coercion, caller options and unrelated environment flags; the lean preload must not register the Harness loader in Workers. | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs`, `src/win-hide-console.mjs`, `src/win-hide-console-child-process.cjs`, `src/win-hide-console-preload.cjs`, `src/dsh-service.js` | `tests/win-hide-console.test.js`, `tests/win-hide-console-descendants.test.js`, real Node/Electron/Pwsh/Bash/filesystem boundaries and `tests/dsh-service-syntax.test.js` |
| Official effective Profile editing, guarded single-write persistence, explicit retained desktop draft import, prompt byte preservation and new/old Team snapshots | `win-desktop/agent-teams-plugin` | `SUPERSEDED_BY_DESIGN`: official SettingsForms/ConfigEditor CAS replaces the separate desktop JSON write destination; the existing V2 cache is retained as an explicit draft source only. New Teams freeze the live Profile at creation; existing Teams and numbered roles keep their saved policy. Home/CLI refusal and malformed V2 rejection remain. | `src/index.ts`, `src/client/TeamProfilesEditor.tsx`, `src/client/profile-editor.ts`, `src/client/settings-write.ts`; wrapper `src/agent-teams-profile-store.js` legacy snapshot | wrapper `tests/agent-teams-profile-layering.test.js`, `tests/agent-teams-settings-save.test.js`, `tests/agent-teams-profile-store.test.js`; plugin `scripts/team-subagent-compat.test.mjs`, `scripts/settings-client-verify.mjs`, `scripts/profile-editor-verify.mjs` |
| Keep the official native Subagent plugin settings card and the local AgentTeams section separately visible, while retaining Host namespaces, saved settings, official runtime closure and AgentTeams spawn | Official Native client plus `win-desktop/agent-teams-plugin` | `SUPERSEDED_BY_DESIGN`: the user chose separate Native/Team responsibilities for 0.1.7. The old hiding transformer is removed; official initial and HMR bundle snapshots are unmodified. | `agent-teams-plugin/src/client/index.tsx`, `agent-teams-plugin/src/client/locales.ts`, `src/win-hide-console-rewrite.js` | `tests/subagent-settings-card-visibility.test.js`, `tests/agent-teams-integration.test.js`, and the local capability manifest test |
| Alpha.2 authenticated startup URL handoff and bounded loopback Cookie recovery: retain the complete canonical `http://127.0.0.1:<port>/?token=...` readiness URL, reject a bare loopback origin, never persist or document the process token, clear only stale `127.0.0.1` `dsh-auth-*` Cookies before the initial authenticated load, and recover once from a current-origin `/plugins/` HTTP 431 without a reload loop | `win-desktop` | `UPSTREAM_EQUIVALENT + REAPPLY`: Alpha.2 owns token issuance, cookie exchange, and clean-root redirect; the wrapper owns lossless capture of the official `dsh web:` URL plus the narrow cleanup required because Cookie scope does not isolate random ports. | `src/dsh-service.js`, `src/main.js`, `src/loopback-auth-cookies.js` | `tests/dsh-web-auth-url.test.js`, `tests/loopback-auth-cookies.test.js`, and the local capability manifest test |
| Browser-safe free loopback port selection and startup diagnostic token redaction | `win-desktop` | `REAPPLY`: TCP availability does not imply Chromium HTTP compatibility; skip restricted ports without disabling browser protections, close all probes and pass the chosen port to Harness. Readiness navigation keeps the full token while diagnostics redact it. | `src/loopback-port.js`, `src/dsh-service.js`, `src/main.js` | `tests/loopback-port.test.js`, authenticated startup regression, and the local capability manifest test |
| Provider-neutral `grep` argument alias normalization at the `dsh-llm-pi-ai` durable tool-call boundary, limited to a missing `pattern` plus an exact single-line `description: "pattern: <non-empty value>"` shape | `win-desktop` | `REAPPLY` until upstream performs an equivalent deterministic normalization. No provider/model routing or optional settings toggle owns this behavior; existing `pattern` values and every ambiguous malformed call remain under the strict upstream Schema. | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs` | `tests/grep-tool-argument-compatibility.test.js` and the local capability manifest test |
| Explicit bounded-period usage-limit exhaustion is classified as terminal `QUOTA` at the official `dsh-llm` boundary, while transient `RATE_LIMIT` and standalone reset notices remain non-terminal | `win-desktop` | `REAPPLY`: RC.1 recognizes unqualified `usage limit` wording but misses provider messages such as `weekly usage limit`; the wrapper adds only this narrow loader rewrite and retains the upstream classifier for every other phrase. | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs` | `tests/win-hide-console.test.js` and the local capability manifest test |
| Recovery of non-empty OpenCode tool streams that end without `finish_reason`, while incomplete streams still fail | `win-desktop` | Narrow compatibility rewrite over the installed OpenCode stream module | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs` | `tests/opencode-stream-rewrite.test.js` |
| Local plugin installation, patch graph, official in-memory profile resolution with a scoped wrapper installation anchor, compiled-local-plugin artifact synchronization, OpenCode model-catalog preparation, verified OpenCode protocol/image-capability reconciliation (static, persisted and live catalogs), including Kimi K3's tool-compatible first-request profile, official-client Schema lowering, provider-wide OpenCode Go session affinity, with manual validation removed by user request | `win-desktop` | `SUPERSEDED_BY_DESIGN + REAPPLY` for startup (official runtime resolver replaces physical profile links); `REAPPLY` for OpenCode until the pinned DSH/Pi catalog demonstrates equivalent per-model transport/capability coverage; known legacy modality mappings may correct only input capability, while unknown models retain text-only fallback. Every OpenCode Go model must receive `x-opencode-session` from the active Harness session, including with `cacheRetention: "none"`; generic providers remain unchanged. Kimi K3 must keep `supportsStrictMode: false`, reasoning-content replay, deferred-tool handling, and Kimi Schema normalization for ref siblings and tuple-style `items`. Do not infer an unknown model's protocol or retry a 500 over another endpoint. | `package.json`, `package-lock.json`, `scripts/sync-local-plugin-artifacts.mjs`, `config/agent-teams.patch.yml`, `src/dsh-service.js`, `src/model-fetcher.js`, `src/win-hide-console-rewrite.js`, `src/preload.cjs`, `src/settings-window.js` | `tests/heal-desktop-plugins.test.js`, `tests/local-plugin-artifacts.test.js`, `tests/model-fetcher.test.js`, `tests/opencode-stream-rewrite.test.js`, `tests/opencode-capabilities-integration.test.js`, and the local capability manifest test |

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
