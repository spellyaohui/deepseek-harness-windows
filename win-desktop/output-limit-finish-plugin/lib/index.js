export const name = 'output-limit-finish'
export const inject = ['llm']

/**
 * Some OpenAI-compatible gateways report `finish_reason: "stop"` even when the
 * upstream model ran out of output budget. Output that consumed the whole
 * requested limit was truncated whatever the gateway says; reporting the
 * official `max-tokens` reason lets the Harness loop and UI handle it.
 * Provider neutral: no gateway or model name takes part in the decision.
 */
export function isTruncatedStop(reason, outputTokens, limit) {
  return reason?.kind === 'stop'
    && Number.isSafeInteger(limit) && limit > 0
    && Number.isFinite(outputTokens) && outputTokens >= limit
}

export function apply(ctx) {
  const resolveLimit = async (options) => {
    if (options.maxTokens !== undefined) return options.maxTokens
    try {
      return (await ctx.llm.resolveModelInfo(options.provider, options.model, options.signal)).defaultMaxTokens
    } catch {
      return undefined
    }
  }
  return ctx.on('llm/stream', async function* (options, next) {
    let outputTokens
    for await (const chunk of next()) {
      if (chunk.type === 'usage') outputTokens = chunk.usage?.outputTokens
      if (chunk.type === 'finish' && chunk.reason?.kind === 'stop' && outputTokens !== undefined
        && isTruncatedStop(chunk.reason, outputTokens, await resolveLimit(options))) {
        yield { ...chunk, reason: { kind: 'max-tokens' } }
        continue
      }
      yield chunk
    }
  })
}
