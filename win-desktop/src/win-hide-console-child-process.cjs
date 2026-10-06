// Shared by the Harness ESM loader and the dependency-free descendant preload.
// Keep this CommonJS: --require also works for external Node runtimes which do
// not support --import. No Harness loader or Electron dependency belongs here.
const INSTALLED = Symbol.for('dsh-desktop.win-hide-console')

function injectWindowsHide(options) {
  if (options == null) return { windowsHide: true }
  if (typeof options !== 'object' || Array.isArray(options)) return options
  // Preserve explicit visibility and leave invalid values to Node's validator.
  if (options.windowsHide != null && options.windowsHide !== true) return { ...options }
  return { ...options, windowsHide: true }
}

function injectWindowsHideArgs(args, method) {
  const copy = [...args]
  const optionsAt = method === 'execSync' ? 1
    : Array.isArray(copy[1]) || (copy[1] == null && copy.length > 2) ? 2 : 1
  const options = copy[optionsAt]
  if (optionsAt === 2 && options === null && (method === 'spawn' || method === 'spawnSync')) return copy
  if (typeof options === 'function') {
    if (method !== undefined && method !== 'execFile') return copy
    copy.splice(optionsAt, 0, injectWindowsHide(undefined))
  } else {
    copy[optionsAt] = injectWindowsHide(options)
  }
  return copy
}

function appendConsolePreload(environment, preloadPath) {
  // Forward slashes avoid NODE_OPTIONS parsing Windows backslash escapes;
  // quotes retain spaces and non-ASCII installation directory names.
  const option = `--require="${preloadPath.replace(/\\/g, '/')}"`
  const key = Object.keys(environment).find(key => key.toUpperCase() === 'NODE_OPTIONS') ?? 'NODE_OPTIONS'
  const previous = environment[key] === undefined ? '' : String(environment[key])
  return { ...environment, [key]: previous.includes(option) ? previous : `${previous}${previous ? ' ' : ''}${option}` }
}

function patchNodeChildProcess(childProcess, { preloadPath } = {}) {
  if (!childProcess || childProcess[INSTALLED]) return childProcess
  for (const name of ['spawn', 'spawnSync', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    const original = childProcess[name]
    if (typeof original !== 'function') continue
    childProcess[name] = function patchedChildProcessFn(...args) {
      const next = injectWindowsHideArgs(args, name)
      if (preloadPath) {
        const optionsAt = name === 'execSync' ? 1
          : Array.isArray(next[1]) || (next[1] == null && next.length > 2) ? 2 : 1
        const options = next[optionsAt]
        // The MCP SDK filters inherited env. Append only our preload to an
        // explicit env; do not leak unrelated parent flags into isolated envs.
        if (options && typeof options === 'object' && !Array.isArray(options)
          && (options.env === undefined || (options.env && typeof options.env === 'object' && !Array.isArray(options.env)))) {
          next[optionsAt] = { ...options, env: appendConsolePreload(options.env ?? process.env, preloadPath) }
        }
      }
      return original.apply(this, next)
    }
  }
  childProcess[INSTALLED] = true
  return childProcess
}

module.exports = { appendConsolePreload, injectWindowsHideArgs, patchNodeChildProcess }
