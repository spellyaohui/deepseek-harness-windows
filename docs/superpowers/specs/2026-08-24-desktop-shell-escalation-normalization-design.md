# Desktop shell escalation normalization design

Status: approved design, pending written-spec review
Date: 2026-08-24
Target: `win-desktop/src/win-hide-console-rewrite.js`

## 1. Problem

The official `pwsh` and `bash` tools expose optional `sandbox_permissions` and
`justification` fields whenever the mounted executor supports sandboxing. The
model can still send those fields when the current call already runs at the
requested mode or at a wider mode, even when the runtime prompt explicitly says
approval is disabled and the fields must be omitted.

The official tools validate the argument pair and request strict escalation
before running the command. Consequently, an empty justification or a same/
narrower requested mode fails before a harmless command executes. Repeated model
retries can fill a new conversation with tool errors without ever reaching the
shell executor.

## 2. Evidence

The affected session's runtime snapshot declared:

```text
Current DSH file policy: danger-full-access.
Approval prompts are disabled in this session.
Do not set sandbox_permissions.
```

The model nevertheless called `pwsh` with an empty justification and then
alternated `workspace-write` and `danger-full-access`. The tool returned
`invalid justification` followed by repeated `not strictly wider` errors. The
requested `Get-Location` command never executed.

## 3. Decision

Normalize only non-widening shell escalation arguments at the desktop import
boundary.

Before the official tool validates escalation arguments:

1. Resolve the current effective sandbox policy.
2. Compare the requested mode with the current mode.
3. If the requested mode is equal to or narrower than the current mode, replace
   both `sandbox_permissions` and `justification` with `undefined` for this tool
   call.
4. Continue through the official validation and execution path under the
   unchanged current policy.

The strict widening relation is:

```text
read-only       -> workspace-write, danger-full-access
workspace-write -> danger-full-access
danger-full-access -> no wider mode
```

## 4. Preserved strict behavior

- A genuinely wider request still requires both fields.
- A genuinely wider request with a missing or blank justification still fails.
- A genuinely wider request still uses the official approval service and its
  rejection/cancellation behavior.
- `justification` without `sandbox_permissions` remains malformed and fails.
- An unknown requested mode remains subject to the official schema/validation.
- The current policy is never lowered to the model-requested mode.
- No approval-disabled session gains access wider than its standing policy.

## 5. Coverage

Apply the normalization to the official generated ESM modules for:

- `@deepseek-ai/dsh-tool-pwsh`
- `@deepseek-ai/dsh-tool-bash`

Do not alter filesystem tools in this change. The observed Windows failure is
on `pwsh`; `bash` shares the same shell escalation contract and receives parity
to prevent platform-dependent behavior. Filesystem mutations have a separate
operation surface and require their own evidence before changing.

## 6. Implementation boundary

Extend the existing desktop import rewrite rather than editing installed
`node_modules` or forking Harness core.

`rewriteDesktopConsoleSource()` already applies narrowly scoped rewrites to
official modules and is loaded before the desktop Harness service starts. Add a
pure shell-escalation rewrite helper with exact source needles for the current
official tool version. If a future upstream version no longer matches the
expected source shape, the helper must leave the source unchanged and an
integration test must fail, making the incompatibility visible during packaging.

The rewrite mutates only the per-call `args` object reference. It does not
change the registered schema, system prompt, executor, approval service, or
stored session event.

## 7. Error handling

- Same/narrower requests with an empty, placeholder, or populated justification
  execute normally under the existing policy.
- Same/narrower requests whose command/description is otherwise invalid still
  fail through the official validators.
- Real escalation failures preserve the original official error text.
- A failed rewrite match is a build/test failure, not a silent release.

## 8. Tests

Add regression coverage proving that:

1. `danger-full-access` + requested `danger-full-access` drops both fields.
2. `danger-full-access` + requested `workspace-write` drops both fields.
3. `workspace-write` + requested `workspace-write` drops both fields.
4. `workspace-write` + requested `danger-full-access` remains a real escalation.
5. `read-only` + requested `workspace-write` remains a real escalation.
6. A same/narrower request with blank justification reaches command execution.
7. A real escalation with blank justification retains the official validation
   error.
8. Justification without a requested mode retains the official validation
   error.
9. The rewrite applies to the installed Pwsh module.
10. The rewrite applies to the installed Bash module.
11. Existing console-hide and OpenCode stream rewrites continue to pass.

## 9. Acceptance criteria

1. The screenshot sequence no longer produces an error loop: `Get-Location`
   executes under the current `danger-full-access` policy.
2. The desktop wrapper never grants a wider mode without the original strict
   justification and approval path.
3. The packaged Windows application contains the tested rewrite and no direct
   edit to installed Harness packages.
