import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import yaml from 'js-yaml'
import {
  TOOL_CALL_GUIDANCE,
  apply,
  inject,
  name,
} from '../tool-call-guidance-plugin/lib/index.js'
import { generateAgentTeamsPatch } from '../src/dsh-service.js'

test('tool guidance registers one compact wrapper-owned system section', () => {
  let registered
  const disposable = { dispose() {} }
  const returned = apply({
    systemPrompt: {
      section(section) {
        registered = section
        return disposable
      },
    },
  })

  assert.equal(name, 'tool-call-guidance')
  assert.deepEqual(inject, ['systemPrompt'])
  assert.equal(returned, disposable)
  assert.ok(TOOL_CALL_GUIDANCE.length <= 500, `guidance is ${TOOL_CALL_GUIDANCE.length} characters`)
  assert.match(TOOL_CALL_GUIDANCE, /current tool schema/i)
  assert.match(TOOL_CALL_GUIDANCE, /unknown or blank/i)
  assert.match(TOOL_CALL_GUIDANCE, /empty value.*meaningful/i)
  assert.match(TOOL_CALL_GUIDANCE, /do not repeat.*unchanged/i)
  assert.deepEqual(registered, {
    name: 'desktop:tool-call-guidance',
    order: 110,
    text: TOOL_CALL_GUIDANCE,
  })
})

test('static and generated desktop patches mount guidance before AgentTeams', () => {
  const staticPatch = yaml.load(readFileSync(new URL('../config/agent-teams.patch.yml', import.meta.url), 'utf8'))
  const staticEntries = staticPatch.flatMap(item => item.insert ?? [])
  const userData = mkdtempSync(join(tmpdir(), 'dsh-tool-guidance-patch-'))
  try {
    const generatedPatch = yaml.load(readFileSync(generateAgentTeamsPatch({
      getSettings: () => ({}),
      getUserDataPath: () => userData,
    }), 'utf8'))
    const generatedEntries = generatedPatch.flatMap(item => item.insert ?? [])

    for (const entries of [staticEntries, generatedEntries]) {
      const guidanceIndex = entries.findIndex(entry => entry.id === 'tool-call-guidance')
      const teamsIndex = entries.findIndex(entry => entry.id === 'agent-teams')
      assert.ok(guidanceIndex >= 0)
      assert.equal(entries[guidanceIndex].name, '@deepseek-ai/dsh-tool-call-guidance')
      assert.ok(guidanceIndex < teamsIndex)
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})
