# Native CPA settings and desktop autosave design

**Date:** 2026-08-24

**Status:** Approved for implementation

**Release target:** `v0.1.1-rc.9`

## Goal

Remove the duplicate CPA settings surface while preserving every CPA runtime
capability, and make the single desktop preference persist immediately when it
changes. The public Windows release must retain these behaviors across future
DeepSeek Harness and AgentTeams upstream updates.

## User-visible behavior

### Models settings

- The Models page shows `CPA / CLIProxyAPI` exactly once, as the native provider
  row in the configured-provider list.
- The dedicated expanded CPA card above the provider list is not registered or
  rendered.
- Clicking the native row's `编辑` action remains the only CPA configuration
  entry. Its existing native disclosure controls remain responsible for API
  address, Token, model discovery, model selection, context-window capacity,
  and maximum-output-token capacity.
- CPA continues to use `openai-responses`, the `CPA_API_KEY` credential
  reference, normalized `/v1` endpoints, and the model-specific English R
  vocabulary. GPT-5.6 models expose `none`, `low`, `medium`, `high`, `xhigh`,
  and `max`; other compatible models retain the full seven-value mapping.
- CPA models remain available to the main-session selector and AgentTeams.

### Desktop settings

- The Desktop section continues to contain only the close-window behavior
  selector.
- Changing the selector immediately calls the existing desktop-settings IPC
  bridge and persists the selected value. There is no separate save button.
- While the write is in progress the selector is disabled, preventing
  out-of-order writes.
- A successful write shows a short accessible saved status.
- A failed write restores the previously persisted selection and shows an
  accessible inline error. The user can retry by selecting the desired value
  again.

## Architecture and ownership

### CPA

The CPA plugin remains the owner of provider-specific behavior. Removing its
dedicated Models card is a presentation change, not removal of the plugin.
Address normalization, credential conventions, model discovery, reasoning
mapping, capacity preservation, and the redacted provider profile remain in
`win-desktop/cpa-provider-plugin`.

The Models settings fork remains provider-neutral. Its native provider editor
continues to display and edit the CPA profile without acquiring CPA-specific
rules. Any compatibility work needed to preserve CPA profile semantics belongs
to the CPA plugin or its integration boundary, not to generic Models UI code.

### Desktop settings

The existing Electron IPC and synchronous persisted store remain unchanged.
Only the browser-side interaction changes from draft-plus-submit to
change-plus-persist. The main process remains the source of truth and returns
the committed settings object after each write.

## Data flow

### Native CPA row

1. Harness resolves the configured `llm-pi-ai.providers.cpa` profile.
2. The native Models page renders one configured-provider row.
3. The user expands the row and edits the redacted profile and credential.
4. The settings service persists profile fields; the credentials service
   persists the Token separately.
5. The shared model catalog makes the resulting CPA models available to main
   sessions and AgentTeams.

### Desktop autosave

1. The user selects `quit` or `tray`.
2. The browser stores the previously committed value, updates the visible
   selection, disables the control, and invokes `desktop-settings:set`.
3. The main process persists the partial update and broadcasts the committed
   settings.
4. On success the browser adopts the returned settings and reports `已保存`.
5. On failure the browser restores the previous value and reports the error.

## Regression requirements

Tests must prove all of the following:

1. The CPA client no longer registers a dedicated `settings.models.card` with
   id `cpa`.
2. The installed CPA plugin and native Models provider row remain present.
3. CPA address normalization, credential redaction, model discovery,
   model-specific reasoning mappings, raw context-window values, raw maximum
   output values, main-session visibility, and AgentTeams visibility remain
   covered.
4. The Desktop section contains no save button and persists from the select
   change handler.
5. Desktop autosave disables the selector while saving, reports success, and
   restores the previous value on failure.
6. `npm run verify:upstream` includes these checks and must remain green before
   any future upstream refresh or release build.

`AGENTS.md` and `docs/UPSTREAM_MAINTENANCE.md` must explicitly register the
single-native-CPA-row and desktop-autosave behaviors. Upstream code may replace
their implementations only after equivalent observable behavior passes the
retained regressions. Conflict resolution must not delete or weaken the tests.

## Release and public-repository safety

- Bump the wrapper release to `0.1.1-rc.9` and update affected local plugin
  versions and lockfile records when their shipped code changes.
- Run the complete upstream regression gate, wrapper tests, relevant package
  tests, and the Windows package build before publishing.
- Review tracked and untracked files for credentials, Tokens, settings,
  sessions, logs, screenshots, exports, generated package directories, and
  local upstream checkouts.
- Commit source, tests, documentation, and required lockfile metadata only.
  Installers and portable archives remain untracked repository artifacts.
- Push the completed source release to `main`, create tag `v0.1.1-rc.9`, and
  upload the generated x64 `.exe` installer and `.zip` portable archive to the
  corresponding public GitHub Release.

## Rollback

If the native CPA row loses any required capability or desktop autosave proves
unstable, revert the release commit and republish the previous `v0.1.1-rc.8`
installer. No data migration is introduced by this change; the existing CPA
profile, credential reference, and desktop settings file remain compatible.
