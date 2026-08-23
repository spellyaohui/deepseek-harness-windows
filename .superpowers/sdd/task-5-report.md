# Task 5 report: native subagent settings and bounded model catalog

## Baseline and scope

- Branch: `feature/agentteams-and-session-export`.
- Starting HEAD: `773d25d39f6448e8fb616b4f8bc43ca1a7e7ab8c`.
- Work was limited to Task 5 in the isolated feature worktree.
- `progress.md`, the main repository, other worktrees, `node_modules`, and Task
  6+ features were not modified.

## Changes

### Host model catalog

- Added `src/client/model-catalog.ts`, whose public terminal states are exactly
  `ready`, `empty`, and `error` and whose default request bound is 10 seconds.
- Registered `GET /plugins/dsh-agent-teams/models` independently of workspace
  availability. The route returns stable `{ models, failures }` JSON, isolates
  failures per provider, rejects non-GET methods with 405, and sends
  `content-type: application/json; charset=utf-8` plus `cache-control: no-store`.
- Model metadata comes only from the official Host LLM service:
  `listProviders()`, `listModels(provider)`, and
  `resolveModelInfo(provider, model)`.

### Harness-native settings section

- Registered `settings.section` id `agent-teams`, order `30`, title
  `子智能体`, and bound namespace `agent-teams` through
  `ctx.settingsScope.bind()`.
- Added a `useSyncExternalStore` settings view for Team/Native delegation,
  provider/model selection, target-default/route-aware/explicit reasoning,
  and the future-member effective scope.
- Added visible loading, empty, unavailable, read-only, saving, error, retry,
  disabled, and focus states, with matching Simplified Chinese and English
  dictionaries.
- Used the Harness `Button` primitive. The locked RC2 primitives package has no
  `Select` export, so the selectors follow the official Models settings page
  and use native accessible `<select>` elements.
- Added a CSS module that uses Harness tokens only. It has no Electron import,
  `:global`, global selector, fixed light/dark color, or fixed color literal.

### One serialized settings writer

- Added `src/client/settings-write.ts` as the only UI write entry. The bound
  scope now performs reads/subscriptions only; the component contains no
  `settings.set()` or `settings.unset()` call.
- The writer is created once at client-plugin `apply()` lifetime, so settings
  section remounts cannot create competing queues.
- Every write is an ordered `settings.mutate` request fenced by a concrete
  namespace revision. A missing revision fails closed without sending a
  mutation.
- A successful response is folded immediately through
  `ctx.settingsScope.describe().acceptView(response.result.value)`, and its
  returned revision fences the next queued write.
- Non-OK, thrown, and timed-out mutations enter uncertain state and perform a
  bounded `settings.describe({})` recovery. The recovered `agent-teams`
  namespace is accepted before later writes. Failed recovery keeps the writer
  fail-closed; Retry attempts recovery before another mutation.
- Both mutation and recovery are bounded. Generation and revision checks, plus
  dropping results after the bound closes, prevent a late old response from
  replacing newer accepted truth. UI actions always leave busy state and show
  their terminal error.
- Provider and model always change in one atomic mutation. A provider change
  preserves the current model when that provider exposes the same id;
  otherwise it selects the lexically first model. An empty provider clears both
  route fields, and a provider with no models produces a visible error without
  mutation.
- Reasoning mode and effort transitions are atomic. Entering explicit mode
  prefers a still-supported current effort, then the target default, then the
  lexically first supported effort. Leaving explicit mode clears effort before
  changing mode. Explicit mode is disabled with explanatory copy when the
  target exposes no efforts.

## RC2 API decision and evidence

Task 2 Host validation couples provider/model and reasoning mode/effort, so
sequential single-field writes cannot cross those valid-state boundaries.
Host validation was not weakened.

The locked official RC2 implementation establishes the supported path:

- `@deepseek-ai/dsh-client-ui-settings/lib/client.js` around lines 1016,
  1035, and 1043 shows bound `set()` serializing one-op mutate requests.
- `@deepseek-ai/dsh-settings/lib/index.js` around lines 420-467 shows ordered
  ops reduced into one candidate, one final resolve/validate, then persistence.
- `@deepseek-ai/dsh-client-ui-settings-models/lib/client.js` around lines
  1131-1140 directly calls `connection.api.settings.mutate` for multi-field
  settings edits.
- The settings scope service exposes the shared describe face and its
  `acceptView()` fold specifically for write answers.

The first implementation mixed the bound scope queue for independent fields
with direct multi-op RPCs. Adversarial review correctly identified that these
two queues could race and that relying only on a later invalidation left the
mirror and revision temporarily stale. The corrected design sends every UI
write through one plugin-lifetime writer while retaining the official bound
scope as the read model.

## TDD RED/GREEN

### Catalog

1. Added ready, empty, HTTP 500, and non-settling request tests.
2. First RED command: `pnpm build; node scripts/settings-client-verify.mjs`.
   It failed with `ERR_MODULE_NOT_FOUND` for
   `lib/client/model-catalog.js`.
3. GREEN proved the four terminal states and that a 100 ms timeout completed
   within the 250 ms test bound.

### Initial atomic helper

1. Added ordered-op, revision-fence, Host-error, and transport-error tests.
2. RED failed with `ERR_MODULE_NOT_FOUND` for
   `lib/client/settings-write.js`.
3. GREEN proved the namespace, exact op order, expected revision, and terminal
   success/error states.

### Adversarial correction

1. Replaced the helper tests with behavioral tests for the unified writer,
   operation planners, and shared UI action state before changing production
   code.
2. RED command: `pnpm build; node scripts/settings-client-verify.mjs`.
   Build completed, then Node failed because `settings-write.js` did not export
   `createAgentTeamsSettingsWriter`.
3. GREEN now covers:
   - strict serialization and use of the first response revision by the second
     write;
   - immediate success `acceptView`;
   - non-OK, thrown, and timeout recovery through describe;
   - missing-revision fail-closed behavior with zero mutation calls;
   - failed recovery and recovery-first Retry;
   - late timed-out response isolation;
   - atomic provider/model and reasoning plans, deterministic model/effort
     choice, zero-effort rejection, and explicit-mode exit;
   - shared UI busy/error terminal states;
   - a guard against reintroducing bound-scope writes in the settings section.

## Adversarial review reconciliation

The single-model review produced seven substantive findings. Each was
classified **valid + actionable** and fixed:

1. Competing bound-scope and direct-RPC queues: replaced by one writer.
2. Successful RPC did not fold the returned view/revision: added immediate
   `acceptView` and revision chaining.
3. Failure and ambiguity had no authoritative recovery or bound: added bounded
   describe recovery, uncertain state, generation/revision protection, and
   fail-closed Retry.
4. Some handler promises and errors were discarded: all mutation handlers now
   await the shared action, which publishes busy then a terminal visible state.
5. Provider/model was not always atomic or deterministic: added atomic planners,
   preservation/lexical fallback, and visible no-model failure.
6. Explicit reasoning could silently do nothing: added supported-effort
   selection, atomic mode/effort transitions, and disabled explanatory UI.
7. Coverage did not prove the concurrency/failure contract: added behavioral
   serialization, recovery, timeout, late-response, planner, and UI-state tests.

After the single-model findings were presented, the user explicitly chose to
skip the optional cross-model second opinion. Work proceeded with the reconciled
single-model findings only.

## Verification

The locked runtime reported Node `v24.19.0` and pnpm `11.19.0`. Final commands:

```powershell
pnpm typecheck
pnpm build
node scripts/settings-client-verify.mjs
pnpm verify
pnpm test
```

All commands exited 0. `pnpm test` rebuilt the Host/client/declaration outputs
and passed settings, client settings, selection policy, offline, lifecycle,
stress, build-path, and skill-mirror verification. The build emitted only the
existing informational recommendation to prefer ESM.

## Self-review and hygiene

- Reviewed correctness, readability, architecture, security, and performance
  against every Task 5 brief item and all seven adversarial findings.
- Confirmed there is one client `settings.mutate` call site and no bound-scope
  write call in the settings component.
- Static CSS checks found only Harness-token backgrounds or `none`, with no
  fixed color, Electron selector/import, `:global`, or global selector.
- Source scan found no credential material or local absolute path.
- Generated JS and declarations are required publish artifacts; ignored new
  `lib/client/*` and `lib/types/client/*` files are force-added explicitly.
- `git diff --cached --check` and staged secret/path scans are run immediately
  before commit.

## Concerns and deferred acceptance

- No real browser or desktop runtime was launched in Task 5. Visual layout,
  live focus appearance, and end-to-end interaction acceptance remain
  explicitly deferred to Task 9.
- Client bundle build continues to print the repository's existing ESM-format
  recommendation; it is informational and does not fail verification.

## Commit

- Implementation and generated artifacts:
  `08882ad85e4701c7bda3e8dbe72936848b640671`.
- Message: `feat: add AgentTeams settings tab and model catalog`.
- This SHA was written back in a report-only follow-up commit so the
  implementation commit remains atomic and the report does not claim a
  self-referential hash.
