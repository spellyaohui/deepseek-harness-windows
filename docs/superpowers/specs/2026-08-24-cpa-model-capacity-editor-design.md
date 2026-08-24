# CPA per-model capacity editor design

Status: approved design, pending written-spec review
Date: 2026-08-24
Target: `win-desktop/cpa-provider-plugin/`

## 1. Problem

CLIProxyAPI model discovery may return only model identity. When a discovered CPA
model has no `contextWindow` or `maxTokens`, Harness's pi-ai adapter falls back
to its generic capacities instead of the actual capacity of the routed model.
The CPA settings card currently lets the user select models but cannot correct
those capacities.

## 2. Decision

Add two optional capacity inputs to every CPA model row:

- `上下文窗口` / `Context window` maps to `contextWindow`.
- `最大输出 token` / `Max output tokens` maps to `maxTokens`.

Both values belong to the individual model, not the CPA provider as a whole.
The plugin does not infer, recommend, or automatically populate values from a
model id. In particular, GPT-family names receive no special treatment.

## 3. Input and display semantics

- Display and edit raw base-10 integers such as `1050000` and `128000`.
- Do not add grouping separators and do not convert values to K/M notation.
- Each field is independently optional.
- A blank field removes that model-level property and lets the installed model
  catalog or pi-ai provider fallback supply the capacity.
- If discovery returns a capacity, initialize the field with that exact integer.
- If an already configured model has a capacity, reopening the card displays
  the stored integer unchanged.
- Fetching models merges discovered rows with configured rows without losing a
  previously stored capacity when the endpoint omits it.

## 4. Validation

- A non-blank value must contain only decimal digits and parse to a safe integer
  greater than zero.
- Reject decimal fractions, signs, exponential notation, separators, whitespace
  inside the number, zero, negative values, and values above
  `Number.MAX_SAFE_INTEGER`.
- Validation identifies the model and field and prevents profile persistence.
- A capacity error must not discard the address, credential draft, model
  selection, or the other model rows.
- The existing requirement that at least one model is selected remains intact.

## 5. Data flow

The CPA card keeps capacity text as form state so blank and temporarily invalid
input can be represented without corrupting the typed profile. Immediately
before save, a pure parser converts each selected model row into an optional
positive integer. Successful parsing feeds the existing `buildCpaProfile()`
path, which already persists optional `contextWindow` and `maxTokens` fields to:

```text
llm-pi-ai.providers.cpa.models[]
```

The credential remains write-only and is unchanged by this feature.

## 6. UI behavior

- Keep the existing model checkbox, name, and id.
- Place the two capacity inputs below the identity line inside the same model
  row.
- Use text inputs with numeric input mode so raw digits remain visible and the
  browser does not introduce number-input stepping or scientific formatting.
- Disable the inputs under the same read-only, busy, and profile-lock states as
  the model checkbox.
- Capacity fields remain editable for an unselected row so a user can prepare
  values before selecting it; only selected models are persisted.
- Add localized labels and concise validation messages in Chinese and English.

## 7. Compatibility

- Existing CPA profiles without capacities remain valid and retain their
  current fallback behavior.
- Existing profiles with capacities round-trip without normalization beyond
  integer serialization.
- Model discovery, reasoning-effort mapping, provider id, API protocol, endpoint
  normalization, and credential storage remain unchanged.
- No provider-wide default capacity fields are added.
- No OpenAI model table or automatic model-name rule is embedded in the plugin.

## 8. Tests

Add regression coverage proving that:

1. `1050000` and `128000` parse and persist exactly.
2. Blank context with a populated output value is accepted.
3. Populated context with blank output is accepted.
4. Both blank fields omit both properties.
5. Invalid digits, fractions, signs, separators, zero, unsafe integers, and
   internal whitespace are rejected.
6. An error names the affected model and field.
7. Discovery-provided values populate the draft.
8. Configured values survive a discovery response that omits capacities.
9. Saving and reopening a profile round-trips exact raw integer values.
10. Existing selection, credential retry, and reasoning-effort tests continue
    to pass.

## 9. Acceptance criteria

1. The CPA settings card exposes raw integer `contextWindow` and `maxTokens`
   inputs for every model.
2. Neither field auto-fills from the model name.
3. Either field may be blank independently and blank means provider fallback.
4. Entering `1050000` remains visibly and durably `1050000`, never `1.05M` or
   `1025K`.
5. A newly packaged Windows build persists the capacities into the CPA model
   profile and presents them to Harness model resolution.
