# Desktop Settings Tab Implementation Plan

**Goal:** Move desktop preferences into the main DSH settings modal as a native settings section and make subagent model loading terminate with a local-catalog fallback.

**Architecture:** The wrapper exposes desktop settings/model IPC through the existing main-window preload. A small web client plugin registers a `settings.section` entry named `desktop`, so the upstream settings shell owns navigation, modal chrome, and theme. The model service uses a bounded API request and returns the local catalog when the live endpoint is unavailable.

**Tech Stack:** Electron 43, Node.js ESM, DSH client-module bundles, React 18 client slot, plain CSS variables from the DSH theme.

## Global Constraints

- Do not keep a second desktop-settings BrowserWindow.
- Do not keep the injected top-right floating settings button.
- Preserve existing `desktop-settings.json` keys and IPC payload names.
- Show a usable model list even when the OpenCode API is slow or unavailable.

### Task 1: Bound model loading

**Files:**
- Modify: `win-desktop/src/model-fetcher.js`
- Test: `win-desktop/tests/model-fetcher.test.js`

- [ ] Add tests for timeout/fallback behavior.
- [ ] Add an 8-second abort signal to live model requests.
- [ ] Return the catalog list with an explicit fallback source when the API fails.
- [ ] Run the focused model-fetcher tests.

### Task 2: Main-window bridge and native settings plugin

**Files:**
- Create: `win-desktop/desktop-settings-plugin/package.json`
- Create: `win-desktop/desktop-settings-plugin/lib/index.js`
- Create: `win-desktop/desktop-settings-plugin/lib/client.js`
- Create: `win-desktop/desktop-settings-plugin/lib/invariant.js`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/config/agent-teams.patch.yml`
- Modify: `win-desktop/src/preload.cjs`
- Modify: `win-desktop/src/settings-window.js`
- Modify: `win-desktop/src/main.js`

- [ ] Expose `fetchModels` and `refreshModels` on `window.dshDesktop`.
- [ ] Register desktop IPC handlers during main-window startup.
- [ ] Register the plugin in the DSH patch graph.
- [ ] Render the desktop section with close behavior, model, reasoning effort, save state, and explicit loading/error states.
- [ ] Use the DSH theme variables and settings-shell spacing.

### Task 3: Remove the obsolete separate surface

**Files:**
- Modify: `win-desktop/src/main.js`
- Modify: `win-desktop/src/settings-window.js`
- Modify: `win-desktop/src/settings-preload.cjs`

- [ ] Remove the floating-button injection.
- [ ] Remove tray actions that open the second BrowserWindow.
- [ ] Keep compatibility only where it does not create another visible settings surface.

### Task 4: Build and verify

- [ ] Run focused tests and JavaScript syntax checks.
- [ ] Build the Windows installer and ZIP.
- [ ] Launch the unpacked executable and verify it remains alive for a smoke interval.
- [ ] Inspect the packaged source for the plugin and timeout changes.
