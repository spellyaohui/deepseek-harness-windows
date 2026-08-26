# OpenCode capability validation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct stale OpenCode Go image capabilities automatically and let a user re-run the same validation from Settings → 模型.

**Architecture:** The wrapper owns a versioned capability overlay in `model-fetcher.js`; it applies profile-level Pi corrections and legacy modality-only corrections without guessing unknown models. A small local settings plugin uses an Electron preload/IPC bridge to invoke the existing reconciler and report the result.

**Tech Stack:** Electron 43, Node 22 ESM, Cordis client plugin, React, node:test.

## Global Constraints

- Do not read, log, copy, or modify user Tokens, API keys, `settings.yaml`, sessions, or installers.
- OpenCode unknown IDs remain text-only; no fallback retry may change a model protocol after a 500.
- CPA remains a single native Models provider row; Models remains provider-neutral.
- `npm run verify:upstream` must pass before a package is built.
- Add no external dependency and do not access the network in the regression gate.

---

### Task 1: Expand offline OpenCode catalog reconciliation

**Files:**
- Modify: `win-desktop/src/model-fetcher.js`
- Modify: `win-desktop/tests/model-fetcher.test.js`

**Interfaces:**
- Produces: `reconcileOpencodeCatalog(catalog)` repairs verified Pi profiles and compatibility modality overrides.
- Produces: `validateOpencodeCatalog(options)` returns `{ models, repaired, error }` without fetching a model list.

- [ ] **Step 1: Write failing regression cases**

Add a catalog fixture containing `ox-alpha-free`, `deepseek-v4-flash-vision-exp`, `qwen3.8-max`, `kimi-k2.5`, `qwen3.5-plus`, `mimo-v2-omni`, `muse-spark-1.2-contributor`, `gpt-5.6-luna`, `mimo-v2.5-pro`, and one unknown ID. Assert the first eight contain `image`, Ox retains `openai-completions` and `1000000/131072`, `mimo-v2.5-pro` is text-only, and unknown remains text-only.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/model-fetcher.test.js`

Expected: Ox and legacy vision assertions fail because the four-profile reconciler leaves them text-only.

- [ ] **Step 3: Implement the minimal overlay**

Add frozen profile data for current Pi `0.84.3` models whose installed `0.82.1` entries differ. Add a separate frozen `{ modelId: ['text', 'image'] | ['text'] }` legacy compatibility map. Apply the profile map first, then only replace `input` for compatibility IDs. Add `validateOpencodeCatalog()` that calls the file reconciler and reports whether serialized catalog content changed.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `node --test tests/model-fetcher.test.js`

Expected: all catalog reconciliation tests pass, including Ox, legacy vision, false-positive removal, and unknown fallback.

- [ ] **Step 5: Commit**

```powershell
git add win-desktop/src/model-fetcher.js win-desktop/tests/model-fetcher.test.js
git commit -m "fix: reconcile OpenCode image capabilities"
```

### Task 2: Expose an explicit Models settings validation action

**Files:**
- Create: `win-desktop/opencode-capabilities-plugin/package.json`
- Create: `win-desktop/opencode-capabilities-plugin/lib/index.js`
- Create: `win-desktop/opencode-capabilities-plugin/lib/client.js`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/config/agent-teams.patch.yml`
- Modify: `win-desktop/src/preload.cjs`
- Modify: `win-desktop/src/settings-window.js`
- Modify: `win-desktop/tests/opencode-capabilities-integration.test.js`

**Interfaces:**
- Consumes: `window.dshDesktop.validateOpencodeCapabilities(): Promise<{ repaired: number, error?: string }>`.
- Produces: `settings.models.card` contribution with an accessible button and live status.

- [ ] **Step 1: Write failing integration tests**

Assert the package is a local `file:` dependency, is mounted in the desktop patch graph, its client injects only `settings.models.card`, the preload exposes `validateOpencodeCapabilities`, and the main IPC handler invokes the catalog validator without touching settings or credentials.

- [ ] **Step 2: Run the focused integration test to verify RED**

Run: `node --test tests/opencode-capabilities-integration.test.js`

Expected: FAIL because the package, bridge, and handler do not exist.

- [ ] **Step 3: Implement the bridge and card**

Register `opencode-capabilities:validate` once in `installSettingsIpc`, pass a validator dependency for tests, expose it as `dshDesktop.validateOpencodeCapabilities`, and add a minimal client card. The client disables during the call; it reports repaired/no-change/failure state and says restart is required. It creates no provider row.

- [ ] **Step 4: Refresh the local file dependency lock entry**

Use Node 22 and the repository's existing npm settings to update only the local package dependency and lockfile metadata. Inspect the lockfile diff for unrelated changes before staging it.

- [ ] **Step 5: Run the focused integration test to verify GREEN**

Run: `node --test tests/opencode-capabilities-integration.test.js`

Expected: PASS with all bridge, patch, and UI ownership assertions.

- [ ] **Step 6: Commit**

```powershell
git add win-desktop/opencode-capabilities-plugin win-desktop/package.json win-desktop/package-lock.json win-desktop/config/agent-teams.patch.yml win-desktop/src/preload.cjs win-desktop/src/settings-window.js win-desktop/tests/opencode-capabilities-integration.test.js
git commit -m "feat: add OpenCode capability validation action"
```

### Task 3: Preserve release provenance and run the acceptance gate

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`

- [ ] **Step 1: Document ownership and version**

Raise the wrapper release to `0.1.1-rc.14`, state that the wrapper owns automatic/manual OpenCode capability validation, and require its regression on future upstream refreshes. Add an rc.14 README entry that describes stale image-capability repair and the manual Settings action.

- [ ] **Step 2: Add failing manifest assertions**

Assert the new local plugin, integration test, reconciliation markers, and patch entry remain registered.

- [ ] **Step 3: Run the manifest test**

Run: `node --test tests/local-capability-manifest.test.js`

Expected: PASS after documentation and ownership records are synchronized.

- [ ] **Step 4: Run the mandatory gate**

Run: `npm run verify:upstream`

Expected: exit code 0; no test is skipped, weakened, or installed from the network.

- [ ] **Step 5: Commit**

```powershell
git add AGENTS.md docs/UPSTREAM_MAINTENANCE.md README.md win-desktop/README.md win-desktop/package.json win-desktop/package-lock.json win-desktop/tests/local-capability-manifest.test.js
git commit -m "docs: record OpenCode capability validation"
```
