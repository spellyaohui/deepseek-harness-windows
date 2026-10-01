/** Desktop opt-out for the official model-facing tool suite, across all presets. */
export function rewriteDesktopWebToolsSource(source, moduleUrl) {
  const url = decodeURIComponent(String(moduleUrl)).replaceAll('\\', '/')
  if (!/\/node_modules\/@deepseek-ai\/dsh-tool-web\/lib\/index\.js$/.test(url)) return source
  const marker = '// Desktop built-in web tools preference (startup snapshot).'
  if (source.includes(marker)) return source
  const needle = 'function apply(ctx, config) {'
  const injection = 'const inject = ['
  if (source.split(needle).length !== 2
    || source.split(injection).length !== 2
    || !source.includes('if (resolved.search)')
    || !source.includes('if (resolved.fetch)')) {
    throw new Error('Desktop built-in web tools activation boundary drift')
  }
  // Keep ctx.web and its providers available to the Cordis runner. Default-on
  // leaves explicit user preset disables intact; opt-out applies at every mount,
  // including late presets and spawned members, without persisting preset copies.
  // A legacy user patch may disable the whole Web service. An opt-out suite
  // registers nothing, so it must not keep presets waiting for that service.
  // Resolve injection once at module load, using the desktop startup snapshot.
  return source.replace(injection, 'const inject = process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS === "0" ? ["tools", "systemPrompt"] : [')
    .replace(needle, `${needle}
\t${marker}
\tif (process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS === "0") config = { ...config, search: false, fetch: false };`)
}
