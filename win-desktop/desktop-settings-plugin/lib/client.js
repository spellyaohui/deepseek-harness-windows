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
      .dsh-desktop-settings-row { display:flex; gap:9px; align-items:center; }
      .dsh-desktop-settings-row .dsh-desktop-settings-select { flex:1; }
      .dsh-desktop-settings-button { min-height:38px; padding:8px 13px; border:1px solid var(--dsw-alias-border-primary,rgba(255,255,255,.16)); border-radius:9px; background:var(--dsw-alias-bg-layer-2,#111821); color:var(--dsw-alias-label-primary,#eef2f7); font:inherit; cursor:pointer; }
      .dsh-desktop-settings-button:hover { border-color:var(--dsw-alias-interactive-border-hover,#5b8cff); }
      .dsh-desktop-settings-button:disabled, .dsh-desktop-settings-select:disabled { opacity:.55; cursor:wait; }
      .dsh-desktop-settings-status { min-height:20px; margin-top:8px; color:var(--dsw-alias-label-secondary,#9aa5b4); font-size:12px; line-height:20px; }
      .dsh-desktop-settings-status.error { color:var(--dsw-alias-label-danger,#ff8f8f); }
      .dsh-desktop-settings-status.success { color:var(--dsw-alias-label-success,#77d7a7); }
      .dsh-desktop-settings-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:2px; }
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
      const [models, setModels] = useState([])
      const [modelSource, setModelSource] = useState('')
      const [modelState, setModelState] = useState('loading')
      const [message, setMessage] = useState('')
      const [saving, setSaving] = useState(false)
      const bridge = window.dshDesktop

      useEffect(() => {
        ensureStyles()
        let alive = true
        Promise.all([bridge.getSettings(), bridge.fetchModels()])
          .then(([nextSettings, result]) => {
            if (!alive) return
            setSettings(nextSettings)
            setModels(result.models ?? [])
            setModelSource(result.source ?? 'catalog')
            setModelState(result.models?.length ? 'ready' : 'error')
            if (result.error) setMessage(`API 不可用，已使用本地目录：${result.error}`)
          })
          .catch((error) => {
            if (!alive) return
            setSettings((current) => current ?? { closeBehavior: 'quit', agentTeamsMemberModel: 'deepseek-v4-flash', agentTeamsMemberReasoningEffort: 'max' })
            setModelState('error')
            setMessage(`获取模型失败：${String(error)}`)
          })
        return () => { alive = false }
      }, [])

      if (settings === null) {
        return h('div', { className: 'dsh-desktop-settings' }, h('div', { className: 'dsh-desktop-settings-card' }, '正在加载桌面设置…'))
      }

      const setField = (key, value) => setSettings((current) => ({ ...current, [key]: value }))
      const refresh = async () => {
        setModelState('loading')
        setMessage('正在刷新模型目录…')
        try {
          const result = await bridge.refreshModels()
          setModels(result.models ?? [])
          setModelSource(result.error ? 'catalog' : 'api')
          setModelState(result.models?.length ? 'ready' : 'error')
          setMessage(result.error ? `API 不可用，已保留本地目录：${result.error}` : `模型目录已更新，共 ${result.models.length} 个模型`)
        } catch (error) {
          setModelState('error')
          setMessage(`刷新失败：${String(error)}`)
        }
      }
      const save = async () => {
        setSaving(true)
        setMessage('正在保存…')
        try {
          await bridge.setSettings({
            closeBehavior: settings.closeBehavior,
            agentTeamsMemberModel: settings.agentTeamsMemberModel,
            agentTeamsMemberReasoningEffort: settings.agentTeamsMemberReasoningEffort,
          })
          setMessage('已保存；模型配置将在下次启动时生效')
        } catch (error) {
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
          h('select', { id: 'dsh-close-behavior', className: 'dsh-desktop-settings-select', value: settings.closeBehavior ?? 'quit', onChange: (event) => setField('closeBehavior', event.target.value) },
            h('option', { value: 'quit' }, '关闭窗口并退出程序'),
            h('option', { value: 'tray' }, '关闭窗口后隐藏到系统托盘'),
          ),
        ),
        h('section', { className: 'dsh-desktop-settings-card' },
          h('h2', { className: 'dsh-desktop-settings-title' }, '子智能体模型'),
          h('p', { className: 'dsh-desktop-settings-help' }, '子智能体调用的语言模型。选择“跟随队长”则使用队长当前模型。'),
          h('label', { className: 'dsh-desktop-settings-label', htmlFor: 'dsh-member-model' }, '模型'),
          h('div', { className: 'dsh-desktop-settings-row' },
            h('select', { id: 'dsh-member-model', className: 'dsh-desktop-settings-select', disabled: modelState === 'loading', value: settings.agentTeamsMemberModel ?? '', onChange: (event) => setField('agentTeamsMemberModel', event.target.value) },
              h('option', { value: '' }, modelState === 'loading' ? '加载中…' : '跟随队长模型'),
              ...models.map((model) => h('option', { key: model.id, value: model.id }, model.name || model.id)),
            ),
            h('button', { type: 'button', className: 'dsh-desktop-settings-button', disabled: modelState === 'loading', onClick: refresh }, '刷新'),
          ),
          h('div', { className: `dsh-desktop-settings-status${modelState === 'error' ? ' error' : modelState === 'ready' ? ' success' : ''}` }, message || (modelState === 'loading' ? '正在获取模型列表…' : `${models.length} 个模型 · ${modelSource === 'api' ? 'API' : '本地目录'}`)),
          h('label', { className: 'dsh-desktop-settings-label', htmlFor: 'dsh-member-effort' }, '推理强度'),
          h('select', { id: 'dsh-member-effort', className: 'dsh-desktop-settings-select', value: settings.agentTeamsMemberReasoningEffort ?? '', onChange: (event) => setField('agentTeamsMemberReasoningEffort', event.target.value) },
            h('option', { value: '' }, '跟随目标模型默认值'),
            h('option', { value: 'low' }, 'low'),
            h('option', { value: 'medium' }, 'medium'),
            h('option', { value: 'high' }, 'high'),
            h('option', { value: 'max' }, 'max'),
          ),
        ),
        h('div', { className: 'dsh-desktop-settings-actions' }, h('button', { type: 'button', className: 'dsh-desktop-settings-button', disabled: saving, onClick: save }, saving ? '保存中…' : '保存设置')),
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
