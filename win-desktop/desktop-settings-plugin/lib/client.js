window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-desktop-settings',
  factory: (require) => {
    const React = require('react')
    const { Switch } = require('@deepseek-ai/dsh-client-ui-primitives')
    const { useEffect, useState } = React
    const h = React.createElement

    const STYLE_ID = 'dsh-desktop-settings-style'
    const styles = `
      .dsh-desktop-settings { display:flex; flex-direction:column; gap:12px; padding:4px 0 24px; font-family:inherit; font-size:14px; line-height:22px; }
      .dsh-desktop-settings-card { padding:12px 0 16px; border-bottom:0.5px solid var(--dsw-alias-border-l2); }
      .dsh-desktop-settings-title { margin:0 0 4px; color:var(--dsw-alias-label-primary); font-size:14px; font-weight:400; line-height:22px; }
      .dsh-desktop-settings-help { margin:0 0 16px; color:var(--dsw-alias-label-secondary); font-size:12px; line-height:18px; }
      .dsh-desktop-settings-label { display:block; margin:12px 0 6px; color:var(--dsw-alias-label-primary); font-size:13px; font-weight:500; line-height:1.5; }
      .dsh-desktop-settings-select { box-sizing:border-box; width:100%; min-height:34px; padding:6px 12px; border:0.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; line-height:1.5; }
      .dsh-desktop-settings-select:focus { outline:2px solid var(--dsw-alias-interactive-border-focus,#5b8cff); outline-offset:1px; }
      .dsh-desktop-settings > p { margin:0; font-size:12px; line-height:18px; overflow-wrap:anywhere; }
      .dsh-desktop-settings-row { display:flex; align-items:center; justify-content:space-between; gap:20px; }
      .dsh-desktop-settings-row > div { min-width:0; }
      .dsh-desktop-settings-row .dsh-desktop-settings-help { margin:4px 0 0; overflow-wrap:anywhere; }
    `

    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) return
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.textContent = styles
      document.head.appendChild(tag)
    }

    function DesktopSettingsSection() {
      const [settings, setSettings] = useState(null)
      const [message, setMessage] = useState('')
      const [saving, setSaving] = useState(false)
      const bridge = window.dshDesktop

      useEffect(() => {
        ensureStyles()
        let alive = true
        bridge.getSettings()
          .then((nextSettings) => {
            if (alive) setSettings(nextSettings)
          })
          .catch((error) => {
            if (!alive) return
            setSettings((current) => current ?? { closeBehavior: 'quit', builtinWebToolsEnabled: true })
            setMessage(`获取设置失败：${String(error)}`)
          })
        return () => { alive = false }
      }, [])

      if (settings === null) {
        return h('div', { className: 'dsh-desktop-settings' }, h('div', { className: 'dsh-desktop-settings-card' }, '正在加载扩展设置…'))
      }

      const persist = async (patch, successMessage) => {
        const previous = settings
        setSettings((current) => ({ ...current, ...patch }))
        setSaving(true)
        setMessage('正在保存…')
        try {
          const committed = await bridge.setSettings(patch)
          setSettings(committed)
          setMessage(successMessage)
        } catch (error) {
          setSettings(previous)
          setMessage(`保存失败：${String(error)}`)
        } finally {
          setSaving(false)
        }
      }

      return h('div', { className: 'dsh-desktop-settings' },
        h('section', { className: 'dsh-desktop-settings-card' },
          h('h2', { className: 'dsh-desktop-settings-title' }, '窗口行为'),
          h('p', { className: 'dsh-desktop-settings-help' }, '选择关闭主窗口时退出程序，或继续在系统托盘运行。'),
          h('label', { className: 'dsh-desktop-settings-label', htmlFor: 'dsh-close-behavior' }, '关闭主窗口'),
          h('select', { id: 'dsh-close-behavior', className: 'dsh-desktop-settings-select', value: settings.closeBehavior ?? 'quit', disabled: saving, onChange: (event) => { void persist({ closeBehavior: event.target.value }, '已保存') } },
            h('option', { value: 'quit' }, '关闭窗口并退出程序'),
            h('option', { value: 'tray' }, '关闭窗口后隐藏到系统托盘'),
          ),
        ),
        h('section', { className: 'dsh-desktop-settings-card' },
          h('h2', { className: 'dsh-desktop-settings-title' }, '内置联网工具'),
          h('div', { className: 'dsh-desktop-settings-row' },
            h('div', null,
              h('div', { id: 'dsh-builtin-web-tools-label' }, '启用内置网页搜索和网页读取'),
              h('p', { className: 'dsh-desktop-settings-help' }, '控制 DSH 内置的 web_search 和 web_fetch，不影响通过 MCP 提供的联网工具。'),
              h('p', { className: 'dsh-desktop-settings-help' }, '自动保存，重启应用后生效。'),
            ),
            h(Switch, { checked: settings.builtinWebToolsEnabled !== false, disabled: saving, label: '启用内置网页搜索和网页读取', onChange: (enabled) => { void persist({ builtinWebToolsEnabled: enabled }, '已保存，重启应用后生效') } }),
          ),
        ),
        message === '' ? null : h('p', { role: message.startsWith('保存失败') ? 'alert' : 'status', 'aria-live': 'polite' }, message),
      )
    }

    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'desktop',
        order: 20,
        label: () => '扩展设置',
      }, DesktopSettingsSection))
    }

    return { inject: ['slots'], apply }
  },
})
