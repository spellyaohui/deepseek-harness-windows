import { register } from 'node:module'
import './win-hide-console-preload.cjs'

if (process.platform === 'win32') {
  register(new URL('./win-hide-console-loader.mjs', import.meta.url).href, {
    parentURL: import.meta.url,
    data: import.meta.url,
  })
}
