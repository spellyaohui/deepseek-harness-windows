import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url))

/** 官方 DeepSeek Harness 鲸鱼图标（白底圆角方块）。 */
export function resolveAppIcon() {
  const candidates = [
    fileURLToPath(new URL('./icon.ico', import.meta.url)),
    fileURLToPath(new URL('../assets/icon.ico', import.meta.url)),
    join(process.resourcesPath ?? '', 'app', 'assets', 'icon.ico'),
  ]
  return candidates.find((path) => existsSync(path))
}

export function createWindowOptions(platform = process.platform) {
  const icon = resolveAppIcon()
  return {
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DeepSeek Harness',
    backgroundColor: '#0b0f14',
    autoHideMenuBar: platform === 'win32',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }
}
