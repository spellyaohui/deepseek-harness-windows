# Session Continuation Markdown Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic `续接 MD` export that gives another agent the effective constraints, current context, complete visible transcript, compact execution state, and recursive delegated-session work needed to continue a Harness session.

**Architecture:** Build a separate local Host/browser plugin over official Harness services. The Host half preflights live-preferred snapshots through `ctx.sessionQuery`, folds events into a typed export model, and streams Markdown through the loopback web server; the browser half registers one action in `conversation.session.header.utilities` and performs a HEAD preflight before handing the GET URL to the browser download manager. Keep the official raw Session ZIP action unchanged as the lossless diagnostic path.

**Tech Stack:** TypeScript 5.9, React 18, Cordis, DeepSeek Harness `0.1.1-rc.2`, `@deepseek-ai/dsh-session-query`, Node.js HTTP streams, Node built-in test runner, tsdown, Electron 43.

## Global Constraints

- Package name is `@deepseek-ai/dsh-session-markdown-export`; local version starts at `0.1.0`.
- Register exactly `HEAD /api/session.export-markdown` and `GET /api/session.export-markdown`.
- Require `sessionId`; parse it through the Harness `SessionId` boundary.
- Default `includeDescendants` to `true`; accept only exact strings `true` and `false`.
- Use `ctx.sessionQuery.readSession`, `readSurface`, `readTitleSnapshot`, and `traceSession`; never export only the browser-rendered state.
- Prefer live state over persistence through the Session Query service and support cold persisted sessions.
- Export the latest complete rendered system prompt, model/provider/reasoning/call config, agent preset, cwd, current surface, complete visible transcript, persisted user-visible reasoning, plugin context, todo, failures, unfinished calls, changed-file facts, and request history.
- Never claim to expose hidden chain-of-thought; label reasoning only as persisted user-visible reasoning.
- Exclude raw successful tool arguments/results from the Markdown transcript and execution appendix.
- Keep the official raw Session ZIP action and `/api/session.export` behavior unchanged.
- Include recursively known descendants by default in deterministic tree order without duplicating inherited seed history.
- Do not rescan project instruction files from disk; export what the persisted rendered prompt and plugin-context messages prove reached the model.
- Do not scan environment variables, credentials, arbitrary paths, or unrelated filesystem content.
- Do not silently truncate stored text or visible reasoning.
- Validate root and known lineage before sending the body; an incomplete streamed export must end with an explicit `EXPORT INCOMPLETE` section.
- Stream incrementally, respect response backpressure, and stop promptly on client abort.
- Sanitize filenames for Windows names, path separators, control characters, trailing spaces/dots, and HTTP header injection.
- The browser action label is `续接 MD`; tooltip is `导出供其他智能体继续工作的 Markdown`.
- Repeated clicks for one session share one in-flight preflight; dismissing the status dialog does not cancel the browser-managed download.
- Use Harness primitives and theme tokens; add no Electron-specific UI styling.

## File Responsibility Map

- `win-desktop/session-markdown-export-plugin/package.json`: local package identity, build scripts, peer dependencies, and browser injection metadata.
- `win-desktop/session-markdown-export-plugin/src/types.ts`: internal export records and stable HTTP error codes.
- `win-desktop/session-markdown-export-plugin/src/content.ts`: fold Session events/surface into continuation records while omitting raw tool traffic.
- `win-desktop/session-markdown-export-plugin/src/render-markdown.ts`: pure deterministic Markdown generator and dynamic fence helpers.
- `win-desktop/session-markdown-export-plugin/src/session-export.ts`: consistent Session Query reads, lineage traversal, seed de-duplication, and preflight plan.
- `win-desktop/session-markdown-export-plugin/src/http.ts`: parameter validation, status mapping, headers, streaming, backpressure, and abort handling.
- `win-desktop/session-markdown-export-plugin/src/index.ts`: Host service injection and exact route registration.
- `win-desktop/session-markdown-export-plugin/src/client/controller.ts`: one in-flight HEAD preflight per session and browser download state.
- `win-desktop/session-markdown-export-plugin/src/client/HeaderAction.tsx`: `续接 MD` button and shared status dialog.
- `win-desktop/session-markdown-export-plugin/src/client/styles.ts`: idempotent theme-token-only style injection.
- `win-desktop/session-markdown-export-plugin/src/client/index.tsx`: locale and official header-utility slot registration.
- `win-desktop/session-markdown-export-plugin/tests/*.test.js`: pure fold, renderer, Session Query, HTTP, and client-controller tests.
- `win-desktop/config/agent-teams.patch.yml`: mount the new plugin beside desktop settings and AgentTeams.
- `win-desktop/package.json` and `win-desktop/package-lock.json`: `file:session-markdown-export-plugin` dependency.
- `win-desktop/tests/session-markdown-export-integration.test.js`: wrapper/package graph regression coverage.

---

### Task 1: Scaffold the independent Host/browser plugin

**Files:**
- Create: `win-desktop/session-markdown-export-plugin/package.json`
- Create: `win-desktop/session-markdown-export-plugin/tsconfig.json`
- Create: `win-desktop/session-markdown-export-plugin/tsconfig.client.json`
- Create: `win-desktop/session-markdown-export-plugin/tsdown.config.ts`
- Create: `win-desktop/session-markdown-export-plugin/src/index.ts`
- Create: `win-desktop/session-markdown-export-plugin/src/client/index.tsx`

**Interfaces:**
- Consumes: Cordis Host context and browser module loader.
- Produces: build artifacts `lib/index.js`, `lib/client.js`, and `lib/types/**` under package id `@deepseek-ai/dsh-session-markdown-export`.

- [ ] **Step 1: Create package metadata with exact runtime seams**

Create `package.json` containing:

```json
{
  "name": "@deepseek-ai/dsh-session-markdown-export",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "package.json"],
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-conversation"
      ],
      "platform": "web"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.client.json && tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.client.json --noEmit",
    "test": "pnpm build && node --test tests/*.test.js"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-agent": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-client-locale": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-client-runtime": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-client-ui-conversation": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-client-ui-primitives": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-client-ui-slots": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-session": "^0.1.1-rc.2",
    "@deepseek-ai/dsh-session-query": "^0.1.1-rc.2",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "~18.3.1",
    "@types/react-dom": "^18.3.7",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tsdown": "0.22.2",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Add exact Host and browser compiler configs**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationDir": "lib/types",
    "outDir": "lib",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/client"]
}
```

Create `tsconfig.client.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": []
  },
  "include": ["src/client"],
  "exclude": []
}
```

Create `tsdown.config.ts`:

```ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const pluginId: string = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).name

const externals = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives',
]

export default defineConfig({
  name: `${pluginId}/client`,
  entry: { client: 'lib/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: (id: string) => externals.includes(id),
    alwaysBundle: (id: string) => !externals.includes(id),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
```

- [ ] **Step 3: Add minimal loadable Host and browser entry points**

Host:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'session-markdown-export'
export const inject = ['sessionQuery']

export function apply(_ctx: Context): void {}
```

Browser:

```tsx
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export const inject = ['slots', 'locale']

export function apply(_ctx: ClientContext): void {}
```

- [ ] **Step 4: Install, build, and verify package identity**

Run:

```powershell
Set-Location 'win-desktop/session-markdown-export-plugin'
pnpm install
pnpm typecheck
pnpm build
node -e "import('./lib/index.js').then(m=>{if(m.name!=='session-markdown-export')process.exit(1)})"
Select-String -Path 'lib/client.js' -Pattern '@deepseek-ai/dsh-session-markdown-export'
```

Expected: typecheck/build succeed, Host import exits 0, and the browser bundle registers under the package name.

- [ ] **Step 5: Commit the scaffold**

```powershell
git add win-desktop/session-markdown-export-plugin
git commit -m "chore: scaffold session Markdown export plugin"
```

---

### Task 2: Fold logs and current surfaces into a typed export model

**Files:**
- Create: `win-desktop/session-markdown-export-plugin/src/types.ts`
- Create: `win-desktop/session-markdown-export-plugin/src/content.ts`
- Create: `win-desktop/session-markdown-export-plugin/tests/content.test.js`

**Interfaces:**
- Consumes: `SessionLogSnapshot`, `SessionSurfaceSnapshot`, and optional title.
- Produces: `foldSessionContent(input): FoldedSessionContent` with no raw tool arguments or successful outputs.

- [ ] **Step 1: Write failing fold tests using complete event fixtures**

Create fixtures containing:

- direct human and plugin-source `user/message` events;
- an `assistant/message` with interleaved `text`, `reasoning`, `tool-call`, and unknown blocks;
- successful and failed `tool/result` events;
- a started call without a result;
- `todo/write` snapshots;
- two `request/header` values with a model/system change;
- an interrupted assistant prefix and max-token turn end;
- a filesystem result meta object shaped as `{ diffs: [{ path, oldText, newText }] }`.

Assert the fold retains human/plugin labels, block order, visible reasoning, latest todo/header, failures, unfinished calls, changed paths, open-turn state, and request history. Assert the JSON serialization of the folded result contains neither the raw tool-call `arguments` string nor a successful tool-result body.

- [ ] **Step 2: Run the focused test and observe the missing module failure**

Run `pnpm build; node --test tests/content.test.js`.

Expected: FAIL because `lib/content.js` and `lib/types.js` do not exist.

- [ ] **Step 3: Define stable internal record types**

`src/types.ts` must define these discriminated unions:

```ts
export type ExportBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'image'; mediaType?: string; digest?: string }
  | { type: 'omitted'; originalType: string }

export interface ExportMessage {
  role: 'user' | 'assistant' | 'context'
  source?: string
  form?: string
  seq: number
  time: number
  blocks: ExportBlock[]
  interrupted?: boolean
}

export interface ExportToolFailure {
  seq: number
  time: number
  tool: string
  code: string
  message: string
}

export interface ExportUnfinishedCall {
  seq: number
  time: number
  callId: string
  tool: string
}

export interface ExportRequestConfiguration {
  seq: number
  time: number
  reason: string
  provider: string
  model: string
  reasoningEffort?: string
  maxTokens?: number
  temperature?: number
  system?: string
  tools: string[]
}
```

`FoldedSessionContent` must include `currentSurface`, `transcript`, `latestRequest`, `requestHistory`, `latestTodos`, `toolFailures`, `unfinishedCalls`, `changedFiles`, `latestHumanRequest`, `latestAssistantText`, and `openTurn`.

- [ ] **Step 4: Implement an allowlist fold**

Use a switch over Session event types. For `assistant/message`, map only stored content blocks and omit `tool-call` content. Track tool names/call ids from `tool/call`, but never copy `arguments`. Pair results by call id; for successful results discard the message. For failures retain only the tool name, `error.code`, `error.name`, and the model-safe textual error block. Extract changed files only when `meta` is a plain object with an array `diffs` whose rows have a string `path`; retain unique normalized path strings, not old/new file bodies.

For unknown assistant blocks return:

```ts
{ type: 'omitted', originalType: String(block.type ?? 'unknown') }
```

For plugin user sources, preserve `source.plugin` and `source.form` when present; direct user sources stay `role: 'user'`.

- [ ] **Step 5: Run and commit**

Run `pnpm build; node --test tests/content.test.js`.

Expected: every fold assertion passes and the no-raw-tool-leak assertions pass.

```powershell
git add win-desktop/session-markdown-export-plugin
git commit -m "feat: fold session history for continuation export"
```

---

### Task 3: Render deterministic and injection-safe Markdown

**Files:**
- Create: `win-desktop/session-markdown-export-plugin/src/render-markdown.ts`
- Create: `win-desktop/session-markdown-export-plugin/tests/render-markdown.test.js`

**Interfaces:**
- Consumes: `FoldedSessionContent`, root/session metadata, and descendant sections.
- Produces: `renderSessionMarkdown(input): Iterable<string>` and `sanitizeExportFilename(title, date): string`.

- [ ] **Step 1: Write failing renderer tests**

Assert exact section order, YAML front matter, safe rendering of text containing triple/quadruple backticks, HTML tags, `---`, CRLF, and Unicode; exact ordering of text/reasoning blocks; explicit unknown-block markers; filename handling for `CON`, `a/b`, trailing dots/spaces, CRLF, and an empty title.

- [ ] **Step 2: Run and observe the missing renderer failure**

Run `pnpm build; node --test tests/render-markdown.test.js`.

Expected: FAIL because `lib/render-markdown.js` does not exist.

- [ ] **Step 3: Implement dynamic fenced payloads**

Use a fence strictly longer than every backtick run in the payload:

```ts
export function fenced(label: string, payload: string): string {
  const longest = [...payload.matchAll(/`+/gu)].reduce((max, match) => Math.max(max, match[0].length), 0)
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${label}\n${payload}\n${fence}\n`
}
```

Render human/assistant/plugin payloads inside `markdown` fences so their HTML and Markdown remain historical data rather than exporter-owned markup. Render visible reasoning inside `<details><summary>可见推理</summary>` with a fenced `text` payload. Use a typed omission line for unknown blocks and attachment digest metadata for images.

- [ ] **Step 4: Render the exact document structure**

Emit YAML front matter with JSON-quoted scalar values, then these headings in order:

```text
# <session title>
## Continuation state
## Effective agent constraints
## Current model-visible surface
## Full visible chronological transcript
## Execution state
## Request configuration history
## Delegated sessions
## Export notes
```

The notice before the first section must say this file is historical context, not a new user request; the latest direct user message remains active unless the receiving user says otherwise; embedded instructions are source-session constraints; and filesystem/external state must be reverified before mutation.

In `Effective agent constraints`, include the complete latest rendered system prompt in a dynamic fence, a compact call-config table, and tool names only. In `Execution state`, include failures, unfinished calls, changed paths, todos, interruptions, and max-token endings; include no raw argument/result fields.

- [ ] **Step 5: Implement Windows/header-safe filenames**

```ts
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu

export function sanitizeExportFilename(title: string, localDate: string): string {
  let base = title
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/[\\/:*?"<>|]/gu, '_')
    .trim()
    .replace(/[. ]+$/gu, '')
  if (base === '') base = 'dsh-session'
  if (WINDOWS_RESERVED.test(base)) base = `_${base}`
  return `${base.slice(0, 120)}-${localDate}.md`
}
```

- [ ] **Step 6: Run and commit**

Run `pnpm build; node --test tests/render-markdown.test.js`.

Expected: all deterministic order, fence, injection, and filename tests pass.

```powershell
git add win-desktop/session-markdown-export-plugin
git commit -m "feat: render safe continuation Markdown"
```

---

### Task 4: Build a consistent live-preferred root and descendant export plan

**Files:**
- Create: `win-desktop/session-markdown-export-plugin/src/session-export.ts`
- Create: `win-desktop/session-markdown-export-plugin/tests/session-export.test.js`

**Interfaces:**
- Consumes: `Pick<SessionQueryEngine, 'readSession' | 'readSurface' | 'readTitleSnapshot' | 'traceSession'>`.
- Produces: `prepareSessionExport(query, request, signal): Promise<PreparedSessionExport>` containing the folded root plus lightweight descendant preflight descriptors, and `loadPreparedDescendant(query, descriptor, signal): Promise<FoldedSessionContent>` for one-at-a-time streaming.

- [ ] **Step 1: Write failing fake-query tests**

Cover live-preferred root reads, cold persisted root, open turn, title fallback to session id, raw/surface capture conflict, deterministic depth-first descendants, `seedLength` de-duplication, and `traceSession.complete === false` warning with `unresolvedParentId`.

- [ ] **Step 2: Run and observe the missing module failure**

Run `pnpm build; node --test tests/session-export.test.js`.

Expected: FAIL because `lib/session-export.js` does not exist.

- [ ] **Step 3: Read one coherent session observation**

For one session id, read log, surface, and title snapshot, then verify their Session headers are compatible with `assertSessionHeadersCompatible`. Compute the raw log's final sequence number and require it to equal `surface.capturedThroughSeq`; otherwise throw a stable `SESSION_CHANGED` conflict before body streaming.

Return a folded record with the session header, title or id fallback, current surface, full transcript, and `seedLength`.

- [ ] **Step 4: Preflight lineage and flatten it in deterministic tree order**

Call `traceSession(rootId)` once. Traverse each node depth-first in the order returned by `descendants`; attach `depth` and `parentId`. Preflight descendants one at a time: read and validate the Session header plus final sequence, store only `{ sessionId, parentId, depth, expectedHeader, expectedLastSeq, seedLength }`, then release that descendant's event arrays before moving to the next node.

When `loadPreparedDescendant()` later re-reads a child, reject if its header or final sequence differs from the preflight descriptor. For a child with `seedLength > 0`, render transcript events from `seedLength` onward and record:

```ts
{ inheritedFrom: parentId, inheritedEventCount: seedLength }
```

Do not copy the inherited prefix into the child section.

- [ ] **Step 5: Preserve partial lineage explicitly**

When `trace.complete` is false, keep the known tree and add one warning record naming `trace.unresolvedParentId`. Missing target/root data or incompatible headers throw a conflict; they never produce a file that appears complete. `PreparedSessionExport` keeps only the folded root, lineage descriptors, and warnings; GET loads, renders, and releases each descendant sequentially.

- [ ] **Step 6: Run and commit**

Run `pnpm build; node --test tests/session-export.test.js`.

Expected: all root, race, lineage, and de-duplication cases pass.

```powershell
git add win-desktop/session-markdown-export-plugin
git commit -m "feat: prepare recursive session export snapshots"
```

---

### Task 5: Add the exact HEAD/GET streaming endpoint

**Files:**
- Create: `win-desktop/session-markdown-export-plugin/src/http.ts`
- Create: `win-desktop/session-markdown-export-plugin/tests/http.test.js`
- Modify: `win-desktop/session-markdown-export-plugin/src/index.ts`

**Interfaces:**
- Consumes: `prepareSessionExport()` and `renderSessionMarkdown()`.
- Produces: exact loopback route `/api/session.export-markdown` with stable 400/404/409/500 errors.

- [ ] **Step 1: Write failing HTTP contract tests**

Use fake `IncomingMessage`/`ServerResponse` objects to cover HEAD/GET parity, required id, invalid boolean, absent session, conflict, filename headers, UTF-8 body, backpressure, request abort, and a descendant failure after the first body chunk.

- [ ] **Step 2: Run and observe the missing module failure**

Run `pnpm build; node --test tests/http.test.js`.

Expected: FAIL because `lib/http.js` does not exist.

- [ ] **Step 3: Define stable error responses**

Use this JSON shape before body streaming:

```ts
export interface ExportHttpErrorBody {
  error: {
    code: 'INVALID_REQUEST' | 'SESSION_NOT_FOUND' | 'SESSION_CONFLICT' | 'EXPORT_FAILED'
    message: string
  }
}
```

Map invalid params to 400, missing Session Query target to 404, compatibility/lineage/source conflicts to 409, and unexpected failures to 500. Log stacks Host-side; return concise messages only.

- [ ] **Step 4: Validate parameters without accepting paths**

Parse `req.url` against a dummy loopback base. Require one non-empty `sessionId`, reject repeated/conflicting values, and accept only absent/`true`/`false` for `includeDescendants`. Convert the id through the Harness `SessionId` constructor/export used by the installed session package. Ignore no other query parameter silently; reject unknown parameters with `INVALID_REQUEST`.

- [ ] **Step 5: Implement HEAD and streaming GET**

HEAD runs complete preflight, sets the same content headers as GET, and ends without a body. GET sets:

```ts
{
  'content-type': 'text/markdown; charset=utf-8',
  'content-disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}
```

Write each renderer chunk separately. When `res.write(chunk)` returns false, await `once(res, 'drain')`. Tie an `AbortController` to request `aborted`/`close` and check it before loading/rendering each descendant.

If a failure happens after headers/body started and the response remains writable, append:

```markdown
## EXPORT INCOMPLETE

The export stopped before every validated section was written. Re-run the export and do not treat this file as a complete continuation package.
```

Then end the response. Never append stack traces or raw error objects.

- [ ] **Step 6: Register the route only after the web-server service binds**

Use this exact compatibility boundary and register one `kind: 'exact'` route at `/api/session.export-markdown`; dispatch only HEAD and GET and return 405 with `Allow: HEAD, GET` otherwise:

```ts
interface WebRouteHost {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

const WEB_SERVER_KEYS = ['webServer', 'httpServer'] as const
```

- [ ] **Step 7: Run and commit**

Run `pnpm build; node --test tests/http.test.js`.

Expected: all status, header, streaming, abort, backpressure, and incomplete-marker tests pass.

```powershell
git add win-desktop/session-markdown-export-plugin
git commit -m "feat: stream session continuation Markdown"
```

---

### Task 6: Register the official `续接 MD` header action

**Files:**
- Create: `win-desktop/session-markdown-export-plugin/src/client/controller.ts`
- Create: `win-desktop/session-markdown-export-plugin/src/client/HeaderAction.tsx`
- Create: `win-desktop/session-markdown-export-plugin/src/client/styles.ts`
- Create: `win-desktop/session-markdown-export-plugin/src/client/locales.ts`
- Create: `win-desktop/session-markdown-export-plugin/tests/client-controller.test.js`
- Modify: `win-desktop/session-markdown-export-plugin/src/client/index.tsx`

**Interfaces:**
- Consumes: same-origin HEAD/GET endpoint and `conversation.session.header.utilities`.
- Produces: one in-flight preflight per Session plus preparing/success/error dialog state.

- [ ] **Step 1: Write failing controller tests**

Assert two concurrent requests for one session return the same Promise and issue one HEAD request; different sessions remain independent; HEAD failure publishes error; success invokes the save callback exactly once; dismiss closes the dialog without aborting the active preflight; dispose aborts and drains every active preflight.

- [ ] **Step 2: Run and observe the missing module failure**

Run `pnpm build; node --test tests/client-controller.test.js`.

Expected: FAIL because `lib/client/controller.js` does not exist.

- [ ] **Step 3: Implement the controller after the official Session ZIP pattern**

Use `createSnapshotStore({ bySession: {} })`, an `active: Map<SessionId, { abort, done }>` and this URL contract:

```ts
const url = new URL('/api/session.export-markdown', hostBase())
url.searchParams.set('sessionId', String(sessionId))
url.searchParams.set('includeDescendants', 'true')
```

Set status `preparing`, perform HEAD with the per-session AbortSignal, then call the save callback with the GET URL. Publish `success` after the browser save starts; publish `error` with a concise response-derived message on failure.

- [ ] **Step 4: Render the action and shared dialog with Harness primitives**

The button text must be `续接 MD`; `title`/tooltip must be `导出供其他智能体继续工作的 Markdown`. Disable and set `aria-busy` only while that session is preparing. The dialog copy must distinguish preparation, download started, and failure. Closing it calls `dismiss(sessionId)` only. `styles.ts` must insert one `<style data-plugin-css="session-markdown-export">` block using only `--dsw-alias-*` and `--dsw-font-*` tokens.

- [ ] **Step 5: Register the official slot**

```tsx
ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
  name: 'conversation.session.header.utilities',
  id: 'session-markdown-export',
  locale: 'session-markdown-export',
  inject: () => ({
    hooks: { sessionMarkdownExport: controller.store },
    request: (sessionId) => controller.download(sessionId),
    dismiss: (sessionId) => controller.dismiss(sessionId),
  }),
}, SessionMarkdownExportHeaderAction))
```

Register Simplified Chinese and English locale dictionaries. Use only Harness theme tokens in `styles.ts`; match the existing Session log capsule dimensions rather than copying desktop styles.

- [ ] **Step 6: Run and commit**

Run `pnpm build; node --test tests/client-controller.test.js`.

Expected: controller tests pass and client TypeScript/bundle generation succeeds.

```powershell
git add win-desktop/session-markdown-export-plugin
git commit -m "feat: add continuation Markdown header action"
```

---

### Task 7: Mount the plugin without changing raw ZIP export

**Files:**
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/config/agent-teams.patch.yml`
- Create: `win-desktop/tests/session-markdown-export-integration.test.js`

**Interfaces:**
- Consumes: built local plugin package.
- Produces: one Host/browser plugin row in the desktop Web profile while retaining `@deepseek-ai/dsh-session-log-export` behavior.

- [ ] **Step 1: Write failing wrapper graph assertions**

Assert:

```js
assert.equal(
  packageJson.dependencies['@deepseek-ai/dsh-session-markdown-export'],
  'file:session-markdown-export-plugin',
)
assert.ok(patchEntries.some(entry => entry.name === '@deepseek-ai/dsh-session-markdown-export'))
assert.match(clientBundle, /conversation\.session\.header\.utilities/)
assert.match(clientBundle, /session-markdown-export/)
assert.match(hostBundle, /\/api\/session\.export-markdown/)
assert.match(rawExportClient, /\/api\/session\.export/)
```

- [ ] **Step 2: Run and observe the missing dependency/row failure**

Run `npm test` from `win-desktop`.

Expected: integration test fails because the local dependency and patch row are absent.

- [ ] **Step 3: Add the local dependency and patch row**

Set:

```json
"@deepseek-ai/dsh-session-markdown-export": "file:session-markdown-export-plugin"
```

Add a patch entry:

```yaml
- id: session-markdown-export
  name: '@deepseek-ai/dsh-session-markdown-export'
```

Run `npm install --ignore-scripts` to update the lockfile. Do not remove, rename, or shadow the official Session log export package/command/action.

- [ ] **Step 4: Run plugin, wrapper, and security gates**

Run:

```powershell
Set-Location 'session-markdown-export-plugin'
pnpm typecheck
pnpm test
Set-Location '..'
npm test
npm audit --audit-level=high
```

Expected: all tests pass and no high/critical vulnerability is reported.

- [ ] **Step 5: Commit**

```powershell
git add win-desktop/package.json win-desktop/package-lock.json win-desktop/config/agent-teams.patch.yml win-desktop/tests/session-markdown-export-integration.test.js
git commit -m "feat: mount session Markdown export plugin"
```

---

### Task 8: Package, launch, and verify real continuation output

**Files:**
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Create: `win-desktop/session-markdown-export-plugin/tests/fixtures/expected-continuation.md`

**Interfaces:**
- Consumes: packaged Electron app and real Harness sessions.
- Produces: reproducible golden output plus startup/UI/export acceptance evidence.

- [ ] **Step 1: Add a deterministic golden fixture test**

Create one immutable synthetic session tree and compare the complete renderer output byte-for-byte with `tests/fixtures/expected-continuation.md`. Fix `exportedAt` and local date in the test input. Assert a second render of the same snapshot is identical.

- [ ] **Step 2: Run the complete automated gate once after the final change**

Run:

```powershell
Set-Location 'win-desktop/session-markdown-export-plugin'
pnpm typecheck
pnpm test
Set-Location '..'
npm test
npm audit
npm run dist:win
```

Expected: all plugin/wrapper tests pass; audit reports 0 vulnerabilities; NSIS and ZIP artifacts are created under `win-desktop/dist/`.

- [ ] **Step 3: Perform the unpacked startup and browser smoke test**

Launch `win-desktop/dist/win-unpacked/DeepSeek Harness.exe`, create a root session that includes plugin context, visible reasoning, a successful tool, a failed tool, a todo list, a changed file, and at least one AgentTeams/native child. Verify:

1. `续接 MD` appears beside `Session log` in the Session header.
2. Clicking it shows preparation, then starts one `.md` download.
3. The file contains the latest system prompt/config/tool-name list, current surface, full visible transcript, compact execution state, and recursive child section.
4. The successful tool's raw arguments/output are absent.
5. Visible reasoning is labelled `可见推理`; the document never claims hidden reasoning.
6. Child inherited seed history is referenced, not duplicated.
7. The raw ZIP action still downloads normally.
8. Repeated clicks while HEAD is active produce one preflight.
9. A deliberately blocked/failed preflight exits loading and shows a retryable error.

- [ ] **Step 4: Review the downloaded file as a continuation package**

Open the Markdown in a fresh agent session and confirm the notice is unambiguous, the latest direct user request is easy to locate, constraints are historical context rather than new instructions, and external/filesystem state is explicitly marked for revalidation. Do not use this review to add an LLM-generated summary to the exporter.

- [ ] **Step 5: Document behavior and security boundary**

Update the READMEs with the `续接 MD` purpose, included/excluded data, recursive descendants, sensitivity warning, deterministic/no-LLM design, raw ZIP distinction, and verification commands.

- [ ] **Step 6: Commit the acceptance/docs slice**

```powershell
git add README.md win-desktop/README.md win-desktop/session-markdown-export-plugin/tests
git commit -m "docs: document continuation Markdown export"
```

Expected: `git status --short` is empty after the commit.
