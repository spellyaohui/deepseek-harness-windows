import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

registerHooks({ resolve(specifier, context, next) {
  // The page store is not mounted by this focused editor render.
  if (specifier === '@deepseek-ai/dsh-client-store') return { url: 'data:text/javascript,export const createSnapshotStore = () => { throw new Error("unexpected page store mount") }', shortCircuit: true }
  if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true }
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { url: 'data:text/javascript,export const Switch = () => null; export const Tooltip = () => null; export const Button = () => null; export const Modal = ({ children }) => children; export const Checkbox = () => null; export const IconPlusOutlineRegular = () => null; export const IconTrashOutlineRegular = () => null; export const IconChevronDownOutlineRegular = () => null; export const IconChevronRightOutlineRegular = () => null', shortCircuit: true }
  return next(specifier, context)
} })
const { ProviderEditor } = await import('../lib/client/ProviderEditor.js')
const { DeepSeekOnboardingDialog } = await import('../lib/client/DeepSeekOnboardingDialog.js')
const getPath = (value, path) => path.reduce((current, key) => current?.[key], value)
const schema = {
  getPath, hasPath: (value, path) => getPath(value, path) !== undefined,
  rehydrate: () => ({ meta: {} }), nodeAtPath: () => ({ meta: {} }),
}
function render(extra = {}) {
  return renderToStaticMarkup(createElement(ProviderEditor, {
    provider: 'fixture', displayName: 'Fixture', settingsPath: [], schema,
    namespace: { ns: 'llm-deepseek', revision: 'test', schema: {}, user: {}, base: {}, value: { apiKeyEnv: 'FIXTURE_KEY' } },
    operations: {}, t: key => key, readOnly: false, onClose() {}, ...extra,
  }))
}
const input = html => html.match(/<input[^>]*aria-label="keyInput"[^>]*>/)?.[0]
const apply = html => html.match(/<button[^>]*>apply<\/button>/)?.[0]

test('read-only credential metadata disables replacement while leaving unrelated settings and cancel usable', () => {
  const readonly = { configured: true, source: 'custom-readonly', writable: false }
  for (const metadata of [{ credential: readonly }, { credentialChecks: { FIXTURE_KEY: readonly } }]) {
    const editor = render(metadata)
    assert.match(input(editor), /disabled=""/)
    assert.doesNotMatch(apply(editor), /disabled=""/, 'unchanged credentials must not lock model/endpoint saves')
    const keyOnly = render({ ...metadata, credentialOnly: true })
    assert.match(input(keyOnly), /disabled=""/)
    assert.match(apply(keyOnly), /disabled=""/)
    assert.match(keyOnly, /<button(?![^>]*disabled)[^>]*>cancel<\/button>/)
  }
})

test('writable and unreported credentials remain editable, and settings read-only still wins', () => {
  for (const credential of [undefined, { configured: true, source: 'env', writable: true }]) {
    const editor = render({ credential })
    assert.doesNotMatch(input(editor), /disabled=""/)
    assert.doesNotMatch(apply(editor), /disabled=""/)
  }
  const editor = render({ readOnly: true, credential: { configured: true, writable: true } })
  assert.match(input(editor), /disabled=""/)
  assert.match(apply(editor), /disabled=""/)
})


test('explicit onboarding passes named and derived read-only credential metadata to its editor', () => {
  const namespace = { ns: 'llm-deepseek', revision: 'test', schema: {}, user: {}, base: {}, value: { apiKeyEnv: 'FIXTURE_KEY' } }
  const readonly = { configured: true, source: 'custom-readonly', writable: false }
  for (const metadata of [{ credential: readonly }, { derivedCredential: readonly }]) {
    const row = {
      entry: { provider: 'deepseek-official', displayName: 'Fixture', settingsNs: 'llm-deepseek', settingsPath: [], active: true },
      ...metadata,
    }
    const state = { status: 'ready', rows: [row], namespaces: new Map([['llm-deepseek', namespace]]), writable: true }
    const html = renderToStaticMarkup(createElement(DeepSeekOnboardingDialog, {
      complete() {}, controller: {}, useModels: select => select(state), operations: {}, schema,
      t: key => key, renderSlot() {}, automatic: false, explicit: true,
    }))
    assert.match(input(html), /disabled=""/)
    assert.match(html, /<button[^>]*disabled=""[^>]*>onboardingSave<\/button>/)
    assert.match(html, /<button(?![^>]*disabled)[^>]*>onboardingLater<\/button>/)
  }
})
