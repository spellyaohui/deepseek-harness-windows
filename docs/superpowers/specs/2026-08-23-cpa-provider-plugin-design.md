# CPA / CLIProxyAPI provider plugin design

Status: approved for implementation planning
Date: 2026-08-23
Target: `win-desktop/`

## 1. Context

The Windows Harness already mounts the official generic `@deepseek-ai/dsh-llm-pi-ai` adapter, the native Models settings page, the Harness credentials service, and a local AgentTeams fork. Those components already provide the difficult runtime behavior needed by a CLIProxyAPI (CPA) connection:

- OpenAI Responses streaming and tool calls;
- custom provider routes and custom `baseURL` values;
- authenticated `GET /v1/models` discovery;
- write-only credential storage;
- per-model reasoning metadata and wire-value mapping;
- provider/model/reasoning discovery for AgentTeams.

CLIProxyAPI exposes an OpenAI-compatible model listing at `/v1/models` and the Responses endpoint at `/v1/responses`. Its thinking converter accepts the common effort vocabulary and converts or clamps it against the selected downstream model. The reference R protocol uses these seven wire values:

```text
none / minimal / low / medium / high / xhigh / max
```

OpenAI's GPT-5.6 model currently declares six selectable levels—`none`, `low`, `medium`, `high`, `xhigh`, and `max`—and does not declare `minimal`. The integration must distinguish the complete protocol vocabulary from the capabilities of one exact model.

The repository is public. No API token, user settings document, local filesystem path, session export, credential fixture, or live endpoint may enter source control or packaged examples.

## 2. Goals

1. Add a dedicated `CPA / CLIProxyAPI` card inside the main Models settings page.
2. Let the user enter an API address and Token, query `/v1/models`, select models, and save the route without editing YAML.
3. Use OpenAI Responses for all CPA model calls.
4. Support the complete seven-value R protocol while filtering model-specific unsupported choices.
5. Make CPA models available to normal Harness sessions and AgentTeams subagents through the same authoritative LLM catalog.
6. Store the Token through the Harness credential seam without exposing it to settings descriptors, logs, or repository files.
7. Keep the CPA implementation as a thin plugin over the existing pi-ai adapter rather than maintaining a second LLM client.

## 3. Non-goals

- Reimplementing Responses streaming, tool-call conversion, replay, retries, attachments, or error translation.
- Modifying CLIProxyAPI itself.
- Supporting multiple independently named CPA connections in the first version.
- Adding Chat Completions as a user-selectable CPA protocol.
- Automatically proving every discovered third-party model's exact reasoning capabilities when `/v1/models` does not publish them.
- Storing or displaying the existing Token after it has been written.
- Adding unrelated provider-management or credential-management features.

## 4. Alternatives considered

### 4.1 Recommended: CPA preset plugin over `llm-pi-ai`

Create a local CPA plugin that contributes a dedicated Models card but writes the resulting route into the existing `llm-pi-ai` settings namespace. The existing adapter remains the sole owner of model requests.

Benefits:

- smallest runtime surface;
- native Harness credentials and settings concurrency;
- native Responses behavior;
- automatic visibility in the main model picker and AgentTeams;
- upgrades remain focused on a small UI/preset layer.

### 4.2 Dedicated CPA LLM adapter

Create a new adapter that owns the `cpa` route and delegates or reimplements the pi-ai request path. This offers stronger isolation but duplicates adapter lifecycle, credential resolution, model descriptors, prepared-call freezing, streaming behavior, and compatibility work. It is rejected as unnecessary maintenance.

### 4.3 Generic custom-provider instructions only

Ask users to create a custom provider manually in the existing Models page. This requires less code, but it does not provide a CPA-specific card, fixed Responses protocol, consistent reasoning metadata, address normalization, or a reliable setup flow. It is rejected because it does not meet the requested user experience.

## 5. Architecture decision

Add two narrowly scoped local packages:

```text
win-desktop/
  models-settings-plugin/       # local fork of the official Models UI plugin
  cpa-provider-plugin/          # CPA card, validation and profile assembly
```

### Models settings fork

Maintain a local fork of `@deepseek-ai/dsh-client-ui-settings-models` under the same package name and exact Harness baseline. The fork adds one generic client slot, tentatively named `settings.models.card`, at the provider-card area of the Models page. It does not contain CPA-specific logic.

The fork must include an `UPSTREAM.md` recording:

- upstream package and version;
- source commit or tag;
- imported date;
- the single intentional extension-slot difference;
- the command used to compare or refresh the fork.

This extension avoids DOM injection and prevents CPA concerns from being embedded directly in the official Models implementation. Future provider presets can reuse the same slot.

### CPA provider plugin

Create `@deepseek-ai/dsh-cpa-provider` as a local `file:` dependency. Its browser half registers the CPA card through `settings.models.card`. Its host half may be empty unless a narrowly scoped host helper is required; it must not own or wrap an LLM adapter.

The CPA card writes one stable route:

```text
provider id: cpa
display name: CPA / CLIProxyAPI
settings namespace: llm-pi-ai
credential reference: CPA_API_KEY
wire protocol: openai-responses
```

The normal `llm-pi-ai` settings watcher activates or updates the route after the profile is committed. No restart is required.

## 6. Settings and credential shape

The CPA card writes the equivalent of this redacted profile through `settings.mutate`:

```yaml
llm-pi-ai:
  providers:
    cpa:
      displayName: CPA / CLIProxyAPI
      apiKeyEnv: CPA_API_KEY
      api: openai-responses
      baseURL: https://cpa.example.invalid/v1
      models:
        - id: example-model
          name: example-model
          reasoningEfforts:
            off: none
            minimal: minimal
            low: low
            medium: medium
            high: high
            xhigh: xhigh
            max: max
```

The example domain is deliberately non-routable. Real endpoints and tokens never appear in repository fixtures.

The Token is written separately through `credentials.set('CPA_API_KEY', value)`. It is never included in a settings mutation. The card follows the official Models editor's write order:

1. validate all visible fields locally;
2. probe the draft endpoint with the draft Token if the user requests discovery;
3. commit the provider profile using the current settings revision;
4. adopt the returned settings revision;
5. write the Token through the credential seam;
6. refresh from redacted host state.

If profile creation succeeds but credential storage fails, the card keeps the created route visible and retries only the credential stage. It must not repeat the stale settings mutation.

## 7. Address normalization

The address field accepts either form:

```text
http://127.0.0.1:8317
http://127.0.0.1:8317/v1
```

Normalization rules:

1. trim surrounding whitespace;
2. require `http:` or `https:`;
3. reject credentials embedded in the URL;
4. remove trailing slashes;
5. append `/v1` when the path does not already end in `/v1`;
6. preserve an explicit reverse-proxy prefix before `/v1`;
7. store the canonical result as `baseURL`.

Discovery calls the existing `llm.discoverModels` wire face with:

```text
settingsNs = llm-pi-ai
provider   = cpa
api        = openai-responses
baseURL    = normalized address
apiKey     = draft Token when supplied
```

The existing adapter then queries `<baseURL>/models`, which resolves to `/v1/models` for the canonical address.

## 8. Model discovery and selection

The discovery result is a draft until the user presses Apply.

- Show model id and provider-supplied name when present.
- New candidates are selected by default.
- Already-configured models are not duplicated.
- Provide `Select all` and `Clear all` actions.
- Require at least one selected model before Apply.
- Preserve configured models and metadata when a later discovery temporarily omits them unless the user explicitly removes them.
- Use the pi-ai fallback capacities when `/v1/models` supplies only ids; do not invent provider-specific context limits in the CPA plugin.

The first version uses a single CPA route because one route has one endpoint, one Token, and one protocol. Multiple CPA instances can be added later by generalizing the route id without changing the adapter contract.

## 9. Reasoning protocol

### Canonical levels

CPA-facing labels and wire values are:

```text
none / minimal / low / medium / high / xhigh / max
```

Harness/pi-ai internally calls the disabled level `off`. The CPA profile therefore maps:

```text
Harness id `off` -> CPA wire value `none`
```

The CPA card and CPA-specific help text display `none`; generic Harness surfaces may continue to display their standard English `Off` label while storing the same `off` id. Both dispatch the CPA wire value `none`.

### Per-model capability policy

The plugin maintains a small pure capability policy over model ids:

- recognized GPT-5.6 family ids: `none`, `low`, `medium`, `high`, `xhigh`, `max`;
- other discovered CPA models: complete seven-value CPA vocabulary by default;
- models explicitly marked non-reasoning by a future capability source: no selectable efforts;
- legacy configured value `ultra`: normalize to `max` before validation or persistence.

The GPT-5.6 rule omits `minimal`, matching the official model capability. For models whose exact capabilities are not published by `/v1/models`, CPA remains the downstream authority: its model registry converts, clamps, or rejects unsupported values. A provider rejection must remain visible; the plugin must not silently retry with another effort.

The capability policy is isolated from React components so it can be updated independently when new model families or CPA metadata become available.

## 10. AgentTeams integration

No separate AgentTeams-to-CPA bridge is created.

The current AgentTeams catalog endpoint enumerates every provider from `ctx.llm.listProviders()`, every model from `ctx.llm.listModels(provider)`, and exact reasoning metadata from `ctx.llm.resolveModelInfo(provider, model)`. Once `llm-pi-ai` activates the `cpa` route, CPA models therefore appear automatically in the existing `子智能体` settings page.

Expected AgentTeams behavior:

1. Provider selector includes `cpa`.
2. Model selector contains the saved CPA models.
3. Explicit reasoning selector contains only the exact model's declared efforts.
4. `target-default`, `route-aware`, and `explicit` modes retain their current semantics.
5. New members snapshot the chosen CPA provider/model/effort at creation.
6. Existing members remain unchanged after CPA settings are edited.
7. A CPA model removed from the route is shown as unavailable for stored settings rather than silently replaced.

Because both captain and member calls use the same LLM adapter route, CPA Responses behavior is identical for main sessions and subagents.

## 11. User interface

The card uses the official Models page's theme tokens, primitives, spacing, validation style, accessible status messages, and Apply/Cancel behavior.

Visible fields and actions:

1. `API address`
2. `Token`
3. `Fetch models`
4. candidate model checklist
5. `Select all` / `Clear all`
6. `Apply` / `Cancel`

The Token field is always blank when the card opens. A configured credential is represented only by a configured-status indicator. Leaving the field blank while editing preserves the stored Token; entering a new Token replaces it.

The card has deterministic states:

```text
idle -> discovering -> candidates | discovery-error
idle/candidates -> saving-profile -> saving-credential -> saved
any write stage -> write-error with retry
```

No state may remain indefinitely in `discovering` or `saving`. Requests use a bounded timeout and return to a retryable state.

## 12. Error handling

- Invalid or missing address: field-level validation; no request.
- Embedded URL username/password: reject; do not normalize or log it.
- Invalid Token characters or pasted `NAME=value`: use the same validation behavior as the official Models editor.
- Discovery `401`/`403`: report authentication failure without echoing the Token.
- Discovery timeout or malformed model list: keep the draft and expose Retry.
- Settings revision conflict: close/reload guidance; do not overwrite another tab's changes.
- Credential write failure after profile success: retry only credential storage.
- No selected models: block Apply.
- Unsupported reasoning effort: preserve the provider/model-specific Harness error; do not downgrade automatically in the Harness layer.
- Removed or unreachable CPA route: existing sessions retain their durable route reference and fail explicitly rather than switching providers.

Logs may include the stable provider id, model id, HTTP status, and sanitized endpoint origin/path. They must never include the Token, authorization header, request body containing credentials, or credential value fragments.

## 13. Public-repository safeguards

1. Use only `.invalid`, loopback-without-token, or injected fake endpoints in tests and documentation.
2. Never read local CPA/Haha settings files into fixtures.
3. Never commit generated Harness home, settings files, credential stores, session exports, screenshots containing endpoints, or package artifacts.
4. Add plugin-specific ignores if its tooling creates caches or packed archives.
5. Run a staged-diff secret scan before every commit.
6. Keep the local reference project's extracted protocol facts in documentation without recording its machine-specific path.

## 14. Focused testing

The feature prioritizes delivery speed, so verification is limited to behavior that protects the requested integration.

### Pure tests

- address normalization for root, `/v1`, reverse-proxy prefix, trailing slash, invalid schemes, and embedded credentials;
- seven-value effort map;
- GPT-5.6 omits `minimal`;
- `ultra` normalizes to `max`;
- discovered models merge without duplicates or accidental removal.

### Plugin/UI tests

- CPA card registers inside the Models page extension slot;
- discovery sends `openai-responses`, normalized `baseURL`, and a one-shot Token;
- Token is absent from the settings mutation and ordinary logs;
- successful Apply stores `llm-pi-ai.providers.cpa` and then `CPA_API_KEY`;
- partial profile/credential failure retries only the unfinished stage;
- loading and saving states always settle.

### Integration tests

- saved CPA route appears in `ctx.llm.listProviders()`;
- saved CPA models appear in the main model catalog;
- AgentTeams `/plugins/dsh-agent-teams/models` includes provider `cpa`;
- AgentTeams exposes the expected GPT-5.6 effort set and routes an explicit effort unchanged to the adapter;
- one mocked Responses stream completes through the existing pi-ai adapter.

After these focused checks, run the existing wrapper tests and build the Windows NSIS and ZIP artifacts. Broader audit, extra security hardening, and unrelated regression suites are not release gates for this feature.

## 15. Rollout sequence

1. Import the exact Models settings package baseline and add the generic `settings.models.card` slot.
2. Add the CPA plugin package, pure address normalization, and reasoning capability policy.
3. Render the CPA card and connect draft discovery.
4. Connect revision-safe settings writes and write-only credential storage.
5. Mount both local packages in the desktop composition and healing path.
6. Verify CPA models appear in the main catalog and AgentTeams catalog.
7. Update public README usage and privacy warnings.
8. Run focused tests, wrapper tests, secret/diff checks, and package Windows artifacts.

Each step gets an atomic commit and leaves the wrapper bootable.

## 16. Acceptance criteria

1. The main Models page contains a Harness-styled `CPA / CLIProxyAPI` card.
2. A user can enter an address and Token, fetch `/v1/models`, select models, and Apply without editing YAML.
3. The stored route uses provider id `cpa`, protocol `openai-responses`, and a canonical `/v1` base URL.
4. The Token is stored only through `CPA_API_KEY` in the Harness credential seam and is never returned to the UI.
5. CPA models can be selected for normal sessions.
6. CPA models can be selected in the AgentTeams subagent settings page.
7. AgentTeams explicit reasoning choices come from the selected CPA model's exact metadata.
8. The complete CPA R vocabulary is supported; GPT-5.6 omits `minimal`; historical `ultra` becomes `max`.
9. Main-session and subagent CPA calls both use the existing pi-ai Responses implementation.
10. Discovery and save failures always settle into a retryable state.
11. No secret, live endpoint, local absolute path, settings file, session export, or build artifact is committed to the public repository.
