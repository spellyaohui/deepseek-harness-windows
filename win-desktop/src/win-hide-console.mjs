import { createRequire } from 'node:module'
import { register } from 'node:module'
import { patchNodeChildProcess } from './win-hide-console-rewrite.js'

if (process.platform === 'win32') {
  patchNodeChildProcess(createRequire(import.meta.url)('node:child_process'))
  register(new URL('./win-hide-console-loader.mjs', import.meta.url).href, {
    parentURL: import.meta.url,
    data: import.meta.url,
  })
}
