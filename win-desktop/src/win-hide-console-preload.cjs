// Only child-process protection crosses npm shims / bundled Node boundaries.
// Never register the Harness ESM loader here: workers inherit NODE_OPTIONS too.
if (process.platform === 'win32') {
  const { appendConsolePreload, patchNodeChildProcess } = require('./win-hide-console-child-process.cjs')
  const environment = appendConsolePreload(process.env, __filename)
  const key = Object.keys(environment).find(key => key.toUpperCase() === 'NODE_OPTIONS')
  process.env[key] = environment[key]
  patchNodeChildProcess(require('node:child_process'), { preloadPath: __filename })
  require('node:module').syncBuiltinESMExports()
}
