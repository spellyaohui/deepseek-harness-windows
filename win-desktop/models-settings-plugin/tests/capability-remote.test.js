import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import manifest from '../package.json' with { type: 'json' }
import {
  createCapabilityProbeHandler,
} from '../lib/capability-probe-service.js'

function successResponse() {
  return {
    status: 200,
    ok: true,
    async json() { return { output: [] } },
    body: null,
  }
}

test('the Models package exposes a mounted model-capabilities Remote contribution', () => {
  assert.deepEqual(manifest.exports['./remote'], {
    types: './lib/typert.remote-client.d.ts',
    default: './lib/typert.remote-client.js',
  })
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/capability-probe-service.ts', import.meta.url), 'utf8')
  assert.match(source, /ModelCapabilityProbeService/)
  assert.match(serviceSource, /namespace: 'model-capabilities'/)
})

test('the Host handler resolves stored credentials without returning them', async () => {
  let resolvedReference
  let observedAuthorization
  const handler = createCapabilityProbeHandler({
    resolveCredential: async (reference) => {
      resolvedReference = reference
      return 'stored-secret'
    },
    fetch: async (_url, init) => {
      observedAuthorization = init.headers.authorization
      return successResponse()
    },
  })

  const result = await handler({
    modelId: 'stored-model',
    protocol: 'openai-responses',
    baseURL: 'https://provider.example/v1',
    credentialRef: 'PROVIDER_API_KEY',
  })

  assert.equal(resolvedReference, 'PROVIDER_API_KEY')
  assert.equal(observedAuthorization, 'Bearer stored-secret')
  assert.doesNotMatch(JSON.stringify(result), /stored-secret/)
})

test('a one-shot draft key takes precedence without touching stored credentials', async () => {
  let resolverCalls = 0
  let observedAuthorization
  const handler = createCapabilityProbeHandler({
    resolveCredential: async () => {
      resolverCalls += 1
      return 'stored-secret'
    },
    fetch: async (_url, init) => {
      observedAuthorization = init.headers.authorization
      return successResponse()
    },
  })

  await handler({
    modelId: 'draft-model',
    protocol: 'openai-responses',
    baseURL: 'https://provider.example/v1',
    credentialRef: 'PROVIDER_API_KEY',
    apiKey: 'one-shot-secret',
  })

  assert.equal(resolverCalls, 0)
  assert.equal(observedAuthorization, 'Bearer one-shot-secret')
})
