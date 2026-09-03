import assert from 'node:assert/strict'
import test from 'node:test'

import { probeModelCapabilities } from '../lib/capability-probe-service.js'

function response(status, body = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body },
    async text() { return JSON.stringify(body) },
    body: null,
  }
}

function requestBody(call) {
  return JSON.parse(call.init.body)
}

function imageDataFor(protocol, body) {
  if (protocol === 'anthropic-messages') {
    return body.messages?.[0]?.content?.find(block => block.type === 'image')?.source?.data
  }
  if (protocol === 'openai-responses') {
    const url = body.input?.[0]?.content?.find(block => block.type === 'input_image')?.image_url
    return typeof url === 'string' ? url.split(',', 2)[1] : undefined
  }
  const url = body.messages?.[0]?.content?.find(block => block.type === 'image_url')?.image_url?.url
  return typeof url === 'string' ? url.split(',', 2)[1] : undefined
}

function pngDimensions(base64) {
  const bytes = Buffer.from(base64, 'base64')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

test('image probes use a valid sample larger than gateways minimum image dimensions', async () => {
  for (const protocol of ['openai-completions', 'openai-responses', 'anthropic-messages']) {
    const result = await probeModelCapabilities({
      modelId: `dimension-gated-${protocol}`,
      protocol,
      baseURL: 'https://provider.example/v1',
    }, {
      fetch: async (_url, init) => {
        const body = requestBody({ init })
        const image = imageDataFor(protocol, body)
        if (image !== undefined) {
          const { width, height } = pngDimensions(image)
          return width > 10 && height > 10
            ? response(200)
            : response(400, { message: 'image dimensions must be greater than 10' })
        }
        return response(200)
      },
    })

    assert.equal(result.checks.image.status, 'supported', protocol)
    assert.deepEqual(result.patch.input, ['text', 'image'], protocol)
  }
})

test('openai-responses probes all generic capability categories using the current route', async () => {
  const calls = []
  const result = await probeModelCapabilities({
    modelId: 'gemini-like',
    protocol: 'openai-responses',
    baseURL: 'https://provider.example/v1',
    apiKey: 'secret-key-must-not-escape',
  }, {
    fetch: async (url, init) => {
      calls.push({ url, init })
      return response(200, { output: [] })
    },
  })

  assert.equal(result.modelId, 'gemini-like')
  assert.equal(result.protocol, 'openai-responses')
  assert.equal(result.checks.text.status, 'supported')
  assert.equal(result.checks.image.status, 'supported')
  assert.equal(result.checks.developer.status, 'supported')
  assert.equal(result.checks.strict.status, 'supported')
  assert.equal(result.checks.store.status, 'supported')
  assert.equal(result.checks.streamingUsage.status, 'supported')
  assert.equal(result.checks.maxTokens.status, 'supported')
  assert.ok(calls.length >= 10)
  assert.ok(calls.every(call => call.url === 'https://provider.example/v1/responses'))
  assert.ok(calls.every(call => call.init.headers.authorization.includes('secret-key-must-not-escape')))
  assert.ok(calls.every(call => !JSON.stringify(result).includes('secret-key-must-not-escape')))
})

test('image rejection becomes text-only without changing other probe results', async () => {
  const result = await probeModelCapabilities({
    modelId: 'text-only',
    protocol: 'openai-completions',
    baseURL: 'https://provider.example/v1',
    apiKey: 'key',
  }, {
    fetch: async (_url, init) => {
      const body = requestBody({ init })
      return JSON.stringify(body).includes('image_url')
        ? response(400, { message: 'invalid image input' })
        : response(200, { choices: [] })
    },
  })

  assert.equal(result.checks.text.status, 'supported')
  assert.equal(result.checks.image.status, 'unsupported')
  assert.deepEqual(result.patch.input, ['text'])
})

test('none rejection does not hide low/high reasoning and omitted reasoning remains off null', async () => {
  const result = await probeModelCapabilities({
    modelId: 'commandcode-gemini',
    protocol: 'openai-completions',
    baseURL: 'https://provider.example/v1',
    apiKey: 'key',
  }, {
    fetch: async (_url, init) => {
      const body = requestBody({ init })
      const effort = body.reasoning_effort
      if (effort === 'none') return response(400, { code: 'server_error', message: 'secret-key in response' })
      if (effort !== undefined && !['low', 'high'].includes(effort)) return response(400, { code: 'unsupported' })
      return response(200, { choices: [] })
    },
  })

  assert.equal(result.checks.reasoning.status, 'supported')
  assert.deepEqual(result.patch.reasoningEfforts, { low: 'low', high: 'high', off: null })
  assert.doesNotMatch(JSON.stringify(result), /secret-key/)
})

test('400 is explicit unsupported but 429, 502, 503, timeout, and network failures stay inconclusive', async () => {
  const statuses = [429, 502, 503]
  for (const status of statuses) {
    const result = await probeModelCapabilities({
      modelId: `model-${status}`,
      protocol: 'openai-responses',
      baseURL: 'https://provider.example/v1',
    }, { fetch: async () => response(status, { message: 'transient' }) })
    assert.equal(result.checks.text.status, 'inconclusive', String(status))
    assert.deepEqual(result.patch, {}, String(status))
  }

  const network = await probeModelCapabilities({
    modelId: 'network-failure',
    protocol: 'openai-responses',
    baseURL: 'https://provider.example/v1',
  }, { fetch: async () => { throw new Error('socket closed with secret-key') } })
  assert.equal(network.checks.text.status, 'inconclusive')
  assert.doesNotMatch(JSON.stringify(network), /secret-key/)
})

test('authentication failures stay inconclusive instead of becoming destructive capability facts', async () => {
  for (const status of [401, 403]) {
    const result = await probeModelCapabilities({
      modelId: `auth-${status}`,
      protocol: 'openai-responses',
      baseURL: 'https://provider.example/v1',
    }, { fetch: async () => response(status, { message: 'credential rejected' }) })

    assert.equal(result.checks.text.status, 'inconclusive', String(status))
    assert.equal(result.checks.image.status, 'inconclusive', String(status))
    assert.deepEqual(result.patch, {}, String(status))
  }
})

test('unknown protocols do not fall back to another wire format', async () => {
  let calls = 0
  const result = await probeModelCapabilities({
    modelId: 'unknown',
    protocol: 'vendor-private',
    baseURL: 'https://provider.example/v1',
  }, { fetch: async () => { calls += 1; return response(200) } })

  assert.equal(calls, 0)
  assert.equal(result.checks.text.status, 'not-applicable')
  assert.equal(result.checks.image.status, 'not-applicable')
  assert.deepEqual(result.patch, {})
})

test('abort is propagated so the caller can stop the remaining matrix', async () => {
  const controller = new AbortController()
  const pending = probeModelCapabilities({
    modelId: 'abort-me',
    protocol: 'openai-responses',
    baseURL: 'https://provider.example/v1',
    signal: controller.signal,
  }, {
    fetch: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
    }),
  })
  controller.abort()
  await assert.rejects(pending, error => error?.name === 'AbortError')
})
