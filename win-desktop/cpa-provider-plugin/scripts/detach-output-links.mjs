import { copyFileSync, existsSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Replace generated files with byte-identical private copies.
 *
 * Local `file:` installs and Windows indexers can keep an existing generated
 * file mapped while TypeScript tries to truncate it. Replacing each directory
 * entry before compilation leaves any consumer on the old inode and gives the
 * CPA build a private writable output file. Symlinks are never followed.
 *
 * @param {string} outputRoot generated directory to make private.
 * @returns {number} number of detached files.
 */
export function detachGeneratedOutputs(outputRoot) {
  if (!existsSync(outputRoot)) return 0
  let detached = 0
  for (const entry of readdirSync(outputRoot, { withFileTypes: true })) {
    const target = join(outputRoot, entry.name)
    if (entry.isDirectory()) {
      detached += detachGeneratedOutputs(target)
      continue
    }
    if (!entry.isFile()) continue

    const temporary = `${target}.detach-${process.pid}`
    try {
      copyFileSync(target, temporary)
      renameSync(temporary, target)
      detached += 1
    } catch (error) {
      try { unlinkSync(temporary) } catch { /* preserve the original diagnostic */ }
      throw new Error(
        `Cannot detach generated output "${target}". Close consumers of this build directory and retry.`,
        { cause: error },
      )
    }
  }
  return detached
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const count = detachGeneratedOutputs(join(packageRoot, 'lib'))
  if (count > 0) console.log(`[cpa-output-links] detached ${count} generated files`)
}
