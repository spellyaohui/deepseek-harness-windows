import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { builtinModels } from '@earendil-works/pi-ai/providers/all'

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@deepseek-ai/dsh-client-store') return { url: 'data:text/javascript,export const createSnapshotStore = () => { throw new Error("unexpected page store mount") }', shortCircuit: true }
  return next(specifier, context)
} })
const { providerUsable, onboardingReadiness } = await import('../models-settings-plugin/lib/client/store.js')

test('official native API-key login remains usable when every environment reference is absent', async () => {
  const models = builtinModels({
    credentials: {
      async read(id) { return id === 'deepseek' ? { type: 'api_key', key: 'fixture-not-a-secret' } : undefined },
      async list() { return [{ providerId: 'deepseek', type: 'api_key' }] },
      async modify() { throw new Error('read-only fixture') },
      async delete() { throw new Error('read-only fixture') },
    },
    authContext: { async env() { return undefined }, async fileExists() { return false } },
  })
  assert.notEqual(await models.getAuth('deepseek'), undefined)
  const row = {
    entry: { provider: 'deepseek', active: true, nativeAuth: { env: ['DEEPSEEK_API_KEY'], oauth: false } },
    apiKeyEnv: undefined, credential: undefined,
    credentialChecks: { DEEPSEEK_API_KEY: { configured: false, writable: true } },
  }
  assert.equal(providerUsable(row), true, 'reference checks do not describe stored login records')
  assert.deepEqual(onboardingReadiness({ status: 'ready', rows: [row] }), { kind: 'provider-ready' })
})
