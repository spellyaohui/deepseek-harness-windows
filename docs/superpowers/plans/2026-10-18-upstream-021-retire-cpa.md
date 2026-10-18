# Harness 0.2.1 upstream integration and CPA retirement

Approved in chat on 2026-10-18. Work on canonical main; no worktree, user-data migration, installer, commit or publication is part of this request.

## Requirements

- Pin Harness 0.2.1-rc.2 at 687f282e8625c6b8d11ff58211a90524be2e4317 and AgentTeams 0.1.24-rc.1 published source 33f29cd0ebebcd23b26877b224cd1c3406671034.
- Prefer upstream implementations. Keep each local capability regression; retire duplicate code only after proving the upstream path.
- Adopt upstream reasoning editor/schema/wire mappings. Do not fill absent declarations with six levels or strip Off. Preserve saved subsets, false, wire values and unrelated fields.
- Remove the CPA package, startup/restore/build dependencies and its sole provider-normalization extension. Existing cpa routes, credentials, protocols, model declarations and frozen roles remain ordinary user configuration.
- Keep provider-neutral manual input defaults/validation and Windows output detachment where upstream differs.
- Preserve local role routing, frozen policies, strict V2, quality gates, authenticated CAS, exact-Agent durable gateway and Windows state IO/lifecycle invariants.
- Dependency preparation is separate from the offline install-free/package-free upstream gate.

## Tasks

1. Run the existing full gate; acquire immutable source/package inputs and retain old inputs untouched.
2. Add retirement/upstream-semantics regressions; refresh Models from upstream and retire CPA end to end.
3. Integrate upstream AgentTeams activation/runtime setup through the existing gateway and retain local contracts.
4. Pin the coherent new runtime/dev closure, adapt source/boundary regressions without weakening assertions, and run focused and complete gates.
5. Update capability classifications, owner identities, rules, README and provenance; review the full uncommitted change and verify again as necessary.

## Acceptance

Exercise provider discovery and declaration, credentials/protocol/capacity/input preservation, invalid declarations, Save/Cancel/CAS/restart; distinguish absent reasoning and false and preserve Off/wire subsets. Exercise actual request selection, first/concurrent/HMR/cold members, tool restrictions, frozen policies and Windows locks. Run npm run verify:upstream and npm run verify:runtime-closure from win-desktop. Report source/runtime evidence separately from live models, installation and release acceptance.

## Review focus

- CPA removal cannot delete or rewrite saved routes/credential references.
- Upstream activation and drain cannot bypass the durable gateway or restore unrestricted members.
- Absent/false/Off reasoning cannot be collapsed or re-materialized on unrelated saves/startup.
- File queues must retain exact-Agent lifecycle ordering and persistent-lock failure behavior.
- The new closure cannot mix old DSH packages or perform installation/network work inside the gate.

## Subsequent user authorization

After the local rc.27 installer and UI changes were accepted on 2026-10-18, the user requested a PR targeting main and authorized merging after Codex review passes. A temporary PR branch in the same canonical checkout is used; no worktree or Release publication is requested.
