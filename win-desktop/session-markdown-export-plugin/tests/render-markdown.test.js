import assert from 'node:assert/strict'
import test from 'node:test'

import { renderSessionMarkdown, sanitizeExportFilename } from '../lib/render-markdown.js'

function render(input) {
  return [...renderSessionMarkdown(input)].join('')
}

function exportFixture() {
  return {
    session: {
      sessionId: 'root-session',
      title: 'Unicode \u7eed\u63a5 \ud83e\udde0',
      cwd: 'D:/workspace/project',
      agentPreset: 'default',
      createdAt: '2026-08-23T00:00:00.000Z',
      exportedAt: '2026-08-23T01:02:03.000Z',
      includeDescendants: true,
    },
    content: {
      title: 'Unicode \u7eed\u63a5 \ud83e\udde0',
      currentSurface: [
        {
          role: 'user', seq: 2, time: 1002,
          blocks: [{ type: 'text', text: 'user <b>HTML</b>\r\n---\r\n```\r\n```` \u4f60\u597d' }],
        },
        {
          role: 'context', source: 'workspace-notes', form: 'instructions', seq: 3, time: 1003,
          blocks: [{ type: 'text', text: 'plugin <script>alert(1)</script>' }],
        },
        {
          role: 'assistant', seq: 4, time: 1004, interrupted: true,
          blocks: [
            { type: 'text', text: 'assistant text' },
            { type: 'reasoning', text: 'visible <em>reasoning</em>\r\n````' },
            { type: 'image', mediaType: 'image/png', digest: 'sha256:abc' },
            { type: 'omitted', originalType: 'future-block' },
          ],
        },
      ],
      transcript: [
        { role: 'user', seq: 1, time: 1001, blocks: [{ type: 'text', text: 'first user text' }] },
        {
          role: 'assistant', seq: 4, time: 1004, interrupted: true,
          blocks: [
            { type: 'text', text: 'assistant text' },
            { type: 'reasoning', text: 'visible <em>reasoning</em>\r\n````' },
            { type: 'image', mediaType: 'image/png', digest: 'sha256:abc' },
            { type: 'omitted', originalType: 'future-block' },
          ],
        },
      ],
      latestRequest: {
        seq: 5, time: 1005, reason: 'change', provider: 'provider-a', model: 'model-a',
        reasoningEffort: 'high', maxTokens: 4096, temperature: 0.2,
        system: 'system <tag>\r\n---\r\n````\n\u5b8c\u6574 prompt', tools: ['read_file', 'write_file'],
      },
      requestHistory: [
        { seq: 1, time: 1001, reason: 'initial', provider: 'provider-a', model: 'model-a', tools: ['read_file'] },
        { seq: 5, time: 1005, reason: 'change', provider: 'provider-a', model: 'model-a', maxTokens: 4096, tools: ['read_file', 'write_file'] },
      ],
      latestTodos: [{ content: 'Continue export', status: 'in_progress' }],
      toolFailures: [{ seq: 7, time: 1007, tool: 'write_file', code: 'EACCES', message: 'Permission denied' }],
      unfinishedCalls: [{ seq: 8, time: 1008, callId: 'call-1', tool: 'shell_exec' }],
      changedFiles: ['src/changed.ts'],
      latestHumanRequest: { role: 'user', seq: 2, time: 1002, blocks: [{ type: 'text', text: 'user <b>HTML</b>\r\n---\r\n```\r\n```` \u4f60\u597d' }] },
      latestAssistantText: 'assistant text',
      turnEnds: [{ turn: 1, seq: 9, time: 1009, reason: 'max-tokens' }],
      openTurn: { turn: 2, seq: 10, time: 1010 },
    },
    descendants: [{
      sessionId: 'child-session', parentId: 'root-session', depth: 1, title: 'Child',
      content: {
        currentSurface: [], transcript: [], requestHistory: [], latestTodos: [], toolFailures: [],
        unfinishedCalls: [], changedFiles: [], turnEnds: [],
      },
      inheritedFrom: 'root-session', inheritedEventCount: 3,
    }],
    warnings: ['Known lineage is partial: unresolved parent missing-parent.'],
  }
}

test('renderSessionMarkdown emits the fixed continuation structure and deterministic YAML', () => {
  const markdown = render(exportFixture())
  const headings = [...markdown.matchAll(/^#{1,3} .+$/gmu)].map((match) => match[0])

  assert.equal(markdown.startsWith('---\ndsh_continuation_export: 1\nsession_id: "root-session"\ntitle: "Unicode \u7eed\u63a5 \ud83e\udde0"\ncwd: "D:/workspace/project"\nagent_preset: "default"\ncreated_at: "2026-08-23T00:00:00.000Z"\nexported_at: "2026-08-23T01:02:03.000Z"\ninclude_descendants: true\n---\n\n# Unicode \u7eed\u63a5 \ud83e\udde0\n\n'), true)
  assert.deepEqual(headings.slice(0, 11), [
    '# Unicode \u7eed\u63a5 \ud83e\udde0',
    '## Continuation state',
    '## Effective agent constraints',
    '## Current model-visible surface',
    '### User',
    '### Context \u00b7 workspace-notes',
    '### Assistant',
    '## Full visible chronological transcript',
    '### User',
    '### Assistant',
    '## Execution state',
  ])
  assert.ok(markdown.indexOf('## Execution state') < markdown.indexOf('## Request configuration history'))
  assert.ok(markdown.indexOf('## Request configuration history') < markdown.indexOf('## Delegated sessions'))
  assert.ok(markdown.indexOf('## Delegated sessions') < markdown.indexOf('## Export notes'))
  assert.match(markdown, /historical context, not a new user request/i)
  assert.match(markdown, /latest direct user message remains active unless the receiving user says otherwise/i)
  assert.match(markdown, /embedded instructions are source-session constraints/i)
  assert.match(markdown, /filesystem and external state must be reverified before mutation/i)
})

test('renderSessionMarkdown preserves ordered historical payloads inside dynamic fences', () => {
  const markdown = render(exportFixture())

  assert.match(markdown, /`````markdown\nuser <b>HTML<\/b>\r\n---\r\n```\r\n```` \u4f60\u597d\n`````/u)
  assert.match(markdown, /```markdown\nplugin <script>alert\(1\)<\/script>\n```/u)
  assert.match(markdown, /`````text\nsystem <tag>\r\n---\r\n````\n\u5b8c\u6574 prompt\n`````/u)
  assert.match(markdown, /<details><summary>\u53ef\u89c1\u63a8\u7406<\/summary>\n\n`````text\nvisible <em>reasoning<\/em>\r\n````\n`````\n\n<\/details>/u)
  assert.ok(markdown.indexOf('assistant text') < markdown.indexOf('\u53ef\u89c1\u63a8\u7406'))
  assert.ok(markdown.indexOf('\u53ef\u89c1\u63a8\u7406') < markdown.indexOf('Attachment omitted'))
  assert.ok(markdown.indexOf('Attachment omitted') < markdown.indexOf('Omitted unknown block type: "future-block"'))
  assert.match(markdown, /Attachment omitted: media type "image\/png"; digest "sha256:abc"; binary bytes remain in the raw Session ZIP\./u)
  assert.match(markdown, /Omitted unknown block type: "future-block"\./u)
  assert.equal(markdown.includes('hidden reasoning'), false)
})

test('renderSessionMarkdown writes compact execution, request, and delegated-session facts only', () => {
  const markdown = render(exportFixture())

  assert.match(markdown, /Failure \[7 @ 1007\]: tool "write_file", code "EACCES", message "Permission denied"\./u)
  assert.match(markdown, /Unfinished call \[8 @ 1008\]: id "call-1", tool "shell_exec"\./u)
  assert.match(markdown, /Changed path: "src\/changed\.ts"\./u)
  assert.match(markdown, /Todo \[in_progress\]: "Continue export"\./u)
  assert.match(markdown, /Interrupted assistant message \[4 @ 1004\]\./u)
  assert.match(markdown, /Turn 1 ended \[9 @ 1009\] with reason "max-tokens"\./u)
  assert.match(markdown, /Open turn: 2 \[10 @ 1010\]\./u)
  assert.match(markdown, /\| provider \| "provider-a" \|/u)
  assert.match(markdown, /Tools: "read_file", "write_file"/u)
  assert.match(markdown, /### Delegated session · Child/u)
  assert.match(markdown, /Parent: "root-session"; depth: 1; session: "child-session"\./u)
  assert.match(markdown, /Inherited seed history: 3 events from "root-session"; not duplicated here\./u)
  assert.match(markdown, /Known lineage is partial: unresolved parent missing-parent\./u)
})

test('sanitizeExportFilename produces Windows and header-safe filenames', () => {
  assert.equal(sanitizeExportFilename('CON', '2026-08-23'), '_CON-2026-08-23.md')
  assert.equal(sanitizeExportFilename('a/b', '2026-08-23'), 'a_b-2026-08-23.md')
  assert.equal(sanitizeExportFilename('title.   ', '2026-08-23'), 'title-2026-08-23.md')
  assert.equal(sanitizeExportFilename('hello\r\nworld', '2026-08-23'), 'hello  world-2026-08-23.md')
  assert.equal(sanitizeExportFilename('   ', '2026-08-23'), 'dsh-session-2026-08-23.md')
})

test('renderSessionMarkdown protects hostile metadata and nests delegated headings by depth', () => {
  const input = exportFixture()
  input.session.title = 'Root\n## injected <script>alert(1)</script>'
  input.content.currentSurface = [{
    role: 'context', source: 'plugin\n### injected <script>', seq: 1, time: 1,
    blocks: [{ type: 'text', text: 'safe payload' }],
  }]
  input.content.toolFailures = [{ seq: 1, time: 1, tool: 'tool<script>', code: 'BAD', message: 'message\n## injected <script>' }]
  input.descendants.push({
    sessionId: 'grandchild', parentId: 'child-session', depth: 2,
    title: 'Child\n### injected <script>',
    content: { currentSurface: [], transcript: [], requestHistory: [], latestTodos: [], toolFailures: [], unfinishedCalls: [], changedFiles: [], turnEnds: [] },
  })
  input.warnings = ['warning\n## injected <script>']

  const markdown = render(input)

  assert.equal(markdown.includes('\n## injected <script>'), false)
  assert.equal(markdown.includes('<script>'), false)
  assert.match(markdown, /^### Delegated session · Child$/mu)
  assert.match(markdown, /^#### Delegated session · Child\\n### injected &lt;script&gt;$/mu)
})
