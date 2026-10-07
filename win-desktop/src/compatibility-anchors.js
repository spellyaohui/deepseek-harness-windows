/** Executable registry for the fixed Harness build; no network or mutable state. */
export const HARNESS_REVISION = '639ed015397290b3745d163aafe02ffee4aa3f84'
const rule = (id, packageName, file, count, pattern, classification, regression, retainedBecause) => Object.freeze({
  id, packageName, version: '0.2.0-rc.2', revision: HARNESS_REVISION, file, count, pattern,
  classification, regression, retainedBecause, failure: 'throw before evaluating a drifted target module',
})
export const compatibilityAnchors = Object.freeze([
  rule('profile-default-layer', 'dsh-app-boot', /^index\.js$/, 1, /layers\.push\(\.\.\.__dshDesktopProfileLayer\(dir\)\)/g, 'REAPPLY', 'agent-teams-settings-save.test.js', 'The official boot API has no additive defaults layer below Profile/Home/CLI.'),
  rule('profile-install-anchor', 'dsh', /^profile-boot-[^/]+\.js$/, 1, /const INSTALL_ANCHOR = "[^"\n]+";/g, 'REAPPLY', 'verify-alpha2-runtime-closure.test.js', 'Use the official resolver with the complete desktop installation closure.'),
  rule('subprocess-spawn-hide', 'dsh-subprocess-local', /^runner-launch-[^/]+\.js$/, 1, /detached: platform !== "win32",\s*windowsHide: platform === "win32"/g, 'UPSTREAM_EQUIVALENT', 'win-hide-console.test.js', 'Upstream owns spawning visibility; no local spawn rewrite is needed.'),
  rule('subprocess-taskkill-hide', 'dsh-subprocess-local', /^runner-launch-[^/]+\.js$/, 2, /stdio: "ignore",\s*windowsHide: true/g, 'UPSTREAM_EQUIVALENT', 'win-hide-console.test.js', 'Both official taskkill paths already hide their consoles.'),
  rule('subprocess-preload', 'dsh-subprocess-local', /^runner-launch-[^/]+\.js$/, 2, 'hook-import', 'REAPPLY', 'win-hide-console-descendants.test.js', 'Inherited process-local NODE_OPTIONS can be filtered; default runner argv must carry the dependency-free preload.'),
  rule('sandbox-preload', 'dsh-sandbox-local', /^index\.js$/, 2, 'hook-import', 'REAPPLY', 'win-hide-console-descendants.test.js', 'Preserve user runner overrides; the public override is not an additive default-argv seam.'),
  rule('pwsh-redundant-escalation', 'dsh-tool-pwsh', /^index\.js$/, 1, /args = normalizeRedundantEscalationArgs\(args, standingPolicy\?\.mode\)/g, 'REAPPLY', 'win-hide-console.test.js', 'Public Tools hooks keep logged arguments immutable; normalize only at the official validator body.'),
  rule('bash-redundant-escalation', 'dsh-tool-bash', /^index\.js$/, 1, /args = normalizeRedundantEscalationArgs\(args, standingPolicy\?\.mode\)/g, 'REAPPLY', 'win-hide-console.test.js', 'The official validator alone does not normalize the redundant request passed onward to the executor.'),
  rule('fs-redundant-escalation', 'dsh-tool-fs', /^index\.js$/, 1, /args = normalizeRedundantEscalationArgs\(args, standingPolicy\?\.mode\)/g, 'REAPPLY', 'win-hide-console.test.js', 'Policy resolution owns local argument normalization; pre-dispatch hooks cannot replace identity arguments.'),
  rule('bounded-period-quota', 'dsh-llm', /^index\.js$/, 1, /return isExplicitPeriodUsageLimitExceeded\(detail\) \|\|/g, 'REAPPLY', 'win-hide-console.test.js', 'No public extension of the private failure classifier; throwing from a stream hook does not preserve QUOTA classification.'),
  rule('grep-durable-alias', 'dsh-llm-pi-ai', /^index\.js$/, 1, /arguments: JSON\.stringify\(normalizeKnownToolArgumentAliases\(event\.toolCall\.name, event\.toolCall\.arguments\)\)/g, 'REAPPLY', 'grep-tool-argument-compatibility.test.js', 'The exact final adapter block is the proven durable seam; no equivalent earlier argument rewrite is exposed.'),
  rule('web-activation', 'dsh-tool-web', /^index\.js$/, 1, /\/\/ Desktop built-in web tools preference \(startup snapshot\)\./g, 'REAPPLY', 'desktop-web-tools.test.js', 'Apply opt-out at every official mount while retaining web providers and independent tools.'),
])

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function assertCompatibilityAnchors(source, moduleUrl, hookImportUrl) {
  const url = decodeURIComponent(String(moduleUrl)).replaceAll('\\', '/')
  for (const entry of compatibilityAnchors) {
    const marker = `/@deepseek-ai/${entry.packageName}/lib/`
    const at = url.lastIndexOf(marker)
    if (at < 0 || !entry.file.test(url.slice(at + marker.length))) continue
    const pattern = entry.pattern === 'hook-import'
      ? new RegExp(`process\\.execPath,\\s*"--import",\\s*${escape(JSON.stringify(hookImportUrl))}`, 'g')
      : entry.pattern
    const actual = [...source.matchAll(pattern)].length
    if (actual !== entry.count) throw new Error(`Desktop compatibility anchor drift: ${entry.id}; expected ${entry.count}, found ${actual}; fixed Harness ${entry.version} ${entry.revision}`)
  }
}
