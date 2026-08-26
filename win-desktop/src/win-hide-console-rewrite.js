/**
 * Rewrite official dsh ESM sources so a GUI Electron host does not flash
 * console windows when tools or the Windows ACL runner spawn children.
 *
 * CREATE_NO_WINDOW (Node `windowsHide`) is safe for ordinary Node spawn.
 * Restricted-token sandbox children die with STATUS_DLL_INIT_FAILED if that
 * flag is set, so those CreateProcessAsUserW calls get STARTF_USESHOWWINDOW
 * + SW_HIDE instead — a console still exists, but the window stays hidden.
 */

const STARTF_USESHOWWINDOW = 1
const STARTF_USESTDHANDLES = 256
const HIDDEN_CONSOLE_STARTF = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES

const SUBPROCESS_SPAWN_NEEDLE = 'detached: platform !== "win32"'
const SUBPROCESS_SPAWN_PATCH = 'detached: platform !== "win32", windowsHide: true'
const TASKKILL_NEEDLE = '], { stdio: "ignore" });'
const TASKKILL_PATCH = '], { stdio: "ignore", windowsHide: true });'
const SANDBOX_DWFLAGS_NEEDLE = 'dwFlags: 256,'
const SANDBOX_DWFLAGS_PATCH = `dwFlags: ${String(HIDDEN_CONSOLE_STARTF)},\n\t\twShowWindow: 0,`
const RUNNER_PROD_NEEDLE = 'if (existsSync(builtEntry)) return [process.execPath, builtEntry];'
const RUNNER_DEV_NEEDLE = `return [
			process.execPath,
			"--import",
			"tsx/esm",
			sourceEntry
		];`
const OPENCODE_MISSING_FINISH_PATTERN = /if \(!hasFinishReason\) \{\n\s+throw new Error\("Stream ended without finish_reason"\);\n\s+\}/
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
const OPENCODE_ACTIVE_TOOLS_NEEDLE = 'params.tools = convertTools(activeTools, compat);'
const OPENCODE_DEFERRED_TOOLS_NEEDLE = 'tools: convertTools(deferredTools, compat),'
const OPENCODE_CONVERT_TOOLS_NEEDLE = 'function convertTools(tools, compat) {'
const OPENCODE_COMPLETIONS_CACHE_SESSION_NEEDLE = 'const cacheSessionId = cacheRetention === "none" ? undefined : options?.sessionId;'
const OPENCODE_COMPLETIONS_CLIENT_NEEDLE = 'const client = createClient(model, context, apiKey, options?.headers, cacheSessionId, compat);'
const OPENCODE_COMPLETIONS_SESSION_AFFINITY_NEEDLE = `if (sessionId && compat.sendSessionAffinityHeaders) {
        if (compat.sessionAffinityFormat === "openrouter") {`
const OPENCODE_COMPLETIONS_SESSION_AFFINITY_PATCH = `if (sessionId && (compat.sendSessionAffinityHeaders || model.provider === "opencode-go")) {
        if (model.provider === "opencode-go") {
            headers["x-opencode-session"] = sessionId;
        }
        else if (compat.sessionAffinityFormat === "openrouter") {`
const OPENCODE_RESPONSES_CACHE_SESSION_NEEDLE = 'const cacheSessionId = cacheRetention === "none" ? undefined : options?.sessionId;'
const OPENCODE_RESPONSES_CLIENT_NEEDLE = 'const client = createClient(model, context, apiKey, options?.headers, cacheSessionId);'
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

function rewriteShellEscalationSource(source, validator) {
  const needle = `async execute(args, exec) {
\t\t\t${validator}(args);
\t\t\tconst standingPolicy = resolveSandboxPolicy(exec);`
  const patch = `async execute(args, exec) {
\t\t\tconst standingPolicy = resolveSandboxPolicy(exec);
\t\t\t${normalizeRedundantEscalationArgs.toString()}
\t\t\targs = normalizeRedundantEscalationArgs(args, standingPolicy?.mode);
\t\t\t${validator}(args);`
  return source.includes(needle) ? source.replace(needle, patch) : source
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
  let next = source

  if (url.includes('@deepseek-ai/dsh-subprocess-local')) {
    if (next.includes(SUBPROCESS_SPAWN_NEEDLE) && !next.includes(SUBPROCESS_SPAWN_PATCH)) {
      next = next.replace(SUBPROCESS_SPAWN_NEEDLE, SUBPROCESS_SPAWN_PATCH)
    }
    if (next.includes(TASKKILL_NEEDLE) && !next.includes(TASKKILL_PATCH)) {
      next = next.replace(TASKKILL_NEEDLE, TASKKILL_PATCH)
    }
  }

  if (url.includes('@deepseek-ai/dsh-sandbox-windows-acl')) {
    if (next.includes(SANDBOX_DWFLAGS_NEEDLE)) {
      next = next.replaceAll(SANDBOX_DWFLAGS_NEEDLE, SANDBOX_DWFLAGS_PATCH)
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
  if (!OPENCODE_MISSING_FINISH_PATTERN.test(source)) return source
  return source.replace(OPENCODE_MISSING_FINISH_PATTERN, OPENCODE_MISSING_FINISH_PATCH)
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
  if (!next.includes('const clientSessionId = model.provider === "opencode-go" ? options?.sessionId : cacheSessionId')
    && next.includes(OPENCODE_COMPLETIONS_CACHE_SESSION_NEEDLE)
    && next.includes(OPENCODE_COMPLETIONS_CLIENT_NEEDLE)) {
    next = next.replace(
      OPENCODE_COMPLETIONS_CLIENT_NEEDLE,
      'const clientSessionId = model.provider === "opencode-go" ? options?.sessionId : cacheSessionId;\n            const client = createClient(model, context, apiKey, options?.headers, clientSessionId, compat);',
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
  if (!next.includes('const clientSessionId = model.provider === "opencode-go" ? options?.sessionId : cacheSessionId')
    && next.includes(OPENCODE_RESPONSES_CACHE_SESSION_NEEDLE)
    && next.includes(OPENCODE_RESPONSES_CLIENT_NEEDLE)) {
    next = next.replace(
      OPENCODE_RESPONSES_CLIENT_NEEDLE,
      'const clientSessionId = model.provider === "opencode-go" ? options?.sessionId : cacheSessionId;\n            const client = createClient(model, context, apiKey, options?.headers, clientSessionId);',
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
  if (!source.includes(OPENCODE_ACTIVE_TOOLS_NEEDLE)
    || !source.includes(OPENCODE_DEFERRED_TOOLS_NEEDLE)
    || !source.includes(OPENCODE_CONVERT_TOOLS_NEEDLE)
    || !source.includes('parameters: tool.parameters, // TypeBox already generates JSON Schema')) {
    return source
  }

  return source
    .replace(OPENCODE_ACTIVE_TOOLS_NEEDLE, 'params.tools = convertTools(activeTools, compat, model);')
    .replace(OPENCODE_DEFERRED_TOOLS_NEEDLE, 'tools: convertTools(deferredTools, compat, model),')
    .replace(OPENCODE_CONVERT_TOOLS_NEEDLE, OPENCODE_KIMI_SCHEMA_HELPER)
    .replace(
      'parameters: tool.parameters, // TypeBox already generates JSON Schema',
      'parameters: isOpenCodeKimi ? normalizeOpenCodeKimiToolSchema(tool.parameters) : tool.parameters, // TypeBox already generates JSON Schema',
    )
}

function injectWindowsHide(options) {
  if (options == null) return { windowsHide: true }
  if (typeof options !== 'object' || Array.isArray(options)) return options
  if (options.windowsHide === false) return options
  return { ...options, windowsHide: true }
}

export function injectWindowsHideArgs(args) {
  const copy = [...args]
  const callback = typeof copy.at(-1) === 'function' ? copy.pop() : undefined
  const last = copy.at(-1)
  if (last && typeof last === 'object' && !Array.isArray(last)) {
    copy[copy.length - 1] = injectWindowsHide(last)
  } else {
    copy.push({ windowsHide: true })
  }
  if (callback) copy.push(callback)
  return copy
}

const INSTALLED = Symbol.for('dsh-desktop.win-hide-console')

export function patchNodeChildProcess(childProcess) {
  if (!childProcess || childProcess[INSTALLED]) return childProcess
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) {
    const original = childProcess[name]
    if (typeof original !== 'function') continue
    childProcess[name] = function patchedChildProcessFn(...args) {
      return original.apply(this, injectWindowsHideArgs(args))
    }
  }
  childProcess[INSTALLED] = true
  return childProcess
}
