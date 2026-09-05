# Upstream baseline

- Package: `@deepseek-ai/dsh-client-ui-settings-models`
- Version/tag: `0.1.2-rc.1` / `dsh-v0.1.2-rc.1`
- Commit: `0a53fb55bea101816fa226bb964ae2bed71c343b`
- Source directory: `packages/client/ui-settings-models`
- Imported: 2026-08-31
- Local desktop fork: `0.1.2-rc.1-desktop.1`

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

The fork also owns the provider-neutral capability validation controls inside
the native model editor. The Host Remote uses the current explicit protocol
and credential seam to run bounded probes; the client applies only successful
or explicitly unsupported fields to the unsaved draft, preserves existing
values unless overwrite is selected, and supports sequential cancellation.
This is a shared seam for CPA, OpenCode, WOYAOPRO, CommandCode, and custom
routes; provider/model-name heuristics and protocol fallback remain outside
this package.

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
