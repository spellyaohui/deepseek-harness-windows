const moduleUrl = new URL(
  '../../node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js',
  import.meta.url,
)
const { stream } = await import(moduleUrl)

if (typeof stream !== 'function') throw new Error('pi-ai OpenAI stream export missing')
process.stdout.write('opencode-stream-loader-ok\n')
