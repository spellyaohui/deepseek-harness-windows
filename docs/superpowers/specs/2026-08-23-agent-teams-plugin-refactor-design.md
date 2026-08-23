# AgentTeams settings and delegation-routing refactor design

Status: approved for implementation planning
Date: 2026-08-23
Target: `win-desktop/`

## 1. Context

The desktop wrapper currently mounts upstream `@nanmicoder/dsh-agent-teams@0.1.13` through a generated Cordis patch. Member model and reasoning settings live in Electron's `desktop-settings.json`, the wrapper fetches models separately, and startup code materializes static AgentTeams configuration.

This has four maintenance problems:

1. AgentTeams reads member defaults only at plugin activation, so settings require a restart.
2. The upstream Config schema has `memberModel` but no `memberReasoningEffort`; the wrapper compensates with a loader rewrite.
3. The browser settings UI uses a separate IPC/model-fetch path instead of Harness settings, model catalog, components, and theme.
4. Harness native delegation tools remain visible beside AgentTeams, so the model can choose either subsystem and produce different inheritance behavior.

Source inspection confirms that native delegation is already pluginized. The standard/code/cordis agent presets mount `subagent`, `subagent_fork`, `list_agents`, `send_message`, and `interrupt_agent` as separate tool plugins. `workflow` and `ralph` can also create work through native subagent providers. Therefore these capabilities can be hidden per Agent scope without patching the official preset files.

Source inspection also confirms that AgentTeams already contains the correct core machinery:

- `resolveMemberLlmSelection()` resolves provider/model/reasoning against the exact target model;
- a changed route drops the captain's incompatible reasoning id and resolves the target default;
- each member stores its resolved provider/model/reasoning snapshot durably;
- cold resume restores that snapshot through the continuable-child setup path.

The best design is to connect settings directly to this existing selection path rather than correct model-generated tool arguments after the fact.

## 2. Goals

1. Make AgentTeams own its Harness-native settings and settings UI.
2. Make configured member provider/model/reasoning deterministic without relying on the model to pass defaults explicitly.
3. Preserve explicit user-requested per-member overrides.
4. Hide all native and indirect delegation tools in Team mode.
5. Preserve a Native compatibility mode.
6. Keep routing policy stable across session resume.
7. Let member-default changes affect newly created members without changing existing members.
8. Remove Electron-only subagent settings, duplicate model loading, generated static member config, and the loader rewrite.
9. Maintain a small, auditable upstream fork rather than editing `node_modules`.

## 3. Non-goals

- Rewriting the AgentTeams scheduler, mailbox, task graph, activity panel, or durable team format.
- Replacing Harness's `spawn`/`fork` subagent providers. AgentTeams continues to use them as its runtime backend.
- Changing an existing member's provider/model/reasoning after creation.
- Switching an established session's visible tool set when the global routing mode changes.
- Modifying the shipped standard/code/cordis preset files.
- Keeping native and AgentTeams delegation simultaneously visible in Team mode.

## 4. Decision summary

Maintain a local source fork of `@nanmicoder/dsh-agent-teams`, based on version `0.1.13`, and install it through a `file:` dependency under the same package name.

The fork adds:

- a Harness `settings` namespace owned by AgentTeams;
- a Harness-styled `子智能体` settings tab in the plugin's existing browser half;
- live member-default resolution at `agent_teams_add_member` execution time;
- a durable per-session delegation-policy event;
- Agent-scoped hiding of native/indirect delegation tools in Team mode;
- routing prompt text that makes AgentTeams the only delegation path in Team mode;
- one-time migration from legacy desktop settings.

The separate proposed `dsh-agent-routing` companion plugin is no longer needed. Direct integration avoids guard-induced failed tool calls and keeps all team behavior under one owner.

## 5. Fork and upgrade strategy

Proposed local package:

```text
win-desktop/agent-teams-plugin/
  package.json
  UPSTREAM.md
  src/...
  tests/...
  lib/...                # build output consumed by the wrapper
```

Rules:

- Preserve package name `@nanmicoder/dsh-agent-teams` so existing Cordis rows remain valid.
- Use a local version suffix such as `0.1.13-desktop.1`.
- `UPSTREAM.md` records upstream repository, baseline version/commit, imported date, and every intentional local difference.
- Keep local changes in focused modules rather than scattering desktop conditionals through scheduler/team-state code.
- Add a repeatable upstream-sync check that compares the imported baseline and reruns upstream plus local tests.
- Never patch installed `node_modules` directly.

## 6. Settings ownership

AgentTeams registers a namespace such as `agent-teams` through the Harness settings service. Its composition config remains the base layer; user settings become the writable override layer.

Proposed schema:

| Field | Values/default | Effect |
|---|---|---|
| `delegationMode` | `teams` / `native`; default `teams` | Tool-routing policy for newly created top-level sessions. |
| `memberLlmProvider` | string or empty; default empty | Empty follows the captain provider; explicit value supplies the default provider for future members. |
| `memberModel` | string or empty; default empty | Empty follows the captain model; explicit value supplies the default model for future members. |
| `memberReasoningMode` | `target-default`, `route-aware`, `explicit`; default `target-default` | Chooses how future members obtain reasoning effort. |
| `memberReasoningEffort` | adapter effort id or empty | Required only for `explicit`. |

`memberProvider` keeps its existing AgentTeams meaning—subagent runtime backend (`spawn` or `fork`)—and is not reused as an LLM provider field. The desktop product keeps the runtime backend fixed to `spawn` unless a later advanced requirement explicitly exposes it.

## 7. Settings semantics

### Delegation mode

`delegationMode` affects new sessions only because it changes model-visible tools and prompt text. Existing sessions retain their durable policy when resumed.

### Member defaults

Member LLM settings are read when `agent_teams_add_member` executes.

- A settings change affects members created after the change, including future members added by an already-running captain.
- Existing members keep their stored route snapshot.
- Continuing an existing member uses its stored snapshot, not current global defaults.

### Reasoning modes

- `target-default`: omit an explicit effort and let the resolved target model select its own default.
- `route-aware`: when provider/model matches the captain route, preserve the captain's current effort; when the route changes, use the target model default.
- `explicit`: validate and use `memberReasoningEffort` against the exact target provider/model.

The legacy empty reasoning selection migrates to `target-default`, matching the current UI text.

## 8. Member-selection precedence

Extend the existing `resolveMemberLlmSelection()` input so it receives live settings defaults without changing its durable output shape.

Precedence is:

1. Explicit per-member provider/model/reasoning requested because the user named a heterogeneous route for that role.
2. AgentTeams settings defaults.
3. The captain's current request route.

Validation rules remain strict:

- an explicit provider requires an explicit model;
- empty strings are rejected at the settings/schema boundary;
- effort ids are resolved against the exact target route;
- a route change never carries an adapter-specific effort id from the old route;
- target model resolution happens before the child Session is created.

The tool schema continues to expose explicit per-member route fields for genuine heterogeneous-team requests. The model-facing instructions continue to say not to ask the user for per-member choices unless the user explicitly requested them.

## 9. Durable delegation policy

Add a required, log-only AgentTeams event:

```text
agent-teams/routing-policy
```

Its payload stores a versioned policy id rather than a mutable boolean:

```json
{ "policy": "teams-v1" }
```

or:

```json
{ "policy": "native-v1" }
```

Policy ids map to immutable behavior in the plugin. A future tool-list change creates `teams-v2` rather than silently changing old sessions.

Resolution rules:

1. A session with a routing-policy event restores that exact policy.
2. A fresh top-level session with no model-visible history snapshots the current global `delegationMode` before its first request.
3. A new child session inherits its parent policy.
4. A legacy session that already contains request/message history but no routing-policy event uses `native-v1` for compatibility.

The event is required rather than ignorable because losing it could reconstruct a session with a different tool set and system prompt.

## 10. Native delegation suppression

In `teams-v1`, AgentTeams installs an Agent-scoped restriction after preset composition and before the first prompt assembly. The restriction hides every visible tool in this policy set:

```text
subagent
subagent_fork
subagent_codex
subagent_claude_code
list_agents
send_message
interrupt_agent
workflow
ralph
```

Implementation requirements:

- Intersect the policy list with tools actually visible in that Agent scope so disabled optional providers do not cause an unknown-tool error.
- Apply the restriction to captains and member agents, preventing recursive native delegation.
- Do not hide any `agent_teams_*` tool required by captains or members.
- Install before the first request header is assembled so the logged tool list and rendered prompt match actual execution.
- In `native-v1`, install no restriction and preserve the official preset behavior.

AgentTeams continues to call `ctx.subagents` internally. Hiding model-facing native tools does not disable the Host subagent service and therefore does not break member spawning or continuation.

## 11. Prompt behavior

The plugin's usage section becomes policy-aware.

In Team mode:

- any task that genuinely needs delegation must use AgentTeams;
- the captain must not look for native subagent/workflow/ralph tools;
- ordinary single-agent tasks do not require creating a team;
- the existing create/member/task/status/delete protocol remains intact.

In Native compatibility mode:

- the current AgentTeams behavior remains: use AgentTeams when the user explicitly asks for it;
- native delegation tools remain available under the official preset instructions.

Prompt text reads the durable session policy, not the latest global setting.

## 12. Browser settings tab

The AgentTeams browser package contributes a new `子智能体` page through the official `settings.section` slot.

The page uses Harness locale, theme tokens, primitives, settings APIs, LLM provider/model catalog, and reasoning metadata.

Sections:

1. `委派模式`
   - Team mode (recommended/default for new sessions).
   - Native compatibility mode.
   - Explanation that mode changes apply to new sessions.
2. `成员模型`
   - Provider selector with `跟随队长`.
   - Model selector populated from the official Harness catalog.
   - Refresh/retry states driven by the official catalog API.
3. `成员推理强度`
   - Target-model default.
   - Route-aware inheritance.
   - Explicit effort choices supported by the selected target route.
4. `生效范围`
   - Existing members retain their route.
   - Future members use the current values.

The tab must never remain indefinitely in `加载中`. Every catalog request reaches one of `ready`, `empty`, or `error`, with a retry action and useful error text.

## 13. Legacy migration

Current desktop fields:

```text
agentTeamsMemberProvider
agentTeamsMemberModel
agentTeamsMemberReasoningEffort
```

Migration behavior:

- `agentTeamsMemberModel` migrates to `memberModel`.
- the currently ignored/empty LLM-provider field migrates only when it contains a valid explicit provider; otherwise it becomes `跟随队长`.
- empty `agentTeamsMemberReasoningEffort` migrates to `memberReasoningMode: target-default`.
- a non-empty effort migrates to `memberReasoningMode: explicit` plus the exact effort id.
- `delegationMode` defaults to `teams` for new sessions.

The wrapper passes legacy values only for the first migration. AgentTeams writes them into its Harness settings user layer with a migration version marker. Subsequent startups read Harness settings directly.

After successful migration and verification, remove from the desktop wrapper:

- subagent fields and controls in `desktop-settings.js` and the desktop settings client;
- the separate model-fetch path used only by those controls;
- AgentTeams member-model/reasoning lines from `generateAgentTeamsPatch()`;
- the loader rewrite that injects `memberReasoningEffort` into the upstream schema;
- obsolete tests and fixtures that assert the old static-patch behavior.

Window close/tray behavior remains in the desktop settings plugin.

## 14. Failure handling

- Invalid settings are rejected before persistence by the Harness schema.
- A configured provider/model that is no longer available causes member creation to fail with a route-specific message; no partial member record or child Session is created.
- An unsupported explicit effort names the provider/model and supported efforts.
- Failure to restore a required routing policy blocks resume rather than silently exposing a different tool set.
- Catalog failures affect only the settings UI; existing stored settings and running teams continue to work.
- AgentTeams tool/runtime failures keep their existing error and durable task semantics.

## 15. Testing

### Upstream-regression tests

- imported upstream AgentTeams tests pass unchanged before local changes;
- scheduler, mailbox, task attempts, archive, activity panel, and cold member restore stay unchanged.

### Settings tests

- namespace registration and schema defaults;
- provider/model/reasoning catalog states;
- settings writes and hot reads for future members;
- legacy migration idempotence;
- no permanent loading state.

### Selection tests

- explicit per-member route beats settings;
- settings beat captain fallback;
- target-default omits effort correctly;
- route-aware preserves captain effort only on the same route;
- explicit effort validates against the target model;
- existing member continuation restores its durable snapshot after settings change.

### Routing-policy tests

- fresh Team session records `teams-v1` before first request;
- fresh Native session records `native-v1`;
- legacy history without an event uses Native compatibility;
- child sessions inherit parent policy;
- Team sessions hide every currently visible native/indirect delegation tool;
- optional absent tools do not make restriction installation fail;
- AgentTeams member spawning still works because Host subagent providers remain registered;
- resumed sessions restore the original policy after global settings change.

### Desktop integration tests

- wrapper boots without the old member-reasoning loader rewrite;
- generated patch mounts the local AgentTeams package without static member defaults after migration;
- main settings modal shows separate `桌面` and `子智能体` tabs with Harness-consistent styling;
- configured member model and effort appear in the child's logged `request/header`;
- Native mode restores official delegation tools;
- Team mode delegates only through AgentTeams.

## 16. Rollout sequence

1. Import the exact upstream AgentTeams `0.1.13` source and prove baseline parity.
2. Add settings namespace and pure selection-policy tests.
3. Connect live settings to future member creation.
4. Add the Harness-native settings tab and official catalog integration.
5. Add durable routing-policy events and Team/Native prompt behavior.
6. Add Agent-scoped native/indirect delegation suppression.
7. Migrate legacy desktop settings.
8. Remove static patch generation and loader rewrite.
9. Run wrapper, plugin, integration, packaged-build, and startup smoke tests.

Each stage must remain bootable and independently testable.

## 17. Acceptance criteria

1. New sessions default to Team mode and expose no native or indirect delegation tools.
2. Native compatibility sessions retain official Harness delegation tools.
3. A session's delegation policy survives restart and global setting changes.
4. AgentTeams creates members with the configured provider/model/reasoning without relying on model-supplied default arguments.
5. Explicit user-requested per-member routing still overrides defaults.
6. Changing settings affects future members but never mutates existing member routes.
7. Cold-resumed members restore their stored provider/model/reasoning exactly.
8. The `子智能体` tab uses Harness styling and official catalog data and cannot remain indefinitely loading.
9. Electron desktop settings retain only desktop concerns.
10. No runtime edit of `node_modules`, generated member config, or reasoning-schema loader rewrite remains.
