# Repository rules

These rules apply to the entire repository. This is a public Windows wrapper
around upstream DeepSeek Harness packages plus independently owned local
plugins and compatibility rewrites.

## Repository safety

- Never commit credentials, Tokens, API keys, `.env` files, runtime sessions,
  `.agent-teams/`, logs, screenshots, exported conversations, installers,
  package output, or local upstream checkouts.
- Treat unknown tracked or untracked files as user-owned. Do not delete or
  overwrite them to make a merge, test, or package command succeed.
- Do not install, publish, package, or access the network as part of the
  upstream regression gate.

## Upstream refresh is a capability migration

Before importing a new upstream Harness or AgentTeams revision, read
`docs/UPSTREAM_MAINTENANCE.md` and classify every registered local capability:

- `UPSTREAM_EQUIVALENT`: upstream now implements the same observable behavior.
  Keep the local regression test and prove it passes against the upstream
  implementation before removing duplicate local code.
- `REAPPLY`: upstream does not implement the capability. Reapply the smallest
  compatible local patch and retain its owning plugin and regression tests.
- `SUPERSEDED_BY_DESIGN`: upstream changes the architecture, but the user-facing
  requirement still exists. Document the replacement ownership and migrate the
  existing regression before removing the old implementation.

Never delete a local plugin, dependency, settings section, rewrite, test, or
provenance record merely to resolve an upstream conflict. A clean merge is not
evidence that the local capability is preserved.

## Capability ownership boundaries

- AgentTeams owns subagent member defaults, explicit/route-aware reasoning,
  shared model-catalog consumption, Team/Native routing, and task lifecycle.
- CPA owns CLIProxyAPI address/credential handling, model discovery, reasoning
  vocabulary, per-model context/output capacities, and the native-provider
  profile normalization seam. CPA must not register a second visible Models
  card; the single native `CPA / CLIProxyAPI` row owns its editor chrome.
- The Models settings fork owns the provider-neutral native editor and its
  additive slot/normalization seam; it must not contain CPA-specific rules.
- Desktop Settings owns the Harness-native `桌面` settings section and window
  behavior bridge.
- Session Markdown owns continuation export ordering, lineage, sanitization,
  and the header action.
- The Windows wrapper owns shell normalization, hidden-console behavior,
  OpenCode stream recovery, plugin mounting, and startup integration.

## Release `v0.1.1-rc.10` interaction invariants

- CPA appears once in “设置 → 模型”, through the native configured-provider
  row. The expandable native editor must retain API address, Token, model
  discovery, model selection, text/image input modalities, raw context/output
  capacities, and model-specific R reasoning levels.
- The `桌面` section has no save button. Changing close behavior immediately
  persists through the existing IPC bridge, disables the selector while the
  write is pending, announces success, and restores the prior committed value
  on failure.
- Every future upstream refresh must classify these behaviors as
  `UPSTREAM_EQUIVALENT`, `REAPPLY`, or `SUPERSEDED_BY_DESIGN`, retain their
  regressions, and run `npm run verify:upstream` before packaging.

Do not collapse these owners into one plugin during conflict resolution. Do not
move provider-specific behavior into the Models fork.

## Version and provenance synchronization

When an owner changes, update its package version, wrapper dependency and
lockfile entry, integration assertions, README version text, and `UPSTREAM.md`
or maintenance registry in the same change. Never update provenance before the
new source and regression evidence are available.

## Mandatory acceptance gate

From `win-desktop`, run:

```powershell
npm run verify:upstream
```

The gate must pass before accepting an upstream refresh, updating provenance,
or building release artifacts. Do not weaken or skip a failing regression to
make the gate green. If ownership moves upstream, preserve the regression and
point it at the new implementation.
