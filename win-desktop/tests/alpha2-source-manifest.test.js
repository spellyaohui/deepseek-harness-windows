import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALPHA2_COMMIT,
  ALPHA2_TAG,
  sha256File,
  validateAlpha2Manifest,
} from '../scripts/verify-alpha2-source.mjs'

const testRoot = mkdtempSync(join(tmpdir(), 'dsh-alpha2-manifest-'))
after(() => rmSync(testRoot, { recursive: true, force: true }))

test('Alpha.2 manifest requires the fixed source identity and SHA-256 for every package', () => {
  const tarball = join(testRoot, 'fixture.tgz')
  writeFileSync(tarball, 'verified fixture')
  const sha256 = sha256File(tarball)
  const manifest = {
    tag: ALPHA2_TAG,
    commit: ALPHA2_COMMIT,
    sourceVersion: '0.1.2-alpha.2',
    node: 'v26.7.0',
    pnpm: '11.7.0',
    vendorTarballPath: 'upstream/dsh-v0.1.2-alpha.2/tarballs/vendor',
    dshTarballPath: 'upstream/dsh-v0.1.2-alpha.2/tarballs/dsh',
    createdAt: '2026-08-31T00:00:00.000Z',
    families: { vendor: ['@example/vendor'], dsh: ['@example/dsh'] },
    packages: [
      { family: 'vendor', file: 'vendor.tgz', name: '@example/vendor', version: '1.0.0', sha256 },
      { family: 'dsh', file: 'dsh.tgz', name: '@example/dsh', version: '0.1.2-alpha.2', sha256 },
    ],
    packedInstall: { vendor: true, dsh: true, cliVersion: '0.1.2-alpha.2' },
  }

  assert.doesNotThrow(() => validateAlpha2Manifest(manifest, { expectedPackageCount: 2 }))
  assert.throws(
    () => validateAlpha2Manifest({ ...manifest, commit: 'wrong' }, { expectedPackageCount: 2 }),
    /commit mismatch/,
  )
  assert.throws(
    () => validateAlpha2Manifest({
      ...manifest,
      packages: manifest.packages.map(({ sha256: _sha256, ...entry }) => entry),
    }, { expectedPackageCount: 2 }),
    /SHA-256/,
  )
})

test('SHA-256 evidence changes when a tarball changes', () => {
  const tarball = join(testRoot, 'tamper.tgz')
  writeFileSync(tarball, 'first payload')
  const before = sha256File(tarball)
  writeFileSync(tarball, 'second payload')
  assert.notEqual(sha256File(tarball), before)
})
