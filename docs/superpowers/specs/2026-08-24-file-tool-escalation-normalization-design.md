# File Tool Escalation Normalization Design

## Problem

The Windows wrapper `0.1.1-rc.7` normalizes redundant sandbox escalation
arguments for the official Pwsh and Bash tools. The same model-generated
arguments can reach `@deepseek-ai/dsh-tool-fs` `write` and `edit`, whose shared
`FsSandboxController.resolvePolicy()` still sends a same-mode request to
`approveEscalation()`. In a `danger-full-access` session this fails with:

```text
sandbox escalation to "danger-full-access" is not strictly wider than this call's current "danger-full-access" mode
```

Live `rc.7` session evidence showed post-upgrade failures from `edit`; older
child sessions also showed `write`. Read-only `read` calls do not use this
mutation escalation controller and are outside the fix.

## Design

Extend the existing ESM loader rewrite to recognize
`@deepseek-ai/dsh-tool-fs`. Rewrite the shared
`FsSandboxController.resolvePolicy()` sequence so it:

1. Resolves the standing sandbox policy.
2. Calls the existing `normalizeRedundantEscalationArgs(args, mode)` helper.
3. Validates the normalized argument pair.
4. Returns the standing policy when no real widening request remains.
5. Preserves the official approval flow for a strictly wider request.

The installed upstream package remains untouched on disk. The runtime loader
applies the compatibility rewrite in memory, matching the existing Pwsh/Bash
approach.

## Safety boundaries

- Strip only known requested modes whose rank is equal to or below the current
  known mode.
- Preserve unknown current or requested modes for official validation.
- Preserve invalid argument-pair errors, including justification without mode
  and real widening without a non-empty justification.
- Preserve approval-before-mutation for valid widening requests.
- Do not change `read`, filesystem observation guards, path resolution, or
  provider mutation behavior.

## Verification

- Source rewrite test against the actual installed `dsh-tool-fs` bundle.
- Runtime fixture imports the actual bundle through the desktop loader and
  executes both `write` and `edit` with same-mode, lower-mode, invalid, and
  valid widening inputs.
- Existing Pwsh/Bash, console hiding, OpenCode, plugin, and desktop tests remain
  green through `npm run verify:upstream`.

## Release identity

The wrapper version becomes `0.1.1-rc.8`; AgentTeams remains
`0.1.13-desktop.3` because this fix is owned by the Windows wrapper loader.
