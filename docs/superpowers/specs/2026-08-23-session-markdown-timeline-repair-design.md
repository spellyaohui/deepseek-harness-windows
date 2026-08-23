# Session Markdown Timeline Repair Design

## Status

Approved on 2026-08-23.

## Problem

A same-snapshot comparison between the raw Session ZIP and continuation Markdown found two defects:

- The raw root log contained 1,007 persisted user/assistant messages while Markdown rendered 885. All 122 missing entries were `user/message` events.
- The selected session inherited 7,352 seed events from its parent. Markdown retained that history but did not identify the seed boundary and rendered only raw epoch milliseconds, so inherited history appeared to predate the selected session without explanation.

Successful tool arguments/results remain intentionally excluded. Descendant transcripts already omit inherited seed messages and must keep that behavior.

## Root Causes

1. Current Harness stores a complete `UserMessage` directly in `user/message.data`. The exporter fixture and folding logic expected the legacy wrapper shape `user/message.data.message`, so every current user and plugin-context message was discarded.
2. Root metadata did not expose `parentSession`, `delegationDepth`, or `seedLength`, even though the raw session header contains them. The renderer therefore could not explain why the chronological history starts before the selected session's creation time.
3. Message timestamps were printed only as epoch milliseconds.

## Decision

### Message compatibility

`foldMessage()` will accept both shapes:

- current: `user/message.data` is the message;
- legacy fixture/external logs: `user/message.data.message` is the message.

Assistant messages remain wrapped in `assistant/message.data.message`. Plugin sources continue to render as historical context rather than direct user requests.

### Root seed timeline

The root export keeps inherited seed history because it is part of the selected session's effective context. Metadata will carry:

- parent session id;
- delegation depth;
- inherited event count (`seedLength`).

Before the root chronological transcript, Markdown will state that sequences below `seedLength` are inherited from the parent and sequences at or above it belong to the selected session log. Descendants continue filtering their transcript at their own seed boundary.

### Timestamp rendering

Each message and execution-state timestamp will display deterministic UTC ISO-8601 text followed by its raw epoch value. Sequence remains the canonical ordering key.

### Release

The corrected Windows package will use version `0.1.1-rc.5`; the faulty `0.1.1-rc.4` artifact will not be overwritten.

## Security and Scope

- Do not commit the supplied ZIP, Markdown, message bodies, session ids, workspace paths, or credentials.
- Keep successful tool payload exclusion unchanged.
- Do not redesign the raw Session ZIP or descendant discovery.

## Acceptance Criteria

- Current direct-shape and legacy wrapped-shape user messages both render.
- Direct human messages and plugin context are classified correctly.
- Root metadata names its parent/depth and explains the seed boundary.
- Rendered timestamps are human-readable UTC plus raw epoch.
- The private comparison artifact renders all 1,007 persisted user/assistant messages with no missing sequences.
- Descendant seed history remains non-duplicated.
- Plugin, desktop, audit, and Windows packaging checks pass for `0.1.1-rc.5`.
