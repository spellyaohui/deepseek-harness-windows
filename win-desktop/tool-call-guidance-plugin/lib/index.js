export const name = 'tool-call-guidance'
export const inject = ['systemPrompt']

export const TOOL_CALL_GUIDANCE = 'Tool calls: build arguments from the current tool schema and explicit context. Omit optional properties whose values are unknown or blank, unless the tool explicitly says an empty value is meaningful. After a failure, read the error or structured next-step guidance; do not repeat the same invalid arguments unchanged.'

export function apply(ctx) {
  return ctx.systemPrompt.section({
    name: 'desktop:tool-call-guidance',
    order: 110,
    text: TOOL_CALL_GUIDANCE,
  })
}
