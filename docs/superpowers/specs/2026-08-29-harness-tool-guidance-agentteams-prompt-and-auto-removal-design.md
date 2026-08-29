# Harness Tool Guidance, AgentTeams Prompt Compaction, and AUTO Removal Design

## Status

Approved in conversation on 2026-08-29. Written-spec review is the final gate before implementation planning.

## Context

DeepSeek Harness currently works, but agents still make avoidable invalid tool calls. The recurring AgentTeams failures include:

- sending `profile: ""` even though the Profile is optional;
- calling participant-only tools before a Team exists;
- calling `agent_teams_edit_plan` after the Team is running;
- creating quality tasks in an invalid lifecycle order or without the required dependency;
- retrying a failed tool call without changing the invalid arguments.

The installed AgentTeams prompt already says to omit an unspecified Profile. A real failing request proved that the rule was present, the configured `software-delivery` Profile was listed, and `CPA / gpt-5.6-sol` still emitted `profile: ""`. The request contained:

- 13,113 characters of system prompt;
- about 7,300 characters in the AgentTeams usage section;
- 394 tool definitions serialized to about 270,000 characters;
- 13 AgentTeams definitions serialized to about 15,600 characters.

This proves that adding another sentence at the end of the existing prompt is insufficient. The critical rules need to be short, early, non-duplicated, and backed by deterministic input handling.

The 394-tool catalog is the dominant request-size cost, but catalog pruning can hide capabilities and requires a separate design. It is explicitly excluded from this change.

The Windows distribution also integrates `@nanmicoder/dsh-auto-mode`. The user has decided to remove the entire AUTO permission feature, not merely shorten its 1,079-character main-agent guidance.

## Goals

1. Add a short, Harness-wide tool-call discipline section to the real system prompt, not to project instructions.
2. Reduce the AgentTeams usage section to at most 3,500 characters for the built-in `software-delivery` Profile while preserving every current lifecycle and quality invariant.
3. Prevent an empty optional AgentTeams Profile from producing a user-visible error.
4. Keep unknown non-empty Profile names strict and actionable.
5. Remove the AUTO permission preset, policy, classifier, UI integration, dependency, startup patch, documentation, and regressions from the Windows distribution.
6. Preserve all unrelated local capabilities, Provider/model routing, image settings, grep compatibility, and AgentTeams V2 state rules.

## Non-goals

- Do not prune, lazily expose, rename, or otherwise alter the 394-tool catalog.
- Do not change Provider protocols, model capabilities, reasoning metadata, or multimodal settings.
- Do not change the generic grep argument compatibility boundary.
- Do not migrate or reinterpret old AgentTeams Profile/Team state.
- Do not migrate old sessions whose permission preset is `auto`.
- Do not delete stale AUTO package files from user Profile caches.
- Do not weaken AgentTeams quality gates or state validation to make malformed calls succeed.
- Do not edit or commit local DSH Profile patches, credentials, Tokens, or runtime sessions.
- Do not build or publish an installer as part of the implementation unless separately requested.

## Decision 1: Wrapper-owned global tool-call guidance

Add a small wrapper-owned local plugin dedicated to one system-prompt section. It must not register tools, settings UI, Provider behavior, or lifecycle state.

The section must be no longer than 500 characters and convey only these cross-tool rules:

1. Build arguments from the current tool schema and explicit context.
2. Omit an optional property when its value is unknown or blank.
3. Preserve an empty value only when the tool explicitly documents that empty value as meaningful.
4. After a failed call, read the error or structured next-step guidance and do not repeat the same invalid arguments unchanged.

This section is mounted by the Windows desktop patch and ordered before AgentTeams. It is a system-prompt capability, not an `AGENTS.md` rule.

The plugin is intentionally separate from AgentTeams, Models, CPA, Desktop Settings, and Session Markdown so those ownership boundaries remain intact.

## Decision 2: Compact AgentTeams into a state machine

`usageSectionText()` remains the AgentTeams-owned cross-tool protocol, but it will be rewritten around a short state/action matrix placed immediately after the delegation-policy preamble:

| Team state | Allowed next actions |
|---|---|
| unknown | Call `agent_teams_status` once to establish state. |
| inactive | Create one Team. Status and idempotent delete remain safe probes. |
| staged | Add/update members and tasks, edit the plan, or wait for explicit approval. Never self-approve in the creation/edit turn. |
| running | Use status, create-task, message, reassign, resume where applicable, and delete. Never create a replacement Team, edit the staged plan, or approve it. |
| halted | Call `agent_teams_resume` with a reason before adding work. |

The compact protocol must still preserve:

- Team-only versus Native delegation policy markers;
- automatic versus required approval semantics;
- exact Profile selection and roster expansion;
- role-level `target-default`, `route-aware`, and `explicit` reasoning ownership;
- paired Provider/model requirements and explicit effort ownership;
- staged roster/DAG planning and explicit dependencies;
- scheduler ownership, durable members, attempts, stale-attempt rejection, and safe reassignment;
- captain/shared-pool assignee semantics;
- quality task contracts, requirements-before-implementation dependency, review verdicts, repair loops, concrete `inScope`/deliverable paths, verification evidence, and delivery gating;
- halted versus escalated distinction;
- cleanup through `agent_teams_delete` and the rule that real deployment requires explicit user confirmation.

Long field-level details stay with the specific tool schema that validates them. The system section must not repeat complete parameter documentation.

## Decision 3: Empty Profile is omission, not compatibility

At `agent_teams_create`:

- missing `profile` means no configured Profile;
- whitespace-only `profile` is normalized to the same omitted state;
- a non-empty Profile must still exactly match a configured name;
- unknown non-empty names continue to fail before state creation or member spawning.

This is provider-neutral optional-argument normalization, not a legacy Profile or old-conversation compatibility layer.

The model-facing Profile parameter description will list the configured Profile names and explicitly say to omit the property otherwise. It will remain an optional string instead of using a strict enum: `defineTool()` validates enum values before `execute()`, so an enum would reject `""` before the normalization seam and recreate the same visible failure.

The tool result and prompt continue to distinguish Profile-backed creation from an ad-hoc Team. An empty Profile must never silently select `software-delivery` or any other default.

## Decision 4: Remove AUTO completely from the distribution

Remove every distribution-owned AUTO touchpoint:

- `@nanmicoder/dsh-auto-mode` from `win-desktop/package.json` and the lockfile;
- `resolveAutoModePatch()` and the AUTO patch argument from the DSH service launch path;
- AUTO from desktop-plugin healing and its integration tests;
- the `Auto` permission preset, client decorator, automatic classifier, policy guard, system guidance, and one-shot approval bridge by no longer shipping or mounting the package;
- README claims and maintenance/provenance entries that describe AUTO as an integrated capability;
- test expectations that require AUTO to resolve or appear in launch arguments.

The official `Read Only`, `Workspace Write`, and `Full Access` modes remain owned by upstream Harness.

There is no migration or compatibility layer for old `auto` sessions. Such sessions may require the user to select an official permission mode or start a new session. The wrapper does not rewrite old session events.

The wrapper also does not recursively delete stale copies under user Profile caches. Without the package dependency and startup patch, those files are inert and outside the release artifact. Avoiding cache deletion preserves user-owned data and prevents a removal routine from becoming a permanent maintenance surface.

## Ownership and versioning

- The new minimal tool-guidance plugin is Windows-wrapper-owned.
- AgentTeams continues to own its lifecycle prompt and Profile input semantics.
- AUTO is removed by explicit product decision; it is not classified as an upstream equivalent.
- The wrapper advances from `0.1.1-rc.27` to the next RC.
- AgentTeams advances from `0.1.14-desktop.9` because its prompt and create boundary change.
- The new local prompt plugin receives its own initial package version.
- Models, CPA, Desktop Settings, Session Markdown, OpenCode compatibility, and grep compatibility versions do not change unless implementation evidence shows their owned source changed.

Version, dependency, lockfile, integration assertions, README text, `UPSTREAM.md`, and `docs/UPSTREAM_MAINTENANCE.md` must move together only after source and tests prove the changes.

## Error handling

- A blank Profile does not produce an error and creates an ad-hoc Team.
- An unknown non-empty Profile reports the exact configured names and performs zero durable writes.
- Wrong lifecycle calls retain structured, actionable guidance; the prompt tells the model not to repeat them unchanged.
- Participant-authorized operations remain strict. The prompt does not grant authority or weaken validation.
- Removing AUTO does not add a fallback auto-approval path. Official permission behavior is authoritative.

## Verification

Add regressions that prove:

1. The global tool-call guidance is registered as a system-prompt section, contains all four rules, and stays within 500 characters.
2. AgentTeams prompt output with `software-delivery` stays within 3,500 characters.
3. The compact prompt contains the state matrix, exact Profile omission rule, reasoning-mode ownership, quality dependency, reassignment/attempt, halt/resume, cleanup, and deployment-confirmation markers.
4. The compact prompt no longer carries duplicated field-by-field tool documentation.
5. `profile` missing and `profile` blank both create the same ad-hoc Team shape.
6. An unknown non-empty Profile still fails before directory creation or member spawn.
7. Existing AgentTeams V2 lifecycle, quality-gate, role-policy, activity, and cold-recovery suites remain green.
8. The wrapper package and lockfile contain no `@nanmicoder/dsh-auto-mode` dependency.
9. DSH launch arguments contain no AUTO patch and still contain the Windows picker and generated desktop/AgentTeams patch.
10. Plugin healing no longer expects AUTO while all remaining desktop plugins still resolve.
11. README and maintenance registries no longer advertise AUTO integration.
12. The 394-tool catalog is untouched by source and regression assertions.

From `win-desktop`, the mandatory final gate is:

```powershell
npm run verify:upstream
```

The gate must remain offline-safe and must not install dependencies, publish, package, deploy, or mutate user runtime state.

## Acceptance criteria

- AUTO is absent from the packaged dependency graph and runtime launch composition.
- New sessions expose only upstream permission modes.
- The wrapper-wide tool discipline is short and model-visible.
- AgentTeams prompt length meets its budget without losing registered invariants.
- Blank optional Profile calls no longer surface an error.
- Unknown Profile names and invalid Team lifecycle actions remain strict.
- No 394-tool catalog pruning is introduced.
- No user-owned dirty files, local Profile patches, credentials, sessions, or caches are changed or committed.
- `npm run verify:upstream` passes before implementation is accepted.

## Rollback

The changes are split into atomic commits: AUTO removal, wrapper tool guidance, AgentTeams prompt/input behavior, and synchronized documentation/versioning. If a regression appears, revert the owning commit rather than restoring a partial AUTO compatibility layer or weakening AgentTeams validation.
