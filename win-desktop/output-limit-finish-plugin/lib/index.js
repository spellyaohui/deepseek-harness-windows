export const name = 'output-limit-finish'
export const inject = ['llm']

/**
 * Some OpenAI-compatible gateways report `finish_reason: "stop"` even when the
 * upstream model reached its output budget. A stop at that boundary is
 * classified as the official `max-tokens` reason. Usage cannot establish why
 * the budget was consumed or whether natural completion coincided with it.
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
    let finish
    for await (const chunk of next()) {
      if (chunk.type === 'usage' && Number.isFinite(chunk.usage?.outputTokens)) outputTokens = chunk.usage.outputTokens
      // Defer only the terminal stop until late usage has settled.
      if (chunk.type === 'finish' && chunk.reason?.kind === 'stop') {
        if (finish) yield finish
        finish = chunk
        continue
      }
      yield chunk
    }
    if (finish) yield !options.signal?.aborted
      && isTruncatedStop(finish.reason, outputTokens, await resolveLimit(options))
      ? { ...finish, reason: { kind: 'max-tokens' } } : finish
  })
}
