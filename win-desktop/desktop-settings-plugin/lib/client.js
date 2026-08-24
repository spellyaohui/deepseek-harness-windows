window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-desktop-settings',
  factory: (require) => {
    const React = require('react')
    const { useEffect, useState } = React
    const h = React.createElement

    const STYLE_ID = 'dsh-desktop-settings-style'
    const styles = `
      .dsh-desktop-settings { display:flex; flex-direction:column; gap:20px; padding:4px 0 24px; }
      .dsh-desktop-settings-card { padding:18px 20px; border:1px solid var(--dsw-alias-border-primary, rgba(255,255,255,.12)); border-radius:14px; background:var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04)); }
      .dsh-desktop-settings-title { margin:0 0 6px; color:var(--dsw-alias-label-primary,#eef2f7); font-size:15px; font-weight:600; line-height:22px; }
      .dsh-desktop-settings-help { margin:0 0 14px; color:var(--dsw-alias-label-secondary,#9aa5b4); font-size:13px; line-height:20px; }
      .dsh-desktop-settings-label { display:block; margin:14px 0 7px; color:var(--dsw-alias-label-primary,#eef2f7); font-size:13px; font-weight:500; }
      .dsh-desktop-settings-select { width:100%; min-height:38px; padding:8px 10px; border:1px solid var(--dsw-alias-border-primary,rgba(255,255,255,.16)); border-radius:9px; background:var(--dsw-alias-bg-layer-2,#111821); color:var(--dsw-alias-label-primary,#eef2f7); font:inherit; }
      .dsh-desktop-settings-select:focus { outline:2px solid var(--dsw-alias-interactive-border-focus,#5b8cff); outline-offset:1px; }
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
            setSettings((current) => current ?? { closeBehavior: 'quit' })
            setMessage(`获取设置失败：${String(error)}`)
          })
        return () => { alive = false }
      }, [])

      if (settings === null) {
        return h('div', { className: 'dsh-desktop-settings' }, h('div', { className: 'dsh-desktop-settings-card' }, '正在加载桌面设置…'))
      }

      const persistCloseBehavior = async (closeBehavior) => {
        const previous = settings
        setSettings((current) => ({ ...current, closeBehavior }))
        setSaving(true)
        setMessage('正在保存…')
        try {
          const committed = await bridge.setSettings({ closeBehavior })
          setSettings(committed)
          setMessage('已保存')
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
          h('select', { id: 'dsh-close-behavior', className: 'dsh-desktop-settings-select', value: settings.closeBehavior ?? 'quit', disabled: saving, onChange: (event) => { void persistCloseBehavior(event.target.value) } },
            h('option', { value: 'quit' }, '关闭窗口并退出程序'),
            h('option', { value: 'tray' }, '关闭窗口后隐藏到系统托盘'),
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
        label: () => '桌面',
      }, DesktopSettingsSection))
    }

    return { inject: ['slots'], apply }
  },
})
