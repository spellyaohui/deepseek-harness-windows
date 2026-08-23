import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import yaml from 'js-yaml'

const wrapperRoot = fileURLToPath(new URL('..', import.meta.url))
const packageJson = JSON.parse(readFileSync(join(wrapperRoot, 'package.json'), 'utf8'))
const patchEntries = yaml.load(readFileSync(join(wrapperRoot, 'config', 'agent-teams.patch.yml'), 'utf8'))
  .flatMap((patch) => patch.insert ?? [])
const markdownPluginRoot = join(
  wrapperRoot,
  'node_modules',
  '@deepseek-ai',
  'dsh-session-markdown-export',
)
const rawExportClientRoot = join(
  wrapperRoot,
  'node_modules',
  '@deepseek-ai',
  'dsh-session-log-export',
)

test('wrapper mounts the packed Markdown export plugin in the desktop Web profile', () => {
  assert.equal(
    packageJson.dependencies['@deepseek-ai/dsh-session-markdown-export'],
    'file:session-markdown-export-plugin',
  )
  assert.ok(patchEntries.some((entry) => entry.name === '@deepseek-ai/dsh-session-markdown-export'))

  assert.equal(existsSync(markdownPluginRoot), true)
  assert.equal(existsSync(join(markdownPluginRoot, 'node_modules')), false)

  const clientBundle = readFileSync(join(markdownPluginRoot, 'lib', 'client.js'), 'utf8')
  const hostBundle = [
    readFileSync(join(markdownPluginRoot, 'lib', 'index.js'), 'utf8'),
    readFileSync(join(markdownPluginRoot, 'lib', 'http.js'), 'utf8'),
  ].join('\n')
  const rawExportClient = readFileSync(join(rawExportClientRoot, 'lib', 'client.js'), 'utf8')

  assert.match(clientBundle, /conversation\.session\.header\.utilities/)
  assert.match(clientBundle, /session-markdown-export/)
  assert.match(hostBundle, /\/api\/session\.export-markdown/)
  assert.match(rawExportClient, /\/api\/session\.export/)
})
