# AgentTeams member-selection precedence correction

Status: approved design, pending written-spec review
Date: 2026-08-24
Target: `win-desktop/agent-teams-plugin/`

## 1. Problem

`agent_teams_add_member` currently gives model-generated `provider`, `model`, and
`reasoning_effort` arguments precedence over the AgentTeams settings page in all
three reasoning modes. A model can therefore override an explicitly configured
member route, pass empty strings that are treated as explicit values, or retry
with guessed provider ids after an error.

This contradicts the intended meaning of the `explicit` settings mode. In that
mode, the user has already selected the complete member LLM route and reasoning
effort. The captain should supply only member identity, role, and work.

## 2. Decision

Selection becomes mode-aware.

### `explicit`

- `memberLlmProvider`, `memberModel`, and `memberReasoningEffort` from live
  AgentTeams settings are authoritative.
- Ignore all tool-supplied `provider`, `model`, and `reasoning_effort` values,
  including empty strings, valid alternative routes, invalid provider ids, and
  the `default` effort sentinel.
- Validate the configured route and effort through the existing target-model
  resolver before creating the member.
- Existing members keep their durable route snapshot; the rule applies when a
  future member is created.

### `target-default`

- Normalize empty or whitespace-only tool route/effort values to omitted.
- A non-empty explicit provider/model pair may select a heterogeneous member
  route.
- When no route override remains, use the settings route and then the captain
  fallback.
- Omit effort so the resolved target model chooses its default, unless a
  non-empty per-member effort was explicitly supplied.

### `route-aware`

- Normalize empty or whitespace-only tool route/effort values to omitted.
- A non-empty explicit provider/model pair may select a heterogeneous member
  route.
- Inherit captain effort only when the final provider/model exactly matches the
  captain route; otherwise use the target model default.
- A non-empty per-member effort remains an allowed override.

## 3. Tool contract and errors

The tool schema retains the optional route fields because the two non-explicit
modes still support heterogeneous teams. Its descriptions must state that the
fields are ignored while AgentTeams settings use `explicit` mode.

For the two non-explicit modes:

- provider and model overrides must be supplied as a pair;
- blank strings are treated as absent instead of producing an empty-field
  validation error;
- an unavailable provider/model error must tell the captain to omit route
  fields to inherit AgentTeams settings;
- when the current Harness catalog can provide valid provider ids, include
  those ids in the error without exposing credentials or endpoint secrets.

No member record or child session may be created after failed selection.

## 4. Prompt behavior

Update the AgentTeams usage instructions so the captain knows:

- in `explicit` mode it must omit provider/model/reasoning fields because the
  plugin enforces the settings route;
- in `target-default` and `route-aware` modes it should still omit them for an
  ordinary member and use them only when the user explicitly requests a
  heterogeneous member route.

Correctness must come from execution-time selection policy, not prompt
compliance alone.

## 5. Compatibility

- Durable member records and continuation behavior do not change.
- The settings schema and UI values do not change.
- Existing sessions use the corrected selection behavior for members created
  after installing the fix.
- Existing members resume with their stored route unchanged.
- Team/native delegation routing is outside this correction.
- PowerShell `sandbox_permissions` misuse is a separate Harness tool-contract
  issue and is not changed by the AgentTeams plugin fix.

## 6. Tests

Add selection-policy regression cases proving that:

1. `explicit` ignores empty tool arguments.
2. `explicit` ignores invalid guessed provider ids.
3. `explicit` ignores a complete valid alternative provider/model/effort.
4. `explicit` resolves exactly the configured provider/model/effort.
5. `target-default` treats blank arguments as omitted.
6. `route-aware` treats blank arguments as omitted.
7. Both non-explicit modes retain valid heterogeneous overrides.
8. Provider-without-model validation still applies after normalization.
9. Failed target resolution creates no partial member.
10. Tool descriptions and usage prompt describe the mode-aware contract.

## 7. Acceptance criteria

1. With settings `cpa / gpt-5.6-luna / max / explicit`, every newly created
   member uses that exact selection regardless of model-generated route fields.
2. The screenshot failure pattern of empty arguments followed by guessed
   providers cannot divert or block member selection in `explicit` mode.
3. `target-default` and `route-aware` no longer fail on empty strings and still
   support intentional heterogeneous member routes.
4. Invalid non-explicit routes produce an actionable inheritance hint and, when
   available, valid provider ids.
5. Plugin verification and Windows wrapper integration tests pass before a new
   installer is packaged.
