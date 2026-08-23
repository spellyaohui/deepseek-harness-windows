export const NS = 'session-markdown-export'

export const zh = {
  'dialog.preparingTitle': '正在准备续接 Markdown',
  'dialog.preparingDescription': '正在验证当前 Session 及其子 Session 的续接 Markdown。',
  'dialog.successTitle': '续接 Markdown 已开始下载',
  'dialog.successDescription': '浏览器正在保存续接 Markdown 文件。',
  'dialog.errorTitle': '续接 Markdown 导出失败',
  'dialog.commandFailed': '无法启动续接 Markdown 导出。',
  'dialog.retry': '重试',
  'dialog.close': '关闭',
} as const

export const en: Record<keyof typeof zh, string> = {
  'dialog.preparingTitle': 'Preparing continuation Markdown',
  'dialog.preparingDescription': 'Validating this Session and its sub-Sessions for continuation Markdown.',
  'dialog.successTitle': 'Continuation Markdown download started',
  'dialog.successDescription': 'The browser is saving the continuation Markdown file.',
  'dialog.errorTitle': 'Continuation Markdown export failed',
  'dialog.commandFailed': 'Could not start the continuation Markdown export.',
  'dialog.retry': 'Retry',
  'dialog.close': 'Close',
}

export type SessionMarkdownExportKey = keyof typeof zh
