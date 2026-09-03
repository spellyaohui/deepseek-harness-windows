import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCapabilityPatch,
  applyCapabilityProbeResult,
  capabilityPatchFromChecks,
  classifyCapabilityOutcome,
} from '../lib/client/model-capabilities.js'

test('capability outcomes keep supported and explicit unsupported separate from temporary failures', () => {
  assert.equal(classifyCapabilityOutcome({ status: 200 }), 'supported')
  assert.equal(classifyCapabilityOutcome({ status: 400 }), 'unsupported')
  assert.equal(classifyCapabilityOutcome({ status: 401 }), 'inconclusive')
  assert.equal(classifyCapabilityOutcome({ status: 403 }), 'inconclusive')
  assert.equal(classifyCapabilityOutcome({ status: 407 }), 'inconclusive')
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

test('automatic empty input accepts a probe result while explicit image and text declarations stay authoritative', () => {
  const patch = { input: ['text', 'image'] }

  assert.deepEqual(
    applyCapabilityPatch({ id: 'missing' }, patch, { overwriteExisting: false, source: 'probe' }),
    { id: 'missing', input: ['text', 'image'] },
  )
  assert.deepEqual(
    applyCapabilityPatch({ id: 'automatic', input: [] }, patch, { overwriteExisting: false, source: 'probe' }),
    { id: 'automatic', input: ['text', 'image'] },
  )
  assert.deepEqual(
    applyCapabilityPatch({ id: 'manual-image', input: ['text', 'image'] }, { input: ['text'] }, { overwriteExisting: false, source: 'probe' }),
    { id: 'manual-image', input: ['text', 'image'] },
  )
  assert.deepEqual(
    applyCapabilityPatch({ id: 'manual-text', input: ['text'] }, patch, { overwriteExisting: false, source: 'probe' }),
    { id: 'manual-text', input: ['text'] },
  )
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

test('probe result application matches trimmed model ids and preserves unselected rows', () => {
  const models = [
    { id: ' model-a ', input: ['text'], contextWindow: 128000 },
    { id: 'model-b', input: ['text'], unknown: true },
  ]
  const result = {
    modelId: 'model-a',
    protocol: 'openai-responses',
    checks: {},
    patch: { input: ['text', 'image'] },
  }

  const next = applyCapabilityProbeResult(models, result, true)
  assert.deepEqual(next[0], { id: ' model-a ', input: ['text', 'image'], contextWindow: 128000 })
  assert.deepEqual(next[1], models[1])
  assert.notEqual(next, models)
})
