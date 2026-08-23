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

export { HIDDEN_CONSOLE_STARTF }

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

  if (url.includes('@nanmicoder/dsh-agent-teams')) {
    next = rewriteAgentTeamsMemberDefaults(next)
  }

  if (url.includes('@earendil-works/pi-ai/dist/api/openai-completions.js')) {
    next = rewriteOpenCodeMissingFinishReason(next)
  }

  return next
}

const TEAMS_CONFIG_NEEDLE = 'memberModel: z.string(),'
const TEAMS_CONFIG_PATCH = 'memberModel: z.string(),\n    memberReasoningEffort: z.string(),'
const TEAMS_RESOLVED_NEEDLE = 'memberModel: config.memberModel,'
const TEAMS_RESOLVED_PATCH = 'memberModel: config.memberModel,\n        memberReasoningEffort: config.memberReasoningEffort,'
const TEAMS_EFFORT_NEEDLE = 'reasoningEffort: args.reasoning_effort,'
const TEAMS_EFFORT_PATCH = 'reasoningEffort: args.reasoning_effort ?? config.memberReasoningEffort,'

/** Accept memberReasoningEffort from the desktop overlay and apply it when add_member omits effort. */
export function rewriteAgentTeamsMemberDefaults(source) {
  let next = source
  if (next.includes(TEAMS_CONFIG_NEEDLE) && !next.includes('memberReasoningEffort: z.string()')) {
    next = next.replace(TEAMS_CONFIG_NEEDLE, TEAMS_CONFIG_PATCH)
  }
  if (next.includes(TEAMS_RESOLVED_NEEDLE) && !next.includes('memberReasoningEffort: config.memberReasoningEffort')) {
    next = next.replace(TEAMS_RESOLVED_NEEDLE, TEAMS_RESOLVED_PATCH)
  }
  if (next.includes(TEAMS_EFFORT_NEEDLE) && !next.includes(TEAMS_EFFORT_PATCH)) {
    next = next.replace(TEAMS_EFFORT_NEEDLE, TEAMS_EFFORT_PATCH)
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
