# Repository rules

These rules apply to the entire repository. This is a public Windows wrapper
around upstream DeepSeek Harness packages plus independently owned local
plugins and compatibility rewrites.

## Canonical workspace and branch

- The development workspace is `D:\Trae\其他\deepseek-harness`, on `main`.
  Do not create nested branch checkouts or worktrees unless the user explicitly
  requests one. GitHub retains only the `main` branch; release tags remain.
- Synchronization software excludes `.git`. Before starting work on another
  machine, fetch `origin/main` and compare its revision and source files with
  the synchronized workspace. Preserve and review differences before changing
  Git metadata; never reset or clean the workspace to make it match a stale ref.
- `upstream/` holds ignored build inputs, toolchains and verification material.
  Keep backups of previous source directories outside this workspace.

## Repository safety

- Never commit credentials, Tokens, API keys, `.env` files, runtime sessions,
  `.agent-teams/`, logs, screenshots, exported conversations, installers,
  package output, or local upstream checkouts.
- Treat unknown tracked or untracked files as user-owned. Do not delete or
  overwrite them to make a merge, test, or package command succeed.
- Do not install, publish, package, or access the network as part of the
  upstream regression gate.

## Upstream refresh is a capability migration

Before importing a new upstream Harness or AgentTeams revision, read
`docs/UPSTREAM_MAINTENANCE.md` and classify every registered local capability:

- `UPSTREAM_EQUIVALENT`: upstream now implements the same observable behavior.
  Keep the local regression test and prove it passes against the upstream
  implementation before removing duplicate local code.
- `REAPPLY`: upstream does not implement the capability. Reapply the smallest
  compatible local patch and retain its owning plugin and regression tests.
- `SUPERSEDED_BY_DESIGN`: upstream changes the architecture, but the user-facing
  requirement still exists. Document the replacement ownership and migrate the
  existing regression before removing the old implementation.

Never delete a local plugin, dependency, settings section, rewrite, test, or
provenance record merely to resolve an upstream conflict. A clean merge is not
evidence that the local capability is preserved.

## Capability ownership boundaries

- AgentTeams owns subagent member defaults, isolated temporary-call defaults, explicit/route-aware reasoning,
  shared model-catalog consumption, Team/Native routing, and task lifecycle.
- CPA owns CLIProxyAPI address/credential handling, model discovery, reasoning
  vocabulary, per-model context/output capacities, and the native-provider
  profile normalization seam. CPA must not register a second visible Models
  card; the single native `CPA / CLIProxyAPI` row owns its editor chrome.
- The Models settings fork owns the provider-neutral native editor and its
  additive slot/normalization seam; it must not contain CPA-specific rules.
- Desktop Settings owns the Harness-native `扩展设置` section (stable slot id
  `desktop`), window behavior and built-in web-tools preference bridge. The
  wrapper owns the exact official `dsh-tool-web` activation rewrite: opt-out
  removes search/fetch registrations and guidance from every mount, retaining
  ctx.web, providers, user preset declarations and independent MCP tools.
- Wrapper tool-call guidance owns only the compact cross-tool system-prompt
  discipline for optional arguments and failed-call retries.
- The Windows wrapper owns shell normalization, hidden-console behavior,
  provider-neutral exact `grep` argument alias normalization at the pi-ai
  durable boundary, bounded-period usage-quota classification at the dsh-llm
  loader boundary, manual model declaration integration, plugin mounting, and
  startup integration.
- The `dsh-output-limit-finish` plugin owns one provider-neutral `llm/stream`
  listener: a `stop` finish whose output reached the request's (or the
  adapter default) `maxTokens` is reported as the official `max-tokens`
  reason. It must never match on gateway, provider or model names and leaves
  every other finish untouched; keep `tests/output-limit-finish.test.js`.
- Native Subagent and AgentTeams settings remain separately visible. The
  official Native page owns native depth, capacity, and allowed model routes;
  AgentTeams owns role-specific Provider/model/reasoning and Team lifecycle.
  This user-approved Harness 0.1.7 separation supersedes the Alpha.2 native-card
  hiding rewrite. The Subagent Host namespace, saved settings, official runtime
  dependencies, and AgentTeams `memberProvider: spawn` path stay installed and
  active. Keep `tests/subagent-settings-card-visibility.test.js` to prove the
  wrapper leaves official initial and HMR client snapshots unmodified and both
  settings clients remain available.

## Release `v0.1.1-rc.17` interaction invariants

- CPA appears once in “设置 → 模型”, through the native configured-provider
  row. The expandable native editor must retain API address, Token, model
  discovery, model selection, text/image input modalities, raw context/output
  capacities, and model-specific R reasoning levels.
- CPA's path-scoped, revision-guarded startup normalization preserves credentials, raw capacities, explicit image/text choices, malformed declarations and manual reasoning subsets. Missing/empty legacy model input becomes text; new models default to text and all six explicit reasoning levels. Never overwrite a user reasoning subset on Save or startup.
- The `桌面` section has no save button. Changing close behavior immediately
  persists through the existing IPC bridge, disables the selector while the
  write is pending, announces success, and restores the prior committed value
  on failure.
- OpenCode compatibility is permanently removed at desktop `0.2.0-rc.16` by
  user request: no catalog reconciliation, `model-fetcher`, stream recovery,
  Kimi Schema lowering or `x-opencode-session` rewrite. Do not restore it
  during refreshes or conflict resolution; the local capability manifest
  asserts its absence.
- Before the Agent Loop receives a pi-ai tool call, the wrapper may normalize
  the exact `grep` argument alias only when the call has no own `pattern` and
  its `description` wholly matches one single-line `pattern: <non-empty value>`
  form. This rule is provider-neutral and model-neutral, never overwrites an
  existing `pattern`, and leaves every other malformed call to the upstream
  strict validator. The upstream grep Schema must continue requiring `pattern`;
  future refreshes must retain the dedicated regression or prove an
  `UPSTREAM_EQUIVALENT` implementation.
- Before `dsh-llm` classifies a provider failure, the wrapper recognizes an
  explicit bounded-period usage limit (for example, `weekly usage limit`
  reached/exceeded) as terminal `QUOTA`. Ordinary transient `rate limit`
  responses and standalone quota-reset notices remain retryable or unknown;
  future refreshes must retain the dedicated loader regression or prove an
  `UPSTREAM_EQUIVALENT` classifier.
- Every future upstream refresh must classify these behaviors as
  `UPSTREAM_EQUIVALENT`, `REAPPLY`, or `SUPERSEDED_BY_DESIGN`, retain their
  regressions, and run `npm run verify:upstream` before packaging.

## Alpha.2 Web authentication startup invariant

- Desktop-owned plugin insertions are a default layer beneath profile, Home and CLI settings. Do not launch the AgentTeams/CPA/Desktop Settings/guidance insertions as a final `--patch` overlay: that makes user saves target an entry before it exists. Keep the scoped, drift-guarded app-boot seam and the real SettingsForms/ConfigEditor save/restart regression, including Home/CLI refusal and stale-revision protection. Never weaken the official ConfigEditor checks or rewrite a user's patch/manifest to make a save succeed.

- Alpha.2 prints a canonical loopback URL containing a fresh process token.
  The Windows wrapper must pass the complete `http://127.0.0.1:<port>/?token=...`
  URL from the `dsh web:` readiness line to Electron; capturing only the origin
  produces the upstream authentication-required page instead of the Web UI.
- A bare loopback origin and the browser-opening notice are not valid readiness
  signals. The process token is used only for local navigation and must not be
  persisted, copied to documentation, or emitted by wrapper diagnostics.
- Future Web/startup refreshes must retain `tests/dsh-web-auth-url.test.js` or
  prove an `UPSTREAM_EQUIVALENT` authenticated handoff before changing this
  boundary.

## Windows console-hide interaction invariants

- The child-process preload covers `spawn`, `spawnSync`, `execSync`,
  `execFile`, `execFileSync` and `fork`; asynchronous `exec` remains covered
  through Node's exported `execFile`. Legal omitted, undefined and null options
  overloads retain callbacks, stdio, output and non-zero exit errors. Native
  invalid overloads, including a null third options slot for spawn/spawnSync,
  must retain their original rejection.
- `windowsHide: false` is an explicit visibility opt-out. Preserve invalid
  explicit values for each runtime's native validation/coercion, and never
  mutate caller options, including Electron fork options. Keep the real native
  boundary regressions in `tests/win-hide-console.test.js` through refreshes.
- An npm `.cmd` shim or a multi-process MCP chain alone does not establish a
  visible-console cause. Keep compatibility provider/tool neutral; do not
  replace user MCP commands with machine-specific CodeGraph paths.

## Wrapper tool-call guidance and AUTO removal invariants

- `@deepseek-ai/dsh-tool-call-guidance` registers one system-prompt section at
  order `110`, before AgentTeams, and stays at or below 500 characters. It must
  not register tools, settings UI, Provider rules, or lifecycle state.
- Its four rules remain provider/model neutral: follow the current tool Schema
  and explicit context; omit unknown or blank optional properties; preserve an
  empty value only when the tool explicitly documents its meaning; after a
  failure, read the error/next step and never repeat the same invalid arguments
  unchanged; an invalid-arguments rejection is the caller's mistake, so fix the
  named field and retry instead of reporting a tool fault.
- The AUTO permission plugin is intentionally absent from dependencies,
  lockfile, desktop Patch composition, healing expectations, prompt, UI, and
  documentation. Do not restore it during conflict resolution. Do not migrate
  old AUTO sessions or delete stale user Profile caches.

## AgentTeams `v0.1.16-rc.1` interaction invariants

- The Windows-owned `software-delivery` default provides Chinese description,
  protocol, team guidance and distinct analyst/implementer/tester/reviewer role
  prompts. Stable member IDs and role reasoning/routing stay unchanged. Read must
  preserve saved V2 prompts; new defaults are applied only by an explicit
  draft restore and Save. Restore eligibility depends on the selected Profile's
  difference from its built-in baseline, even when the saved draft is clean.
  Retry/save controls remain single-line in narrow windows and long errors wrap.
  Preserve profile-store/default-YAML parity, member-persona injection and the
  3,500-character captain prompt budget regressions.

- Global AgentTeams settings own Team/Native delegation and the separate default
  Provider/model/reasoning policy for temporary captain `subagent` calls in Team
  mode. This default never overrides Profile roles or native-mode settings.
  Each Profile
  role owns its Provider, model, and `reasoning_mode`. An `explicit` role must
  use its configured Provider/model/effort; only `target-default` and
  `route-aware` may resolve from the captain or target route. Do not restore a
  global member-model override or add a legacy Profile/Team migration layer.
- Temporary calls use the saved policy only when no explicit tool route/effort
  is supplied. With no saved temporary policy, retain existing captain/role
  selection. The native tool Schema and tool-supplied route allowlists stay
  strict; the trusted saved default is not a new advertised model override.
  Unavailable configured models fail before Team/member/task writes, without
  falling back to the captain. Concurrent and repeated calls remain supported
  within native and Team limits; never assign new work to a busy child or reuse
  a child with a different pinned route/reasoning policy. Changing the default
  affects subsequent selections, not existing members. Save the complete policy
  through one SettingsForms CAS operation; cancelling/editing a failed draft
  retires its stale retry payload. Preserve real-runtime and save/restart tests.
- The staged member editor and its activity snapshot must preserve all three
  role reasoning modes. `reasoningMode` is required in every V2 member record;
  only `explicit` Web mutations may carry `reasoningEffort`. Materialized
  effort captured for `target-default` or `route-aware` cold recovery must
  never be reinterpreted as an explicit editor override. Switching an existing
  `explicit` member to either non-explicit mode must clear the old explicit
  effort before selection; omitted effort may be retained only when both the
  stored and target modes are `explicit`.
- `agent_teams_status` is a clean read-only probe before the caller creates or
  joins a Team and must return `active: false`. `agent_teams_delete` is an
  idempotent no-op before the captain creates a Team. Claim, update, and
  messaging tools remain participant-authorized and must not inherit those
  relaxed probe/delete semantics.
- `agent_teams_status` defaults to a read-only compact summary and never wakes
  members or acknowledges mail. It retains task/dependency/attempt/attempt_id,
  verdict/findings, coverage, delivery blockers, and new mailbox information;
  `detail: "full"` is required for complete task outputs and stable
  route/profile details. `acknowledge: true` is an explicit mailbox-consume
  action after the displayed entries have been processed. `wake: "recover"`
  is captain-only and reserved for post-restart or clearly stuck ready work/mail.
  Repeated unchanged summaries may collapse to a heartbeat, but full detail
  remains available on demand.
- `agent_teams_approve` must first observe `active=true` and `phase=staged` for
  the current captain. A generic “继续”/“确认” message without a staged Team
  is not approval evidence; when no Team exists, the tool returns an inactive
  no-op with the `agent_teams_create` next step and must not write state.
- Ordinary delegation defaults to `approval="automatic"`: omit the optional
  Team name so the plugin generates it, and when a captain-planning Profile has
  no seed tasks the Captain must create the task names/contracts itself instead
  of asking the user to type one in the Web panel. Use `approval="required"`
  only when the user explicitly requests plan review before startup; its
  trusted user-approval boundary remains strict and cannot be self-approved.
- Every staged Web member/task mutation and Web approval must carry the current
  activity snapshot `planRevision`. The Host validates it with the Team CAS
  contract, and Web approval must prepare and consume a one-time credential for
  that same revision. Raw AgentTeams state, plan, halt, artwork and model-catalog
  routes must remain behind Alpha.2 Connection authentication plus Host/Origin
  checks and fail closed while Connection is unavailable.
- Blank optional task strings from non-GPT tool calls must be omitted before
  strict V2 persistence. Profile and Team state still require
  `schemaVersion: 2`; malformed or older documents are rejected, not migrated.
- The captain usage section starts with the unknown/inactive/staged/running/
  halted lifecycle state machine and the complete built-in `software-delivery`
  output must remain at or below 3,500 characters. Prompt compaction must retain
  reasoning ownership, Profile selection, staged approval, DAG dependencies,
  scheduler/attempt/reassignment safety, quality gates, halt/resume, cleanup,
  and explicit deployment confirmation.
- At `agent_teams_create`, a missing, empty, or whitespace-only optional
  `profile` means no Profile and creates an ad-hoc Team. A non-empty name must
  exactly match a configured Profile and must fail before durable writes or
  member spawning when unknown. Keep the model-facing parameter an optional
  string with configured names in its description; do not replace it with an
  enum or add a default Profile.
- A running Team may queue implementation behind an open requirements task
  only through an explicit dependency. The scheduler must still wait for that
  requirements task to finish with `verdict=pass` before implementation runs.
- `agent_teams_edit_plan` may write only a staged Team. Calling it for a running
  Team returns structured `already_running` guidance with zero plan writes and
  points the caller to create-task, message, reassign, or status tools. Staged
  edits remain one atomic batch and support the complete quality contract.
  The activity snapshot, browser form, Host payload parser, and durable
  mutation must round-trip every quality field; empty arrays intentionally
  clear list fields instead of being omitted or replaced by stale values. The
  Host boundary must reject any list containing a non-string item instead of
  filtering it into a partial update or accidental clear.
- Implementation and repair deliverables must be covered by `inScope`.
  Completion with `changedPaths: []` requires a non-empty `noChangesReason`,
  and an empty changed-path list can never hide declared deliverables. Ordinary
  `work` tasks retain their output-only completion compatibility.
- At the `create_task` boundary, blank or whitespace `assignee` means the
  shared task pool, while the literal `captain` is the reserved captain-owned
  task alias; only other non-empty values are looked up as active member names.
  Quality errors must tell the model to use concrete workspace-relative POSIX
  paths for deliverables and to put abstract outcomes in task prose; protected
  `.env`, secret, and `.git` paths remain excluded.
- Preserve the rc.26 regressions in AgentTeams quality-gate/lifecycle suites
  and the wrapper capability manifest. Future Harness or AgentTeams refreshes
  must make these tests pass against the classified owner; deleting, skipping,
  or weakening a regression is not an acceptable conflict resolution.
- Normalize blank optional task fields only at new model-facing tool-write
  boundaries; strict V2 durable reads and malformed legacy state remain
  fail-closed with no migration layer.
- A member attempt becomes failed only from final `agent/error`, never from an
  intermediate retry signal. Settlement must match the Team, Captain, member,
  task, attempt, and `attemptId`; reports are bounded and sanitized, and the
  scheduler may continue only after the real child reaches idle.
- When `agent_teams_add_member` receives a new name formed from an unnumbered
  role plus a positive numeric suffix, it must inherit the frozen base-role
  Provider/model/reasoning policy from the current Team. This is generic for
  every configured role and any suffix length; `-`/`_`/space separators are
  accepted. The unnumbered base member wins over numbered members, explicit
  request fields win over inheritance, unmatched custom names keep captain
  routing, and ambiguous role-description fallback must fail closed. Keep the
  focused selection and lifecycle regressions through every upstream refresh.
- Every continuable child operation (start, send, interrupt, retirement and
  drain) must enter the single durable-session subagent gateway. The gateway
  resolves the exact live Agent, rejects stale or same-ID pseudo-handles, and
  serializes each child operation; no direct `ctx.subagents.*` call may bypass
  this admission boundary.

## AgentTeams `0.1.22-desktop.9` session-audit invariants

- A captain takeover spans turns: the captain's idle edge never revokes,
  requeues or reassigns captain-owned `claimed`/`in_progress` work. Only the
  captain's completion, failure or explicit reassignment releases it.
- Quality completion matches every current acceptance criterion and verify
  command by text identity after formatting-only normalization (NFKC,
  whitespace, trailing punctuation). A same-count all-pass report of other
  items never covers a contract; rejections list the missing items.
- Implementation/repair completion is audited against Git working-tree
  snapshots taken at `in_progress` and at completion: directories cannot stand
  in for files, every changed in-scope file must be reported, and an
  out-of-scope change not owned by another open write task blocks completion
  even when dropped from `changedPaths`. Non-Git or snapshot-less attempts skip
  only the observed-change part; Git runs with `windowsHide`.
- Numbered members inherit the matched base role's `executionPrompt` unless
  the call supplies its own; model-route precedence is unchanged.
- `agent_teams_amend_task` rejects the whole call, with zero writes, when it
  carries any field outside the amendable contract (for example
  `dependencies`).
- An `integration` task cannot be dispatched, claimed or taken over while any
  review in the Team is open, failed without completed follow-up, or completed
  without `verdict=pass`, including reviews created after it and never listed
  as dependencies. Reviews downstream of the integration are excluded.
- A member whose latest turn ended with `max-tokens` reports that cause to the
  captain once per attempt instead of the generic idle notice; there is no
  automatic retry with the same budget.
- The captain idle requeue, same-count evidence fallback and silent amend
  field drop originate in upstream v0.1.22; no upstream PR is planned. Every
  AgentTeams refresh must check those three spots first and reapply or
  reclassify them per `docs/UPSTREAM_MAINTENANCE.md`.
- Keep `lifecycle-verify.mjs`, `quality-gates-tdd.mjs` (`tdd.audit.*`,
  `tdd.integration.*`, `tdd.complete.*` count/paraphrase checks) and
  `quality-gates-amend.test.mjs` regressions through every refresh.

## Models settings fork `0.2.0-rc.2-desktop.4` interaction invariants

- User-requested replacement: capability probing and its Remote/Host service are removed. Keep model discovery, native provider editors, onboarding, credential boundaries, Save/CAS and draft cancellation.
- Every pi-ai model uses image or text-only; persist ['text', 'image'] or ['text']. Missing/empty input displays and saves as text. New providers/models default to text. Malformed input remains invalid and blocks Save.
- Offer Default, Minimal, Low, Medium, High, Xhigh and Max. Default always uses the server default; each model can select the six explicit levels. Save selected levels as reasoningEfforts without off (Default is supplied by Harness), or false when none are selected. Preserve existing selected wire mappings and every unrelated model field; malformed efforts block Save.
- List operations, bulk input actions, expandable model settings and footer Save/Cancel have separate layout groups and remain usable at narrow widths.
- Models stays provider-neutral. CPA and model-name rules stay with their owners. Manual declarations override catalogs and defaults, and saved changes require restart.
- Before generated lib writes, detach each existing output entry with identical bytes to prevent Windows os error 1224. Keep detachment and manual declaration regressions through future refreshes.

Do not collapse these owners into one plugin during conflict resolution. Do not
move provider-specific behavior into the Models fork.

## Desktop rc.12 settings and console invariants

- Desktop startup selects a free loopback port that Chromium permits and passes
  it explicitly to Harness. Never bypass browser port protections. Retain
  src/loopback-port.js and tests/loopback-port.test.js through refreshes. Keep
  the readiness token intact for navigation, but redact it from diagnostics.
- AgentTeams temporary-member Schema must survive official JSON serialization
  and browser hydration; do not reintroduce transforms with module-local closures.
- Profile editing reads official effective settings and uses one Settings/CAS
  write with a guarded draft baseline. It does not write the desktop JSON cache.
  A saved V2 desktop record may be explicitly imported into a draft; absence of
  that record must not advertise a saved import. Keep official Home/CLI refusal.
- A live Profile snapshot applies to new Teams; each created Team freezes its
  routes and prompts, including later numbered-role inheritance. This supersedes
  the historical separate desktop Profile writer/restart-only editor behavior.
- Empty Profile maps retain Save/Reload. Protocol and execution prompt text
  retains original whitespace on read, unrelated saves and explicit imports.
- The dependency-free child console preload is inherited through process-local
  NODE_OPTIONS, even for MCP-filtered environments. Keep unrelated parent flags
  out of explicit child environments, preserve explicit visibility/native
  validation, synchronize ESM builtin exports, and never register the Harness
  loader from this descendant/Worker preload. Do not alter global environments
  or vendor packages as part of the wrapper implementation.
- Retain tests/agent-teams-profile-layering.test.js, the official JSON-wire
  settings save regression, the live new/old-Team AgentLoop regression and
  tests/win-hide-console-descendants.test.js in every upstream refresh.

## Version and provenance synchronization

When an owner changes, update its package version, wrapper dependency and
lockfile entry, integration assertions, README version text, and `UPSTREAM.md`
or maintenance registry in the same change. Never update provenance before the
new source and regression evidence are available.

## Mandatory acceptance gate

From `win-desktop`, run:

```powershell
npm run verify:upstream
```

The gate must pass before accepting an upstream refresh, updating provenance,
or building release artifacts. Do not weaken or skip a failing regression to
make the gate green. The gate compiles local plugins and synchronizes their
`lib` outputs into the already-installed `file:` dependencies; it must not run
a package-manager install. If ownership moves upstream, preserve the
regression and point it at the new implementation.

---

## Windows 桌面版发布规则

这套规则已与当前 Alpha.2 架构和本地能力登记同步。AUTO 权限插件已永久移除，
后续上游刷新不得重新引入它。

### 发布前检查

- 分别核对官方 Harness 与 AgentTeams 的当前发布信息，并与仓库中固定的
  provenance、版本和锁文件对照；不得把浮动 `latest` 直接写入运行时依赖。
- 先从 `win-desktop/` 运行 `npm run verify:upstream`。该门禁必须保持离线、无安装、
  无网络、无打包，并覆盖所有本地插件回归、Alpha.2 运行时闭包和包装器测试。
- AgentTeams 的升级必须逐项复核 `docs/UPSTREAM_MAINTENANCE.md` 中的
  `UPSTREAM_EQUIVALENT`、`REAPPLY` 和 `SUPERSEDED_BY_DESIGN`；不得因上游冲突删除
  Profiles、角色模型策略、严格 V2、质量门禁、等待/恢复或本地兼容回归。
- AUTO 不在依赖、锁文件、Patch、healing、提示词、设置界面、文档或迁移目标中；
  不迁移旧 AUTO 会话，也不清理用户 Profile 缓存。

### 图标与打包

- 保留官方鲸鱼图标：`win-desktop/assets/icon.ico`、`icon.png` 和 `src/icon.ico`。
- `build.win.icon` 必须是 `assets/icon.ico`，`build.files` 必须包含该文件，
  `signAndEditExecutable` 必须为 `true`。
- 从真实 `win-desktop/` checkout 打包，`node_modules` 必须是实际目录，不得是
  Junction 或 symlink；打包后必须验证 `win-unpacked` 与 ZIP 的真实模块解析闭包。
- 记录 EXE、ZIP 和 blockmap 的大小及 SHA-256。安装包只作为 Release 资产交付，
  不进入源码树，不提交、不打 tag、不创建 Release 或上传资产，除非用户另行授权。

打包入口为 `win-desktop/npm run dist:win`；只有完整回归和运行时闭包验证均通过后，
才能报告本地安装包构建完成。
