window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-opencode-capabilities',
  factory: (require) => {
    const React = require('react')
    const { useEffect, useState } = React
    const h = React.createElement
    const STYLE_ID = 'dsh-opencode-capabilities-style'

    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) return
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.textContent = `
        .dsh-opencode-capabilities { margin:0 0 16px; padding:14px 16px; border:1px solid var(--dsw-alias-border-primary,rgba(255,255,255,.12)); border-radius:12px; background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04)); }
        .dsh-opencode-capabilities-title { margin:0 0 4px; font-size:14px; font-weight:600; color:var(--dsw-alias-label-primary,#eef2f7); }
        .dsh-opencode-capabilities-help { margin:0 0 10px; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary,#9aa5b4); }
        .dsh-opencode-capabilities-button { min-height:32px; padding:6px 10px; border:1px solid var(--dsw-alias-border-primary,rgba(255,255,255,.16)); border-radius:8px; background:var(--dsw-alias-bg-layer-2,#182235); color:var(--dsw-alias-label-primary,#eef2f7); font:inherit; cursor:pointer; }
        .dsh-opencode-capabilities-button:disabled { cursor:wait; opacity:.65; }
        .dsh-opencode-capabilities-status { margin:9px 0 0; font-size:12px; color:var(--dsw-alias-label-secondary,#9aa5b4); }
      `
      document.head.appendChild(tag)
    }

    function OpenCodeCapabilitiesCard() {
      const [running, setRunning] = useState(false)
      const [message, setMessage] = useState('')
      useEffect(() => { ensureStyles() }, [])
      const validate = async () => {
        setRunning(true)
        setMessage('正在校验 OpenCode 模型能力…')
        try {
          const result = await window.dshDesktop.validateOpencodeCapabilities()
          if (result.error) {
            setMessage(`校验失败：${result.error}`)
          } else if (result.repaired > 0) {
            setMessage(`已修复 ${result.repaired} 个模型能力声明；重启 Harness 后生效。`)
          } else {
            setMessage('模型能力目录已是最新状态。')
          }
        } catch (error) {
          setMessage(`校验失败：${String(error)}`)
        } finally {
          setRunning(false)
        }
      }
      return h('section', { className: 'dsh-opencode-capabilities' },
        h('h3', { className: 'dsh-opencode-capabilities-title' }, 'OpenCode 模型能力'),
        h('p', { className: 'dsh-opencode-capabilities-help' }, '校验并修复过时的图片能力和协议目录。不会读取或修改 API Token。'),
        h('button', { type: 'button', className: 'dsh-opencode-capabilities-button', disabled: running, onClick: () => { void validate() } }, running ? '正在校验…' : '校验模型能力'),
        message === '' ? null : h('p', { className: 'dsh-opencode-capabilities-status', role: message.startsWith('校验失败') ? 'alert' : 'status', 'aria-live': 'polite' }, message),
      )
    }

    function apply(ctx) {
      ctx.slots.inject('settings.models.card', () => ctx.slots.register({
        name: 'settings.models.card',
        id: 'opencode-capabilities',
        order: -20,
      }, OpenCodeCapabilitiesCard))
    }

    return { inject: ['slots'], apply }
  },
})
