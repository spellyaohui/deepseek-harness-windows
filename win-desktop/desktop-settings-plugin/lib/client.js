window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-desktop-settings',
  factory: (require) => {
    const React = require('react')
    const { Switch, Button, Input } = require('@deepseek-ai/dsh-client-ui-primitives')
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
      .dsh-desktop-backup-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
      .dsh-desktop-backup-actions button { white-space:nowrap; }
      .dsh-desktop-backup-fields { display:grid; gap:8px; max-width:360px; }
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
      const [backupMode, setBackupMode] = useState(null)
      const [password, setPassword] = useState('')
      const [confirmation, setConfirmation] = useState('')
      const [backupMessage, setBackupMessage] = useState('')
      const [backupFailed, setBackupFailed] = useState(false)
      const [backingUp, setBackingUp] = useState(false)
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

      const runBackup = async () => {
        if (password.length < 8 || password.length > 1024 || (backupMode === 'export' && password !== confirmation)) {
          setBackupFailed(true)
          setBackupMessage(password !== confirmation && backupMode === 'export' ? '两次输入的密码不一致' : '备份密码须为 8～1024 个字符')
          return
        }
        setBackingUp(true); setBackupFailed(false); setBackupMessage('正在处理配置备份…')
        try {
          const call = async body => {
            const response = await fetch('/plugins/dsh-desktop-settings/backup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error ?? '备份操作失败')
            return result
          }
          let canceled
          if (backupMode === 'export') {
            const result = await call({ action: 'export', password })
            canceled = (await bridge.saveConfigurationBackup(result.encrypted)).canceled
          } else {
            const selected = await bridge.openConfigurationBackup()
            canceled = selected.canceled
            if (!canceled) await call({ action: 'import', encrypted: selected.encrypted, password })
          }
          setBackupMessage(canceled ? '已取消' : backupMode === 'export' ? '配置备份已导出，请妥善保存备份文件和密码。' : '配置导入成功。请退出并重新启动程序，使所有模型和子智能体配置生效。')
          setBackupMode(null)
        } catch (error) { setBackupFailed(true); setBackupMessage(`备份操作失败：${error instanceof Error ? error.message : '请重试'}`) }
        finally { setPassword(''); setConfirmation(''); setBackingUp(false) }
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
        h('section', { className: 'dsh-desktop-settings-card' },
          h('h2', { className: 'dsh-desktop-settings-title' }, '配置备份'),
          h('p', { className: 'dsh-desktop-settings-help' }, '导出或导入模型供应商及 API Key / Token、临时子智能体、团队 Profile 和原生子智能体配置。备份使用密码加密，不包含对话和账户登录状态。'),
          h('p', { className: 'dsh-desktop-settings-help' }, '导入会替换备份中的配置，建议先导出当前配置。导入成功后请重启程序。密码无法找回，请妥善保存。'),
          backupMode === null ? h('div', { className: 'dsh-desktop-backup-actions' },
            ...[['export', '导出配置'], ['import', '导入配置']].map(([mode, label]) => h(Button, { key: mode, variant: 'outline', size: 'sm', disabled: saving || backingUp, onClick: () => { setBackupMode(mode); setPassword(''); setConfirmation(''); setBackupMessage(''); setBackupFailed(false) } }, label)),
          ) : h('div', null,
            h('label', { className: 'dsh-desktop-settings-label', htmlFor: 'dsh-backup-password' }, backupMode === 'export' ? '设置备份密码' : '输入备份密码'),
            h('div', { className: 'dsh-desktop-backup-fields' },
              h(Input, { id: 'dsh-backup-password', type: 'password', autoComplete: 'new-password', value: password, maxLength: 1024, placeholder: '至少 8 个字符', disabled: backingUp, onChange: event => setPassword(event.target.value) }),
              backupMode === 'export' ? h(Input, { type: 'password', autoComplete: 'new-password', 'aria-label': '确认备份密码', value: confirmation, maxLength: 1024, placeholder: '再次输入密码', disabled: backingUp, onChange: event => setConfirmation(event.target.value) }) : null,
            ),
            h('div', { className: 'dsh-desktop-backup-actions' },
              h(Button, { variant: 'outline', size: 'sm', disabled: backingUp || saving || !password, onClick: () => { void runBackup() } }, backingUp ? '正在处理…' : backupMode === 'export' ? '加密并导出' : '选择文件并导入'),
              h(Button, { variant: 'ghost', size: 'sm', disabled: backingUp, onClick: () => { setBackupMode(null); setPassword(''); setConfirmation(''); setBackupMessage('') } }, '取消'),
            ),
          ),
          backupMessage ? h('p', { className: 'dsh-desktop-settings-help', style: { margin: '12px 0 0', overflowWrap: 'anywhere' }, role: backupFailed ? 'alert' : 'status', 'aria-live': 'polite' }, backupMessage) : null,
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
