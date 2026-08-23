const STYLE_SELECTOR = 'style[data-plugin-css="session-markdown-export"]'

const CSS = `
.dsh-session-markdown-export-button {
  align-items: center;
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 18px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  display: inline-flex;
  font-family: var(--dsw-font-family);
  font-size: 13px;
  font-weight: 400;
  gap: 4px;
  height: 32px;
  justify-content: center;
  line-height: 20px;
  min-width: 78px;
  padding: 6px 12px;
}
.dsh-session-markdown-export-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-session-markdown-export-button:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: wait;
}
.dsh-session-markdown-export-button > span,
.dsh-session-markdown-export-button > svg {
  flex: none;
}
.dsh-session-markdown-export-button > span {
  white-space: nowrap;
}
`

export function ensureSessionMarkdownExportStyles(): void {
  if (typeof document === 'undefined' || document.querySelector(STYLE_SELECTOR) !== null) return
  const tag = document.createElement('style')
  tag.dataset.pluginCss = 'session-markdown-export'
  tag.textContent = CSS
  document.head.appendChild(tag)
}
