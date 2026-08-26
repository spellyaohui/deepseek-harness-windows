# OpenCode Protocol Profile Reconciliation Design

## Goal

Ensure that every OpenCode Go model with an authoritative, model-specific
transport profile is routed through that transport before the Harness runtime
loads its Pi catalog.  The repair must cover the installed static catalog,
previously persisted model rows, and models obtained from the live `/models`
endpoint without changing user credentials or unrelated providers.

## Evidence and scope

The packaged `@earendil-works/pi-ai@0.82.1` catalog and the wrapper's dynamic
fallback both default some OpenCode models to an incorrect protocol.  The
current Pi model registry identifies these mismatches:

| Model | Packaged transport | Authoritative transport |
| --- | --- | --- |
| `muse-spark-1.2-contributor` | `openai-completions` | `openai-responses` |
| `gpt-5.6-luna` | `openai-completions` | `openai-responses` |
| `qwen3.7-max` | `anthropic-messages` | `openai-completions` |
| `qwen3.7-plus` | `anthropic-messages` | `openai-completions` |

OpenCode's `/models` endpoint only exposes model identifiers; it does not
publish a transport contract.  Therefore an unknown identifier cannot safely
be retried through another protocol after a server error: that could duplicate
a billed request or hide a genuine upstream outage.  Unknown models retain the
current conservative Completions fallback until a supported profile is added.

The Muse provider also has a separately reported upstream serving incident.
Correct routing removes this wrapper-side protocol defect but cannot guarantee
that the remote model service is healthy at request time.

## Ownership and architecture

The Windows wrapper owns OpenCode catalog preparation, so the change remains
in `win-desktop/src/model-fetcher.js`; it does not move provider-specific
behavior into the Models fork or CPA plugin.

A single exported protocol-profile registry owns each verified OpenCode model
override.  Each entry contains the transport and, where verified, its input
modalities, reasoning support, capacity limits, thinking-level map, and
protocol compatibility fields.  A single reconciliation function applies the
profile to a copied catalog model and moves the model to the correct transport
group.  Existing model metadata not owned by the profile is preserved.

Catalog preparation invokes reconciliation in all three paths:

1. repair the packaged static catalog before settings hydration;
2. repair persisted-model hydration before it writes a model not present in
   the package catalog;
3. repair live model discovery before adding an unknown model fallback.

The reconciliation function only alters identifiers present in the explicit
registry.  It must not modify credentials, settings YAML, other providers, or
models with no verified profile.

## Behavioural requirements

- `muse-spark-1.2-contributor` and `gpt-5.6-luna` use
  `openai-responses`, not `/chat/completions`.
- `qwen3.7-max` and `qwen3.7-plus` use `openai-completions`, not Anthropic
  Messages.
- Corrected models retain their ID and are discoverable exactly once.
- An explicitly persisted user capability may extend a model profile, but it
  may not override a verified transport required by that model.
- Unknown model IDs keep the existing generic Completions fallback and are
  not endpoint-probed or automatically retried.
- A server `500` remains visible to the user as a server error; no transport
  failover is attempted.

## Testing and release requirements

Unit tests must first demonstrate each current mismatched static entry, then
prove reconciliation moves the model to the verified transport and applies the
verified metadata.  They must also prove unknown models remain unchanged,
existing valid models remain unchanged, and no duplicate ID remains across
catalog transport groups.

The wrapper integration regression must verify that the packaged startup
composition calls the reconciler before the Harness service starts.  The
release updates the wrapper version, README, and upstream-maintenance registry
with the Windows-wrapper ownership and retained regression requirement.

Before an EXE is produced, `npm run verify:upstream` must pass.  The package
inspection must verify the corrected runtime catalog logic is included.  The
installer is delivered for user testing only; no GitHub push, tag, release, or
asset upload occurs until the user explicitly confirms the installer works.

## Non-goals

- Upgrading the whole Pi dependency graph from `0.82.1` to `0.84.3`.
- Changing the native Models UI or CPA plugin.
- Sending test prompts to the user's OpenCode account or reading a Token.
- Retrying an arbitrary model over another endpoint after a `500`.

## Sources

- https://pi.dev/models/opencode-go/muse-spark-1-2-contributor
- https://pi.dev/models/opencode-go/gpt-5-6-luna
- https://pi.dev/models/opencode-go/qwen3-7-max
- https://pi.dev/models/opencode-go/qwen3-7-plus
- https://github.com/anomalyco/opencode/issues/45053
