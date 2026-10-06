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

const SUBPROCESS_SPAWN_NEEDLE = 'detached: platform !== "win32"'
const SUBPROCESS_SPAWN_PATCH = 'detached: platform !== "win32", windowsHide: true'
const SUBPROCESS_SPAWN_UPSTREAM_EQUIVALENT = `detached: platform !== "win32",
\t\twindowsHide: platform === "win32"`
const TASKKILL_NEEDLE = '], { stdio: "ignore" });'
const TASKKILL_PATCH = '], { stdio: "ignore", windowsHide: true });'
const TASKKILL_UPSTREAM_EQUIVALENT = `stdio: "ignore",
\t\twindowsHide: true`
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
const OPENCODE_MISSING_FINISH_PATTERN = /if \(!hasFinishReason\) \{\n\s+throw new Error\("Stream ended without finish_reason"\);\n\s+\}/
const OPENCODE_MISSING_FINISH_ALPHA2_PATTERN = /if \(\(compat\.supportsFinishReason && !hasFinishReason\) \|\| output\.stopReason === "pending"\) \{\n\s+throw new Error\("Stream ended without finish_reason"\);\n\s+\}/
const OPENCODE_MISSING_FINISH_PATCH = `if (!hasFinishReason) {
                // OpenCode Go may close an otherwise complete SSE response
                // after text/tool deltas without sending finish_reason. Limit
                // recovery to a non-empty response from that provider; empty
                // or interrupted streams still fail loudly.
                if (model.provider === "opencode-go" && blocks.length > 0) {
                    output.stopReason = blocks.some((block) => block.type === "toolCall") ? "toolUse" : "stop";
                }
                else {
                    throw new Error("Stream ended without finish_reason");
                }
            }`
const OPENCODE_MISSING_FINISH_ALPHA2_PATCH = `if ((compat.supportsFinishReason && !hasFinishReason) || output.stopReason === "pending") {
                // OpenCode Go may close an otherwise complete SSE response
                // after text/tool deltas without sending finish_reason. Limit
                // recovery to a non-empty response from that provider; empty
                // or interrupted streams still fail loudly.
                if (model.provider === "opencode-go" && output.content.length > 0) {
                    output.stopReason = output.content.some((block) => block.type === "toolCall") ? "toolUse" : "stop";
                }
                else {
                    throw new Error("Stream ended without finish_reason");
                }
            }`
const OPENCODE_ACTIVE_TOOLS_NEEDLE = 'params.tools = convertTools(activeTools, compat);'
const OPENCODE_DEFERRED_TOOLS_NEEDLE = 'tools: convertTools(deferredTools, compat),'
const OPENCODE_TRANSCRIPT_TOOLS_NEEDLE = 'params.tools = convertTools(transcriptTools.requestTools, compat);'
const OPENCODE_TRANSCRIPT_ADDED_TOOLS_NEEDLE = 'tools: convertTools(addedTools, compat),'
const OPENCODE_CONVERT_TOOLS_NEEDLE = 'function convertTools(tools, compat) {'
const OPENCODE_COMPLETIONS_CACHE_SESSION_NEEDLE = 'const cacheSessionId = cacheRetention === "none" ? undefined : options?.sessionId;'
const OPENCODE_COMPLETIONS_CLIENT_NEEDLE = 'const client = createClient(model, context, apiKey, options?.headers, cacheSessionId, compat);'
const OPENCODE_COMPLETIONS_CLIENT_ALPHA2_NEEDLE = 'const client = createClient(model, context, apiKey, options?.headers, options?.fetch, cacheSessionId, compat);'
const OPENCODE_COMPLETIONS_CLIENT_020_NEEDLE = 'const client = createClient(model, normalizedContext, apiKey, options?.headers, options?.fetch, cacheSessionId, compat);'
const OPENCODE_COMPLETIONS_SESSION_AFFINITY_NEEDLE = `if (sessionId && compat.sendSessionAffinityHeaders) {
        if (compat.sessionAffinityFormat === "openrouter") {`
const OPENCODE_COMPLETIONS_SESSION_AFFINITY_PATCH = `if (sessionId && (compat.sendSessionAffinityHeaders || model.provider === "opencode-go")) {
        if (model.provider === "opencode-go") {
            headers["x-opencode-session"] = sessionId;
        }
        else if (compat.sessionAffinityFormat === "openrouter") {`
const OPENCODE_RESPONSES_CACHE_SESSION_NEEDLE = 'const cacheSessionId = cacheRetention === "none" ? undefined : options?.sessionId;'
const OPENCODE_RESPONSES_CLIENT_NEEDLE = 'const client = createClient(model, context, apiKey, options?.headers, cacheSessionId);'
const OPENCODE_RESPONSES_CLIENT_ALPHA2_NEEDLE = 'const client = createClient(model, context, apiKey, options?.headers, options?.fetch, cacheSessionId);'
const OPENCODE_RESPONSES_CLIENT_020_NEEDLE = 'const client = createClient(model, normalizedContext, apiKey, options?.headers, options?.fetch, cacheSessionId);'
const OPENCODE_RESPONSES_SESSION_AFFINITY_NEEDLE = `if (sessionId) {
        if (compat.sessionAffinityFormat === "openrouter") {`
const OPENCODE_RESPONSES_SESSION_AFFINITY_PATCH = `if (sessionId) {
        if (model.provider === "opencode-go") {
            headers["x-opencode-session"] = sessionId;
        }
        if (compat.sessionAffinityFormat === "openrouter") {`
const OPENCODE_KIMI_SCHEMA_HELPER = `function normalizeOpenCodeKimiToolSchema(schema) {
    if (schema === null || typeof schema !== "object") return schema;
    if (Array.isArray(schema)) return schema.map(normalizeOpenCodeKimiToolSchema);
    // Match OpenCode's Kimi compatibility transform: Moonshot expands refs
    // before validation and rejects sibling fields on the ref node.
    if (typeof schema.$ref === "string") return { $ref: schema.$ref };
    const normalized = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, normalizeOpenCodeKimiToolSchema(value)]));
    // Moonshot's function-schema validator expects one item schema, not a
    // tuple-style array of schemas.
    if (Array.isArray(normalized.items)) normalized.items = normalized.items[0] ?? {};
    return normalized;
}
function convertTools(tools, compat, model) {
    const isOpenCodeKimi = model.provider === "opencode-go" && model.id.toLowerCase().includes("kimi");`
const OPENCODE_LEGACY_TOOL_PARAMETERS_NEEDLE = 'parameters: tool.parameters, // TypeBox already generates JSON Schema'
const OPENCODE_ALPHA2_TOOL_PARAMETERS_NEEDLE = 'parameters: getJsonSchemaToolParameters(tool, strict),'
const OPENCODE_STRICT_TOOL_NEEDLE = '...(compat.supportsStrictMode !== false && { strict: strict ?? false }),'
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
    if (next.includes(SUBPROCESS_SPAWN_NEEDLE)
      && !next.includes(SUBPROCESS_SPAWN_PATCH)
      && !next.includes(SUBPROCESS_SPAWN_UPSTREAM_EQUIVALENT)) {
      next = next.replace(SUBPROCESS_SPAWN_NEEDLE, SUBPROCESS_SPAWN_PATCH)
    }
    if (next.includes(TASKKILL_NEEDLE)
      && !next.includes(TASKKILL_PATCH)
      && !next.includes(TASKKILL_UPSTREAM_EQUIVALENT)) {
      next = next.replace(TASKKILL_NEEDLE, TASKKILL_PATCH)
    }
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

  if (url.includes('@earendil-works/pi-ai/dist/api/openai-responses.js')) {
    next = rewriteOpenCodeGoSessionAffinity(next)
  }

  if (url.includes('@earendil-works/pi-ai/dist/api/openai-completions.js')) {
    next = rewriteOpenCodeMissingFinishReason(next)
    next = rewriteOpenCodeGoSessionAffinity(next)
    next = rewriteOpenCodeKimiToolSchemas(next)
  }

  return next
}

/**
 * Recover non-empty OpenCode Go streams that omit `finish_reason` after the
 * provider has already emitted complete response blocks. This stays strictly
 * provider-scoped so connection failures and every other provider preserve
 * pi-ai's normal fail-closed behavior.
 */
export function rewriteOpenCodeMissingFinishReason(source) {
  if (OPENCODE_MISSING_FINISH_ALPHA2_PATTERN.test(source)) {
    return source.replace(OPENCODE_MISSING_FINISH_ALPHA2_PATTERN, OPENCODE_MISSING_FINISH_ALPHA2_PATCH)
  }
  if (OPENCODE_MISSING_FINISH_PATTERN.test(source)) {
    return source.replace(OPENCODE_MISSING_FINISH_PATTERN, OPENCODE_MISSING_FINISH_PATCH)
  }
  return source
}

/**
 * Give every OpenCode Go request the same session affinity used by the
 * official client. The gateway can route a model-specific request to a
 * backend that rejects it when this header is absent, even though the API
 * key and model catalog are valid. Keep the session id independent from Pi's
 * prompt-cache retention so `cacheRetention: "none"` still has stable routing.
 */
export function rewriteOpenCodeGoSessionAffinity(source) {
  let next = rewriteOpenCodeGoCompletionsSessionAffinity(source)
  next = rewriteOpenCodeGoResponsesSessionAffinity(next)
  return next
}

function rewriteOpenCodeGoCompletionsSessionAffinity(source) {
  let next = source
  if (!next.includes('headers["x-opencode-session"] = sessionId')
    && next.includes(OPENCODE_COMPLETIONS_SESSION_AFFINITY_NEEDLE)) {
    next = next.replace(OPENCODE_COMPLETIONS_SESSION_AFFINITY_NEEDLE, OPENCODE_COMPLETIONS_SESSION_AFFINITY_PATCH)
  }
  const clientNeedle = next.includes(OPENCODE_COMPLETIONS_CLIENT_020_NEEDLE)
    ? OPENCODE_COMPLETIONS_CLIENT_020_NEEDLE
    : next.includes(OPENCODE_COMPLETIONS_CLIENT_ALPHA2_NEEDLE)
      ? OPENCODE_COMPLETIONS_CLIENT_ALPHA2_NEEDLE
    : next.includes(OPENCODE_COMPLETIONS_CLIENT_NEEDLE)
      ? OPENCODE_COMPLETIONS_CLIENT_NEEDLE
      : undefined
  if (!next.includes('const clientSessionId = model.provider === "opencode-go" ? options?.sessionId : cacheSessionId')
    && next.includes(OPENCODE_COMPLETIONS_CACHE_SESSION_NEEDLE)
    && clientNeedle !== undefined) {
    const clientPatch = `const clientSessionId = model.provider === "opencode-go" ? options?.sessionId : cacheSessionId;\n            ${clientNeedle.replace('cacheSessionId, compat)', 'clientSessionId, compat)')}`
    next = next.replace(
      clientNeedle,
      clientPatch,
    )
  }
  return next
}

function rewriteOpenCodeGoResponsesSessionAffinity(source) {
  let next = source
  if (!next.includes('headers["x-opencode-session"] = sessionId')
    && next.includes(OPENCODE_RESPONSES_SESSION_AFFINITY_NEEDLE)) {
    next = next.replace(OPENCODE_RESPONSES_SESSION_AFFINITY_NEEDLE, OPENCODE_RESPONSES_SESSION_AFFINITY_PATCH)
  }
  const clientNeedle = next.includes(OPENCODE_RESPONSES_CLIENT_020_NEEDLE)
    ? OPENCODE_RESPONSES_CLIENT_020_NEEDLE
    : next.includes(OPENCODE_RESPONSES_CLIENT_ALPHA2_NEEDLE)
      ? OPENCODE_RESPONSES_CLIENT_ALPHA2_NEEDLE
    : next.includes(OPENCODE_RESPONSES_CLIENT_NEEDLE)
      ? OPENCODE_RESPONSES_CLIENT_NEEDLE
      : undefined
  if (!next.includes('const clientSessionId = model.provider === "opencode-go" ? options?.sessionId : cacheSessionId')
    && next.includes(OPENCODE_RESPONSES_CACHE_SESSION_NEEDLE)
    && clientNeedle !== undefined) {
    const clientPatch = `const clientSessionId = model.provider === "opencode-go" ? options?.sessionId : cacheSessionId;\n            ${clientNeedle.replace('cacheSessionId)', 'clientSessionId)')}`
    next = next.replace(
      clientNeedle,
      clientPatch,
    )
  }
  return next
}

/**
 * Align Kimi models on OpenCode Go with the official OpenCode client before
 * Pi serializes tool definitions. This is deliberately provider-and-family
 * scoped: generic OpenCode models keep their schemas byte-for-byte unchanged.
 */
export function rewriteOpenCodeKimiToolSchemas(source) {
  if (source.includes('function normalizeOpenCodeKimiToolSchema(schema)')) return source
  const activeToolsNeedle = source.includes(OPENCODE_TRANSCRIPT_TOOLS_NEEDLE)
    ? OPENCODE_TRANSCRIPT_TOOLS_NEEDLE : OPENCODE_ACTIVE_TOOLS_NEEDLE
  const addedToolsNeedle = source.includes(OPENCODE_TRANSCRIPT_ADDED_TOOLS_NEEDLE)
    ? OPENCODE_TRANSCRIPT_ADDED_TOOLS_NEEDLE : OPENCODE_DEFERRED_TOOLS_NEEDLE
  const parametersNeedle = source.includes(OPENCODE_ALPHA2_TOOL_PARAMETERS_NEEDLE)
    ? OPENCODE_ALPHA2_TOOL_PARAMETERS_NEEDLE
    : source.includes(OPENCODE_LEGACY_TOOL_PARAMETERS_NEEDLE)
      ? OPENCODE_LEGACY_TOOL_PARAMETERS_NEEDLE
      : undefined
  if (!source.includes(activeToolsNeedle)
    || !source.includes(addedToolsNeedle)
    || !source.includes(OPENCODE_CONVERT_TOOLS_NEEDLE)
    || parametersNeedle === undefined) {
    return source
  }

  const parametersPatch = parametersNeedle === OPENCODE_ALPHA2_TOOL_PARAMETERS_NEEDLE
    ? 'parameters: isOpenCodeKimi ? normalizeOpenCodeKimiToolSchema(getJsonSchemaToolParameters(tool, strict)) : getJsonSchemaToolParameters(tool, strict),'
    : 'parameters: isOpenCodeKimi ? normalizeOpenCodeKimiToolSchema(tool.parameters) : tool.parameters, // TypeBox already generates JSON Schema'

  let next = source
    .replace(activeToolsNeedle, activeToolsNeedle.replace('compat);', 'compat, model);'))
    .replace(addedToolsNeedle, addedToolsNeedle.replace('compat),', 'compat, model),'))
    .replace(OPENCODE_CONVERT_TOOLS_NEEDLE, OPENCODE_KIMI_SCHEMA_HELPER)
    .replace(parametersNeedle, parametersPatch)
  if (next.includes(OPENCODE_STRICT_TOOL_NEEDLE)) {
    next = next.replace(
      OPENCODE_STRICT_TOOL_NEEDLE,
      '...(!isOpenCodeKimi && compat.supportsStrictMode !== false && { strict: strict ?? false }),',
    )
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
