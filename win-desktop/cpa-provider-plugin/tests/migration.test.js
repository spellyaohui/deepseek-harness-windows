import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../lib/index.js'
import { cpaProfileMigration } from '../lib/migration.js'

test('migrates an existing CPA profile that predates image capability declarations', () => {
  const migration = cpaProfileMigration({
    ns: 'llm-pi-ai',
    revision: 7,
    user: {
      providers: {
        cpa: {
          displayName: 'CPA / CLIProxyAPI',
          apiKeyEnv: 'CPA_API_KEY',
          api: 'openai-responses',
          baseURL: 'https://proxy.example.invalid/v1',
          models: [
            { id: 'gpt-5.6-sol', name: 'gpt-5.6-sol', contextWindow: 272000, maxTokens: 131072 },
          ],
        },
      },
    },
  })

  assert.equal(migration?.expectedRevision, 7)
  assert.deepEqual(migration?.ops, [{
    op: 'set',
    path: ['providers', 'cpa'],
    value: {
      displayName: 'CPA / CLIProxyAPI',
      apiKeyEnv: 'CPA_API_KEY',
      api: 'openai-responses',
      baseURL: 'https://proxy.example.invalid/v1',
      defaultInput: ['text', 'image'],
      models: [{
        id: 'gpt-5.6-sol',
        name: 'gpt-5.6-sol',
        contextWindow: 272000,
        maxTokens: 131072,
        input: ['text', 'image'],
        reasoningEfforts: {
          off: 'none', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
        },
      }],
    },
  }])
})

test('does not rewrite a current CPA profile or an unrelated settings descriptor', () => {
  assert.equal(cpaProfileMigration({ ns: 'agent-default-model', revision: 1, user: {} }), undefined)
  assert.equal(cpaProfileMigration({ ns: 'llm-pi-ai', revision: 2, user: { providers: {} } }), undefined)
  assert.equal(cpaProfileMigration({
    ns: 'llm-pi-ai',
    revision: 3,
    user: {
      providers: {
        cpa: {
          displayName: 'CPA / CLIProxyAPI',
          apiKeyEnv: 'CPA_API_KEY',
          api: 'openai-responses',
          baseURL: 'https://proxy.example.invalid/v1',
          defaultInput: ['text', 'image'],
          models: [{
            id: 'text-only',
            input: ['text'],
            reasoningEfforts: {
              off: 'none', minimal: 'minimal', low: 'low', medium: 'medium',
              high: 'high', xhigh: 'xhigh', max: 'max',
            },
          }],
        },
      },
    },
  }), undefined)
})

test('preserves an explicit text-only model while upgrading the provider default', () => {
  const migration = cpaProfileMigration({
    ns: 'llm-pi-ai',
    revision: 11,
    user: {
      providers: {
        cpa: {
          displayName: 'CPA / CLIProxyAPI',
          apiKeyEnv: 'CPA_API_KEY',
          api: 'openai-responses',
          baseURL: 'https://proxy.example.invalid/v1',
          models: [{ id: 'text-only', input: ['text'] }],
        },
      },
    },
  })

  assert.deepEqual(migration?.ops[0].value.defaultInput, ['text', 'image'])
  assert.deepEqual(migration?.ops[0].value.models[0].input, ['text'])
})

test('host startup applies the legacy migration through a revision-guarded path mutation', async () => {
  const writes = []
  let injection
  const ctx = {
    inject(dependencies, callback) {
      assert.deepEqual(dependencies, ['settings'])
      injection = callback({
        settings: {
          describe: () => [{
            ns: 'llm-pi-ai',
            revision: 19,
            user: {
              providers: {
                cpa: {
                  baseURL: 'https://proxy.example.invalid/v1',
                  models: [{ id: 'gpt-5.6-sol' }],
                },
              },
            },
          }],
          mutate: async (...args) => writes.push(args),
        },
      })
    },
    logger: { info() {}, warn() {} },
  }

  apply(ctx)
  await injection

  assert.equal(writes.length, 1)
  assert.equal(writes[0][0], 'llm-pi-ai')
  assert.equal(writes[0][2], 19)
  assert.deepEqual(writes[0][1][0].path, ['providers', 'cpa'])
  assert.deepEqual(writes[0][1][0].value.defaultInput, ['text', 'image'])
  assert.deepEqual(writes[0][1][0].value.models[0].input, ['text', 'image'])
})
