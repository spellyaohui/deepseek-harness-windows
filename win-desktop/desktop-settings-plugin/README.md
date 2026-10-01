# Desktop Settings 0.1.4

The native 扩展设置 section retains the stable desktop slot id and uses the pinned Harness global font, 14px regular text,
12px helper text, and the official 13px form-label/control typography. Its
content aligns with the native settings column. Control surface, border and
radius tokens come from the official theme.

Window close behavior still saves immediately through the desktop IPC bridge,
disables its selector during saving, announces success and rolls back on failure.
The official Switch controls builtinWebToolsEnabled, default true. It saves
immediately through the same IPC store; pending writes disable both controls,
and failed writes restore the committed state. Tool changes require app restart.
The wrapper snapshots the setting for the Host preload and changes only the
official dsh-tool-web activation config. No preset copies or user profile edits
are persisted. Explicit preset disables are retained when the desktop switch is on.
ctx.web, its providers and independently registered tools remain available.
The plugin does not modify model or AgentTeams routing.

Evidence: full offline verify:upstream and browser-computed typography, layout
and keyboard-focus checks, seven offline real-store/loader/runtime regressions,
and real Electron IPC save/restart/failure rollback. Provenance remains independent local desktop code,
registered in docs/UPSTREAM_MAINTENANCE.md.
