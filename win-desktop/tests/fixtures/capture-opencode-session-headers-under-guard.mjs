import { createServer } from 'node:http'

const completionsModuleUrl = new URL(
  '../../node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js',
  import.meta.url,
)
const responsesModuleUrl = new URL(
  '../../node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js',
  import.meta.url,
)
const { stream: completionsStream } = await import(completionsModuleUrl)
const { stream: responsesStream } = await import(responsesModuleUrl)

const requests = []
const server = createServer((request, response) => {
  requests.push({
    provider: request.headers['x-test-provider'] ?? null,
    session: request.headers['x-opencode-session'] ?? null,
  })
  request.resume()
  request.on('end', () => {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      connection: 'close',
      'cache-control': 'no-cache',
    })
    const events = request.url?.endsWith('/responses')
      ? [
          'data: {"type":"response.completed","response":{"id":"fixture","status":"completed","output":[]}}',
          '',
          'data: [DONE]',
          '',
        ]
      : [
          'data: {"id":"fixture","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}',
          '',
          'data: {"id":"fixture","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
          '',
          'data: [DONE]',
          '',
        ]
    response.end(events.join('\n'))
  })
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})

const { port } = server.address()
const baseModel = {
  name: 'fixture',
  api: 'openai-completions',
  baseUrl: `http://127.0.0.1:${port}/v1`,
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 100,
}

async function consume(stream, model, provider, sessionId) {
  const events = stream(model, {
    messages: [{ role: 'user', content: 'hi', timestamp: 0 }],
  }, {
    apiKey: 'fixture-key',
    sessionId,
    cacheRetention: 'none',
    headers: { 'x-test-provider': provider },
  })
  for await (const event of events) {
    if (event.type === 'done' || event.type === 'error') break
  }
}

try {
  await consume(completionsStream, { ...baseModel, id: 'kimi-k3', provider: 'opencode-go' }, 'opencode-go', 'harness-session-k3')
  await consume(responsesStream, { ...baseModel, id: 'muse-spark-1.2-contributor', api: 'openai-responses', provider: 'opencode-go' }, 'opencode-go', 'harness-session-muse')
  await consume(completionsStream, { ...baseModel, id: 'generic-model', provider: 'openai' }, 'openai', 'harness-session-generic')
} finally {
  await new Promise((resolve) => server.close(resolve))
}

process.stdout.write(JSON.stringify(requests))
