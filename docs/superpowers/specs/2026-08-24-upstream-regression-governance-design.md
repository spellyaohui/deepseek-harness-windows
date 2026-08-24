# Upstream regression governance design

Status: approved
Date: 2026-08-24
Target: repository-wide maintenance rules

## 1. Problem

This repository combines pinned upstream Harness packages, two maintained
forks, and several local plugins and desktop compatibility rewrites. An
upstream refresh can compile successfully while silently removing a local
capability, deleting its regression test, or replacing an installed local
package with the upstream package.

The current upgrade instructions are distributed across plugin-specific
`UPSTREAM.md` files. There is no root agent rule, no single capability
registry, and no command that exercises every local owner after an upstream
change. Some README version statements have already drifted from the packaged
versions.

## 2. Goals

- Make preservation of local fixes and plugin capabilities a repository rule.
- Permit removal of a local patch only when upstream provides equivalent
  behavior and the corresponding regression remains green.
- Keep feature ownership explicit: AgentTeams settings remain in AgentTeams,
  CPA remains a standalone provider plugin, and the Models fork remains only
  the additive card slot.
- Make deletion of a plugin, integration edge, or regression gate fail
  visibly before packaging.
- Provide one reproducible command for upstream-refresh acceptance.

## 3. Options considered

### Rules file only

Add only `AGENTS.md`. This gives future agents the right instructions but
cannot detect an accidental deletion or an incomplete manual merge.

### Automated tests only

Add only a verification command. This detects some missing artifacts but does
not explain ownership, upstream-equivalence decisions, or how conflicts must be
resolved.

### Rules, capability registry, and executable gate

Recommended. A concise root rule controls agent behavior, a human-readable
registry records ownership and acceptance evidence, and an executable command
fails when required plugins or test gates disappear.

## 4. Repository rules

Create root `AGENTS.md` with these binding requirements:

1. Perform every upstream refresh in a fresh branch/worktree.
2. Record the previous upstream baseline and local capability inventory before
   importing new source.
3. Classify every local delta as:
   - `UPSTREAM_EQUIVALENT`: upstream source implements the same observable
     contract and the local regression passes unchanged or with a justified
     source-location update.
   - `REAPPLY`: upstream does not implement the contract; reapply the local
     change and retain its regression.
   - `SUPERSEDED_BY_DESIGN`: the repository intentionally changes the local
     contract; this requires explicit user approval and an updated design doc.
4. Never resolve a conflict by deleting a local plugin, test, settings section,
   patch entry, or dependency solely to make the merge/build pass.
5. Run the full upstream regression gate before changing provenance, packaging,
   or claiming the refresh is complete.
6. Keep the public repository free of credentials, sessions, live team state,
   logs, exported Markdown, screenshots with sensitive context, installers,
   and local upstream checkouts.

## 5. Capability registry

Create `docs/UPSTREAM_MAINTENANCE.md` as the canonical local capability
registry. Each entry records owner, upstream relationship, preserved behavior,
critical source/tests, and required gate.

The registry covers:

- AgentTeams local fork:
  - independent provider/model/reasoning settings;
  - explicit settings override tool-supplied route arguments;
  - shared Harness model catalog including CPA models;
  - Team/Native durable routing policy and native-tool suppression;
  - scheduler, task attempts, claim compatibility, reassignment, mailbox,
    continuation, lifecycle and stress behavior.
- CPA standalone provider plugin:
  - address and credential separation;
  - model discovery and profile persistence;
  - seven-level reasoning vocabulary and GPT-5.6 `minimal` exclusion;
  - per-model optional raw `contextWindow` and `maxTokens`;
  - availability to both the main model selector and AgentTeams.
- Models settings fork:
  - owns only `settings.models.card` declaration/rendering;
  - provider-specific CPA behavior remains outside the fork.
- Desktop settings plugin:
  - owns the native-styled Desktop and Subagent settings sections and the
    AgentTeams settings bridge.
- Session Markdown export plugin:
  - deterministic visible-context export, correct sequence/timestamps,
    inheritance boundaries, descendant sections and raw-ZIP coexistence.
- Desktop source rewrites:
  - console hiding;
  - OpenCode non-empty missing-`finish_reason` recovery;
  - Pwsh/Bash redundant escalation normalization with fail-closed unknown modes
    and real approval-boundary coverage.

## 6. Executable gate

Add `win-desktop/scripts/verify-upstream-regressions.mjs` and expose it as:

```text
npm run verify:upstream
```

The script runs sequentially and stops on the first failure:

1. `pnpm test` in `models-settings-plugin`.
2. `pnpm test` in `cpa-provider-plugin`.
3. `pnpm test` in `agent-teams-plugin`.
4. `pnpm test` in `session-markdown-export-plugin`.
5. `npm test` in `win-desktop`.

It must use inherited stdio, Windows-safe executable resolution, and the
current Node process environment. It must not install packages, modify live
state, run network tests, publish, or package.

## 7. Fast manifest regression

Add a normal desktop test that runs as part of `npm test`. It verifies:

- all four local plugin directories and package manifests exist;
- desktop dependencies still use `file:` for AgentTeams, Models, CPA, Desktop
  Settings, and Session Markdown;
- lockfile entries resolve to those local directories;
- required plugin test/verification files still exist;
- every plugin exposes its expected build/test scripts;
- `verify:upstream` remains registered;
- ownership markers remain present: Models card slot, CPA registration,
  AgentTeams shared catalog/settings and claim compatibility, Session Markdown
  mount, and shell/OpenCode rewrite entry points.

The manifest test is a deletion/drift sentry, not a replacement for behavioral
plugin suites.

## 8. Upstream refresh workflow

1. Create a fresh worktree and capture branch, HEAD, dirty state, current
   versions, upstream baselines, and the capability registry.
2. Import the new upstream source without deleting local plugins.
3. Compare each registry item and record one classification with source and
   test evidence.
4. Reapply missing behavior in the owning plugin or wrapper boundary.
5. Update `UPSTREAM.md`, local fork versions, lockfile, installed local copies,
   README versions, and the capability registry.
6. Run `npm run verify:upstream`.
7. Run packaging only after the gate passes; inspect `win-unpacked` for local
   package versions and key capability markers.

## 9. Failure handling

- A failing capability regression blocks packaging and upstream-baseline
  updates.
- If upstream source structure changes but behavior may be equivalent, keep the
  local regression and adapt only its source-location assertion after proving
  runtime behavior.
- If a required plugin cannot mount against the new upstream version, report
  the incompatibility; do not silently fall back to the upstream/native feature.
- An upstream fix removes local code only after equivalent behavior is proven.
  The regression test remains, renamed only if ownership truly moves.

## 10. Documentation consistency

Update current documentation to desktop `0.1.1-rc.7` and AgentTeams
`0.1.13-desktop.3`. Update AgentTeams `UPSTREAM.md` with the `.desktop.3`
member-claim compatibility delta. Future release changes must update these
statements in the same commit as version metadata.

## 11. Acceptance criteria

- A future agent entering the repository automatically receives the upstream
  preservation rules.
- The capability registry names every local feature owner and regression gate.
- Removing a plugin directory, local dependency edge, required test file, or
  critical integration marker makes `npm test` fail.
- `npm run verify:upstream` exercises all local plugin suites and desktop tests.
- Current documentation versions match package metadata.
- The worktree is clean after verification and contains no sensitive files.

