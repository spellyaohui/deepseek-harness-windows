# AgentTeams 0.1.18 Upstream-First Migration Design

## Approved intent

The direct user instruction is the design authority: follow the AgentTeams
plugin's recommended Harness host, prefer upstream fixes wherever they overlap
local patches, and reapply only local capabilities that upstream still lacks.

## Fixed baselines

- AgentTeams source: `v0.1.18` at
  `68fe529d602b1eea1f1ecaee99857d20a4f94be0`.
- Recommended Harness host: `0.1.5-rc.1`.
- Current desktop baseline: the existing uncommitted `0.1.17` / Harness
  `0.1.5-rc.1` migration in this working tree.
- No Harness upgrade is required because the plugin recommendation did not
  change.

## Migration architecture

Import the upstream `0.1.17..0.1.18` source and regression changes into the
local fork first. At every overlap, keep the upstream scheduling and lifecycle
implementation as the behavioral owner, then wrap it with the narrowest local
compatibility seam needed by the desktop fork.

Upstream owns the new atomic plan creation, lazy member start, next-model-step
message delivery, stale-message de-duplication, descendant and queued-input
cleanup, retired-member cold-restore rejection, missing-attempt recovery, and
the default depth change. The local fork continues to own role-level
provider/model/reasoning selection, strict V2 state, local quality contracts,
Team/Native routing, authenticated Web mutations, Profile integration, and the
single durable-session subagent gateway.

The gateway must adapt to upstream queue/steer/cleanup primitives rather than
forking those primitives. Every continuable child operation remains admitted
through one live-agent resolution and per-child serialization boundary.

## State and compatibility

The dormant-member representation introduced by upstream is accepted in new
`0.1.18` Team state. Existing strict V2 validation remains fail-closed for
malformed or legacy documents. No migration may reinterpret saved role
provider/model/reasoning policy. The recommended host and all offline tarball
pins remain `0.1.5-rc.1`.

## Verification and delivery

Port upstream focused tests before the implementation they guard, retain every
local regression, build generated plugin output, and run the complete offline
`win-desktop/npm run verify:upstream` gate. After it passes, build the Windows
EXE/ZIP/blockmap with `npm run dist:win`, verify packaged dependency closure,
record SHA-256 and Authenticode status, and leave all artifacts untracked.

No commit, push, tag, GitHub Release, upload, install, or cleanup is authorized
by this migration request. Existing tracked and untracked user files remain
untouched unless listed in the implementation plan.
