# Upstream provenance

- Repository: `https://github.com/NanmiCoder/dsh-agent-teams.git`
- Package: `@nanmicoder/dsh-agent-teams@0.1.13`
- Tag: `v0.1.13`
- Annotated tag object: `d501d2dbd54b700307d86dde0ee9125ece769c81`
- Source commit: `912aae5225d3d85fa841a1b0c8a5c77021876c25`
- Imported: `2026-08-23`

## Local package identity

- Package name remains `@nanmicoder/dsh-agent-teams`.
- Desktop fork version is `0.1.13-desktop.1`.
- The Windows wrapper installs this directory through `file:agent-teams-plugin`.

## Intentional local differences

- Harness settings namespace and browser settings section.
- Live member provider/model/reasoning defaults.
- Versioned Team/Native routing policy persisted in `request/header.system`.
- Agent-scoped suppression of native delegation tools in Team mode.
- One-time migration from legacy Electron settings.
- Desktop integration and regression verification.

## Upgrade rule

Import a future upstream release into a fresh temporary checkout, compare it with this directory, reapply only the intentional local modules above, then run `pnpm build`, `pnpm verify`, and every `scripts/desktop-*-verify.mjs` gate before changing the recorded baseline.
