import { Type } from '@earendil-works/pi-ai'

const moduleUrl = new URL(
  '../../node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js',
  import.meta.url,
)
const { stream } = await import(moduleUrl)

const model = {
  id: 'kimi-k3',
  name: 'Kimi K3',
  api: 'openai-completions',
  provider: 'opencode-go',
  baseUrl: 'http://127.0.0.1:1/v1',
  reasoning: true,
  thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null, max: 'max' },
  input: ['text', 'image'],
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
  contextWindow: 1048576,
  maxTokens: 131072,
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsStrictMode: false,
    maxTokensField: 'max_tokens',
    requiresReasoningContentOnAssistantMessages: true,
    deferredToolsMode: 'kimi',
  },
}

const schema = Type.Object({
  target: Type.Unsafe({ $ref: '#/$defs/target', description: 'remove sibling fields' }),
  choices: Type.Array(Type.String()),
})
schema.properties.choices.items = [{ type: 'string' }, { type: 'number' }]

const events = stream(model, {
  messages: [{ role: 'user', content: 'hi', timestamp: 0 }],
  tools: [{ name: 'probe', description: 'capture serialized tool schema', parameters: schema }],
}, {
  apiKey: 'test',
  onPayload(payload) {
    process.stdout.write(JSON.stringify(payload))
    throw new Error('stop-after-capture')
  },
})

for await (const event of events) {
  if (event.type === 'error') break
}
