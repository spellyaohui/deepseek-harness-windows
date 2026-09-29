# AgentTeams 0.1.22 / Harness 0.2.0-rc.2 Windows migration

Date: 2026-09-30

## Intent and decision

Upgrade the existing Windows wrapper to the stable AgentTeams `v0.1.22` and its
recommended, published Harness `dsh-v0.2.0-rc.2` while retaining the current
Electron shell and user-approved local capabilities. Adopt upstream behavior
where it demonstrably supersedes a local patch; keep the smallest remaining
local patch and its regression otherwise. The user selected adapting the
official Windows dsh-command management flow into this shell rather than
replacing the shell with the separate official Desktop application.

This is a source migration and validation task. It does not authorize a GitHub
push, tag, Release, installer build, or an automatic change to the user's PATH.

## Pinned upstream inputs

- Pin the exact AgentTeams `v0.1.22` source and npm release, not a floating
  `latest` dependency. Its `src/` runtime is unchanged from `v0.1.21`; the new
  contract adds the `0.2.0-rc.2` recommended host, retains the seven earlier
  peers, and adds prebuilt Git entrypoints and release/source checks.
- Pin the exact official Harness `dsh-v0.2.0-rc.2` source and package closure.
  Keep official tarballs unmodified and record their identities and hashes.
  The old 0.1.7 closure stays available as provenance, not as a runtime mix.
- Preserve the published Host's new Web/runtime behavior (plan review,
  model-selector search, file-sidebar open-in-app, terminal fixes, plugin
  guidance, updated model catalog, and opt-in async question mode) through
  the full official package graph. Do not imitate these features in wrapper
  code. Removed catalog IDs must be surfaced as unresolved selections rather
  than silently replaced in saved Profiles or provider settings.

## Ownership and data flow

1. The wrapper still launches the pinned official `dsh web` through its
   Electron-contained Node runtime. Its authenticated loopback URL, startup
   resolution, hidden-console, cookie recovery, OpenCode, exact grep alias,
   quota classifier, and plugin mounting boundaries remain local unless an
   upstream-equivalent regression proves a specific rewrite redundant.
2. AgentTeams stays one bundled local fork. Import v0.1.22's package and
   compatibility contract, then retain role-specific Provider/model/effort,
   strict V2 state, Profiles, Team/Native policy, quality gates, Web CAS/auth,
   and the single durable child-operation gateway. Native Subagent and
   AgentTeams settings remain separately visible. Keep upstream lifecycle,
   mailbox, UI, and task semantics as the primary implementation.
3. The Models fork remains provider-neutral and is rebased on the official
   0.2.0-rc.2 editor. CPA, desktop settings, tool-call guidance, and OpenCode
   retain their separate owners; no provider-specific rule moves into Models.
4. The Windows wrapper adds one explicit tray action, `管理 dsh 命令`. It uses
   the upstream Windows command-management protocol and `command-path.ps1`
   ownership/CAS rules. An inspection reads the current per-user PATH and
   owned-command receipt; only a user-confirmed install/remove operation
   writes HKCU PATH. It neither rewrites system PATH nor replaces another
   `dsh` command without an explicit conflict decision. Startup never installs
   the command automatically.
5. The bundled `dsh.cmd` launcher points to this wrapper's installed EXE and
   its pinned `@deepseek-ai/dsh` CLI entry, using the same host package graph
   as the GUI. The official Desktop-only `@deepseek-ai/dsh-desktop-host` is not
   a published npm package, so its launcher path cannot be copied verbatim.
   Adapt only that path and shell wiring; keep the upstream Windows ownership
   logic and user-visible semantics. A development or non-installed run offers
   an unavailable explanation, not a PATH mutation.

The upstream Git prebuilt-entry contract belongs to the upstream-published
plugin. The bundled local fork remains built from source into ignored `lib/`
and synchronized through the existing offline gate; do not commit generated
package output merely to mimic the upstream repository's distribution layout.
Generic upstream plugin-manager Git installation must remain available.

## Conflict policy

For each row in `docs/UPSTREAM_MAINTENANCE.md`, record
`UPSTREAM_EQUIVALENT`, `REAPPLY`, or `SUPERSEDED_BY_DESIGN` with the retained
regression. Upstream code wins only after equivalent behavior is proved.
Any newly discovered conflict that changes a user-approved observable
behavior—especially role routing, Team/Native authority, saved settings,
command ownership, or desktop shell behavior—returns to the user for a
decision before that behavior is changed. No conflict is resolved by dropping
a plugin, disabling a test, migrating legacy Team state, or restoring AUTO.

## Safety and errors

- Treat the current dirty working tree and untracked files as user-owned.
  Inspect and preserve them; stage only exact files belonging to this work.
- The command-management action must be unavailable when the packaged
  launcher is absent, return an actionable error when inspection fails, and
  re-inspect before mutation. A stale fingerprint, occupied command, or
  changed PATH entry fails closed. Removal touches only the entry owned by
  this installer; backups and other commands remain recoverable.
- Keep authentication, Host/Origin, strict schema, live Agent identity, and
  child-operation serialization gates intact. No credentials, sessions,
  screenshots, logs, generated outputs, or installers enter Git.

## Acceptance evidence

1. Verify fixed tag/commit, package/peer matrix, source and artifact hashes,
   official closure, and absence of mixed 0.1.7 runtime packages.
2. Retain every registered local regression against its classified owner.
   Add focused Windows command-manager tests for inspect, manual confirmation,
   install/remove, stale or occupied PATH, and launcher resolution; none may
   alter the real user's PATH during tests.
3. From `win-desktop`, run the existing offline, install-free and network-free
   `npm run verify:upstream` before finalizing provenance. Validate real
   `node_modules` resolution and a fresh isolated Electron startup, including
   both Native and AgentTeams settings, official client features, and the
   command-management action. Clearly distinguish fixture/static checks from
   real provider, long-run, installed-EXE, and user acceptance.
4. Update wrapper and fork versions, manifests, lockfiles, integration
   assertions, README/release notes, and provenance together only after source
   and regression evidence exists. No installer or release is created in this
   task without a separate request.
