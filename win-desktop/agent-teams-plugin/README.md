<p align="right">
  <strong>English</strong> · <a href="./README_ZH.md">简体中文</a>
</p>

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="dsh-agent-teams turns one DeepSeek Harness session into a coordinated multi-agent team">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nanmicoder/dsh-agent-teams"><img src="https://img.shields.io/npm/v/@nanmicoder/dsh-agent-teams.svg" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@nanmicoder/dsh-agent-teams.svg" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-plugin-202724" alt="DeepSeek Harness plugin">
</p>

## One prompt. A working team.

`dsh-agent-teams` turns the current DeepSeek Harness session into a captain that can assemble durable sub-agents, split a goal into dependency-aware tasks, and coordinate work through direct messages.

Ask in natural language. The plugin provides the team protocol, ten coordination tools, persistent state, an automatic shared-task scheduler, and a live Web UI—without requiring a separate workflow engine.

<p align="center">
  <img src="./assets/ui.png" width="100%" alt="DeepSeek Harness conversation with the AgentTeams live activity panel, members, tasks, dependencies, and reports">
</p>

## Releases

Read the [latest release notes](https://github.com/NanmiCoder/dsh-agent-teams/releases/latest) or browse the [complete release history](https://github.com/NanmiCoder/dsh-agent-teams/releases). The same Markdown notes are included in the npm package under `release-notes/`.

### v0.1.15-desktop.7

- Keeps interrupt and drain inside one per-child durable-session lock, so a new delivery cannot slip between a stop request and quiescence.
- Adds a concurrent stop/drain regression while preserving exact-live-Agent admission and the RC.1 role-level Provider/model/reasoning route.

### v0.1.15-desktop.6

- Routes Team deletion, task reassignment, approval-failure cleanup, and startup cleanup through the same per-child durable-session gateway lock.
- Adds a real interleaving regression proving an in-flight child delivery settles before Team archival and later cold resume remains denied.

### v0.1.15-desktop.5

- Routes every continuable child start, follow-up, interrupt, retirement, and drain through one durable-session gateway.
- Rejects stale/same-ID pseudo-handles and retired children before dispatch, while per-child locks serialize delivery and cleanup.
- Keeps role-level Provider, model, and reasoning policy authoritative under RC.1 `agent/created` for first, concurrent, and cold-resumed requests.

### v0.1.15-desktop.4

- Numbered members inherit the frozen unnumbered role template from the current Team, so any configured role can keep its Provider, model, and reasoning policy as the numeric suffix grows.
- Hyphen, underscore, and space separators before positive numeric suffixes are supported; explicit member settings still take precedence and ambiguous role-description matches fail closed.
- Added pure policy and real lifecycle regressions for numbered role families, high suffixes, explicit overrides, and unmatched custom roles.

### v0.1.15-desktop.3

- Makes ordinary captain-planning slash activation automatic and model-owned: the Captain generates the Team name and task graph without asking the user to name or confirm a task.
- Disables staged Web member/task mutation and approval while the plan is still `building` or awaiting feedback; only `ready_for_review` snapshots may carry browser edits or approval.
- Adds lifecycle and client packaging regressions for both boundaries while preserving the Alpha.2 Web/CAS, strict V2, quality-gate, and per-role model contracts.

### v0.1.15-desktop.2

- Defaults ordinary delegation to automatic startup with generated Team names and Captain-owned task planning; staged Web review is reserved for an explicit user request.
- Carries `planRevision` from activity snapshots through every staged browser mutation and Web approval, with Host-side CAS and one-time approval credentials.
- Restores Alpha.2 Connection authentication and Host/Origin checks on raw AgentTeams Web routes, with real HTTP regression coverage.

### v0.1.15-desktop.1

- Refreshes the fork's upstream provenance to fixed AgentTeams commit `232a338fc9a0d393f118912386f67e7f3a6c67d6` / package `0.1.15`.
- Normalizes blank optional task fields only at new model-facing tool-write boundaries; strict V2 durable reads still reject malformed or legacy state without migration.
- Settles only final member `agent/error` events against the current Team/member/task attempt, stores a bounded sanitized Captain report, and resumes independent scheduling only after the real child becomes idle.
- Keeps the Alpha.2 client seams, per-role Provider/model/reasoning policy, strict V2 state, quality gates, and no runtime dependency on experimental AgentTeams packages.

### v0.1.14-desktop.11

- `agent_teams_status` defaults to a read-only compact summary and never wakes members or acknowledges mail. Use `detail="full"` for complete task reports, provider/model evidence, or profile protocol; set `acknowledge=true` only after processing displayed mailbox entries; use `wake="recover"` only for a captain after restart or clearly stuck ready work/mail.
- Unchanged status results collapse to a small heartbeat while preserving quality-critical task/dependency/attempt/verdict/findings, coverage, delivery, and mailbox state. Normal creation, approval, task-update, and idle-edge scheduling remains event-driven.

### v0.1.14-desktop.10

- The captain system guidance is now a lifecycle-first state machine. The complete built-in `software-delivery` prompt is 3,353 characters and retains approval, reasoning-route, dependency, attempt/reassignment, quality, halt/resume, cleanup, and deployment-confirmation rules.
- Missing, empty, or whitespace-only optional `profile` values create the same ad-hoc Team and never select a default Profile.
- Unknown non-empty Profile names still fail before durable state creation or member spawning; the create-tool schema lists current configured names and tells models to omit the property otherwise.

### v0.1.14-desktop.9

- `agent_teams_create_task` accepts `captain` as the captain-owned task alias and normalizes blank assignees to the shared pool; other names still require an active member.
- Deliverable failures now explain the required workspace-relative POSIX path and direct abstract outcomes to task prose.
- Protected `.env`, secret, and `.git` paths remain excluded, with explicit safe-boundary guidance.

### v0.1.14-desktop.8

- A running Team now returns structured next-step guidance when `agent_teams_edit_plan` is called by mistake; the approved plan remains immutable and no tool exception is raised.
- An approval-like turn with no staged Team now returns inactive guidance instead of a tool exception; the tool never creates state implicitly and points to `agent_teams_create` only when the user actually wants AgentTeams.
- The staged member editor preserves `target-default`, `route-aware`, and `explicit` reasoning authority; switching away from `explicit` clears the old explicit effort.
- Staged task editing can replace the complete quality contract, including task kind, objective, scope, acceptance, verification commands, deliverables, and coverage; the Host rejects non-string list items while empty lists explicitly clear fields.
- Implementation/repair deliverables must be covered by `inScope`; empty `changedPaths` requires `noChangesReason` and cannot hide declared deliverables.

### v0.1.14-desktop.7

- Make `agent_teams_status` a clean read-only probe before the caller has created or joined a Team; it returns `active: false` instead of a red participant error.
- Keep `agent_teams_claim_task`, `agent_teams_update_task`, and `agent_teams_send_message` strict so inactive sessions cannot mutate Team state or impersonate members.
- Allow a running Team to queue an implementation behind an active requirements task when the dependency is explicit; scheduling still waits for requirements to complete with `verdict=pass`.

### v0.1.14-desktop.6

- Normalize blank optional task strings before persistence so non-GPT tool calls cannot create a Team that strict V2 validation cannot read back.
- Make `agent_teams_delete` idempotent before the captain has created a Team, returning a clean no-op instead of a red tool error.
- Keep strict V2-only Profile/Team loading and role-level Provider/model/reasoning authority; no legacy migration layer was added.

### v0.1.14-desktop.5

- Configure each member's Provider, model, and reasoning policy in its Profile role card.
- Global member-model and reasoning settings are no longer supported.
- Profile documents and Team state require `schemaVersion: 2`. Older data remains on disk but is rejected rather than loaded or migrated; create a new Profile and Team.
- CPA and OpenCode models continue to use the shared Harness catalog.

## Why AgentTeams?

| Capability | What it changes |
| --- | --- |
| **Captain-led delegation** | The current session creates the team, assigns roles, and consolidates the final result. |
| **Durable members** | Members are continuable DSH sub-agents that can be woken for focused follow-up turns. |
| **Dependency-aware tasks** | Tasks move through explicit states and cannot be claimed before their dependencies finish. |
| **Automatic reuse and safe takeover** | Idle members claim the next ready task; reassignment revokes stale attempts before new work starts, and cold recovery retries stranded open attempts. |
| **Direct messaging** | Members send durable mailbox messages directly to teammates or the captain—no relay required. |
| **Live activity panel** | The Web UI combines segmented progress, a collapsible roster, and an interactive task DAG; completed archives retain their full member and task history. |

The conversation card and activity panel use Harness's official locale service. They follow live language changes between English and Simplified Chinese—including status labels, dynamic summaries, controls, archive markers, and accessibility text—without a page reload or a separate plugin setting.

## Install

> [!NOTE]
> Requires an existing [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) installation.

### npm

```sh
dsh plugin --profile web add @nanmicoder/dsh-agent-teams@latest
```

### Build from source

```sh
git clone https://github.com/NanmiCoder/dsh-agent-teams.git
cd dsh-agent-teams
pnpm install
pnpm build
dsh plugin --profile web add .
```

Run `pnpm build` again after changing the source. The local plugin install remains linked to this checkout.

Validate the composed profile, restart DSH, and refresh the Web UI:

```sh
dsh --profile web --dump-config
dsh web
```

Then ask for a team directly:

> Use AgentTeams to review the commits after v0.5.3 from performance, security, and product perspectives. Return one consolidated report.

## How it works

1. The current session creates a team and becomes its captain.
2. The captain adds role-specific members backed by continuable sub-agents.
3. The goal becomes tasks with owners and explicit dependencies.
4. The shared scheduler uses real `running / idle / ready` state to atomically claim one ready task per idle member and wake it. An interrupted resident attempt stays parked and can resume through a direct message without losing its capability; after a cold process restart, the scheduler retries stranded open work with a fresh attempt.
5. Members update with the current `attempt_id`; reassignment or captain takeover revokes the old attempt and waits for the old worker to quiesce before a new attempt starts.
6. The captain presents the combined result, then archives the complete team record.

Team state is stored under `<workspace>/.agent-teams/`; the Web panel reads that disk truth and combines it with live sub-agent activity.

Member creation follows the role policy resolved from the active Profile. Each role card carries its own `provider`, `model`, `reasoning_mode`, and optional `reasoning_effort`; the resolved route and effort are snapshotted for later continuations. The built-in `software-delivery` Profile provides `analyst`, `implementer`, `tester`, and `reviewer` roles with `reasoning_mode: target-default`. Profile changes are injected before startup and require a restart before they apply to new teams.

## Slash command

No “use AgentTeams” phrasing required. The plugin registers the
closed-namespace `/agent-teams` host command, so the Web GUI slash menu shows
an `agent-teams` placeholder with an input hint: pick it (or type the
command), describe the goal, and press Enter.

```
/agent-teams research the pricing pages of three competitors
```

The command pipeline claims the line, then preserves that exact input as an
ordinary user follow-up so it remains visible in the main chat. The gesture
boundary adds the deterministic activation directive at pre-step, so the
captain protocol still starts immediately. The invocation is also durably
logged (`command/run` / `command/done`).

Surfaces without command adjudication (for example the headless CLI) get the
same deterministic activation through a gesture boundary: any genuine user
message starting with `/agent-teams` activates the protocol for the rest of
the text. Mid-sentence mentions stay ordinary prose.

## Configuration

Defaults work without extra setup. A trusted Profile can define role-level member behavior:

```yaml
- id: agent-teams
  config:
    stateDir: .agent-teams
    memberProvider: spawn
    memberMaxDepth: 1
    maxMembers: 8
    profiles:
      software-delivery:
        schemaVersion: 2
        members:
          - name: analyst
            role: Requirements analyst
            reasoning_mode: target-default
          - name: implementer
            role: Implementation engineer
            reasoning_mode: target-default
          - name: tester
            role: Verification engineer
            reasoning_mode: target-default
          - name: reviewer
            role: Code and risk reviewer
            reasoning_mode: target-default
```

`memberProvider` is the sub-agent runtime backend (`spawn` / `fork`), not an LLM provider. For each Profile role, set a paired `provider` + `model` when routing to a specific catalog entry, then choose `reasoning_mode` as `target-default`, `route-aware`, or `explicit`; `explicit` requires `reasoning_effort`. The role card is the source of truth, and no global member model or reasoning override is available.

`slashCommand: false` disables the deterministic `/agent-teams` activation surfaces (slash command and gesture boundary), leaving the natural-language trigger as the only entry point.

## Boundaries

- One captain leads one active team at a time.
- Idle members with no open task are automatically reused for ready work. An idle member that still owns an open attempt is parked until messaged or explicitly reassigned; messages that cannot be delivered live remain durable and are retried at a later status boundary.
- State is file-backed and serialized within one DSH process; concurrent processes editing the same team are not coordinated.
- The activity panel reports persisted state as-is. Models may occasionally finish work without performing the expected task-state update.

See [docs/usage.md](./docs/usage.md) for the full tool reference, state model, Web UI behavior, configuration, and known limits.

## Plugin development Skill

The repository also ships the open Agent Skills package [`dsh-plugin-development`](./skills/dsh-plugin-development/SKILL.md):

```sh
npx skills add NanmiCoder/dsh-agent-teams --skill dsh-plugin-development
```

## Documentation

| Guide | Covers |
| --- | --- |
| [Usage](./docs/usage.md) | Architecture, UI behavior, tools, configuration, limits, and validation |
| [Verification](./docs/verification-guide.md) | Offline, composition, real e2e, and GUI verification |
| [Plugin development](./docs/developing-dsh-plugins.md) | Human-readable guide built from this plugin |
| [README writing](./docs/readme-writing-guide.md) | Repository documentation conventions |

## Development

```sh
pnpm install
pnpm build
pnpm verify
```

## License

[MIT](./LICENSE)
