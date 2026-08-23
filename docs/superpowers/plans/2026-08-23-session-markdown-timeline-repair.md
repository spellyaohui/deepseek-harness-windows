# Session Markdown Timeline Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore every current Harness user/context message, explain inherited root history, render readable timestamps, and package the repair as `0.1.1-rc.5`.

**Architecture:** Keep the existing fold/prepare/render pipeline. Normalize current and legacy user event shapes at the folding boundary, carry root lineage metadata through the prepared export, and render a deterministic seed note plus UTC timestamps without changing descendant filtering or tool-payload policy.

**Tech Stack:** TypeScript, Node.js test runner, DeepSeek Harness session-query APIs, Electron Builder.

## Global Constraints

- The repository is public; never commit supplied session artifacts, message bodies, credentials, ids, or local absolute paths.
- Preserve successful tool argument/result exclusion.
- Preserve descendant `seq >= seedLength` filtering.
- Release version is exactly `0.1.1-rc.5`.

---

### Task 1: Restore current Harness user and context messages

**Files:**
- Modify: `win-desktop/session-markdown-export-plugin/src/content.ts`
- Modify: `win-desktop/session-markdown-export-plugin/tests/content.test.js`

**Interfaces:**
- Consumes current `user/message.data: UserMessage` and legacy `user/message.data.message: UserMessage`.
- Produces unchanged `ExportMessage` records for `FoldedSessionContent.transcript` and `currentSurface`.

- [ ] **Step 1: Add failing current-shape tests**

Add sanitized direct-shape human and plugin events:

```js
{
  seq: 20,
  time: 1020,
  type: 'user/message',
  data: message('user', { kind: 'user' }, [{ type: 'text', text: 'Direct prompt.' }]),
}
```

Assert the human entry becomes role `user`, plugin entry becomes role `context`, and `latestHumanRequest` points to the direct prompt.

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
cd win-desktop/session-markdown-export-plugin
node --test tests/content.test.js
```

Expected: the new current-shape entries are absent.

- [ ] **Step 3: Normalize both user shapes**

In `foldMessage()` select the message as:

```ts
const message = event.type === 'user/message'
  ? asRecord(data?.message) ?? data
  : asRecord(data?.message)
```

Keep assistant/tool behavior unchanged.

- [ ] **Step 4: Run typecheck and focused tests**

```powershell
pnpm typecheck
node --test tests/content.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add win-desktop/session-markdown-export-plugin/src/content.ts win-desktop/session-markdown-export-plugin/tests/content.test.js
git commit -m "fix: retain current Harness user messages"
```

---

### Task 2: Explain the root seed boundary and render readable times

**Files:**
- Modify: `win-desktop/session-markdown-export-plugin/src/http.ts`
- Modify: `win-desktop/session-markdown-export-plugin/src/render-markdown.ts`
- Modify: `win-desktop/session-markdown-export-plugin/tests/render-markdown.test.js`
- Modify: `win-desktop/session-markdown-export-plugin/tests/fixtures/expected-continuation.md`

**Interfaces:**
- Extends `SessionMarkdownMetadata` with `inheritedFrom?: string` and `inheritedEventCount?: number`.
- `metadata()` receives the prepared root `seedLength` and maps root parent/depth/inheritance fields.
- Message ordering remains sequence order from `foldSessionContent()`.

- [ ] **Step 1: Add failing metadata/render tests**

Assert root output includes:

```text
Parent session: `parent-session`.
Inherited seed history: 3 events from `parent-session`.
Sequences below 3 are inherited history; sequences at or above 3 belong to this session log.
timestamp: 1970-01-01T00:00:01.001Z (1001)
```

- [ ] **Step 2: Run render tests and confirm RED**

```powershell
node --test tests/render-markdown.test.js tests/http.test.js
```

- [ ] **Step 3: Carry root lineage metadata**

Pass `prepared.root.seedLength` into `metadata()` and map `header.parentSession`, `header.delegationDepth`, and the inherited count only when a parent and positive seed exist.

- [ ] **Step 4: Render deterministic timeline notes and timestamps**

Add one timestamp formatter:

```ts
function timestamp(value: number): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? String(value) : `${date.toISOString()} (${value})`
}
```

Use it for messages, request headers, failures, unfinished calls, turn ends, and open turns. Add the root seed note before the full transcript.

- [ ] **Step 5: Update the golden fixture and verify**

```powershell
pnpm typecheck
pnpm test
```

Expected: all session Markdown plugin tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add win-desktop/session-markdown-export-plugin
git commit -m "fix: clarify inherited session timeline"
```

---

### Task 3: Private-artifact parity check and `rc.5` package

**Files:**
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`

**Interfaces:**
- Produces `DeepSeek-Harness-0.1.1-rc.5-windows-x64.exe` and `.zip` under ignored `win-desktop/dist/`.

- [ ] **Step 1: Build the plugin and reinstall its local package**

```powershell
cd win-desktop/session-markdown-export-plugin
pnpm build
cd ..
npm install --legacy-peer-deps --install-links=true
```

- [ ] **Step 2: Run the private parity diagnostic**

Using the supplied local ZIP only, compare all raw `user/message` and `assistant/message` sequences against the newly folded/rendered output. Expected: 1,007/1,007 represented and zero missing sequences. Do not copy fixture content into the repository.

- [ ] **Step 3: Bump and document `0.1.1-rc.5`**

Update both package version fields and artifact names. Document restored user messages, root seed boundary, and ISO timestamps.

- [ ] **Step 4: Run release verification**

```powershell
cd win-desktop/session-markdown-export-plugin
pnpm typecheck
pnpm test
cd ..
npm test
npm audit
git diff --check
```

- [ ] **Step 5: Scan staged content and commit**

Verify no bearer values, API keys, local absolute paths, session ids, message bodies, or supplied filenames are staged, then commit:

```powershell
git commit -m "docs: release session timeline repair"
```

- [ ] **Step 6: Package and verify artifacts**

```powershell
npm run dist:win
```

Expected:

```text
win-desktop/dist/DeepSeek-Harness-0.1.1-rc.5-windows-x64.exe
win-desktop/dist/DeepSeek-Harness-0.1.1-rc.5-windows-x64.zip
```

Confirm both exist, packaged plugin hashes match installed sources, artifacts remain ignored, and the tracked worktree is clean.
