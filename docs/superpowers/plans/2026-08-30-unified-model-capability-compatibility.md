# Unified Model Capability Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one provider-neutral, user-triggered model capability probe that accurately persists image input, reasoning efforts, and verifiable protocol compatibility for every configured pi-ai Provider while preserving all existing local compatibility behavior.

**Architecture:** The Host side of the Models plugin owns a Typert Remote capability-probe service. It resolves the configured credential through the existing credential seam, sends bounded minimal requests using the currently selected protocol, classifies every check as `supported`, `unsupported`, `inconclusive`, or `not-applicable`, and returns only redacted capability results. The Client Models editor owns selection, cancellation, draft-only application, explicit overwrite confirmation, three-state image editing, and final settings mutation; it never receives a credential value from the Host.

**Tech Stack:** TypeScript/TSX local plugins, Cordis/Typert Host Remote service, Node `fetch`, React settings UI, Node built-in test runner, tsdown bundles, Electron Builder.

## Global Constraints

- Use the capability precedence `user explicit > successful probe > normalized discovery metadata > verified static catalog/provider default > pi-ai safe default`.
- A normal probe never overwrites an existing model-level capability; only the explicit `覆盖现有能力` draft option may do so.
- `自动` deletes model-level `input`; `文本和图像` stores `['text', 'image']`; `仅文本` stores `['text']`.
- Only explicit `supported` or explicit `unsupported` results may change a field; network, credential-temporary, rate-limit, 5xx/502, timeout, and stream failures remain `inconclusive` and preserve prior values.
- Use the current configured protocol and route; never switch protocol, address, provider, or model automatically.
- Do not inspect, log, persist, or return user session content, real files, real images, Authorization headers, API keys, or full upstream responses.
- Do not add Provider-name/model-name heuristics, a second CPA Models card, an AUTO plugin, an old-session migration layer, or a replacement grep compatibility rule.
- Preserve the existing AgentTeams role model/reasoning policy, CPA profile migration, OpenCode protocol/image/Kimi fixes, wrapper tool guidance, session export, and grep regressions.
- The Host Remote method must accept only concrete workspace-independent JSON fields and must be covered by the Models plugin's existing Host/client build boundary.
- Before provenance/version or release changes, run `npm run verify:upstream` from `D:\Trae\其他\deepseek-harness\win-desktop` and keep every existing regression enabled.

---

## File Map

- Create `win-desktop/models-settings-plugin/src/capability-probe-service.ts`: Host Remote service, credential resolution, protocol dispatch, bounded probe matrix, error redaction, and cancellation.
- Create `win-desktop/models-settings-plugin/src/capability-contract.ts`: shared JSON-safe result/status types and canonical merge helpers used by Host tests and Client-facing declarations.
- Create `win-desktop/models-settings-plugin/src/client/model-capabilities.ts`: provider-neutral draft merge, capability validation, display projection, and protocol-specific compatibility-field allowlist derived from the current model schema.
- Modify `win-desktop/models-settings-plugin/src/index.ts`: register the Host capability service and expose the existing Models plugin Host entry without moving provider-specific logic into the Client fork.
- Modify `win-desktop/models-settings-plugin/src/client/index.ts`: consume the generated Remote contract, inject a narrow probe face into the Models section, and export the new types.
- Modify `win-desktop/models-settings-plugin/src/client/ModelsSection.tsx`, `ProviderEditor.tsx`, and `ModelListEditor.tsx`: pass the current route/model draft to the probe UI and keep save behavior atomic.
- Modify `win-desktop/models-settings-plugin/src/client/locales.ts` and `ModelsSection.module.css`: add concise bilingual probe/overwrite/status copy and recognizable controls without creating another settings card.
- Create `win-desktop/models-settings-plugin/tests/capability-contract.test.js`, `capability-probe.test.js`, and `capability-ui.test.js`: pure contract, fake HTTP/credential probe, and source/UI regressions.
- Modify `win-desktop/models-settings-plugin/package.json`, `pnpm-lock.yaml`, `README.md`, `README.zh.md`, and `UPSTREAM.md`: dependencies, package version, user-facing behavior, and maintenance ownership.
- Modify `win-desktop/package.json`, `package-lock.json`/workspace lock as present, root `README.md`, `docs/UPSTREAM_MAINTENANCE.md`, and local capability manifest assertions: wrapper synchronization and refresh governance.
- Modify `win-desktop/tests/local-capability-manifest.test.js` and add `win-desktop/tests/model-capability-probe-integration.test.js`: wrapper ownership and installed bundle integration.

## Task 1: Define capability statuses, canonical fields, and merge rules

**Files:**
- Create: `win-desktop/models-settings-plugin/src/capability-contract.ts`
- Create: `win-desktop/models-settings-plugin/src/client/model-capabilities.ts`
- Test: `win-desktop/models-settings-plugin/tests/capability-contract.test.js`

**Interfaces:**
- `CapabilityStatus = 'supported' | 'unsupported' | 'inconclusive' | 'not-applicable'`.
- `CapabilityCheck = { status: CapabilityStatus; summary: string; error?: string }`.
- `ModelCapabilityPatch = { input?: ['text'] | ['text', 'image']; reasoningEfforts?: false | Readonly<Record<string, string | null>>; compat?: Readonly<Record<string, boolean | string>> }`.
- `ModelCapabilityProbeResult = { modelId: string; protocol: string; checks: Readonly<Record<string, CapabilityCheck>>; patch: ModelCapabilityPatch; }`.
- `mergeModelCapabilityPatch(model, patch, { overwriteExisting, source })` returns a cloned row, preserves all unknown fields, never changes `id`, `api`, capacities, cost, or credentials, and applies only allowed successful/explicitly unsupported fields.

- [ ] **Step 1: Write failing pure-contract tests** for missing/empty `input`, malformed `input`, `none`/`off: null`, partial reasoning success, all reasoning unsupported, inconclusive preservation, overwrite-off preservation, overwrite-on replacement, unknown-field preservation, and refusal to alter identity/protocol/capacity/cost.
- [ ] **Step 2: Run `pnpm --dir win-desktop/models-settings-plugin test -- --test-name-pattern capability-contract`** and confirm the new imports/functions fail before implementation.
- [ ] **Step 3: Implement only the canonical types, strict validators, and merge function** with no Provider/model-name branches.
- [ ] **Step 4: Run the focused contract tests and the existing model-input tests**; require all focused assertions to pass.
- [ ] **Step 5: Commit** with `feat: define provider-neutral model capability contract`.

## Task 2: Implement the Host probe matrix against fake transports

**Files:**
- Modify: `win-desktop/models-settings-plugin/src/capability-probe-service.ts`
- Test: `win-desktop/models-settings-plugin/tests/capability-probe.test.js`

**Interfaces:**
- `probeModelCapabilities(request, dependencies?)` accepts `{ modelId, protocol, baseURL, credentialRef?, apiKey?, candidate?, signal? }` and returns `ModelCapabilityProbeResult`.
- Dependencies are injectable `{ fetch, resolveCredential, now }` so tests never use the network or real credentials.
- Wire dispatchers are selected only from the explicit protocol value: `openai-completions`, `openai-responses`, `anthropic-messages`; unknown protocols return `not-applicable` checks and do not guess.

- [ ] **Step 1: Write failing fake-fetch tests** for text success, fixed 1×1 image success/failure, reasoning partial success, CommandCode-style `none` 400 with other levels accepted, developer/strict/store/streaming usage/max-token-field checks, 400 unsupported classification, timeout/502/5xx inconclusive classification, redacted error summaries, and AbortSignal cancellation.
- [ ] **Step 2: Run the focused probe tests and verify RED**; no real endpoint or API key is permitted.
- [ ] **Step 3: Implement minimal request builders** for the three explicit wire protocols, a fixed 1×1 PNG payload, strict response-shape checks, HTTP/error classification, and the `off: null` semantic when omitted reasoning succeeds after `none` is rejected.
- [ ] **Step 4: Add the ordered reasoning probe** using advertised valid efforts first, then the canonical fallback effort keys; retain successful wire spellings and do not infer support from an unrelated error.
- [ ] **Step 5: Run focused probe tests plus `npm test --prefix win-desktop`** and require zero failures.
- [ ] **Step 6: Commit** with `feat: add bounded provider-neutral model capability probes`.

## Task 3: Mount the Host Remote and credential-safe cancellation bridge

**Files:**
- Modify: `win-desktop/models-settings-plugin/src/capability-probe-service.ts`
- Modify: `win-desktop/models-settings-plugin/src/index.ts`
- Modify: `win-desktop/models-settings-plugin/src/client/index.ts`
- Modify: `win-desktop/models-settings-plugin/tsconfig.json`
- Modify: `win-desktop/models-settings-plugin/package.json`
- Test: `win-desktop/models-settings-plugin/tests/capability-probe.test.js`
- Test: `win-desktop/tests/model-capability-probe-integration.test.js`

**Interfaces:**
- Host service key: `modelCapabilityProbe`.
- Remote namespace: `model-capabilities`; method: `probe`.
- Client face: `ctx.remote.modelCapabilities.probe(request, signal?)` with a JSON-safe request that contains the route/model/protocol facts, optional one-shot `apiKey`, and no stored credential value.
- Stored credentials resolve only through `ctx.credentials.resolve(credentialRef)` inside the Host request. The resolved value is never included in the result, logs, or error string.

- [ ] **Step 1: Write failing service-registration and integration tests** asserting the Host service exports the exact Remote method, resolves a stored credential when no one-shot key is supplied, prefers a non-empty one-shot key for an unsaved draft, passes cancellation through, and returns no secret fields.
- [ ] **Step 2: Run the focused tests and confirm RED** against the empty Host entry.
- [ ] **Step 3: Register the service using the repository's `TypertRemoteService`/`Remote` pattern** and add only the required Host peer dependencies; do not expose a second browser API or read credentials in the renderer.
- [ ] **Step 4: Build the Models plugin and run the integration source/bundle assertions**; verify the client bundle purity gate accepts only generated remote/type imports.
- [ ] **Step 5: Commit** with `feat: expose credential-safe capability probe remote`.

## Task 4: Add model-row draft UI for selection, probe, cancellation, and overwrite

**Files:**
- Modify: `win-desktop/models-settings-plugin/src/client/ModelListEditor.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/ProviderEditor.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/ModelsSection.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/locales.ts`
- Modify: `win-desktop/models-settings-plugin/src/client/ModelsSection.module.css`
- Modify: `win-desktop/models-settings-plugin/src/client/index.ts`
- Test: `win-desktop/models-settings-plugin/tests/capability-ui.test.js`

**Interfaces:**
- `ModelListEditor` receives a `probe` face with `probe(request, signal?)`, the current Provider route facts, and the existing model draft array.
- UI state is draft-only: selected model IDs, running model ID/check, `AbortController`, overwrite boolean, and result map; closing/reloading before save discards all capability changes.
- `applyProbeResults(models, results, overwriteExisting)` uses the pure merge from Task 1 and leaves every unselected/unfinished model untouched.

- [ ] **Step 1: Write failing source/UI tests** for a recognizable “能力探测” section inside the existing Provider model editor, per-model checkbox, `探测并应用`, `取消探测`, `覆盖现有能力`, status text, automatic sequential probing, and preservation of existing image/reasoning/compat fields when overwrite is off.
- [ ] **Step 2: Run the focused UI tests and confirm RED**.
- [ ] **Step 3: Implement the smallest UI path**: selection, sequential calls, cancellation, result-to-draft application, and no settings write until the parent Save action succeeds.
- [ ] **Step 4: Add three-state image choice and reasoning/compat summary controls** to the same model row, reusing existing `model-input.ts` semantics and schema validation.
- [ ] **Step 5: Run Models plugin tests and TypeScript typecheck**; ensure malformed `input` and invalid compat values block Save with actionable localized text.
- [ ] **Step 6: Commit** with `feat: add draft model capability validation controls`.

## Task 5: Integrate discovery metadata and all supported Providers without heuristics

**Files:**
- Modify: `win-desktop/models-settings-plugin/src/client/ModelListEditor.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/model-capabilities.ts`
- Modify: `win-desktop/models-settings-plugin/src/client/DeepSeekModelsEditor.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/store.ts`
- Modify: `win-desktop/cpa-provider-plugin/src/types.ts`
- Modify: `win-desktop/cpa-provider-plugin/src/profile.ts`
- Modify: `win-desktop/opencode-capabilities-plugin/src/index.ts` or the current catalog owner only when the existing source shows a required additive field
- Test: `win-desktop/models-settings-plugin/tests/capability-contract.test.js`
- Test: `win-desktop/tests/cpa-provider-integration.test.js`
- Test: `win-desktop/tests/model-fetcher.test.js`

**Interfaces:**
- Normalize optional discovery capability fields only through a provider-neutral canonical adapter at the model-row boundary.
- CPA, WOYAOPRO, OpenCode, CommandCode, and custom OpenAI-compatible routes all call the same probe Remote method; no provider/model string is inspected by the Models fork.
- Existing static OpenCode corrections remain higher priority than unknown-model safe defaults, and hydration never rewrites persisted settings.

- [ ] **Step 1: Add failing integration assertions** that a discovery capability candidate fills an unset draft, a successful probe replaces only an unset candidate, explicit model input/reasoning/compat survives ordinary probe, and changing provider/protocol does not reuse another route's result.
- [ ] **Step 2: Run focused integration tests and confirm RED**.
- [ ] **Step 3: Implement candidate normalization and route wiring** while keeping CPA-specific normalization in the CPA plugin and OpenCode catalog corrections in the OpenCode owner.
- [ ] **Step 4: Run CPA, OpenCode, model-input, grep, AgentTeams, and Models tests**; verify `gemini-3.7-flash-high` is handled as a normal protocol/model probe, not a special case.
- [ ] **Step 5: Commit** with `feat: unify capability discovery across configured model routes`.

## Task 6: Preserve upstream ownership, manifests, documentation, and versions

**Files:**
- Modify: `win-desktop/models-settings-plugin/package.json`, `pnpm-lock.yaml`, `README.md`, `README.zh.md`, `UPSTREAM.md`
- Modify: `win-desktop/package.json`, root lockfile if present, `README.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`
- Test: `win-desktop/tests/local-plugin-artifacts.test.js`

- [ ] **Step 1: Add failing manifest assertions** for wrapper-owned probe service, provider-neutral Model editor ownership, retained grep/OpenCode/AgentTeams/CPA capabilities, and prohibition of AUTO/legacy migration restoration.
- [ ] **Step 2: Run manifest tests and confirm RED**.
- [ ] **Step 3: Update package versions, wrapper file dependencies, lockfile entries, README version/feature notes, and maintenance classification** with `REAPPLY` ownership unless fresh upstream evidence proves `UPSTREAM_EQUIVALENT` or `SUPERSEDED_BY_DESIGN`.
- [ ] **Step 4: Run `git diff --check`, package-level typechecks, and the complete local plugin test set**.
- [ ] **Step 5: Commit** with `docs: record unified model capability ownership`.

## Task 7: Full regression gate and release artifact build

**Files:**
- Modify only release metadata files proven necessary after the gate: `win-desktop/package.json`, `README.md`, release notes, and `docs/UPSTREAM_MAINTENANCE.md`
- Generate only ignored/untracked output under `win-desktop/dist/`; never stage it in source commits.

- [ ] **Step 1: From `D:\Trae\其他\deepseek-harness\win-desktop`, run `npm run verify:upstream`** and stop on any regression failure; do not weaken or skip tests.
- [ ] **Step 2: Run `npm test` from `D:\Trae\其他\deepseek-harness\win-desktop` and inspect the full pass/fail count.**
- [ ] **Step 3: Run `npm run dist:win`** only after the upstream gate passes; build NSIS and ZIP with the existing x64 targets and no publish flag.
- [ ] **Step 4: Verify the unpacked package resolves `@deepseek-ai/dsh-app-boot`, `@deepseek-ai/cordis`, loader/include packages, `js-yaml`, and `argparse` from `src/dsh-service.js`; record EXE/ZIP SHA-256 and `Get-AuthenticodeSignature` results.
- [ ] **Step 5: Run `git status --short --branch`, classify every changed/untracked path, and prove no secrets, runtime state, screenshots, installers, or package output is staged.**
- [ ] **Step 6: Commit the final source/documentation changes** with `chore: prepare unified capability compatibility release` only after fresh verification evidence is available.

## Self-Review Checklist

- [ ] Every design requirement has a task: statuses, precedence, explicit probe, fixed image, reasoning `none` handling, compatibility checks, cancellation, credential safety, draft-only writes, all Providers, no heuristics, preserved local regressions, upstream refresh governance, and EXE/ZIP verification.
- [ ] No task introduces an AUTO dependency, old-session migration, provider-name/model-name branch, second Models card, protocol fallback, or automatic settings mutation.
- [ ] Host and Client signatures use one exact JSON-safe contract; cancellation is the final optional boundary argument.
- [ ] All user-facing prose is in task descriptions/acceptance and all deliverable paths are concrete workspace-relative POSIX paths.
- [ ] The existing current branch remains the implementation branch; no destructive cleanup or unrelated refactor is part of this plan.
