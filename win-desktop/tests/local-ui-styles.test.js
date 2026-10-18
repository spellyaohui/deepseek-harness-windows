import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))

test('every local client CSS-module reference has a declared selector', () => {
  const missing = []
  for (const owner of ['models-settings-plugin', 'agent-teams-plugin']) {
    const dir = join(root, owner, 'src/client')
    for (const name of readdirSync(dir).filter(name => /\.tsx?$/.test(name) && !name.includes(' (SFConflict '))) {
      const source = readFileSync(join(dir, name), 'utf8')
      for (const [, alias, path] of source.matchAll(/import (\w+) from ['"](.+\.module\.css)['"]/g)) {
        const css = readFileSync(join(dir, path), 'utf8')
        const refs = new RegExp(alias + "(?:\\.([A-Za-z_]\\w*)|\\[['\"]([^'\"]+)['\"]\\])", 'g')
        for (const [, dot, bracket] of source.matchAll(refs)) {
          const key = dot ?? bracket
          if (!new RegExp('\\.' + key + '(?![\\w-])').test(css)) missing.push(owner + '/' + name + ': ' + key)
        }
      }
    }
  }
  assert.deepEqual([...new Set(missing)], [])
})

test('Models styles never leak bare control selectors outside their CSS module', () => {
  const css = readFileSync(join(root, 'models-settings-plugin/src/client/ModelsSection.module.css'), 'utf8')
  assert.doesNotMatch(css, /(?:^|,)\s*(?:button|input|select|textarea)(?=[\s:{])/m)
})
