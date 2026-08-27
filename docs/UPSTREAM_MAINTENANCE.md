# Upstream maintenance and local capability registry

This document is the canonical map of behavior that must survive every
DeepSeek Harness or AgentTeams upstream refresh. Root `AGENTS.md` defines the
binding rules; this registry records who owns each capability and which tests
prove it still exists.

## Current local identities

- Windows desktop wrapper: `0.1.1-rc.20`
- OpenCode capability validation plugin: `0.1.1`
- AgentTeams fork: `0.1.14-desktop.3`, based on upstream `0.1.14`
- CPA provider plugin: `0.1.4`
- Models settings fork: `0.1.1-rc.2-desktop.2`
- Desktop Settings plugin: `0.1.1`
- Session Markdown export plugin: `0.1.0`

## AgentTeams owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Harness-native `子智能体` section, shared provider/model catalog including CPA, target-default/route-aware/explicit reasoning, explicit route authority, Team/Native routing markers, native-tool suppression, member claim compatibility and durable task lifecycle | `win-desktop/agent-teams-plugin` | Local fork of `@nanmicoder/dsh-agent-teams@0.1.14`; classify every upstream change before import | `src/index.ts`, `src/settings.ts`, `src/selection-policy.ts`, `src/routing-policy.ts`, `src/host-model-catalog.ts`, `src/tools.ts`, `src/members.ts`, `src/scheduler.ts`, `src/client/AgentTeamsSettingsSection.tsx`, `UPSTREAM.md` | `pnpm test`; wrapper `tests/agent-teams-integration.test.js`, `tests/heal-desktop-plugins.test.js`, `tests/win-hide-console.test.js` |
| Persisted named profiles, built-in `software-delivery` roster, profile editor and safe startup injection | `win-desktop` host bridge plus `win-desktop/agent-teams-plugin` | `REAPPLY`: upstream owns profile execution semantics; the Windows fork owns local persistence, editor UX, validation boundary, and restart-required injection | `src/agent-teams-profile-store.js`, `src/desktop-settings.js`, `src/settings-window.js`, `src/preload.cjs`, `src/dsh-service.js`, `config/agent-teams.patch.yml`, `src/client/TeamProfilesEditor.tsx`, `src/client/profile-editor.ts`, `src/client/desktop-bridge.ts` | `tests/agent-teams-profile-store.test.js`, `tests/agent-teams-integration.test.js`, `tests/desktop-settings-plugin.test.js`; plugin `scripts/profile-editor-verify.mjs` and `scripts/settings-client-verify.mjs` |

## CPA owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| CLIProxyAPI address and Token flow, `/v1/models` discovery, `openai-responses` profile, text/image input modalities, revision-guarded migration of legacy CPA profiles, seven-level R vocabulary, GPT-5.6 effort filtering, per-model raw context/output capacities, redacted persistence, and exactly one native Models provider row | `win-desktop/cpa-provider-plugin` | Independent local Provider plugin; native editor is rendered by the Models fork through a provider-profile normalization seam | `src/index.ts`, `src/migration.ts`, `src/address.ts`, `src/profile.ts`, `src/reasoning.ts`, `src/client/index.tsx`, `src/client/capacity.ts`, `src/client/controller.ts` | `pnpm test`; wrapper `tests/cpa-provider-integration.test.js` and `tests/agent-teams-integration.test.js` |

## Models settings owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Additive `settings.models.card` slot, provider-neutral profile normalization seam, and native expandable provider rows | `win-desktop/models-settings-plugin` | Minimal fork of upstream `@deepseek-ai/dsh-client-ui-settings-models@0.1.1-rc.2`; no CPA-specific behavior belongs here | `src/client/ModelsSection.tsx`, `src/client/ProviderEditor.tsx`, `src/client/provider-profile.ts`, `UPSTREAM.md` | `pnpm test`; wrapper `tests/cpa-provider-integration.test.js` |

## Desktop Settings owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Harness-native `桌面` settings section, theme-consistent window behavior UI, IPC bridge without a separate settings window, and immediate close-behavior autosave with rollback | `win-desktop/desktop-settings-plugin` plus wrapper bridge | Independent local desktop integration | `desktop-settings-plugin/lib/client.js`, `src/settings-window.js`, `src/desktop-settings.js`, `src/preload.cjs`, `config/agent-teams.patch.yml` | wrapper `tests/desktop-settings-plugin.test.js` and `tests/desktop-settings.test.js` |

## Session Markdown owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Header export action, stable chronological continuation transcript, descendant lineage, open-turn handling, tool-payload folding, deterministic Markdown, safe filenames and streaming HTTP contract | `win-desktop/session-markdown-export-plugin` | Independent local plugin | `src/session-export.ts`, `src/content.ts`, `src/render-markdown.ts`, `src/http.ts`, `src/client/controller.ts`, `src/client/HeaderAction.tsx` | `pnpm test`; wrapper `tests/session-markdown-export-integration.test.js` |

## Windows wrapper owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Shell and filesystem-mutation escalation normalization without weakening validation or real widening approval, hidden Node/sandbox console windows, loader injection and child-process guard | `win-desktop` | Compatibility rewrites over official Windows runtime packages | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs`, `src/win-hide-console.mjs`, `src/dsh-service.js` | `tests/win-hide-console.test.js`, including real Pwsh/Bash and `dsh-tool-fs` runtime fixtures, plus `tests/dsh-service-syntax.test.js` |
| Recovery of non-empty OpenCode tool streams that end without `finish_reason`, while incomplete streams still fail | `win-desktop` | Narrow compatibility rewrite over the installed OpenCode stream module | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs` | `tests/opencode-stream-rewrite.test.js` |
| Local plugin installation, patch graph, startup healing, compiled-local-plugin artifact synchronization, OpenCode model-catalog preparation, verified OpenCode protocol/image-capability reconciliation (static, persisted and live catalogs), including Kimi K3's tool-compatible first-request profile, official-client Schema lowering, provider-wide OpenCode Go session affinity, and the narrow manual validation bridge | `win-desktop` plus `opencode-capabilities-plugin` | `REAPPLY` until the pinned DSH/Pi catalog demonstrates equivalent per-model transport/capability coverage; known legacy modality mappings may correct only input capability, while unknown models retain text-only fallback. Every OpenCode Go model must receive `x-opencode-session` from the active Harness session, including with `cacheRetention: "none"`; generic providers remain unchanged. Kimi K3 must keep `supportsStrictMode: false`, reasoning-content replay, deferred-tool handling, and Kimi Schema normalization for ref siblings and tuple-style `items`. Do not infer an unknown model's protocol or retry a 500 over another endpoint. | `package.json`, `package-lock.json`, `scripts/sync-local-plugin-artifacts.mjs`, `config/agent-teams.patch.yml`, `src/dsh-service.js`, `src/model-fetcher.js`, `src/win-hide-console-rewrite.js`, `src/preload.cjs`, `src/settings-window.js`, `opencode-capabilities-plugin/lib/client.js` | `tests/heal-desktop-plugins.test.js`, `tests/local-plugin-artifacts.test.js`, `tests/model-fetcher.test.js`, `tests/opencode-stream-rewrite.test.js`, `tests/opencode-capabilities-integration.test.js`, and the local capability manifest test |

OpenCode 官方客户端在其请求准备代码中会为 `providerID` 以 `opencode` 开头的请求设置
`x-opencode-session`；OpenCode Go 网关也以该头作为会话粘性标识。Windows 包装器
只在 `opencode-go` 的 Pi Completions/Responses 请求中补这一头，Muse Spark 原有的
`openai-responses` 模型档案保持不变。依据：[OpenCode 请求准备源码](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/llm/request.ts)、[OpenCode Go 会话粘性说明](https://github.com/anomalyco/opencode/issues/35402)。

## Required classification

### Refresh classification — 2026-08-27

The live upstream check found AgentTeams `v0.1.14` at source commit
`5fe388f1a30da7b1374294b25bd6f8ad74ab6aa5`. Official Harness remains pinned at
`0.1.1-rc.2`; Auto Mode remains `0.1.5`. The six registered owner rows were
classified as follows:

| Registered owner row | Result | Refresh action |
| --- | --- | --- |
| AgentTeams | `REAPPLY` | Imported upstream v0.1.14, then reapplied the local settings/catalog, route policy, Team/Native tool boundary, claim compatibility, and Windows verification seams. |
| CPA | `REAPPLY` | No upstream owner change; retained the independent CPA plugin and its migration, modality, capacity, and native-row regressions. |
| Models settings | `REAPPLY` | No upstream owner change; retained the provider-neutral native editor and additive slot seam without adding CPA rules. |
| Desktop Settings | `REAPPLY` | No upstream owner change; retained the Harness-native desktop section and immediate-save IPC bridge. |
| Session Markdown | `REAPPLY` | No upstream owner change; retained continuation export ownership and regression coverage. |
| Windows wrapper | `REAPPLY` | No upstream owner change; retained shell, OpenCode, plugin-mount, startup-healing, and artifact synchronization compatibility. |

AgentTeams' mixed upstream/local capability row is further split here so that
an upstream-equivalent behavior is not mistaken for ownership of the local
fork's settings contract:

| AgentTeams capability | Result | Evidence/action |
| --- | --- | --- |
| v0.1.14 staged plans, atomic approval, halt/resume, profiles, quality gates, fallback, and activity controls | `UPSTREAM_EQUIVALENT` | Imported the upstream implementation and retained its offline, lifecycle, quality-gate, and stress regressions. |
| Local persisted profile editor, built-in roster, host IPC and restart-time injection | `REAPPLY` | Reapplied the smallest wrapper seam around the upstream profile schema; host validation is fail-closed, the editor preserves all upstream fields, and profile/store/YAML regressions pass. |
| Local `子智能体` settings, shared catalog including CPA, target-default/route-aware/explicit reasoning, and explicit route authority | `REAPPLY` | Kept the local settings runtime, model catalog, selection policy, and settings-client regressions. |
| Team/Native durable markers, native-tool suppression, member claim compatibility, and local desktop mounting | `REAPPLY` | Kept the routing policy, tolerant claim behavior, client injection, and wrapper integration regressions. |
| Durable task/member/attempt recovery core | `UPSTREAM_EQUIVALENT` | Reconciled the v0.1.14 lifecycle implementation and passed the lifecycle and complex stress suites; local claim/policy seams remain reapplied. |

No registered capability required `SUPERSEDED_BY_DESIGN` in this refresh.

Record one result for every row above during a refresh:

- `UPSTREAM_EQUIVALENT`: upstream owns equivalent observable behavior and the
  retained regression passes against it.
- `REAPPLY`: the capability is still local and its smallest compatible patch is
  reapplied.
- `SUPERSEDED_BY_DESIGN`: implementation ownership changes, but the requirement
  and regression are migrated before the old code is removed.

An upstream implementation can replace local code, but it cannot replace the
regression evidence. Tests survive ownership moves.

## Seven-step upstream refresh workflow

1. Create a fresh isolated worktree and record the current branch, HEAD, dirty
   state, upstream tag/commit, and affected package versions.
2. Run the current `npm run verify:upstream` gate before importing anything; a
   failing baseline must be diagnosed separately.
3. Compare the new upstream source with every registry row and assign one of
   the three classifications above. Do not resolve conflicts by deletion.
4. Import upstream changes, then reapply or migrate each local capability in
   its existing ownership boundary.
5. Update package versions, local `file:` dependencies, lockfile entries,
   README text, provenance records, and integration assertions together.
6. Run `npm run verify:upstream`; fix the implementation rather than weakening,
   deleting, or skipping a regression.
7. Review the public-repository diff for credentials, runtime state, logs,
   screenshots, exports, installers, generated output, and local upstream
   checkouts. Only after the gate and review pass may provenance be finalized
   or release packaging begin.

## Gate contract

From `win-desktop`:

```powershell
npm run verify:upstream
```

The command runs the Models, CPA, AgentTeams, Session Markdown, and desktop
test suites sequentially, then synchronizes each local plugin `lib`
directory into its existing `file:` dependency before wrapper tests verify the
packed runtime surface. It must not install dependencies, publish packages,
build installers, access the network, or mutate live session/team state.
