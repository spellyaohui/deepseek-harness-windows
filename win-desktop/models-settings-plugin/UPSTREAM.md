# Upstream baseline

- Package: `@deepseek-ai/dsh-client-ui-settings-models`
- Version/tag: `0.2.0-rc.2` / `dsh-v0.2.0-rc.2`
- Commit: `639ed015397290b3745d163aafe02ffee4aa3f84`
- Source directory: `packages/client/ui-settings-models`
- Imported: 2026-09-30
- Local desktop fork: `0.2.0-rc.2-desktop.4`

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
