# AgentTeams 0.1.23 source recovery and create-default routing

> For agentic workers: use subagent-driven-development task gates with bounded file ownership. User explicitly approved implementation in canonical main, no new worktree, no publication.

**Goal:** Restore the installed AgentTeams 0.1.23 feature baseline and bundled Superpowers, then make ad-hoc create-plan members honor saved temporary routes without overriding Profile or explicit policy.

**Architecture:** Import fixed upstream source, retain or replace local capabilities according to the existing registry and its regressions. Change the existing AgentTeams creation selection boundary only; the durable gateway remains the sole child-operation admission owner.

**Tech stack:** Existing TypeScript/React plugin, Node offline Host tests, Electron 44 / NSIS.

**Spec:** The user's 2026-10-13 confirmation and Global Constraints below are the binding specification. Earlier Superpowers design remains authoritative for its unchanged provider.

## Global Constraints

- Work only in D:/Trae/其他/deepseek-harness on main. Base and origin/main: 72dc27c090671d74873df44d44cbe562a690ffe4. No new worktree.
- Harness remains 0.2.0-rc.2 at 639ed015397290b3745d163aafe02ffee4aa3f84; official tarballs unchanged. Electron remains 44.0.0.
- Upstream AgentTeams v0.1.23 is 1094b84add6f2fb19edf659367fe2fd5f7f14154. Previous source v0.1.22 is 9cba4fe4171f27c019991cafd2a107f87ef3517b.
- Candidate fork: 0.1.23-desktop.2. Candidate wrapper: 0.2.0-rc.20. Superpowers package stays 0.1.0 / upstream v7.0.0 commit bb92a77741419a4ab5f06e711a283343f1ada0c3.
- Upstream fixes/features win where observably equivalent; classify every active registry capability, retain regressions, and reapply unresolved local behavior. Escalate genuine user-facing design conflicts.
- Preserve Profile model/reasoning, all three reasoning modes, explicit selections, strict V2, quality/audit gates, Web auth/CAS, Team/Native separation, current settings, native allowlists and the single durable gateway.
- Do not restore AUTO, Session Markdown export, retired OpenCode compatibility or legacy Team/Profile migration. Do not alter user configuration, credentials or runtime Teams/sessions.
- Existing user-owned 2026-10-10 plan/spec files stay unchanged. Prior isolated source/test installer remains untouched as a recovery/reference copy.
- No commit, push, tag, GitHub Release, real install, paid-model call or hot overwrite. Installer is for user acceptance only.
- The upstream gate remains offline, install-free and package-free. Dependency preparation/downloads occur separately. A real canonical node_modules is mandatory.

## Review Focus

1. Create-plan default-shaped members (omitted routes/mode, target-default, blank optional routes where existing write contract permits) receive the saved temporary policy, not the captain.
2. Profile roles and explicit route/effort/non-default mode do not inherit temporary settings; invalid partial/explicit policy still fails closed.
3. Staged and automatic creation freeze routes; later setting changes and cold recovery do not reroute existing members.
4. Invalid/unavailable temporary route rejects before Team writes or child spawning; durable gateway and Native admission remain intact.
5. Restored upstream artifact/lineage/tool-policy/Unicode/source features and old local quality regressions remain active; packaged Superpowers files match the fixed raw Git-blob digest.

## Task 0: Establish verified baseline and prerequisites (controller)

- [x] Fetch origin, preserve previous branch/user files, fast-forward canonical main and prove HEAD=origin/main with zero tracked diff.
- [x] Retrieve clean fixed v0.1.23 source under ignored upstream/agentteams-023-source-20261013; verify both source commits and unchanged recommended host.
- [x] Run existing verify:upstream before imports. Diagnose dependency/input problems separately; restore exact known inputs/dependencies outside the gate without deleting user files or weakening tests.
- [x] Record baseline outcome and file-ownership preflight in ignored ledger.

## Task 1: Recover AgentTeams source and fix create routing (core worker)

**Ownership:** win-desktop/agent-teams-plugin/** only, plus its task report. Do not edit wrapper files or docs/UPSTREAM_MAINTENANCE.md.

**Consumes:** fixed v0.1.23 source, v0.1.22 base, main's local fork and active capability registry. Existing tools/register/selection and real-runtime tests.
**Produces:** compiled compatible AgentTeams source, candidate package/pnpm version, capability classifications and RED/GREEN evidence.

- [x] Compare three source versions; preserve every upstream new feature and classify each active local capability with evidence. Import mechanically where safe and resolve semantic differences without weakening regressions.
- [x] Add a real Tools/AgentLoop create-plan regression that fails on current routing. Literal expected route: provider alt-gateway, model worker-small, reasoningMode explicit, effort high; captain route: provider captain-gateway, model captain-large, effort max.
- [x] Implement only the existing creation selection seam: for inline plan members with no real explicit route/effort/non-default reasoning choice, use the saved temporaryMember. Preserve Profile selection and explicit policies; absent temporary policy retains captain fallback.
- [x] Store truthful modelPolicySource and selected reasoning policy, freezing one creation snapshot. Reuse established optional-field and selection validation rather than guessing roles or selecting a Profile automatically.
- [x] Test omitted/default mode, all saved modes, explicit precedence, Profile isolation, staged/automatic creation, frozen continuation, unavailable routes and zero-write rejection, plus old custom-member/gateway/quality regressions.
- [x] Build and run complete AgentTeams pnpm test with no install/network inside tests. Report any baseline failure by name; no skipped/removed/weak assertions.
- [x] Prepare accurate UPSTREAM.md/release notes after source/regression evidence, retaining unchanged host pins and release contract.

## Task 2: Preserve Superpowers in canonical wrapper (integration worker)

**Ownership:** win-desktop/superpowers-plugin/**; wrapper src/dsh-service.js and desktop-profile-layer.js; config/agent-teams.patch.yml; sync-local-plugin-artifacts.mjs, verify-upstream-regressions.mjs, runtime/ZIP closure scripts; Superpowers/closure/artifact/manifest/healing tests and fixture. No AgentTeams source/package, wrapper package/lock or general docs/version assertions.

**Consumes:** previously verified isolated .worktrees/superpowers-harness-build source at same base; installed native Harness APIs.
**Produces:** canonical bundled provider/integration and active full-asset regressions, unchanged native/Team boundaries.

- [x] Preserve the verified 15 skills / 75 original assets and LICENSE without text conversion. Independent path/hash digest: 4b646fcbb694f25c32d5840657cc20becb1b0e9791a9de5d4081898cf09116c7.
- [x] Restore only that known Superpowers feature delta, inspect wrapper caller/default whitelist/test landing points, and retain all existing plugins and upstream gates.
- [x] No Hook, extra scheduler, settings writer or prompt plugin. Preserve native provider precedence, user disable/restart and exact resourceBase.
- [x] Run plugin tests and focused real Host/permission/artifact/closure tests. Do not install dependencies or sync during controller baseline execution; coordinate prerequisite readiness.
- [x] Self-review and write precise report, including any unavailable evidence. Do not run final package or edit versions.

## Task 3: Integration, review and local installer (controller)

**Ownership:** wrapper package.json/lockfile, wrapper/AgentTeams version integration assertions, .gitattributes, README, maintenance registry, acceptance/release notes, dependency preparation and build artifacts.

- [x] Review both task diffs against reports, then independent task-scoped reviews; resolve concrete findings through owning worker.
- [x] Synchronize candidate versions, installed file dependencies and provenance/ownership assertions. Preserve official source identities and all gate stages.
- [x] Preserve upstream `tool_policy` through the local desktop Profile cache whitelist and serialization, with strict V2 no-write rejection for malformed/internal fields.
- [x] Run npm run verify:upstream in canonical win-desktop, then independent whole-change review. No acceptance from worker reports alone.
- [x] Run npm run dist:win only after gate. Verify actual unpacked and isolated ZIP closures, runtime versions, full Superpowers asset parity and official whale icons.
- [x] Record EXE/ZIP/blockmap bytes, SHA-256 and Authenticode. Deliver local rc.20 installer and separate manual model/install acceptance limitations.
- [x] Re-read git status/diff, verify no credentials/runtime/generated outputs staged and no external publication. Do not clean source/evidence until authorized.

## Plan self-review

The two worker ownership sets do not overlap; their shared package dependencies are prepared by the controller before tests. The controller owns global versions and final gate. Upstream migration precedes the create-plan regression; source restoration alone is not bug-fix evidence. All five review conditions have named behavior checks above. No new API, automatic Profile choice or legacy migration is introduced.
