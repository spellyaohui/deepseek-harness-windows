# AgentTeams Profile 编辑器设计

状态：已根据用户选择的 B 方案形成实现前设计，等待书面复核。

## 背景

AgentTeams v0.1.14 已经在插件运行时提供了 named profile：profile 可以冻结成员名单、角色提示、模型路由、推理等级、fallback、任务模板、任务依赖和质量门禁策略。Windows fork 当前已经导入这些运行时能力和 `profile=` 调用规则，但设置页没有编辑入口，桌面启动时也没有给 AgentTeams 注入一个可直接使用的内置 profile。

本次改动只补齐桌面设置和启动配置桥接，不改变 AgentTeams 的 profile 解析、成员选择、任务调度或已有普通调用语义。

## 目标

1. 在现有“设置 → Subagents / AgentTeams”页面内增加一个辨识度足够的“团队 Profiles”卡片，采用已确认的 B 方案，不创建第二个设置窗口。
2. 首次安装提供一个内置 `software-delivery` profile。它使用队长规划模式，包含分析、实现、测试、审查四个角色，但不写死 provider、model 或 reasoning effort；未指定路由时继续沿用 AgentTeams 当前的队长/设置选择策略。
3. 允许用户编辑内置 profile 的配置、添加/复制自定义 profile、编辑自定义 profile、删除自定义 profile，并恢复内置 profile 默认值。
4. 将 profile 配置保存到 Electron userData 下现有的 `desktop-settings.json`，升级时保留用户对同名 profile 的修改；内置 profile 只在缺失时补入，不覆盖用户内容。
5. 保存后的配置在下一次桌面启动生成 AgentTeams patch 时生效。当前已运行的会话、已有团队和已有成员不被设置页修改。
6. 编辑器覆盖 upstream profile 的可观察配置字段：`description`、`protocol`、`executionPrompt`、profile `fallback`、`taskPlanning`、`members`、seed `tasks` 和 `reviewPolicy`；成员编辑覆盖 `name`、`role`、`provider`、`model`、`reasoning_effort`、成员提示词和成员 fallback。
7. 在保存边界做 JSON 形状和编辑器规则校验，在启动注入边界做安全筛选；无效的手工文件内容不能阻止 Harness 启动。AgentTeams 自身的 `resolveTeamProfile` 仍是最终语义校验权威。

## 非目标

- 不增加“当前激活 profile”设置；模型只有在 `agent_teams_create` 中明确传递 `profile=<name>` 时才使用模板。
- 不把 profile 配置写入 Harness `agent-teams` live settings namespace；该 namespace 继续只负责 Team/Native、成员默认路由和 reasoning 策略。
- 不为 profile 编辑器增加 API Token、地址或任何 provider credential 字段。CPA 仍由 CPA 插件和原生 Models 行负责。
- 不编辑 `.agent-teams` 状态文件，不修改已经创建的团队快照，不让编辑器发起网络请求。
- 不改变没有 profile 的旧 `agent_teams_create` 路径，也不重新引入空字符串、`default`、`none` 或 `captain` 这样的占位 profile 调用。

## 方案与边界

### 1. 配置所有权与持久化

新增 wrapper-owned 的 `agent-teams-profile-store` 模块，集中定义：

- `BUILTIN_AGENT_TEAMS_PROFILES`：不可变的 `software-delivery` 默认配置；
- `getAgentTeamsProfiles()`：从桌面设置读取并合并内置缺失项；
- `setAgentTeamsProfiles(profiles)`：校验并保存完整 profile map；
- `getAgentTeamsProfileSnapshot()`：返回 `{ profiles, builtInNames }` 给 renderer。

`desktop-settings.js` 继续负责文件读写和未知设置字段保留，profile store 负责 profile map 的克隆、内置合并和边界检查。保存自定义 map 时保留其他桌面设置字段。内置 profile 在 UI 中不可删除但可编辑；“恢复默认”只替换该 profile。这样既能保留用户修改，也能在未来增加新的内置 profile 而不覆盖已有同名内容。

### 2. IPC / preload 合同

新增窄接口，避免 AgentTeams client 直接依赖完整 Electron 设置对象：

```ts
type AgentTeamsProfileSnapshot = {
  profiles: Record<string, TeamProfileConfig>
  builtInNames: string[]
  builtInProfiles: Record<string, TeamProfileConfig>
}

interface DshDesktopBridge {
  getAgentTeamsProfiles(): Promise<AgentTeamsProfileSnapshot>
  setAgentTeamsProfiles(
    profiles: Record<string, unknown>,
  ): Promise<AgentTeamsProfileSnapshot>
}
```

IPC channel 为 `agent-teams-profiles:get` 和 `agent-teams-profiles:set`。set 成功返回完整的 Host truth；失败抛出统一的人类可读 `Error`，renderer 保留当前草稿并显示错误，不把失败草稿当成已保存配置。主进程保存后继续广播现有 `desktop-settings:changed`，但 profile 编辑器不依赖广播完成当前保存。

### 3. 启动 patch

`generateAgentTeamsPatch()` 在现有插件条目中为 AgentTeams config 增加 `profiles`。动态 patch 使用 profile store 返回的安全 map；静态 `config/agent-teams.patch.yml` 同步包含 `software-delivery`，供未经过桌面设置的静态调用者使用。profiles 使用 YAML 安全的 JSON flow value 写入，避免描述、提示词、模型名中的换行、冒号、井号或引号破坏 patch。

启动边界只接受可 JSON 序列化、profile 名称非空、成员数量在当前 `maxMembers` 内且成员对象具有非空 `name` 的条目；明显损坏的自定义条目被丢弃并保留内置默认。完整 profile 结构仍由 AgentTeams v0.1.14 的运行时 resolver 在真正使用 profile 时校验，避免 wrapper 复制一套会漂移的 DAG / quality policy 规则。

### 4. 设置页交互

Profiles 卡片放在现有 AgentTeams 设置页的全局路由设置之后、范围说明之前。卡片标题、内置/自定义标识、重启生效提示和保存状态应显著可见。编辑区域采用单列主表单和可折叠的高级字段：

- profile 列表：选择、添加、复制、删除（内置不可删除）；
- 基本字段：名称（自定义可改，内置名称锁定）、描述、protocol、execution prompt；
- 规划方式：`captain` / `seed`；切换为 `captain` 时只保留成员和 guardrails，seed task 编辑区隐藏但不自动改写用户草稿；
- 成员表：成员名、角色、可选 provider/model、可选 reasoning effort、成员提示词和 fallback；提供“跟随队长”空值语义，并保留当前 catalog 不可用的旧值；
- seed 任务表：id、subject、description、assignee、依赖 ID（逗号分隔）；
- review policy：轮次、repair 次数、required reviewers；
- 操作：保存、取消、恢复内置默认。保存成功只提示“已保存，重启后生效”，不伪装成当前运行时已热更新。

编辑器使用现有共享 model catalog 作为 provider/model/reasoning 的选择来源，但允许保存目录中暂时不可用的既有值；不因目录请求失败而清空用户 profile。所有表单控件使用真实 label、fieldset、键盘可达按钮和 `aria-live` 状态；loading、bridge 不可用、空 profile 和保存失败都有明确文案。

### 5. 编辑器校验与错误语义

编辑器保存前执行纯函数校验：

- profile 名称必须是可被 `profile=` 调用的非空单 token，最多 64 个字符，且不得是 `captain`；
- profile map 最多 16 个，成员至少 1 个且最多 8 个；成员名非空、去重且不得占用 captain；
- provider 与 model 的显式路由必须成对出现；空的可选字段转为省略；
- fallback 必须同时有 provider 和 model；
- seed task 的 id 非空且唯一，依赖只能引用已存在任务，任务必须有负责人且负责人是 profile 成员，不能形成环；
- review policy 数值为正整数，最小轮次不大于最大轮次。

校验失败只阻止保存，并将错误绑定到卡片的 `role=alert`；不触碰已提交的 Host 配置。主进程再执行 JSON-safe 结构校验，防止 renderer 直接发送数组、函数、循环结构或过大的对象。

## 兼容性与回归

必须保留现有 upstream capability registry 中的 AgentTeams profile、成员路由、CPA catalog、桌面 close behavior、OpenCode 修复、Session Markdown 和 Windows console-hide 回归。新增回归覆盖：

1. 内置 profile 的完整默认内容和无 hard-coded LLM route；
2. 首次读取、保存后读取、未知 desktop 字段保留、用户修改不被内置合并覆盖；
3. 内置 profile 不可通过 store 删除，自定义 profile 可删除；
4. 生成 patch 后 YAML 可解析，动态和静态 patch 都包含 `software-delivery`，特殊字符仍按原值 round-trip；
5. malformed persisted profile 不阻断 patch generation，并回退到安全内置配置；
6. 编辑器纯函数的 profile/task/fallback 校验、规范化和保存 payload；
7. client bundle 注册现有 `agent-teams` settings section，并包含 profile editor 的可访问控件和 IPC 调用；
8. 既有普通 create 调用仍不自动填充 `profile`，profile 调用仍保留 upstream resolver / DAG / snapshot 行为。

验证顺序为局部 profile/store/client 测试 → `pnpm build` / plugin verify → 从 `win-desktop` 执行 `npm run verify:upstream` → wrapper package build 和安装包 smoke verification。上游回归门禁不得安装依赖、访问网络或打包。

## 风险与取舍

- profile 采用重启生效而不是热更新，因为 AgentTeams config 在 DSH 启动时被解析并进入 prompt/tool closure；热更新会让新旧会话看到不同 roster，风险高于收益。
- wrapper 只做启动安全筛选，不复制完整的 upstream profile resolver；这样 malformed 文件能安全回退，同时保留 AgentTeams 作为唯一 profile 语义权威。
- 自定义 profile 名称限制为无空格 token，略窄于底层 map key 的理论能力，但它与当前 `--profile <name>` tokenizer 一致，避免 UI 创建出无法稳定调用的模板。
- 编辑器初版支持所有 upstream profile 字段，但不增加质量门禁之外的新业务字段；任何未来新增字段必须先更新此处的类型、校验、UI 和回归。

## 验收标准

- 用户在现有设置页能看到并辨认“团队 Profiles”，首次可直接看到 `software-delivery`。
- 用户修改/新增 profile 后重启桌面，AgentTeams usage prompt 列出该 profile，明确调用 `profile=software-delivery` 或自定义名称时才使用对应模板。
- 重启前当前 DSH 会话行为不被 profile 保存改变；普通不带 profile 的请求行为不变。
- profile 配置保存失败时用户能看到错误且草稿不丢；损坏的手工配置不会让 Harness 无法启动。
- `npm run verify:upstream`、插件构建/验证和最终 EXE/NSIS/ZIP 验证均通过后才可称为完成。
