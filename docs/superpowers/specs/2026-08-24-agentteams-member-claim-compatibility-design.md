# AgentTeams member claim compatibility design

Status: approved
Date: 2026-08-24
Target: `win-desktop/agent-teams-plugin`

## Problem

The scheduler atomically pre-claims a ready task, creates its `attempt_id`, and
then wakes the selected member. The member performs an idempotent
`agent_teams_claim_task` call to observe that same capability before updating
the task.

Real CPA sessions show members repeatedly supplying the optional `assignee`
field even when their reasoning says it is omitted. Observed values include
the member's own name, an empty string, and `captain`. The current tool rejects
every member call where the property exists, so harmless model argument noise
blocks the entire assignment handshake.

## Evidence

- The live task was already `claimed` for `case-investigator` and carried the
  scheduler-created attempt id.
- Raw tool calls contained `assignee: "case-investigator"`, `assignee: ""`,
  and `assignee: "captain"`.
- The installed and worktree AgentTeams version was `0.1.13-desktop.2`.
- CPA transport retries also failed independently; this design does not claim
  to repair that separate network/upstream failure.

## Options considered

1. Prompt-only correction. Smallest change, but remains vulnerable when a
   model fills optional properties despite the instruction.
2. Prompt correction plus a narrow compatibility normalization. Recommended:
   preserves the handshake and authorization while accepting harmless empty or
   self-assignee noise.
3. Remove the idempotent member claim call after scheduler dispatch. More
   invasive and weakens the existing capability-observation contract and its
   lifecycle coverage.

## Decision

Keep the scheduler pre-claim and member idempotent confirmation.

For a member caller:

- Missing `assignee`, an empty/whitespace-only value, or the caller's own name
  are equivalent and use the caller identity.
- `captain` and every other member name remain rejected.
- Authorization remains before the idempotent return.

For a captain caller, existing explicit `assignee` behavior remains unchanged.

Strengthen both the member persona and automatic assignment prompt with an
exact call shape that contains `task_id` only and says never to send
`assignee` from a member.

## Version and packaging

- Release the local fork as `0.1.13-desktop.3`.
- Update desktop lockfile and installed-package assertions.
- Rebuild and synchronize only the package's published files into the desktop
  `node_modules` copy before packaging.
- Do not edit the currently running team state or retry its failed tasks.

## Tests

Regression coverage must prove:

1. A scheduler-preclaimed member task is idempotently observed with only
   `task_id`.
2. Empty and whitespace `assignee` values behave like omission.
3. The member's own name behaves like omission.
4. `captain` and another member name are rejected.
5. The automatic prompt contains the exact task-id-only call instruction.
6. Existing races, stale-attempt handling, captain reassignment, and scheduler
   lifecycle tests continue to pass.

## Acceptance criteria

- The screenshot's repeated member claim error cannot be reproduced with the
  observed empty/self argument variants.
- Members still cannot claim on behalf of another identity or the captain.
- Plugin and desktop suites pass and the packaged app contains
  `0.1.13-desktop.3`.

