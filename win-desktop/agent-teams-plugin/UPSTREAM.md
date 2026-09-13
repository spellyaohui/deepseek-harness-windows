# Upstream provenance

- Repository: `https://github.com/NanmiCoder/dsh-agent-teams.git`
- Package: `@nanmicoder/dsh-agent-teams@0.1.18`
- Tag: `v0.1.18`
- Source commit: `68fe529d602b1eea1f1ecaee99857d20a4f94be0`
- Imported: `2026-09-13`

## Local package identity

- Package name remains `@nanmicoder/dsh-agent-teams`.
- Desktop fork version is `0.1.18`.
- The Windows wrapper installs this directory through `file:agent-teams-plugin`.

## 2026-09-13 v0.1.18 / Harness 0.1.5-rc.1 refresh classification

- `UPSTREAM_EQUIVALENT`: use upstream 0.1.18 atomic roster/task planning,
  dormant members and lazy first-task activation instead of welcome-only model
  turns. The upstream mailbox owns next-model-step delivery, obsolete task
  message de-duplication, delivery receipts, and stale-attempt filtering.
- `UPSTREAM_EQUIVALENT`: use upstream descendant and queued-input cleanup for
  archive, removal and reassignment; retired-member cold-restore rejection;
  current-attempt recovery when `attempt_id` is omitted; unfinished-delivery
  guards; and the explicit `memberMaxDepth: 0` default.
- `REAPPLY`: the Windows durable-session gateway remains the single admission
  boundary around upstream start, queue/steer delivery, interrupt, retirement,
  descendant cleanup and drain primitives. It retains live-Agent resolution
  and per-child serialization without reimplementing the upstream mailbox.
- `REAPPLY`: role-level Provider/model/reasoning policy, strict V2 persistence,
  local quality contracts, shared model catalog, compact prompt, Profile
  editor, Team/Native policy, authenticated Web CAS routes, and desktop-only
  settings injects remain local because upstream still has no equivalent.
- Compatibility continues to recommend Harness `0.1.5-rc.1`; no Harness
  source, peer range, tarball pin or Models desktop cohort changed in this
  AgentTeams-only refresh.

## 2026-09-11 v0.1.17 / Harness 0.1.5-rc.1 refresh classification

- `UPSTREAM_EQUIVALENT`: upstream `0.1.5-rc.1` is the recommended host and
  supplies the modern subagent delivery contract, Session format v3, and the
  current conversation/navigation surfaces. The desktop fork consumes those
  paths instead of restoring RC.1 runtime code.
- `UPSTREAM_EQUIVALENT`: upstream `0.1.17` moves the activity panel, cards,
  badges, task nodes, plan controls, and dialogs to Harness semantic colors.
  The fork takes this source directly so light, dark, system, and custom themes
  update without a second theme store or light-only token bridge.
- `REAPPLY`: the Windows gateway admits every `deliverPrompt` queue/steer,
  start, message, interrupt, retirement, and drain operation through the same
  durable child-session lock. It also reads Team/Native markers from Session v3
  `system/message` while retaining only the legacy `request/header.system`
  read fallback for existing durable sessions.
- `REAPPLY`: role-level Provider/model/reasoning policy, strict V2 persistence,
  quality contracts, shared model catalog, compact prompt, Profile editor,
  Team/Native policy, authenticated Web routes, and desktop-only settings
  injects remain local because upstream does not provide equivalent behavior.
- Compatibility now recommends `0.1.5-rc.1` and retains the explicitly
  enumerated `0.1.2-rc.1`, `0.1.2-alpha.5`, and `0.1.2-alpha.2` legacy lines.
  All development host tarballs are pinned under `upstream/dsh-v0.1.5-rc.1`.

## 2026-09-07 refresh classification

- `UPSTREAM_EQUIVALENT`: `src/harness-compat.ts` host adapter, FIFO continuation, own session events, retired-member delivery guards, fallback persistence, notification-driven status guidance, bounded JSON Web bodies, parked member/attempt recovery, activity-panel UI improvements, and the RC.1 release contract (`compatibility.json`, doctor/compatibility scripts, `publishConfig.tag=next`, bounded host peers).
- `REAPPLY`: role-level provider/model/reasoning policy, strict V2 persistence, quality-gate extras, shared host model catalog, compact 3,500-character captain prompt, Team/Native routing, durable-session subagent gateway, Profile editor/desktop integration, the RC.1 `agent/created` selection adapter, extra settings/slots/remotes client injects, and offline RC.1 `file:` tarball development pins (including `@deepseek-ai/dsh` and `dsh-session-projection`) resolved as exact host versions.

## Intentional local differences

- Harness settings namespace and browser settings section.
- Role-level member provider/model/reasoning policy and Profile role-card editor.
- Versioned Team/Native routing policy persisted in Session v3 `system/message`,
  with a read-only legacy `request/header.system` fallback.
- Agent-scoped suppression of native delegation tools in Team mode.
- Strict Profile and Team `schemaVersion: 2` validation; older data remains on disk but is rejected and never migrated.
- Desktop integration and regression verification.
- Offline tarball development pins: `@deepseek-ai/dsh` and every local `dsh-*` `devDependency` stay `file:` paths under `upstream/dsh-v0.1.5-rc.1/tarballs`. `scripts/compatibility.mjs` treats the tarball filename version as the exact supported host so the publish contract can pass without a network install.
- `scripts/doctor.mjs` treats a same-host `-desktop.N` Models fork as the active 0.1.5 cohort, because the Windows wrapper replaces `@deepseek-ai/dsh-client-ui-settings-models` with the local editor fork.
- Extra settings injects and peers (`dsh-api-remotes`, `dsh-client-connection`, `dsh-client-ui-settings`, `dsh-client-ui-slots`, `dsh-settings`, `dsh-workspace`) remain because the Windows Profile editor and settings section consume them. Their peer ranges enumerate `0.1.5-rc.1 || 0.1.2-rc.1 || 0.1.2-alpha.5 || 0.1.2-alpha.2`.

## 2026-09-10 v0.1.16-rc.3 refresh classification

- `UPSTREAM_EQUIVALENT`: upstream existing-Team continuation guidance, fixed
  AgentTeams prompt/tool exposure, Web approval wake-up, and settled lock
  queue cleanup were adopted with focused regressions.
- `REAPPLY`: the Windows fork keeps its RC.1 host compatibility adapter,
  Team/Native routing policy, role-level Provider/model/reasoning selection,
  strict V2 and quality contracts, and durable-session subagent gateway.
  AgentTeams children receive the fixed member-scoped prompt through the local
  routing-policy lifecycle; no direct `ctx.subagents.*` path was introduced.
- The recommended host remains `0.1.2-rc.1`; the optional supported hosts stay
  `0.1.2-alpha.5` and `0.1.2-alpha.2`. No Harness dependency or tarball pin
  changed in this refresh.
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
  `dsh-v0.1.2-rc.1`, and ports the verified wait, identity-scoping,
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
  idle. The fixed RC.1 `dsh-llm-retry` package is a development-test
  dependency only; upstream experimental AgentTeams packages are not installed
  at runtime.
- `.desktop.2` makes ordinary delegation automatic and model-owned: Team names
  are generated when omitted, captain-planned task names/contracts are created
  by the Captain, and staged review is used only when the user explicitly asks
  to inspect a plan before startup. It also completes the local Revision/CAS
  migration across activity snapshots, browser mutations, Host validation and
  one-time Web approval credentials, and restores upstream `v0.1.15` Alpha.2
  Connection authentication plus Host/Origin checks for every raw Web route.
- The current `.desktop.7` release routes every continuable child start,
  follow-up, interrupt, retirement, and drain through one durable-session
  gateway. It resolves only the exact live Agent (rejecting stale or same-ID
  pseudo-handles) and serializes each child operation so a retirement race
  cannot reopen a settled member. Team deletion, task reassignment, approval
  failure, startup cleanup, and halt stop/drain now hold the same per-child
  lock through retirement, interrupt, and quiescence. The RC.1 `agent/created`
  adapter also keeps role Provider/model/reasoning selection authoritative for
  first, concurrent, and cold-resumed requests.
- `.desktop.6` makes each Profile role the authority for Provider, model, and
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
