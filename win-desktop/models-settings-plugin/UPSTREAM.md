# Upstream baseline

- Package: `@deepseek-ai/dsh-client-ui-settings-models`
- Version/tag: `0.2.1-rc.2` / `dsh-v0.2.1-rc.2`
- Commit: `687f282e8625c6b8d11ff58211a90524be2e4317`
- Source directory: `packages/client/ui-settings-models`
- Imported: 2026-10-18
- Local desktop fork: `0.2.1-rc.2-desktop.1`


## 2026-10-18 upstream-first refresh (current)

Fixed Harness `0.2.1-rc.2` / `687f282e8625c6b8d11ff58211a90524be2e4317`,
AgentTeams `0.1.24-rc.1` / `33f29cd0ebebcd23b26877b224cd1c3406671034`.
Wrapper `0.2.0-rc.27`, AgentTeams `0.1.24-desktop.1`, Models `0.2.1-rc.2-desktop.1`,
Electron `44.7.0` (official lockfile), Superpowers `0.1.2` (unchanged v7 assets).
The older dated sections below are history, not instructions to restore retired code.

Local UI follow-up (2026-10-18): reuse official Button/Input/Switch controls and the
native Models select/textarea metrics and theme tokens. Models CSS remains the fixed
upstream stylesheet plus scoped input-action/hint additions; legacy duplicate layout
and reasoning styles are removed. AgentTeams Profile fields and Desktop Settings
follow the same native controls. Keep `win-desktop/tests/local-ui-styles.test.js`
and real Electron light/dark and narrow-layout checks when changing these surfaces.

| Registered capability group | Classification | Current owner and regression |
| --- | --- | --- |
| Per-model reasoning UI, Schema levels, wire mappings, native discovery/protocol/credentials/capacity editing, draft Save/Cancel/CAS | UPSTREAM_EQUIVALENT | Official Models and pi-ai; retained model-reasoning, model-list-upstream-runtime, provider-profile and native-provider-retention tests |
| Explicit reasoning switch-off and canonical text/image declarations | REAPPLY | Provider-neutral Models save helpers; explicit switch-off writes false, untouched absence inherits, valid image input always includes text, malformed input is retained for rejection; model-reasoning/model-input/native-provider-retention regressions |
| Read-only credential replacement controls | REAPPLY | Provider-neutral native editor respects CredentialInfo.writable for named/derived write refs; credential-only Apply is disabled while unrelated settings remain writable; real React provider-credentials regression |
| Automatic six effort defaults, deleting Off, CPA-specific normalizer/startup migration/package/editor hooks | SUPERSEDED_BY_DESIGN | Explicit user retirement; saved cpa routes and role bindings are ordinary native data. No migration or replacement normalizer. Historical CPA capacity/credential/model coverage moves to native-provider-retention and model integration tests |
| Managed child creation, cancellation cleanup, runtimeSetup restoration and resident HMR hydration | UPSTREAM_EQUIVALENT | Upstream AgentTeams adapter inside the durable gateway; managed-activation, team-subagent-compat and custom-member-routing tests |
| Cold captain restoration and immediate native activation result | SUPERSEDED_BY_DESIGN | Official resolveAgent and activation protocol; keep exact parent admission, return guidance and cold recovery regressions |
| Explicit/route-aware/target-default reasoning, frozen role model/prompt/tool inheritance, trusted Profile and temporary authority, strict V2, DAG/quality/audit/integration gates, compact status/mail receipts, polling guard, lifecycle admission and unique gateway | REAPPLY | Existing AgentTeams owners and all registered suites retained; no global model override, user migration or direct child bypass |
| Windows ordered lifecycle edges, state file read/replace queue, console/preload, escalation normalization, grep alias, bounded-period quota, authenticated token handoff, loopback/cookie recovery | REAPPLY | Existing wrapper/AgentTeams boundaries, real native/lock and loader anchor regressions |
| Native subprocess spawn/taskkill windowsHide | UPSTREAM_EQUIVALENT | Official subprocess implementation; existing native console tests retained |
| Manual text/image input validation/defaults, bulk actions, generated-output detachment | REAPPLY | Provider-neutral Models fork; model-input, model-input-ui, output-link-safety and model integration tests |
| Desktop Settings/backup/web opt-out, output-limit finish, compact tool guidance, fixed Superpowers assets, separate Native and AgentTeams cards, default Profile layer under Home/CLI | REAPPLY | Existing independent owners and full wrapper regressions retained |
| OpenCode, AUTO, capability probe, old Profile writer, native-card hiding and retired experimental auto-mounts | SUPERSEDED_BY_DESIGN | Remain absent; cumulative retention registry and capability manifest |

All other active rows in this registry retain their documented owners and regression
requirements as REAPPLY unless explicitly marked upstream-equivalent above. Registry
archives: [352 immutable inputs](../../docs/UPSTREAM_021_SOURCE_MANIFEST.md). The installed
closure is the dependency graph reachable from the desktop roots, not every source
archive. New CLI dependencies include experimental profile bundles; install their
exact dependencies without inserting those profiles into desktop startup. Dependency
preparation stays outside the offline, no-install, no-package regression gate.

Upgrade evidence is recorded in `win-desktop/release-notes/v0.2.0-rc.26.md`;
UI follow-up and the new local package are recorded in `win-desktop/release-notes/v0.2.0-rc.27.md`.
No installer, live gateway inference, real user configuration migration or publication
is implied by local fixture evidence.


Codex PR follow-up (2026-10-18): image-capable discovery and explicit Save use the same canonical text/image helper; malformed lists remain invalid. The official reasoning editor is unchanged except that an explicit switch-off writes `false`, while untouched absence remains inherited. Upstream master still deletes the field (latest file commit `7d654c9d8af9f1ac8d0d5874afcb6016ea94ee3a`, checked on this date), so keep this small local correction until an equivalent fix is proven. React handler and native pi-ai catalog tests distinguish both states; do not restore automatic six-level defaults or drop Off.

## Historical provenance


## 2026-10-07 public seam reassessment

No source or owner-version change. Classification remains REAPPLY for the smallest
provider-neutral manual-declaration/draft/Save fork. The existing
normalize-provider-profile seam is additive. The official provider display slot
exposes provider/configured/keyConfigured, not the parent draft updater or atomic
Save/CAS contract, so it is not an equivalent replacement for this fork. CPA-specific
normalization remains CPA-owned; no second ModelPicker or capability-probing service
is introduced. Models regressions pass against the installed official closure.
Historical probing sections below are superseded by the 2026-10-01 user-requested
replacement and must not be restored during refreshes.

## 2026-10-03 input-choice typography

The manual image/text-only labels now use the official Checkbox's 14px font size
and 20px line height, inheriting the Web shell's font family. Previously they
inherited the browser's 16px default. An isolated Electron comparison against
the official Checkbox and Web CSS confirms equal computed typography, correct
text/image selection, disabled controls, no horizontal overflow at 320/600px,
and no renderer errors. Model declarations and Save ownership are unchanged.

## 2026-10-01 manual declaration replacement

User-requested SUPERSEDED_BY_DESIGN: remove the network capability probe and Remote, replace auto image input with manual image/text-only choices, and offer seven default reasoning choices with per-model subsets. Keep provider-neutral draft/Save ownership, credential safety, malformed-value rejection, untouched fields, onboarding, discovery and output detachment. CPA retains manual subsets and defaults new models to text. Regressions now cover manual declarations through the official 0.2.0 catalog, rather than the retired probe. Older sections below record historical designs.

## 2026-09-30 capability Remote repair

The official source revision and runtime remain `0.2.0-rc.2` at the fixed
commit above. The local capability contribution now supplies strict-codec
`create()` factories required by the official Typert registry. Its descriptor
and Client `$mount` call use their actual TypeScript contracts without casts.
The provider-neutral ownership, late optional namespace lookup, draft-only
results, parent Save action, and credential boundary are unchanged.

The regression uses the official Cordis, Client Gateway, and TypertRegistry
with only the transport replaced. It proves mounting, probe routing, late
lookup, cancellation, disposal, and strict request/result validation. Models
52/52, CPA 27/27, AgentTeams, the runtime closure, and wrapper 150/150 passed
in the complete offline gate before packaging. Same-commit archive recovery
and immutable original records are described in
[`SOURCE_ARCHIVE_REBUILD_20260930.md`](../../docs/SOURCE_ARCHIVE_REBUILD_20260930.md).

## 2026-09-30 Harness 0.2.0-rc.2 refresh classification

- `UPSTREAM_EQUIVALENT`: the official 0.2.0 Models editor source is retained
  with its current onboarding, provider ordering, shared model row and catalog
  behavior. Do not reproduce upstream client features in this fork.
- `REAPPLY`: only provider-neutral image-input states, malformed-input save
  rejection, sequential cancellable draft probes, explicit overwrite, legal
  protocol compatibility fields, late Remote availability and generated-output
  detachment remain local. CPA, OpenCode and model-name rules stay outside.
- The fork builds against official 0.2.0 tarballs. All 50 Models tests pass
  in the complete wrapper offline gate.

## 2026-09-28 Harness 0.1.7-rc.2 refresh classification

- `UPSTREAM_EQUIVALENT`: use the complete new Models source, custom API
  onboarding, account-first provider ordering, current configForms/credentials,
  shared ModelRow, per-model inputTypes/catalog defaults and candidate search.
  The inherited catalog is read without materializing a model override.
- `REAPPLY`: keep provider-neutral auto/image/text-only semantics and the
  malformed-input save gate on the shared input-control seam; retain draft-only
  sequential capability/reasoning probing, cancellation, explicit overwrite,
  protocol-legal compat patches, normalization waterfall, late optional Remote
  lookup and byte-preserving prebuild detachment. No provider/model heuristic
  is introduced.
- Stored custom credentials retain `credentialRef` only in the Host capability
  probe request. The official discovery request stays on its own upstream wire
  contract, and a typed one-shot key still takes precedence without persistence.
- Host pins/locks now use only official 0.1.7 tarballs. Build/typecheck and all
  50 tests, including upstream UI/source and pure runtime-helper regressions,
  pass inside the complete wrapper `verify:upstream` gate.

## Intentional desktop difference

Alpha.2 replaces the rc.2 Models page with provider-card/footer slots, a new
Onboarding flow, and Remote-only client APIs. The desktop fork follows that
upstream design and contributes through `settings.models.provider-card` while
retaining the Models page's existing controller, snapshot, API and schema face.
It also exposes a provider-neutral `settings.models/normalize-provider-profile`
waterfall so an independent provider plugin can normalize its own profile just
before the native editor validates and persists it. No CPA rules live in this
fork; the CPA plugin is the only listener for provider `cpa`.

Provider-specific behavior does not belong in this fork. CPA behavior is owned
by the separate `@deepseek-ai/dsh-cpa-provider` plugin.

## 2026-09-11 Harness 0.1.5-rc.1 refresh classification

- `UPSTREAM_EQUIVALENT`: consume the official 0.1.5 client settings, slots,
  Remote, Session v3, and UI package graph rather than retaining 0.1.2 client
  artifacts.
- `REAPPLY`: retain only the provider-neutral image-input editor, draft-only
  capability probe, explicit-overwrite semantics, late Remote degradation, and
  generated-output detachment. CPA, OpenCode, WOYAOPRO, and model-name rules
  remain outside this fork.
- The wrapper owns the external-consumer closure for the official UI primitives
  package: its compiled imports are direct runtime needs in a flat Windows
  install, so the wrapper pins the exact 0.1.5 resolved packages. This does not
  add provider-specific behavior to Models.

The fork also owns the provider-neutral capability validation controls inside
the native model editor. The Host Remote uses the current explicit protocol
and credential seam to run bounded probes; the client applies only successful
or explicitly unsupported fields to the unsaved draft, preserves existing
values unless overwrite is selected, and supports sequential cancellation.
This is a shared seam for CPA, OpenCode, WOYAOPRO, CommandCode, and custom
routes; provider/model-name heuristics and protocol fallback remain outside
this package. Persist `compat.maxTokensField` only when the probe uniquely
accepts `max_tokens` or `max_completion_tokens`. The Responses wire field
`max_output_tokens` is protocol-local and must not be written into pi-ai
settings, because the schema rejects it on save and startup.

The capability Remote is an optional, late-mounted enhancement at the client
boundary. Its absence or delayed mount must never suppress the Models section,
provider editors, model rows, input-mode controls, or Save flow; only the
capability-probe controls degrade to an unavailable notice. The dedicated
Models-section availability regression owns this startup-order invariant.
Gateway registers every generated namespace as a separate Cordis
`remote.<namespace>` service. This fork therefore resolves the optional probe
with `ctx.get('remote.model-capabilities')` at action time instead of reading an
undeclared `ctx.remote` property. This matches the official Gateway tests'
optional namespace lookup while preserving page availability if the mount is
late or unavailable.

The desktop fork also owns a provider-neutral per-model image-input editor.
`auto` removes the model-level `input` override, `image` stores `['text',
'image']`, and `text-only` stores `['text']`. Invalid modality values block
save without filtering or downgrading the source row. The editor preserves
unrelated model fields, keeps unknown automatic models fail-closed, and its
provider-scoped bulk actions operate on the unsaved draft only. The dedicated
model-input tests, UI tests, and wrapper ownership regressions are part of the
refresh contract. Provider-specific normalization listeners may set Provider
defaults, but must preserve missing/empty model input as `auto` and leave
malformed input intact for this fork's shared save gate.

## Refresh rule

Import the same upstream directory from a newer Harness tag and first classify
the current provider-card/footer, Onboarding and Remote design. Reapply only
the provider-neutral normalization seam, model-input/reasoning capability
editor, late Remote degradation and generated-output safety when upstream does
not provide an equivalent. Then run `pnpm typecheck` and `pnpm test`; the
Alpha.2 base, native CPA row, model-input and wrapper ownership regressions
must remain green after every refresh.
