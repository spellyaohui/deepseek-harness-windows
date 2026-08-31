import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectAlpha2RuntimeClosure } from '../scripts/alpha2-runtime-dependencies.mjs'

test('Alpha.2 closure allows only the existing official native landlock dependency outside dsh family', () => {
  const packages = new Map([
    ['@deepseek-ai/dsh-sandbox-local', {
      entry: { version: '0.1.2-alpha.2' },
      manifest: {
        dependencies: {
          '@deepseek-ai/node-addon-landlock-run': '^0.1.1',
        },
      },
    }],
  ])

  assert.deepEqual(
    collectAlpha2RuntimeClosure(['@deepseek-ai/dsh-sandbox-local'], packages),
    ['@deepseek-ai/dsh-sandbox-local'],
  )
})

test('Alpha.2 closure still rejects an unregistered missing package', () => {
  const packages = new Map([
    ['@deepseek-ai/example', {
      entry: { version: '0.1.2-alpha.2' },
      manifest: { dependencies: { '@deepseek-ai/not-approved': '^1.0.0' } },
    }],
  ])

  assert.throws(
    () => collectAlpha2RuntimeClosure(['@deepseek-ai/example'], packages),
    /Alpha\.2 dependency is missing from the validated release families: @deepseek-ai\/not-approved/u,
  )
})
