# Upstream baseline

- Package: `@deepseek-ai/dsh-client-ui-settings-models`
- Version/tag: `0.1.1-rc.2` / `dsh-v0.1.1-rc.2`
- Commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- Source directory: `packages/client/ui-settings-models`
- Imported: 2026-08-23

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

## Refresh rule

Import the same upstream directory from a newer Harness tag, reapply only the
slot declaration/rendering and provider-neutral normalization seam, then run
`pnpm typecheck` and `pnpm test`. The native CPA row regression must remain
green after every refresh.
