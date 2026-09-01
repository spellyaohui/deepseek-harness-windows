# AgentTeams 232a338 Selective Refresh Design

## Goal

Move the useful post-`v0.1.15` AgentTeams changes from fixed upstream commit
`232a338fc9a0d393f118912386f67e7f3a6c67d6` into the maintained Windows fork
without replacing the fork, weakening strict V2 state, or losing local
Profiles, role-owned model selection, trusted staged approval, plan CAS,
quality gates, compact status, and native Subagent spawning.

## Fixed sources

- Published Alpha.2 compatibility release: `v0.1.15`, commit
  `da2e2e49242c6ecd7e801a74dba0c8268a0a2f81`.
- Optional-field fixes: PR #109, merge commit
  `9848c52e8c5df4f4ee49febd84b319c5e26fd9d7`.
- Final member-failure bridge: PR #110, merge commit
  `232a338fc9a0d393f118912386f67e7f3a6c67d6`.
- Harness runtime remains the already validated fixed
  `dsh-v0.1.2-alpha.2` closure at
  `0a53fb55bea101816fa226bb964ae2bed71c343b`.

The wrapper must not install `@nanmicoder/dsh-agent-teams@latest`. The local
fork remains the runtime Owner and selectively reapplies observable behavior.

## Owner classification

| Upstream slice | Classification | Local treatment |
| --- | --- | --- |
| `v0.1.15` Alpha.2 client imports, injection, Web routes, authentication and Origin fence | `UPSTREAM_EQUIVALENT` | Keep the local Alpha.2 contract and route regressions; do not replace the fork. |
| PR #109 blank optional tool values | `REAPPLY` | Normalize blank optional values before validation/persistence and retain invalid non-string values for strict validation. |
| PR #109 durable-read cleanup of previously dirty Team records | `SUPERSEDED_BY_DESIGN` | Do not migrate or repair old Team files. Strict schema V2 rejection remains authoritative. |
| PR #110 final member turn failure settlement | `REAPPLY` | Bridge final `agent/error` into the current attempt, Captain notification, member release, and scheduler continuation. |

## PR #109 input contract

One pure helper normalizes only new tool payloads:

- optional scalar strings become absent when blank or whitespace-only;
- optional string arrays drop blank string entries and become absent when no
  entries remain;
- non-string array entries remain present so the strict validator rejects the
  malformed payload instead of silently filtering it;
- a blank optional finding `file` is omitted;
- `profile: ""` and blank `assignee` keep their existing no-Profile/shared-pool
  semantics;
- staged Web mutations retain their explicit empty-array means clear contract.

The helper is applied to model-facing `agent_teams_create_task` and completion
payloads before validation and persistence. It is not called by
`coerceTeamState`, `readTeam`, or any durable recovery path.

## PR #110 member failure contract

`spawnMember` subscribes to the child Agent's final `agent/error` event. The
event is authoritative only after Harness request recovery is exhausted;
request-error/fallback events must never settle a task.

At the event boundary the plugin synchronously captures:

- Captain session id;
- Team id;
- member name and child session id;
- the current claimed/in-progress task id, attempt number and `attemptId`.

Under the Team lock, the bridge writes failure only if all captured identities
still match current durable state. A stale event after reassignment, retry,
member removal, Team replacement, or attempt replacement is a no-op.

For a current attempt the bridge:

1. marks the task `failed` with a sanitized bounded summary;
2. clears the attempt capability through the existing terminal-state rules;
3. releases the durable member from `working` to `idle`;
4. appends the existing task/member activity events;
5. writes one new Captain mailbox entry and injects one Team message into the
   live Captain without exposing credentials, prompts, stack traces, or raw
   provider payloads;
6. waits for the child driver to become genuinely idle and then asks the
   scheduler to continue unrelated ready work.

The bridge never automatically retries the failed task. Captain-controlled
reassignment/retry and attempt-CAS remain authoritative.

## Dependency boundary

`@deepseek-ai/dsh-llm-retry` may be declared only as a fixed Alpha.2
development dependency when the regression imports its real retry policy. It
must resolve from the ignored fixed tarball closure and must not become a new
packaged AgentTeams runtime dependency.

## Verification

The change must prove:

- blank scalar/list tool values cannot brick a newly written strict V2 Team;
- malformed non-string list entries are rejected, not filtered;
- an old/invalid Team document remains rejected without migration;
- intermediate request retries do not fail a task;
- one final member error fails only the matching current attempt;
- duplicate and stale final errors are idempotent no-ops;
- Captain notification is sanitized and emitted once;
- member release happens only after actual child idleness;
- unrelated ready work continues while dependencies of the failed task remain
  blocked;
- trusted staged approval, Profiles, role model/reasoning ownership, compact
  status and all previous lifecycle/quality/stress tests remain green.

## Release identity

After source and regressions pass, the local package becomes
`0.1.15-desktop.1`. Version, wrapper lock metadata, integration assertions,
README, `UPSTREAM.md`, maintenance registry and release notes move together.
No installer, commit push, tag, GitHub Release, or asset upload is part of this
increment.
