import { rewriteDesktopConsoleSource } from './win-hide-console-rewrite.js'

const defaultHookUrl = new URL('./win-hide-console.mjs', import.meta.url).href
let hookImportUrl = defaultHookUrl

export function initialize(data) {
  if (typeof data === 'string' && data.length > 0) hookImportUrl = data
}

function sourceText(source) {
  if (source == null) return null
  if (typeof source === 'string') return source
  return Buffer.from(source).toString('utf8')
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  const original = sourceText(result.source)
  if (original == null) return result
  const rewritten = rewriteDesktopConsoleSource(original, url, hookImportUrl)
  if (rewritten === original) return result
  return {
    format: result.format,
    source: rewritten,
    shortCircuit: true,
  }
}
