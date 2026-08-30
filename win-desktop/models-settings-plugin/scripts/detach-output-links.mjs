import { copyFileSync, existsSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Replace generated files with byte-identical private copies.
 *
 * pnpm can hardlink a local `file:` package into another plugin's node_modules.
 * A running consumer or indexer can memory-map either directory entry;
 * TypeScript/Rolldown then cannot truncate the source output on Windows
 * (ERROR_USER_MAPPED_FILE / os error 1224). Replacing the source entry leaves
 * the consumer's old inode untouched and gives the next build a writable file.
 * Every existing regular file is replaced, not only files whose link count is
 * greater than one, because Windows does not expose all mapped-file ownership
 * through `nlink`. Nested generated directories are traversed, while symlinks
 * are never followed.
 *
 * @param outputRoot - generated directory to make private.
 * @returns number of detached files.
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
  if (count > 0) console.log(`[models-output-links] detached ${count} generated files`)
}
