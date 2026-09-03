# Upstream provenance

- Repository: `https://github.com/NanmiCoder/dsh-agent-teams.git`
- Package: `@nanmicoder/dsh-agent-teams@0.1.15`
- Tag: `v0.1.15`
- Source commit: `232a338fc9a0d393f118912386f67e7f3a6c67d6`
- Imported: `2026-09-01`

## Local package identity

- Package name remains `@nanmicoder/dsh-agent-teams`.
- Desktop fork version is `0.1.15-desktop.4`.
- The Windows wrapper installs this directory through `file:agent-teams-plugin`.

## Intentional local differences

- Harness settings namespace and browser settings section.
- Role-level member provider/model/reasoning policy and Profile role-card editor.
- Versioned Team/Native routing policy persisted in `request/header.system`.
- Agent-scoped suppression of native delegation tools in Team mode.
- Strict Profile and Team `schemaVersion: 2` validation; older data remains on disk but is rejected and never migrated.
- Desktop integration and regression verification.
- Path-stable virtual CSS module ids with generated-artifact verification.
- Windows PowerShell lock-fixture timing uses `[Threading.Thread]::Sleep(140)`.
- `.desktop.2` makes explicit member settings authoritative, treats blank
  non-explicit tool arguments as omitted, and adds actionable invalid-route
  errors.
- `.desktop.3` makes ordinary captain-planning slash activation automatic and
  model-owned: the Captain creates the Team's generated name and task graph
  without a user naming/confirmation round. The staged Web editor is mutation
  disabled while the plan is still `building` or awaiting feedback, so only a
  `ready_for_review` snapshot can carry browser plan edits or approval.
- `.desktop.3` makes member task claims compatible with noisy tool arguments:
  members are instructed to send only `task_id`, while blank, whitespace, or
  self `assignee` values remain idempotent and attempts to claim as another
  actor are still rejected.
- `.desktop.4` makes any numbered member inherit the frozen unnumbered role
  template from the current Team. The role name and positive numeric suffix are
  discovered from the live Team roster rather than a provider or role
  whitelist; separators are accepted, explicit member settings still win, and
  unmatched or ambiguous role descriptions remain safe rather than choosing a
  random route.
- `.desktop.6` normalizes blank optional task strings before persistence so a
  non-GPT tool call cannot produce a Team that strict V2 validation rejects on
  the next read. It also makes captain-side deletion idempotent when no Team
  exists, without weakening strict V2 validation for real persisted state.
- `.desktop.7` makes the read-only `agent_teams_status` call return an inactive
  snapshot before the session creates or joins a Team. Participant-only task
  mutation and messaging tools retain their strict identity boundary. It also
  lets a running Team queue implementation behind an explicit active
  requirements dependency while preserving pass-before-dispatch gating.
- `.desktop.8` makes `agent_teams_edit_plan` return structured next-step guidance
  when a running Team is targeted, validates declared implementation/repair
  deliverables against `inScope`, preserves all three staged member reasoning
  modes without replaying non-explicit materialized effort or retaining an old
  explicit effort after switching modes, rejects malformed Host list payloads,
  round-trips and clears the complete staged quality contract through the
  Web/Host/durable boundary, and requires explicit no-change evidence without
  allowing empty `changedPaths` to hide declared deliverables.
- `.desktop.9` keeps those quality gates strict while making
  their rejection actionable: prose deliverable labels are directed to
  subject/description/acceptance, protected `.env`/secret/`.git` paths are
  explicitly explained as excluded, `captain` is accepted as the reserved
  captain-owned task alias, and blank assignees are normalized to the shared
  task pool. The upstream task engine remains the semantic owner; this is a
  local model-facing boundary and regression seam.
- `.desktop.10` compacts the captain protocol into a lifecycle-first state
  machine with a 3,500-character budget for the complete built-in Profile,
  while retaining reasoning, dependency, attempt/reassignment, quality,
  resume/delete, and deployment-confirmation contracts. At the create boundary,
  blank optional Profile input is omission and produces an ad-hoc Team; unknown
  non-empty names remain strict before durable writes or member spawning. This
  is provider-neutral input normalization, not a legacy-state migration.
- `.desktop.11` makes `agent_teams_status` read-only by default with a compact
  quality-preserving summary and unchanged-result heartbeat. Full task reports
  and stable route/profile details require `detail="full"`; scheduler recovery
  requires explicit `wake="recover"`. Normal creation, approval, task-update,
  and member-idle scheduling remains event-driven, and the status renderer is
  isolated in `src/status-render.ts` for future upstream conflict review.
- `.desktop.12` adapts the client, settings and activity surfaces to Harness
  `dsh-v0.1.2-alpha.2`, and ports the verified wait, identity-scoping,
  Revision/CAS and event-recovery structure needed by the desktop fork. It does
  not install the upstream experimental AgentTeams packages; role-level model
  authority, strict V2 state, quality gates and desktop Profile editing remain
  local owners with their existing regressions.
- `.desktop.1` is based on fixed upstream commit `232a338` / package `0.1.15`.
  It keeps blank optional-field normalization at new model-facing tool-write
  boundaries only, while strict V2 durable reads remain fail-closed. It also
  records final member `agent/error` failures against the current Team/member,
  task, attempt and `attemptId`, persists a bounded sanitized Captain report,
  and lets the existing scheduler continue only after the real child reaches
  idle. The fixed Alpha.2 `dsh-llm-retry` package is a development-test
  dependency only; upstream experimental AgentTeams packages are not installed
  at runtime.
- `.desktop.2` makes ordinary delegation automatic and model-owned: Team names
  are generated when omitted, captain-planned task names/contracts are created
  by the Captain, and staged review is used only when the user explicitly asks
  to inspect a plan before startup. It also completes the local Revision/CAS
  migration across activity snapshots, browser mutations, Host validation and
  one-time Web approval credentials, and restores upstream `v0.1.15` Alpha.2
  Connection authentication plus Host/Origin checks for every raw Web route.
- `.desktop.5` makes each Profile role the authority for Provider, model, and
  reasoning policy, removes global member-model/reasoning settings, and
  requires strict Profile/Team `schemaVersion: 2`. Older persisted documents
  are retained for user inspection but are rejected rather than loaded or
  migrated; the user must create a new Profile and Team.
- The v0.1.14 staged-plan, named-profile, fallback, quality-gate, atomic
  approval, halt/resume, and activity-panel improvements are imported. The
  desktop fork keeps immediate execution as the default for ordinary
  AgentTeams requests; explicit `approval=required` and captain-planning
  profiles use the upstream staged review flow.
- The v0.1.14 model-directory injection is combined with the local
  `connection` and `settings` injections so the staged editor uses Harness's
  catalog without moving CPA-specific behavior into this plugin.
- The Windows wrapper owns a persisted `software-delivery` built-in with
  `analyst`, `implementer`, `tester`, and `reviewer` role cards, plus a browser
  settings editor for the complete upstream profile shape. The editor uses a
  narrow host IPC bridge; the host validates and stores JSON-safe V2 documents,
  injects them into the startup patch after a restart, and rejects unsupported
  old documents without migration. This local editor/persistence seam is
  `REAPPLY`; upstream profile execution remains the semantic authority.
- CPA and OpenCode role routes continue to resolve from the shared Harness
  Provider/model catalog; this fork does not maintain a second catalog.
- `scripts/clean-build.mjs` validates the package-local `lib` path by path
  component, which keeps the upstream clean-build guard working on Windows.

## Upgrade rule

Import a future upstream release into a fresh isolated worktree, classify every
registered capability in `../../docs/UPSTREAM_MAINTENANCE.md`, reapply or
migrate the intentional local modules above, then run `pnpm test` here and
`npm run verify:upstream` from `win-desktop` before changing the recorded
baseline.
