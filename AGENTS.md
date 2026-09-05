# Repository rules

These rules apply to the entire repository. This is a public Windows wrapper
around upstream DeepSeek Harness packages plus independently owned local
plugins and compatibility rewrites.

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

- AgentTeams owns subagent member defaults, explicit/route-aware reasoning,
  shared model-catalog consumption, Team/Native routing, and task lifecycle.
- CPA owns CLIProxyAPI address/credential handling, model discovery, reasoning
  vocabulary, per-model context/output capacities, and the native-provider
  profile normalization seam. CPA must not register a second visible Models
  card; the single native `CPA / CLIProxyAPI` row owns its editor chrome.
- The Models settings fork owns the provider-neutral native editor and its
  additive slot/normalization seam; it must not contain CPA-specific rules.
- Desktop Settings owns the Harness-native `桌面` settings section and window
  behavior bridge.
- Session Markdown owns continuation export ordering, lineage, sanitization,
  and the header action.
- Wrapper tool-call guidance owns only the compact cross-tool system-prompt
  discipline for optional arguments and failed-call retries.
- The Windows wrapper owns shell normalization, hidden-console behavior,
  provider-neutral exact `grep` argument alias normalization at the pi-ai
  durable boundary, OpenCode stream recovery, verified OpenCode model-protocol
  and image-capability reconciliation, the manual capability-validation bridge,
  plugin mounting, and startup integration.
- The Windows wrapper may hide only the native Subagent plugin settings card by
  rewriting the exact Alpha.2 client-module bundle snapshot boundary. The
  Subagent Host namespace, saved settings, official runtime dependencies, and
  AgentTeams `memberProvider: spawn` path must remain installed and active. The
  replacement Slot key stays byte-length equal to preserve the authored source
  map, and both initial and HMR snapshot paths use the same package-ID-scoped
  transformer. Future upstream refreshes must retain the focused regression or
  prove an `UPSTREAM_EQUIVALENT` single-card composition control.

## Release `v0.1.1-rc.17` interaction invariants

- CPA appears once in “设置 → 模型”, through the native configured-provider
  row. The expandable native editor must retain API address, Token, model
  discovery, model selection, text/image input modalities, raw context/output
  capacities, and model-specific R reasoning levels.
- Existing CPA profiles created before image modalities were persisted must be
  migrated on startup through the CPA plugin's path-scoped, revision-guarded
  settings mutation. The migration must preserve unrelated providers,
  credentials, raw capacities, and explicit per-model text-only overrides.
  Once a profile already carries the current text/image Provider default,
  missing or empty model-level `input` is intentional `auto` and must not be
  materialized again. Native CPA edits must also leave malformed `input`
  untouched so the provider-neutral Models validator can reject it.
- The `桌面` section has no save button. Changing close behavior immediately
  persists through the existing IPC bridge, disables the selector while the
  write is pending, announces success, and restores the prior committed value
  on failure.
- Before Harness imports the Pi OpenCode Go catalog, the wrapper reconciles
  only its documented model profiles across static, persisted and live
  catalogs. Muse Spark 1.2 Contributor and GPT-5.6 Luna use
  `openai-responses`; Qwen3.7 Max and Qwen3.7 Plus use
  `openai-completions`. Unknown models retain the generic Completions fallback;
  a server 500 never triggers an alternative-protocol retry.
- Before that same catalog is used, the wrapper corrects the documented
  text/image input capability for verified current and legacy OpenCode models.
  Unknown models stay text-only. “设置 → 模型 → OpenCode 模型能力” can run the
  same offline-safe catalog validation manually; it writes no provider settings,
  addresses, credentials, or Token, and requires restart before the repaired
  catalog is loaded.
- `opencode-go/kimi-k3` retains its verified Chat Completions transport and
  Kimi-specific tool compatibility: no OpenAI `strict` field, required
  reasoning-content replay, deferred-tool handling, and the official-client
  Kimi Schema normalization (ref siblings and tuple-style `items`). This must
  apply before the first Harness request, including a brand-new session.
- Every `opencode-go` model request carries the current Harness session as
  `x-opencode-session`, including when prompt-cache retention is `none`, so the
  OpenCode Go gateway keeps model routing stable. Generic OpenAI-compatible
  providers must not receive this OpenCode-specific header.
- Before the Agent Loop receives a pi-ai tool call, the wrapper may normalize
  the exact `grep` argument alias only when the call has no own `pattern` and
  its `description` wholly matches one single-line `pattern: <non-empty value>`
  form. This rule is provider-neutral and model-neutral, never overwrites an
  existing `pattern`, and leaves every other malformed call to the upstream
  strict validator. The upstream grep Schema must continue requiring `pattern`;
  future refreshes must retain the dedicated regression or prove an
  `UPSTREAM_EQUIVALENT` implementation.
- Every future upstream refresh must classify these behaviors as
  `UPSTREAM_EQUIVALENT`, `REAPPLY`, or `SUPERSEDED_BY_DESIGN`, retain their
  regressions, and run `npm run verify:upstream` before packaging.

## Alpha.2 Web authentication startup invariant

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

## Wrapper tool-call guidance and AUTO removal invariants

- `@deepseek-ai/dsh-tool-call-guidance` registers one system-prompt section at
  order `110`, before AgentTeams, and stays at or below 500 characters. It must
  not register tools, settings UI, Provider rules, or lifecycle state.
- Its four rules remain provider/model neutral: follow the current tool Schema
  and explicit context; omit unknown or blank optional properties; preserve an
  empty value only when the tool explicitly documents its meaning; after a
  failure, read the error/next step and never repeat the same invalid arguments
  unchanged.
- The AUTO permission plugin is intentionally absent from dependencies,
  lockfile, desktop Patch composition, healing expectations, prompt, UI, and
  documentation. Do not restore it during conflict resolution. Do not migrate
  old AUTO sessions or delete stale user Profile caches.

## AgentTeams `v0.1.15-desktop.7` interaction invariants

- Global AgentTeams settings own only Team/Native delegation. Each Profile
  role owns its Provider, model, and `reasoning_mode`. An `explicit` role must
  use its configured Provider/model/effort; only `target-default` and
  `route-aware` may resolve from the captain or target route. Do not restore a
  global member-model override or add a legacy Profile/Team migration layer.
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

## Models settings fork `v0.1.1-rc.2-desktop.6` interaction invariants

- Each pi-ai model row owns its image-input choice: `auto`, `image`, or
  `text-only`. Persist `auto` by deleting the model-level `input`, `image` as
  `['text', 'image']`, and `text-only` as `['text']`.
- Missing or empty `input` resolves to `auto`; a valid non-empty list containing
  `image` resolves to `image`, and a valid text-only list resolves to
  `text-only`. Malformed values are invalid and block save; they must not be
  filtered, cleared, or silently downgraded.
- The editor must preserve every unedited model field, including protocol,
  capacities, reasoning, cost, and compat records. Provider-scoped bulk
  actions operate only on the unsaved draft and must use the same pure
  normalization contract.
- The existing model editor owns one provider-neutral capability probe surface:
  rows are selected individually, probes run sequentially against the current
  explicit protocol/address, cancellation preserves completed draft results,
  and only an explicit overwrite toggle may replace existing capability
  fields. The probe never writes settings before the parent Save action.
- The capability Remote is optional at initial render because its mount is
  asynchronous. Missing or delayed Remote state must leave the Models page,
  Provider editors, model rows, input modes, and Save flow available; only the
  probe controls may degrade to an unavailable notice.
- A Remote namespace is an independent Cordis service named
  `remote.<namespace>`. Optional or late-bound namespace access must use
  `ctx.get('remote.<namespace>')` at action time; `ctx.remote.<namespace>` is
  legal only in a Fiber that declares that exact service in `inject`.
- Capability outcomes use `supported` / `unsupported` / `inconclusive` /
  `not-applicable`; authentication/proxy-auth failures (401/403/407),
  transient HTTP, timeout, rate-limit, 5xx, and network failures remain
  inconclusive. Stored credentials resolve only in Host, and a typed draft key
  is one-shot and never returned or persisted by the probe.
- The Models fork remains provider-neutral: no CPA, OpenCode, woyaopro, or
  model-name heuristics belong there. Unknown automatic models remain
  fail-closed through pi-ai's text-only default, and a saved choice requires
  restart before the runtime loads it.
- Before Models TypeScript/Rolldown output is regenerated, the build detaches
  every existing `lib` output directory entry with identical bytes so a
  consumer/indexer memory map cannot trigger Windows `os error 1224`; the
  generated output remains ignored by the package's source ownership rules.
- OpenCode catalog hydration must never rewrite persisted provider settings;
  manual model-level declarations remain higher precedence than installed
  catalogs and provider defaults. Preserve the model-input unit/UI tests,
  wrapper ownership regressions, and capability-manifest markers through every
  upstream refresh.

Do not collapse these owners into one plugin during conflict resolution. Do not
move provider-specific behavior into the Models fork.

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
