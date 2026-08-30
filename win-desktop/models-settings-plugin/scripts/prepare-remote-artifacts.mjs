import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const typesRoot = join(root, 'lib', 'types')
const remoteJs = join(root, 'lib', 'remote.js')
const remoteDts = join(typesRoot, 'remote.d.ts')
const generatedJs = join(root, 'lib', 'typert.remote-client.js')
const generatedDts = join(root, 'lib', 'typert.remote-client.d.ts')

mkdirSync(dirname(generatedJs), { recursive: true })
copyFileSync(remoteJs, generatedJs)
const declaration = readFileSync(remoteDts, 'utf8')
  .replaceAll("'./capability-probe-service.ts'", "'./types/capability-probe-service.d.ts'")
  .replaceAll("'./capability-contract.ts'", "'./types/capability-contract.d.ts'")
writeFileSync(generatedDts, declaration, 'utf8')
