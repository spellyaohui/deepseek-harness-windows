# Upstream baseline

- Package: `@deepseek-ai/dsh-client-ui-settings-models`
- Version/tag: `0.1.1-rc.2` / `dsh-v0.1.1-rc.2`
- Commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- Source directory: `packages/client/ui-settings-models`
- Imported: 2026-08-23
- Local desktop fork: `0.1.1-rc.2-desktop.6`

## Intentional desktop difference

This fork adds one additive client slot, `settings.models.card`, rendered inside
the Models settings page before the standard provider rows. The slot receives
the Models page's existing controller, snapshot, API and schema inject face.
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

Import the same upstream directory from a newer Harness tag, reapply only the
slot declaration/rendering, provider-neutral normalization seam, and the
provider-neutral model-input editor when upstream does not provide an
equivalent. Then run `pnpm typecheck` and `pnpm test`; the native CPA row,
model-input, and wrapper ownership regressions must remain green after every
refresh.
