import { existsSync, readFileSync } from 'node:fs'
import { posix, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const clientBundle = resolve(packageRoot, 'lib/client.js')
if (!existsSync(clientBundle)) {
  throw new Error(`Generated client bundle is missing: ${clientBundle}`)
}
const artifacts = [clientBundle, resolve(packageRoot, 'lib/client.js.map')]
  .filter(existsSync)

const virtualPrefixes = ['\\0dsh-css:', '\0dsh-css:']

/** Return the path payload of every virtual CSS id embedded in a string. */
function virtualCssPaths(value) {
  const paths = []
  for (const prefix of virtualPrefixes) {
    let offset = value.indexOf(prefix)
    while (offset !== -1) {
      paths.push(value.slice(offset + prefix.length))
      offset = value.indexOf(prefix, offset + prefix.length)
    }
  }
  return paths
}

/** Node's native path APIs cover drive, UNC/device, and POSIX absolute paths. */
function isAbsoluteVirtualCssPath(value) {
  return win32.isAbsolute(value) || posix.isAbsolute(value)
}

/** Keep the verifier's bypass cases executable in the package verification chain. */
function assertSyntheticCases() {
  const actualNul = '\0dsh-css:'
  const literalBackslashZero = '\\0dsh-css:'
  const cases = [
    ['Windows drive with actual NUL', actualNul + 'C:\\agent\\style.css.mjs', true],
    ['Windows drive with literal backslash-zero', literalBackslashZero + 'C:\\agent\\style.css.mjs', true],
    ['Windows UNC path', actualNul + '\\\\server\\share\\style.css.mjs', true],
    ['Windows device path', actualNul + '\\\\?\\C:\\agent\\style.css.mjs', true],
    ['POSIX path', actualNul + '/agent/style.css.mjs', true],
    ['safe relative path', actualNul + 'src/client/style.css.mjs', false],
  ]
  for (const [name, value, unsafe] of cases) {
    const detected = virtualCssPaths(value).some(isAbsoluteVirtualCssPath)
    if (detected !== unsafe) {
      throw new Error(`build-path synthetic assertion failed: ${name}`)
    }
  }

  const encodedMap = JSON.stringify({
    sources: [actualNul + 'C:\\agent\\style.css.mjs'],
  })
  const decodedMap = JSON.parse(encodedMap)
  const decodedDetected = decodedMap.sources.some(source =>
    virtualCssPaths(source).some(isAbsoluteVirtualCssPath),
  )
  if (!decodedDetected) {
    throw new Error('build-path synthetic assertion failed: JSON-escaped source map')
  }
}

assertSyntheticCases()

const failures = []
for (const artifact of artifacts) {
  const content = readFileSync(artifact, 'utf8')
  if (artifact.endsWith('.map')) {
    const sourceMap = JSON.parse(content)
    for (const source of sourceMap.sources ?? []) {
      if (typeof source !== 'string') continue
      for (const virtualPath of virtualCssPaths(source)) {
        if (isAbsoluteVirtualCssPath(virtualPath)) {
          failures.push(`${artifact}: source map virtual CSS id ${source}`)
        }
      }
    }
    continue
  }

  for (const virtualPath of virtualCssPaths(content)) {
    if (isAbsoluteVirtualCssPath(virtualPath)) {
      failures.push(`${artifact}: bundle virtual CSS id ${virtualPath}`)
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Generated artifacts contain absolute CSS virtual module ids:\n${failures.join('\n')}`)
}

console.log(`build-path verification passed for ${artifacts.length} artifact(s)`)
