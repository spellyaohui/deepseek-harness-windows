# Upstream provenance

- Repository: `https://github.com/NanmiCoder/dsh-agent-teams.git`
- Package: `@nanmicoder/dsh-agent-teams@0.1.14`
- Tag: `v0.1.14`
- Annotated tag object: `637399ce6c4ef201284de05c79982e82b7a866b1`
- Source commit: `5fe388f1a30da7b1374294b25bd6f8ad74ab6aa5`
- Imported: `2026-08-27`

## Local package identity

- Package name remains `@nanmicoder/dsh-agent-teams`.
- Desktop fork version is `0.1.14-desktop.2`.
- The Windows wrapper installs this directory through `file:agent-teams-plugin`.

## Intentional local differences

- Harness settings namespace and browser settings section.
- Live member provider/model/reasoning defaults.
- Versioned Team/Native routing policy persisted in `request/header.system`.
- Agent-scoped suppression of native delegation tools in Team mode.
- One-time migration from legacy Electron settings.
- Desktop integration and regression verification.
- Path-stable virtual CSS module ids with generated-artifact verification.
- Windows PowerShell lock-fixture timing uses `[Threading.Thread]::Sleep(140)`.
- `.desktop.2` makes explicit member settings authoritative, treats blank
  non-explicit tool arguments as omitted, and adds actionable invalid-route
  errors.
- `.desktop.3` makes member task claims compatible with noisy tool arguments:
  members are instructed to send only `task_id`, while blank, whitespace, or
  self `assignee` values remain idempotent and attempts to claim as another
  actor are still rejected.
- The v0.1.14 staged-plan, named-profile, fallback, quality-gate, atomic
  approval, halt/resume, and activity-panel improvements are imported. The
  desktop fork keeps immediate execution as the default for ordinary
  AgentTeams requests; explicit `approval=required` and captain-planning
  profiles use the upstream staged review flow.
- The v0.1.14 model-directory injection is combined with the local
  `connection` and `settings` injections so the staged editor uses Harness's
  catalog without moving CPA-specific behavior into this plugin.
- The Windows wrapper owns a persisted `software-delivery` built-in and a
  browser settings editor for the complete upstream profile shape. The editor
  uses a narrow host IPC bridge; the host validates and stores JSON-safe maps,
  injects them into the startup patch after a restart, and falls back to the
  built-in map when stored entries are malformed. This local editor/persistence
  seam is `REAPPLY`; upstream profile execution remains the semantic authority.
- `scripts/clean-build.mjs` validates the package-local `lib` path by path
  component, which keeps the upstream clean-build guard working on Windows.

## Upgrade rule

Import a future upstream release into a fresh isolated worktree, classify every
registered capability in `../../docs/UPSTREAM_MAINTENANCE.md`, reapply or
migrate the intentional local modules above, then run `pnpm test` here and
`npm run verify:upstream` from `win-desktop` before changing the recorded
baseline.
