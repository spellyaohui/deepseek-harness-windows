import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createLateBoundCapabilityRemote,
  modelsSectionDependenciesReady,
  resolveCapabilityRemote,
} from '../lib/client/models-section-availability.js'

const required = {
  controller: {},
  useSnapshot: () => ({}),
  api: {},
  schema: {},
  t: key => key,
  renderSlot: () => null,
  normalizeProviderProfile: () => ({ ok: true, value: {} }),
}

test('Models section remains renderable while capability Remote is unavailable', () => {
  assert.equal(modelsSectionDependenciesReady(required), true)
  assert.equal(modelsSectionDependenciesReady({ ...required, modelCapabilities: undefined }), true)
})

test('Models section still waits for its actual required shell dependencies', () => {
  for (const key of Object.keys(required)) {
    assert.equal(modelsSectionDependenciesReady({ ...required, [key]: undefined }), false, key)
  }
})

test('capability Remote is resolved at probe time instead of registration time', async () => {
  let remote
  const lateBound = createLateBoundCapabilityRemote(
    () => remote,
    () => 'capability Remote unavailable',
  )

  await assert.rejects(lateBound.probe({}), /capability Remote unavailable/)

  remote = { probe: async request => ({ ok: true, value: request }) }
  assert.deepEqual(await lateBound.probe({ modelId: 'late-model' }), {
    ok: true,
    value: { modelId: 'late-model' },
  })
})

test('capability namespace uses optional service lookup without undeclared property access', () => {
  const remote = { probe: async () => ({ ok: true, value: {} }) }
  let propertyRead = false
  const ctx = {
    get remote() {
      propertyRead = true
      throw new Error('cannot get property "remote.model-capabilities" without inject')
    },
    get(name) {
      assert.equal(name, 'remote.model-capabilities')
      return remote
    },
  }

  assert.equal(resolveCapabilityRemote(ctx), remote)
  assert.equal(propertyRead, false)
})
