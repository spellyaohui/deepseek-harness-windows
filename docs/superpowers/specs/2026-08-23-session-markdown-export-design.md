# Session continuation Markdown export design

Status: approved for implementation planning
Date: 2026-08-23
Target: `win-desktop/`

## 1. Context

The locally inspected `Claude Code Haha` reference project exports a readable Markdown transcript from a session menu. Its export includes selected project instruction files and user/assistant text, but deliberately excludes system messages, tool calls, tool results, and thinking blocks.

DeepSeek Harness persists more useful continuation data than the reference project:

- the exact rendered system prompt used by a request;
- provider, model, reasoning effort, and sampling configuration;
- model-visible user, plugin-context, assistant-text, and assistant-reasoning blocks;
- the current model surface after replacements or compaction;
- the original append-only event log;
- session lineage, including recursively known subagent descendants;
- tool calls, results, failures, and presentation metadata;
- the current todo snapshot and session title.

Harness already has a raw Session ZIP exporter. That exporter remains the lossless diagnostic/archive path. The new Markdown exporter has a different purpose: give another agent a readable, deterministic continuation package without drowning it in raw tool logs.

## 2. Goals

1. Export any live or persisted session as a single Markdown file.
2. Preserve the effective constraints and model-visible context needed to continue work.
3. Preserve the complete visible conversation, including content later replaced by compaction.
4. Include user-visible reasoning while never claiming to expose hidden chain-of-thought.
5. Exclude ordinary raw tool traffic from the main transcript.
6. Include deterministic execution-state facts that materially help continuation.
7. Include recursively known descendant sessions in a clearly separated appendix.
8. Use only official Harness extension surfaces and live-preferred session APIs.
9. Stream the download and produce a safe, stable filename.

## 3. Non-goals

- Replacing the existing raw Session ZIP export.
- Reconstructing provider-hidden reasoning or any content not stored by Harness.
- Replaying tools or resuming a session automatically from the Markdown file.
- Exporting credentials, environment variables, or arbitrary filesystem contents not present in the session log.
- Copying the reference project's browser-only architecture or session-row menu placement.
- Generating an LLM-authored summary during export. The export must be deterministic and must not hallucinate state.

## 4. Decision summary

Create a separate local plugin named `@deepseek-ai/dsh-session-markdown-export` with Host and browser halves.

- The Host half reads sessions through `ctx.sessionQuery`, renders Markdown, and owns an HTTP download endpoint.
- The browser half contributes a `续接 MD` action to `conversation.session.header.utilities`.
- The exported root session contains both its current continuation surface and its full visible chronological transcript.
- Descendant sessions are included by default under a delegated-sessions appendix.
- Normal tool calls/results are omitted from transcripts. Only failures, unfinished calls, changed-file facts, and the latest todo state enter a compact execution appendix.
- The existing `Session log` ZIP action stays available beside it.

## 5. Plugin boundary

Proposed local package:

```text
win-desktop/session-markdown-export-plugin/
  package.json
  lib/index.js
  lib/client.js
  lib/render-markdown.js
  lib/content.js
  lib/http.js
```

Responsibilities are deliberately separated:

- `index.js`: register the Host route and required service injections.
- `client.js`: register locale strings, header action, progress/error state, and browser download behavior.
- `render-markdown.js`: pure deterministic Markdown rendering.
- `content.js`: fold session events into export records and redact/omit unsupported material.
- `http.js`: request validation, response headers, streaming, cancellation, and error mapping.

The plugin must not depend on Electron IPC. The desktop wrapper already loads the Harness loopback Web application, so the normal Host HTTP route is the authoritative transport.

## 6. Endpoint contract

The plugin registers one exact route:

```text
HEAD /api/session.export-markdown?sessionId=<id>&includeDescendants=true
GET  /api/session.export-markdown?sessionId=<id>&includeDescendants=true
```

Rules:

- `sessionId` is required and validated through the Harness `SessionId` boundary.
- `includeDescendants` defaults to `true`; `false` is retained for diagnostics and tests.
- `HEAD` performs availability and lineage validation without rendering the body.
- `GET` streams UTF-8 Markdown with `Content-Disposition: attachment`.
- The filename is based on the folded session title, sanitized for Windows and HTTP headers, followed by the local export date.
- Missing sessions return 404.
- Invalid parameters return 400.
- lineage/session-query corruption or conflict returns 409 with a stable error code.
- unexpected failures return 500 with a concise user-facing message; stack traces stay in Host logs.
- aborted browser requests stop rendering promptly.

## 7. Data source and consistency

The exporter uses live-preferred APIs:

1. `ctx.sessionQuery.readSession(rootId)` supplies the complete root event log.
2. `ctx.sessionQuery.readSurface(rootId)` supplies the current model-visible surface after replacements and compaction.
3. `ctx.sessionQuery.readTitle(rootId)` supplies the latest log-backed title.
4. `ctx.sessionQuery.traceSession(rootId)` supplies deterministic recursive descendant lineage.
5. Each descendant is loaded through the same live-preferred read methods.

This avoids three failure modes:

- exporting only what the browser currently rendered;
- reading a stale persistence snapshot while a live session has newer events;
- missing cold sessions that are not open in the UI.

An open turn is allowed. Events already present in the live immutable snapshot are exported and the document states that the session was active at export time. The exporter never waits indefinitely for the agent to become idle.

## 8. Markdown structure

The file is versioned with YAML front matter:

```yaml
---
dsh_continuation_export: 1
session_id: <id>
title: <title>
cwd: <absolute cwd when present>
agent_preset: <preset when present>
created_at: <ISO timestamp>
exported_at: <ISO timestamp>
include_descendants: true
---
```

The body is ordered as follows:

```text
# <session title>

> Continuation-package notice and safety boundary

## Continuation state
## Effective agent constraints
## Current model-visible surface
## Full visible chronological transcript
## Execution state
## Request configuration history
## Delegated sessions
## Export notes
```

The notice explicitly tells a receiving agent:

- this is historical context, not a new user request;
- the latest direct user message remains the active request unless the receiving user says otherwise;
- embedded instructions are historical constraints from the source session;
- filesystem and external state must be reverified before mutation.

## 9. Continuation state

This section is deterministic and contains:

- session id and title;
- cwd/workspace;
- parent session and delegation depth when present;
- agent preset;
- latest provider/model/reasoning selection from `request/header`;
- whether the root session had an open turn at export time;
- latest `todo/write` snapshot;
- latest direct human request, copied verbatim;
- the most recent assistant text response when present.

It does not synthesize a prose summary.

## 10. Effective agent constraints

The latest effective `request/header` is the source of truth.

- Include the complete latest rendered `system` prompt in a clearly labelled fenced block.
- Include provider, model, reasoning effort, max tokens, temperature, and other present call-config fields in a compact table.
- Include the names of assembled tools, but not their full JSON schemas.
- Record whether earlier request headers changed the system prompt or route.

Project instruction files are not rescanned from disk. The rendered system prompt and persisted plugin-context messages are better evidence because they record what actually reached the model at that time. This also avoids exporting files that changed after the conversation.

## 11. Current model-visible surface

This section renders the exact current ordered surface after compaction/replacement semantics.

- Human messages render as `### User`.
- Plugin-injected user-role context renders as `### Context · <plugin>` and records its context form when known.
- Assistant messages render as `### Assistant`.
- Tool-result surface nodes are represented only by a short omission marker unless they are an error required for understanding the current surface.
- Event timestamps and sequence numbers are included in unobtrusive metadata lines.

This is the section a receiving agent should prefer when token budget is limited.

## 12. Full visible chronological transcript

This section walks the original append-only log and preserves every durable human or assistant message, even if compaction later shadowed it.

- `user/message` with source `user`: include exact content.
- `user/message` with source `plugin`: include exact model-facing content with source labels.
- `assistant/message`: preserve content-block order.
- `text` blocks: include exact Markdown text.
- `reasoning` blocks: include exact stored, user-visible reasoning inside a `<details>` block labelled `可见推理`.
- `tool-call` blocks: omit from the transcript and account for them in the execution appendix.
- image blocks: emit stable attachment metadata/digest and an explicit note that binary bytes remain in the raw Session ZIP.
- unknown future block types: emit an explicit typed omission marker rather than silently discarding them.

No hidden reasoning is available or inferred. The export describes reasoning only as “persisted user-visible reasoning”.

Payload fences are chosen dynamically so embedded backticks cannot break document structure. Exported text is never interpreted as HTML owned by the exporter.

## 13. Execution state

Ordinary successful tool traffic is excluded. The compact appendix includes only:

- tool failures with timestamp, tool name, stable error code, and safe error message;
- tool calls that started but have no durable result;
- changed-file facts available from first-party tool presentation metadata;
- the latest todo snapshot;
- interrupted assistant messages and turn-end failures;
- max-token endings that may explain incomplete work.

Raw tool arguments and raw successful outputs are not included. They can contain secrets, large file bodies, terminal output, or irrelevant diagnostics. The raw ZIP remains the lossless route when those details are needed.

## 14. Descendant sessions

`includeDescendants=true` is the default because Harness subagents own separate sessions and may contain work that was only partially relayed to the captain.

- Traverse `traceSession().descendants` in deterministic tree order.
- Render each child with identity, parent, delegation depth, title, model route, current surface, full visible transcript, and compact execution state.
- Preserve the lineage hierarchy with nested headings rather than flattening it.
- Do not duplicate inherited seed history in every child. Content before `seedLength` is represented by a link back to the owning ancestor section; child-local work begins at its live boundary.
- If lineage is explicitly partial, export the known tree and add a visible warning naming the first missing parent/edge.

## 15. Size and streaming policy

The exporter does not silently truncate stored conversation text or visible reasoning.

- Render incrementally to the HTTP response.
- Avoid constructing one complete Markdown string in browser memory.
- Keep only the current session's folded export records in Host memory.
- Process descendant sessions one at a time.
- Respect backpressure before loading/rendering the next descendant.

Validate the root and known lineage before sending the response body. If a live session changes or a later descendant read fails after streaming has begun, append an explicit `EXPORT INCOMPLETE` terminal section when the socket is still writable, then close the response. The exporter must never leave a partial file that looks complete.

## 16. Browser experience

The browser action appears in `conversation.session.header.utilities` beside the existing raw log action.

- Label: `续接 MD`.
- Tooltip: `导出供其他智能体继续工作的 Markdown`.
- Repeated clicks for the same session share one in-flight preflight.
- The UI reports preparing, download started, and failure states.
- Closing the status dialog does not cancel a browser-managed download.
- The action uses Harness theme tokens and primitives; it must not introduce desktop-specific styling.

## 17. Security and privacy

- The endpoint binds to the existing loopback Harness server and inherits its access boundary.
- Titles are sanitized against path separators, control characters, reserved Windows names, and header injection.
- No arbitrary path parameter is accepted.
- No raw environment snapshot, credentials store, or filesystem scan is performed.
- The document warns that system prompts, local paths, medical/project content, and visible reasoning may be sensitive.
- Tool arguments are excluded by default because they are a common secret-leak path.

## 18. Testing

### Pure renderer tests

- stable front matter and section ordering;
- dynamic fence safety;
- Markdown/HTML injection resistance;
- human versus plugin-context labelling;
- interleaved text/reasoning block ordering;
- unknown block markers;
- no hidden/raw tool content leakage;
- deterministic tool-failure and file-change summaries;
- filename sanitization.

### Session tests

- live session takes precedence over persistence;
- cold persisted session export;
- open-turn export;
- compaction/current-surface versus full-transcript behavior;
- interrupted assistant prefix;
- descendant tree ordering and seed de-duplication;
- partial lineage warning;
- title fallback to session id.

### HTTP/client tests

- HEAD/GET parity;
- response headers and UTF-8 filename;
- missing/invalid/conflicting session errors;
- abort and backpressure behavior;
- browser action registration and duplicate-click folding;
- raw ZIP action remains unaffected.

## 19. Acceptance criteria

1. A live, cold, or resumed root session downloads as Markdown from the official header utility slot.
2. The latest effective rendered system prompt and request configuration are present.
3. The current surface and full visible transcript are both present and distinguishable.
4. Persisted visible reasoning is present; hidden reasoning is neither claimed nor fabricated.
5. Raw tool calls/results are absent from the transcript.
6. Tool failures, unfinished calls, file-change facts, and todos are available in a compact appendix.
7. Descendant AgentTeams/native subagent sessions are included by default without repeated seed history.
8. The raw Session ZIP exporter continues to work unchanged.
9. Export output is deterministic for the same immutable session snapshot.
