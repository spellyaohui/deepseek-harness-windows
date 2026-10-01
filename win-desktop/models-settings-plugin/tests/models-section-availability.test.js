import assert from 'node:assert/strict'
import test from 'node:test'

import {
  modelsSectionDependenciesReady,
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

test('Models section remains renderable with native editing services only', () => {
  assert.equal(modelsSectionDependenciesReady(required), true)
  assert.equal(modelsSectionDependenciesReady({ ...required, modelCapabilities: undefined }), true)
})

test('Models section still waits for its actual required shell dependencies', () => {
  for (const key of Object.keys(required)) {
    assert.equal(modelsSectionDependenciesReady({ ...required, [key]: undefined }), false, key)
  }
})
