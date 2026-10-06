export const name = 'tool-call-guidance'
export const inject = ['systemPrompt']

export const TOOL_CALL_GUIDANCE = 'Tool calls: build arguments from the current tool schema and explicit context. Omit optional properties whose values are unknown or blank, unless the tool explicitly says an empty value is meaningful. After a failure, read the error or structured next-step guidance; do not repeat the same invalid arguments unchanged. An invalid-arguments error means the call was wrong, not the tool: fix the named field and retry instead of reporting a tool fault.'

export function apply(ctx) {
  return ctx.systemPrompt.section({
    name: 'desktop:tool-call-guidance',
    order: 110,
    text: TOOL_CALL_GUIDANCE,
  })
}
