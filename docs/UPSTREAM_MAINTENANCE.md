# Upstream maintenance and local capability registry

This document is the canonical map of behavior that must survive every
DeepSeek Harness or AgentTeams upstream refresh. Root `AGENTS.md` defines the
binding rules; this registry records who owns each capability and which tests
prove it still exists.

## Current local identities

- Windows desktop wrapper: `0.1.1-rc.14`
- AgentTeams fork: `0.1.13-desktop.3`, based on upstream `0.1.13`
- CPA provider plugin: `0.1.4`
- Models settings fork: `0.1.1-rc.2-desktop.2`
- Desktop Settings plugin: `0.1.1`
- Session Markdown export plugin: `0.1.0`

## AgentTeams owner

| Capability | Owner | Upstream relationship | Critical files | Required regression |
| --- | --- | --- | --- | --- |
| Harness-native `子智能体` section, shared provider/model catalog including CPA, target-default/route-aware/explicit reasoning, explicit route authority, Team/Native routing markers, native-tool suppression, member claim compatibility and durable task lifecycle | `win-desktop/agent-teams-plugin` | Local fork of `@nanmicoder/dsh-agent-teams@0.1.13`; classify every upstream change before import | `src/index.ts`, `src/settings.ts`, `src/selection-policy.ts`, `src/routing-policy.ts`, `src/host-model-catalog.ts`, `src/tools.ts`, `src/members.ts`, `src/scheduler.ts`, `src/client/AgentTeamsSettingsSection.tsx`, `UPSTREAM.md` | `pnpm test`; wrapper `tests/agent-teams-integration.test.js`, `tests/heal-desktop-plugins.test.js`, `tests/win-hide-console.test.js` |

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
| Local plugin installation, patch graph, startup healing, compiled-local-plugin artifact synchronization, OpenCode model-catalog preparation, verified OpenCode protocol/image-capability reconciliation (static, persisted and live catalogs), and the narrow manual validation bridge | `win-desktop` plus `opencode-capabilities-plugin` | `REAPPLY` until the pinned DSH/Pi catalog demonstrates equivalent per-model transport/capability coverage; known legacy modality mappings may correct only input capability, while unknown models retain text-only fallback. Do not infer an unknown model's protocol or retry a 500 over another endpoint. | `package.json`, `package-lock.json`, `scripts/sync-local-plugin-artifacts.mjs`, `config/agent-teams.patch.yml`, `src/dsh-service.js`, `src/model-fetcher.js`, `src/preload.cjs`, `src/settings-window.js`, `opencode-capabilities-plugin/lib/client.js` | `tests/heal-desktop-plugins.test.js`, `tests/local-plugin-artifacts.test.js`, `tests/model-fetcher.test.js`, `tests/opencode-capabilities-integration.test.js`, and the local capability manifest test |

## Required classification

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
