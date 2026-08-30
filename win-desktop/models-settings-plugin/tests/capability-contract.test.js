import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCapabilityPatch,
  capabilityPatchFromChecks,
  classifyCapabilityOutcome,
} from '../lib/client/model-capabilities.js'

test('capability outcomes keep supported and explicit unsupported separate from temporary failures', () => {
  assert.equal(classifyCapabilityOutcome({ status: 200 }), 'supported')
  assert.equal(classifyCapabilityOutcome({ status: 400 }), 'unsupported')
  assert.equal(classifyCapabilityOutcome({ status: 502 }), 'inconclusive')
  assert.equal(classifyCapabilityOutcome({ status: 429 }), 'inconclusive')
  assert.equal(classifyCapabilityOutcome({ aborted: true }), 'inconclusive')
})

test('successful image and partial reasoning checks produce only canonical fields', () => {
  const patch = capabilityPatchFromChecks({
    image: { status: 'supported', summary: 'accepted' },
    reasoning: {
      status: 'supported',
      summary: 'partial',
      efforts: { low: 'low', high: 'high', off: null },
    },
    strict: { status: 'unsupported', summary: 'rejected' },
    store: { status: 'inconclusive', summary: 'timeout' },
  })

  assert.deepEqual(patch, {
    input: ['text', 'image'],
    reasoningEfforts: { low: 'low', high: 'high', off: null },
    compat: { supportsStrictMode: false },
  })
})

test('all reasoning efforts explicitly unsupported become false without inventing off none', () => {
  assert.deepEqual(
    capabilityPatchFromChecks({
      reasoning: {
        status: 'unsupported',
        summary: 'all rejected',
        efforts: {},
        allEffortsUnsupported: true,
        noneRejected: true,
        omittedReasoningSupported: true,
      },
    }),
    { reasoningEfforts: false },
  )
})

test('ordinary probe preserves existing model capabilities but applies unset fields', () => {
  const original = {
    id: 'model-a',
    api: 'openai-responses',
    input: ['text'],
    reasoningEfforts: { low: 'legacy-low' },
    compat: { supportsStore: true, customFlag: 'keep' },
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 1 },
    unknown: { untouched: true },
  }

  const result = applyCapabilityPatch(original, {
    input: ['text', 'image'],
    reasoningEfforts: { low: 'low', high: 'high' },
    compat: { supportsStrictMode: false, supportsStore: false },
  }, { overwriteExisting: false, source: 'probe' })

  assert.deepEqual(result, {
    ...original,
    compat: { supportsStore: true, customFlag: 'keep', supportsStrictMode: false },
  })
  assert.notEqual(result, original)
  assert.deepEqual(original.compat, { supportsStore: true, customFlag: 'keep' })
})

test('explicit overwrite changes only probed capability fields and preserves unrelated compat fields', () => {
  const original = {
    id: 'model-b',
    api: 'openai-completions',
    input: ['text'],
    reasoningEfforts: { low: 'low', high: 'high' },
    compat: { supportsStore: true, customFlag: 'keep' },
    contextWindow: 64000,
    maxTokens: 4096,
    cost: { output: 2 },
  }

  const result = applyCapabilityPatch(original, {
    input: ['text', 'image'],
    reasoningEfforts: false,
    compat: { supportsStore: false, supportsStrictMode: true },
  }, { overwriteExisting: true, source: 'probe' })

  assert.deepEqual(result, {
    ...original,
    input: ['text', 'image'],
    reasoningEfforts: false,
    compat: { supportsStore: false, customFlag: 'keep', supportsStrictMode: true },
  })
  assert.equal(result.id, original.id)
  assert.equal(result.api, original.api)
  assert.equal(result.contextWindow, original.contextWindow)
  assert.equal(result.maxTokens, original.maxTokens)
  assert.deepEqual(result.cost, original.cost)
})

test('inconclusive and not-applicable checks never produce a destructive patch', () => {
  assert.deepEqual(capabilityPatchFromChecks({
    image: { status: 'inconclusive', summary: '502' },
    reasoning: { status: 'not-applicable', summary: 'protocol does not expose it' },
    strict: { status: 'inconclusive', summary: 'timeout' },
  }), {})
})
