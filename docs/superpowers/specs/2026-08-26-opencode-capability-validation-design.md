# OpenCode capability validation design

## Goal

Ensure OpenCode Go models are admitted for image input only when a verified
catalog declares image support, repair stale local catalog entries at startup,
and expose the same repair as an explicit action in Settings → 模型.

## Evidence and scope

The packaged Pi catalog is `@earendil-works/pi-ai@0.82.1`. Its OpenCode Go
entries lag the current `0.84.3` catalog and the Models.dev OpenCode Go source.
The installed catalog marks eight known vision models as text-only, including
`ox-alpha-free`; it also marks `mimo-v2.5-pro` as vision despite the current
source declaring text-only input. The OpenCode `/models` endpoint returns IDs,
not capabilities, so it cannot safely infer image support by itself.

## Architecture

`win-desktop/src/model-fetcher.js` remains the sole owner of OpenCode catalog
preparation. It will use two versioned, offline-safe data layers:

1. Pi `0.84.3` profile overrides for models still present in that catalog. They
   repair transport, text/image input, and capacity fields together.
2. A narrow Models.dev compatibility modality list for legacy IDs omitted by
   Pi `0.84.3`. It changes only `input` and includes a text-only correction for
   `mimo-v2.5-pro`.

The reconciler applies both layers to static package data, persisted model
rows, and models newly added from the live OpenCode endpoint. Unknown IDs
remain conservative (`text` only). It never tries a second protocol after a
server error.

## Manual validation action

An independently owned local `opencode-capabilities-plugin` contributes a
small card to the existing Models settings slot. Its button calls a dedicated
Electron IPC method. The method runs the same catalog reconciler, reports the
number of repaired entries, and states that a Harness restart is required for
the already-loaded Pi runtime to see its updated catalog. It does not expose
credentials, create a new provider row, or modify CPA/Models ownership.

## Error handling

The startup path retains its current non-blocking fallback: catalog validation
failures are logged and Harness still starts. The manual action returns a
sanitized failure message to the settings card. Neither path modifies
`settings.yaml`; the repair is limited to Pi's installed OpenCode catalog.

## Acceptance criteria

- `ox-alpha-free` becomes `text,image`, retains OpenAI Completions, and gains
  the verified 1,000,000/131,072 capacities.
- All eight known false text-only vision entries admit images after catalog
  reconciliation; `mimo-v2.5-pro` is corrected to text-only.
- Unknown models remain text-only.
- The Models settings card invokes the IPC bridge, announces repaired/no-op
  results, and disables while in flight.
- Existing CPA, AgentTeams, Markdown export, OpenCode protocol, and Windows
  console regressions remain in the mandatory upstream gate.
