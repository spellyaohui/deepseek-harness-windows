/**
 * Rewrite official dsh ESM sources so a GUI Electron host does not flash
 * console windows when tools or the Windows ACL runner spawn children.
 *
 * Node `windowsHide` hides ordinary child-process console windows.
 * Restricted-token sandbox children die with STATUS_DLL_INIT_FAILED if that
 * flag is set, so those CreateProcessAsUserW calls get STARTF_USESHOWWINDOW
 * + SW_HIDE instead — a console still exists, but the window stays hidden.
 */

import { fileURLToPath } from 'node:url'
import { rewriteDesktopProfileLayer } from './desktop-profile-layer.js'
export { injectWindowsHideArgs, patchNodeChildProcess } from './win-hide-console-child-process.cjs'

const DESKTOP_INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))
const PROFILE_INSTALL_ANCHOR_NEEDLE = 'const INSTALL_ANCHOR = fileURLToPath(new URL("../package.json", import.meta.url));'
const PROFILE_INSTALL_ANCHOR_PATCH = `const INSTALL_ANCHOR = ${JSON.stringify(DESKTOP_INSTALL_ANCHOR)};`

const STARTF_USESHOWWINDOW = 1
const STARTF_USESTDHANDLES = 256
const HIDDEN_CONSOLE_STARTF = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES

const RUNNER_PROD_NEEDLE = 'if (existsSync(builtEntry)) return [process.execPath, builtEntry];'
const RUNNER_DEV_NEEDLE = `return [
			process.execPath,
			"--import",
			"tsx/esm",
			sourceEntry
		];`
const RUNNER_DEV_017_NEEDLE = `return [
			process.execPath,
			"--import",
			\`data:text/javascript,\${encodeURIComponent(registration)}\`,
			sourceEntry
		];`
const SUBPROCESS_RUNNER_PROD_PATTERN = /if \(extname\(fileURLToPath\(import\.meta\.url\)\) !== "\.ts"\) return \[process\.execPath, fileURLToPath\(import\.meta\.resolve\("@deepseek-ai\/dsh-subprocess-local\/runner"\)\)\];/
const SUBPROCESS_RUNNER_DEV_PATTERN = /return \[\n\t\tprocess\.execPath,\n\t\t"--import",\n\t\timport\.meta\.resolve\("tsx\/esm"\),\n\t\tfileURLToPath\(new URL\("\.\/bin\.ts", import\.meta\.url\)\)\n\t\];/
const TOOL_ARGUMENT_STREAM_SIGNATURE_NEEDLE = 'async function* toStreamChunks(events, contextWindow) {'
const TOOL_ARGUMENT_STREAM_SIGNATURE_ALPHA2_NEEDLE = 'async function* toStreamChunks(events, contextWindow, callerSignal) {'
const TOOL_ARGUMENT_STREAM_SIGNATURE_015_NEEDLE = 'async function* toStreamChunks(events, contextWindow, callerSignal, requestedModel) {'
const TOOL_CALL_END_BLOCK_NEEDLE = `\t\tcase "toolcall_end":
\t\t\tyield {
\t\t\t\ttype: "block-end",
\t\t\t\tindex: event.contentIndex,
\t\t\t\tblock: {
\t\t\t\t\ttype: "tool-call",
\t\t\t\t\tid: CallId(event.toolCall.id),
\t\t\t\t\tname: event.toolCall.name,
\t\t\t\t\targuments: JSON.stringify(event.toolCall.arguments)
\t\t\t\t}
\t\t\t};
\t\t\tbreak;`
const TOOL_CALL_END_BLOCK_PATCH = `\t\tcase "toolcall_end":
\t\t\tyield {
\t\t\t\ttype: "block-end",
\t\t\t\tindex: event.contentIndex,
\t\t\t\tblock: {
\t\t\t\t\ttype: "tool-call",
\t\t\t\t\tid: CallId(event.toolCall.id),
\t\t\t\t\tname: event.toolCall.name,
\t\t\t\t\targuments: JSON.stringify(normalizeKnownToolArgumentAliases(event.toolCall.name, event.toolCall.arguments))
\t\t\t\t}
\t\t\t};
\t\t\tbreak;`
const TOOL_CALL_END_BLOCK_ALPHA2_NEEDLE = `\t\tcase "toolcall_end":
\t\t\tyield {
\t\t\t\ttype: "block-end",
\t\t\t\tindex: event.contentIndex,
\t\t\t\tblock: {
\t\t\t\t\ttype: "tool-call",
\t\t\t\t\tid: brandString(event.toolCall.id),
\t\t\t\t\tname: event.toolCall.name,
\t\t\t\t\targuments: JSON.stringify(event.toolCall.arguments)
\t\t\t\t}
\t\t\t};
\t\t\tbreak;`
const DSH_LLM_QUOTA_FUNCTION_NEEDLE = `function isQuotaExceededError(detail) {
\treturn `

export { HIDDEN_CONSOLE_STARTF }

export function normalizeRedundantEscalationArgs(args, currentMode) {
  const requested = args?.sandbox_permissions
  const knownModes = ['read-only', 'workspace-write', 'danger-full-access']
  const currentRank = knownModes.indexOf(currentMode)
  const requestedRank = knownModes.indexOf(requested)
  const redundant = currentRank !== -1
    && requestedRank !== -1
    && requestedRank <= currentRank
  return redundant
    ? { ...args, sandbox_permissions: undefined, justification: undefined }
    : args
}

/**
 * Repair registered, structurally unambiguous tool-call aliases without
 * weakening their schemas. Every non-matching shape stays untouched so the
 * Harness validator can reject it normally.
 */
export function normalizeKnownToolArgumentAliases(toolName, args) {
  if (toolName !== 'grep') return args
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return args
  if (Object.prototype.hasOwnProperty.call(args, 'pattern')) return args

  const description = args.description
  if (typeof description !== 'string') return args
  const match = /^[ \t]*pattern[ \t]*:[ \t]*([^\r\n]*\S)[ \t]*$/iu.exec(description)
  if (match === null) return args

  const normalized = { ...args, pattern: match[1] }
  delete normalized.description
  return normalized
}

/**
 * Recognize provider messages that name a bounded-period usage limit as
 * exhausted. The official RC.1 classifier handles `usage limit reached`, but
 * not the common `weekly usage limit` form returned by the provider. Keep the
 * matcher narrow so a transient `rate limit` remains retryable and a standalone
 * reset notice does not become terminal quota.
 */
function isExplicitPeriodUsageLimitExceeded(detail) {
  // The provider's terminal wording is commonly "weekly usage limit".
  const periodUsageLimit = '(?:hourly|daily|weekly|monthly|quarterly|annual|yearly)[\\s_-]+usage[\\s_-]+limit'
  const exhausted = '(?:reached|exceeded|exhausted|depleted|hit)'
  const sameSentence = '[^\\r\\n.!?]{0,80}'
  return new RegExp(`\\b${exhausted}\\b${sameSentence}\\b(?:your[\\s_-]+)?${periodUsageLimit}\\b`, 'i').test(detail)
    || new RegExp(`\\b${periodUsageLimit}\\b${sameSentence}\\b${exhausted}\\b`, 'i').test(detail)
}

/**
 * Extend only the official dsh-llm quota classifier at the loader boundary.
 * Missing or ambiguous anchors fail closed, and the rewrite is idempotent.
 */
export function rewriteQuotaErrorClassification(source) {
  const helperMarker = 'function isExplicitPeriodUsageLimitExceeded(detail)'
  if (source.includes(helperMarker)) return source

  const first = source.indexOf(DSH_LLM_QUOTA_FUNCTION_NEEDLE)
  const unique = first !== -1
    && source.indexOf(DSH_LLM_QUOTA_FUNCTION_NEEDLE, first + DSH_LLM_QUOTA_FUNCTION_NEEDLE.length) === -1
  if (!unique) return source

  const patched = source.replace(
    DSH_LLM_QUOTA_FUNCTION_NEEDLE,
    `${DSH_LLM_QUOTA_FUNCTION_NEEDLE}isExplicitPeriodUsageLimitExceeded(detail) || `,
  )
  const functionEnd = patched.indexOf('\n}', first)
  if (functionEnd === -1) return source
  return `${patched.slice(0, functionEnd + 2)}\n${isExplicitPeriodUsageLimitExceeded.toString()}${patched.slice(functionEnd + 2)}`
}

function rewriteShellEscalationSource(source, validator) {
  const oldOrder = new RegExp(`async execute\\(args, exec\\) \\{\\n(\\t+)(${validator}\\(args\\);)\\n\\1const standingPolicy = resolveSandboxPolicy\\(exec\\);`)
  const currentOrder = new RegExp(`async execute\\(args, exec\\) \\{\\n(\\t+)const standingPolicy = resolveSandboxPolicy\\(exec\\);\\n\\1(${validator}\\(args, standingPolicy\\?\\.mode\\);)`)
  const match = oldOrder.exec(source) ?? currentOrder.exec(source)
  if (match === null) return source
  const [, indent, validation] = match
  return source.replace(match[0], `async execute(args, exec) {
${indent}const standingPolicy = resolveSandboxPolicy(exec);
${indent}${normalizeRedundantEscalationArgs.toString()}
${indent}args = normalizeRedundantEscalationArgs(args, standingPolicy?.mode);
${indent}${validation}`)
}

function rewriteFsEscalationSource(source) {
  const standingPolicy = 'const standingPolicy = this.policy?.resolve({ ...exec.agent ? { session: exec.agent.session } : {} });'
  const needle = `async resolvePolicy(toolName, args, exec) {
\t\tvalidateEscalationArgs(args.sandbox_permissions, args.justification);
\t\t${standingPolicy}`
  const patch = `async resolvePolicy(toolName, args, exec) {
\t\t${standingPolicy}
\t\t${normalizeRedundantEscalationArgs.toString()}
\t\targs = normalizeRedundantEscalationArgs(args, standingPolicy?.mode);
\t\tvalidateEscalationArgs(args.sandbox_permissions, args.justification);`
  return source.includes(needle) ? source.replace(needle, patch) : source
}

export function rewriteDesktopConsoleSource(source, moduleUrl = '', hookImportUrl = '') {
  const url = decodeURIComponent(String(moduleUrl))
  let next = rewriteDesktopProfileLayer(source, moduleUrl)

  const normalizedUrl = url.replaceAll('\\', '/')
  if (/\/@deepseek-ai\/dsh\/lib\/profile-boot-[^/]+\.js$/.test(normalizedUrl)
    && !next.includes(PROFILE_INSTALL_ANCHOR_PATCH)) {
    const first = next.indexOf(PROFILE_INSTALL_ANCHOR_NEEDLE)
    if (first === -1 || next.indexOf(PROFILE_INSTALL_ANCHOR_NEEDLE, first + PROFILE_INSTALL_ANCHOR_NEEDLE.length) !== -1) {
      throw new Error('Desktop profile installation anchor drift')
    }
    // Use the official in-memory resolver with the wrapper's complete closure.
    // No profile dependency links or alternative resolution service are created.
    next = next.replace(PROFILE_INSTALL_ANCHOR_NEEDLE, PROFILE_INSTALL_ANCHOR_PATCH)
  }
  if (url.includes('@deepseek-ai/dsh-subprocess-local')) {
    // Pinned upstream owns spawn and both taskkill visibility flags. The
    // executable registry verifies their exact equivalent forms at load time.
    if (hookImportUrl) {
      next = next.replace(
        SUBPROCESS_RUNNER_PROD_PATTERN,
        `if (extname(fileURLToPath(import.meta.url)) !== ".ts") return [process.execPath, "--import", ${JSON.stringify(hookImportUrl)}, fileURLToPath(import.meta.resolve("@deepseek-ai/dsh-subprocess-local/runner"))];`,
      )
      next = next.replace(
        SUBPROCESS_RUNNER_DEV_PATTERN,
        `return [
\t\tprocess.execPath,
\t\t"--import",
\t\t${JSON.stringify(hookImportUrl)},
\t\t"--import",
\t\timport.meta.resolve("tsx/esm"),
\t\tfileURLToPath(new URL("./bin.ts", import.meta.url))
\t];`,
      )
    }
  }

  if (url.includes('@deepseek-ai/dsh-sandbox-local') && hookImportUrl) {
    const runnerProdPatch = `if (existsSync(builtEntry)) return [process.execPath, "--import", ${JSON.stringify(hookImportUrl)}, builtEntry];`
    if (next.includes(RUNNER_PROD_NEEDLE)) {
      next = next.replace(RUNNER_PROD_NEEDLE, runnerProdPatch)
    }
    const runnerDevPatch = `return [
			process.execPath,
			"--import",
			${JSON.stringify(hookImportUrl)},
			"--import",
			"tsx/esm",
			sourceEntry
		];`
    if (next.includes(RUNNER_DEV_NEEDLE)) {
      next = next.replace(RUNNER_DEV_NEEDLE, runnerDevPatch)
    }
    if (next.includes(RUNNER_DEV_017_NEEDLE)) {
      next = next.replace(RUNNER_DEV_017_NEEDLE, RUNNER_DEV_017_NEEDLE.replace(
        'process.execPath,', `process.execPath,\n\t\t\t"--import",\n\t\t\t${JSON.stringify(hookImportUrl)},`,
      ))
    }
  }

  if (url.includes('@deepseek-ai/dsh-tool-pwsh')) {
    next = rewriteShellEscalationSource(next, 'validatePwshArgs')
  }

  if (url.includes('@deepseek-ai/dsh-tool-bash')) {
    next = rewriteShellEscalationSource(next, 'validateBashArgs')
  }

  if (url.includes('@deepseek-ai/dsh-tool-fs')) {
    next = rewriteFsEscalationSource(next)
  }

  if (normalizedUrl.includes('@deepseek-ai/dsh-llm/lib/index.js')) {
    next = rewriteQuotaErrorClassification(next)
  }

  if (url.includes('@deepseek-ai/dsh-llm-pi-ai')) {
    next = rewriteKnownToolArgumentAliases(next)
  }

  return next
}

/**
 * Normalize the final pi-ai tool-call block before it enters the Harness
 * durable assistant message and Agent Loop. The rule depends only on the exact
 * tool name and argument shape, so the same deterministic repair works across
 * providers and models without changing the stream function's interface.
 */
export function rewriteKnownToolArgumentAliases(source) {
  const helperMarker = 'function normalizeKnownToolArgumentAliases(toolName, args)'
  if (source.includes(helperMarker)) return source

  const uniqueIndex = (needle) => {
    const first = source.indexOf(needle)
    if (first === -1 || source.indexOf(needle, first + needle.length) !== -1) return -1
    return first
  }
  const signatureNeedle = uniqueIndex(TOOL_ARGUMENT_STREAM_SIGNATURE_015_NEEDLE) !== -1
    ? TOOL_ARGUMENT_STREAM_SIGNATURE_015_NEEDLE
    : uniqueIndex(TOOL_ARGUMENT_STREAM_SIGNATURE_ALPHA2_NEEDLE) !== -1
      ? TOOL_ARGUMENT_STREAM_SIGNATURE_ALPHA2_NEEDLE
      : uniqueIndex(TOOL_ARGUMENT_STREAM_SIGNATURE_NEEDLE) !== -1
        ? TOOL_ARGUMENT_STREAM_SIGNATURE_NEEDLE
        : undefined
  const blockNeedle = uniqueIndex(TOOL_CALL_END_BLOCK_ALPHA2_NEEDLE) !== -1
    ? TOOL_CALL_END_BLOCK_ALPHA2_NEEDLE
    : uniqueIndex(TOOL_CALL_END_BLOCK_NEEDLE) !== -1
      ? TOOL_CALL_END_BLOCK_NEEDLE
      : undefined
  if (signatureNeedle === undefined || blockNeedle === undefined) return source
  const signatureAt = uniqueIndex(signatureNeedle)
  const blockAt = uniqueIndex(blockNeedle)
  if (signatureAt === -1 || blockAt <= signatureAt) return source
  const blockPatch = blockNeedle.replace(
    'arguments: JSON.stringify(event.toolCall.arguments)',
    'arguments: JSON.stringify(normalizeKnownToolArgumentAliases(event.toolCall.name, event.toolCall.arguments))',
  )

  return source
    .replace(
      signatureNeedle,
      `${normalizeKnownToolArgumentAliases.toString()}\n${signatureNeedle}`,
    )
    .replace(blockNeedle, blockPatch)
}
