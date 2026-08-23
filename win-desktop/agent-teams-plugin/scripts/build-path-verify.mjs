import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const clientBundle = resolve(packageRoot, 'lib/client.js')
if (!existsSync(clientBundle)) {
  throw new Error(`Generated client bundle is missing: ${clientBundle}`)
}
const artifacts = [clientBundle, resolve(packageRoot, 'lib/client.js.map')]
  .filter(existsSync)

const virtualPrefixes = ['\\0dsh-css:', '\0dsh-css:']
const absolutePath = /^(?:[A-Za-z]:[\\/]|\/)/
const failures = []

for (const artifact of artifacts) {
  const content = readFileSync(artifact, 'utf8')
  for (const prefix of virtualPrefixes) {
    let offset = content.indexOf(prefix)
    while (offset !== -1) {
      const moduleId = content.slice(offset + prefix.length)
      if (absolutePath.test(moduleId)) {
        failures.push(`${artifact}: ${prefix}${moduleId.split(/\r?\n|"/u, 1)[0]}`)
      }
      offset = content.indexOf(prefix, offset + prefix.length)
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Generated artifacts contain absolute CSS virtual module ids:\n${failures.join('\n')}`)
}

console.log(`build-path verification passed for ${artifacts.length} artifact(s)`)
