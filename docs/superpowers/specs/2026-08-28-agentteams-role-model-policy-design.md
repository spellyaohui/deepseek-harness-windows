# AgentTeams 角色级模型策略与新状态硬切换设计

状态：用户已确认设计方向、界面、状态格式与删除边界，等待书面复核。

## 背景

当前 AgentTeams 设置同时存在两层成员模型选择：设置页中的全局
`memberLlmProvider`、`memberModel`、`memberReasoningMode`、
`memberReasoningEffort`，以及 named Profile 每个成员已有的 `provider`、
`model`、`reasoning_effort`。全局 `explicit` 模式拥有最高优先级，会忽略
Profile 角色填写的模型和思考强度，因此无法稳定实现“实现角色使用低成本
模型、审核角色使用高阶模型”的异构团队。

项目还保留了多组旧对话兼容逻辑：旧桌面设置迁移、无委派策略标记会话
回退 Native、旧 Team 状态字段补全、旧成员缺少模型快照时借用 Harness
描述符、旧活动卡片和旧成员导航回退。继续维护这些分支会使角色模型策略、
状态校验和冷恢复行为长期存在两套语义。

本次采用强制新格式：成员模型设置下放到 Profile 角色，删除全局成员模型
设置和旧对话兼容层。旧文件不删除、不改写，但不再参与 AgentTeams 运行。

## 目标

1. 全局 AgentTeams 设置只保留 Team / Native 委派方式，不再提供统一成员
   Provider、模型或思考强度。
2. 每个 Profile 角色独立选择目标模型和思考策略，支持同一团队混用 CPA、
   OpenCode 及其他已注册 Provider。
3. 新增、复制和编辑 Profile 时可新增自定义角色，并复用同一角色模型编辑器。
4. 角色模型配置成为唯一成员 LLM 选择权威，不存在隐藏的全局覆盖或旧值回退。
5. 新 Team 使用带明确版本号的单一严格状态格式；旧对话、旧 Team、旧 Profile
   和旧任务哨兵格式不再迁移或修复。
6. 保留新格式所需的冷启动恢复、暂停/恢复、调度、质量门禁、模型 fallback
   和成员认领安全边界。
7. 保留 CPA、OpenCode、Kimi、Windows 进程等当前运行必需的协议和平台兼容
   能力；它们不属于旧对话适配。

## 非目标

- 不为不同 Profile 建立第二套全局“角色模板库”。角色配置归属于当前 Profile。
- 不热切换已经创建的子智能体模型，不重写现存 `.agent-teams` 文件。
- 不自动迁移旧全局成员模型设置、旧自定义 Profile 或旧 Team 状态。
- 不在 AgentTeams 中保存 API 地址、Token、凭据或 Provider 私有配置。
- 不改变 Team / Native 两种委派模式本身，也不删除新会话使用的持久策略标记。
- 不删除 `work` 任务、自动审批、暂停/恢复等仍被新调用使用的功能，仅删除它们
  针对缺字段旧状态的兼容入口。

## 所有权与边界

- AgentTeams 插件拥有角色模型策略、Profile 语义、模型选择、Team 状态格式、
  冷恢复和任务生命周期。
- Windows wrapper 继续拥有 Profile 文件持久化、IPC 和启动 patch 注入，不解释
  Provider 私有字段。
- CPA 插件与原生 Models 设置继续拥有 CLIProxyAPI 地址、凭据、模型发现、能力和
  容量。AgentTeams 只消费共享模型目录。
- OpenCode 协议和图片能力修复继续由 Windows wrapper 负责。AgentTeams 不复制
  OpenCode 模型白名单或协议规则。
- Profile 保存仍是重启生效；已经存在的 Team 使用其创建时冻结的新格式快照。

## Profile 角色配置合同

新格式为每个成员增加必填 `reasoning_mode`，并保留现有目标路由字段：

```ts
type RoleReasoningMode = 'target-default' | 'route-aware' | 'explicit'

interface TeamProfileMemberConfigV2 {
  name: string
  role?: string
  provider?: string
  model?: string
  reasoning_mode: RoleReasoningMode
  reasoning_effort?: string
  executionPrompt?: string
  fallback?: {
    provider: string
    model: string
  }
}
```

### 目标路由

- `provider` 和 `model` 同时缺失表示跟随队长当前 Provider 和模型。
- 两者必须成对出现；不再接受仅 Provider 或仅模型的模糊路由。
- 显式目标必须来自当前 Harness 共享模型目录。AgentTeams 不硬编码 CPA 或
  OpenCode 的 Provider ID。
- `fallback` 仍是角色级可选的完整 Provider/模型对，解析顺序保持成员 fallback、
  Profile fallback、插件 fallback。

### 思考策略

- `target-default`：不发送角色思考强度，由目标模型使用其默认值；
  `reasoning_effort` 必须缺失。
- `route-aware`：目标路由与队长完全相同时继承队长强度；路由变化时使用目标
  模型默认值；`reasoning_effort` 必须缺失。
- `explicit`：必须同时配置 `provider`、`model` 和该模型目录声明支持的
  `reasoning_effort`。

新增角色默认写入 `reasoning_mode: 'target-default'`，Provider/模型为空，即
“跟随队长 + 目标模型默认值”。所有 persisted Profile 成员必须显式写入模式，
运行时不根据旧字段组合猜测模式。

### 唯一选择链

成员选择只读取角色配置与队长当前请求：

1. 解析角色目标 Provider/模型；为空时使用队长当前路由。
2. 按角色 `reasoning_mode` 计算思考强度。
3. 通过 `ctx.llm.resolveCallConfig` 验证目标模型和强度。
4. 将解析后的 Provider、模型和最终强度冻结到成员状态与子智能体描述符。

全局成员模型字段、全局 explicit 权威和 legacy fallback 不再进入选择链。

## 设置页面

AgentTeams 设置页面移除全局“成员模型”和“成员推理强度”两个区域，只保留：

1. Team / Native 委派方式；
2. 团队 Profiles；
3. 生效范围和重启提示。

Profile 中每个成员卡片包含：

- 成员名称、角色职责和成员提示词；
- 目标模型来源：跟随队长，或选择 Provider 后选择模型；
- 思考策略：目标模型默认值、路由感知继承、明确指定；
- explicit 模式下按目标模型目录显示思考强度；
- 可折叠的成员 fallback；
- 删除角色操作。

新增、复制、重命名和删除自定义 Profile 的现有操作保留。新增角色和复制 Profile
都生成完整的新格式字段。内置 `software-delivery` Profile 的 analyst、implementer、
tester、reviewer 四个角色使用新格式默认策略，不写死任何 Provider 或模型。

模型目录加载失败时：

- 保留当前草稿，不自动清空字段；
- 禁止保存新的显式模型配置；
- 显示失败原因和重试按钮；
- 不发起 Provider 设置写入，也不读取地址或 Token。

## Profile 存储版本

wrapper 的 Profile store 增加显式版本字段：

```ts
interface AgentTeamsProfileDocumentV2 {
  schemaVersion: 2
  profiles: Record<string, TeamProfileConfigV2>
}
```

启动 patch 和 IPC 只输出 V2 Profile。缺少版本、版本不等于 2、成员缺少
`reasoning_mode` 或字段组合无效的旧 Profile 文档不被导入、不被自动改写。
内置 V2 Profile 始终可用。旧原始桌面设置文件保留在原处，只有用户保存新格式
Profile 时才由现有原子写入流程提交 V2 文档。

全局旧成员模型设置不迁移到 Profile，不作为默认值，也不产生过渡警告控制器。
相关 migration status HTTP 路由、启动确认握手和清理回调全部删除。

## Team 状态 V2

所有新 Team 写入必填版本号：

```ts
interface TeamStateV2 {
  schemaVersion: 2
  name: string
  id: string
  captainSessionId: string
  createdAt: number
  phase: 'staged' | 'running'
  planReviewState?: 'awaiting_review' | 'awaiting_feedback'
  members: TeamMemberV2[]
  tasks: TeamTaskV2[]
  taskSeq: number
}

interface TeamMemberV2 {
  id: string
  name: string
  provider: string
  model: string
  reasoningEffort?: string
  status: 'idle' | 'working' | 'removed'
  joinedAt: number
}
```

状态约束：

- `schemaVersion` 必须严格等于 2；
- `phase` 必填；staged Team 必须有 `planReviewState`，running Team 不得保留它；
- Profile 快照只接受对象，不接受字符串名称或损坏对象删除回退；
- 每个成员必须保存非空 Provider 和模型，冷恢复必须与 Harness 子智能体描述符一致；
- 每个任务必须保存 `kind`；普通任务显式写入 `work`；
- claimed / in-progress 任务必须满足新格式的尝试、能力和负责人约束；
- 可选字段只能缺失或包含有效值，不接受空字符串、`round: 0` 等哨兵。

`readTeam` 和 `readTeamSync` 只执行 JSON 解析与 V2 严格校验，不再调用
`coerceProfileSnapshot`、`coerceTeamTask` 或其他旧字段修复函数。

## 旧对话兼容层删除清单

实施必须删除代码、测试、文档和 provenance 中对应的旧能力声明：

1. `legacyDesktopSettings` 配置、旧桌面字段抽取、`migrationVersion`、
   `/plugins/dsh-agent-teams/migration-status`、wrapper 启动迁移握手和旧字段清理。
2. 已建立历史但没有 Team / Native 标记时强制选择 `native-v1` 的分支。无标记
   会话按当前委派设置安装新策略，下一次请求写入当前标记。
3. 字符串 Profile 快照升级、损坏 Profile 删除回退和任务空哨兵清理。
4. 缺少 `phase`、`planReviewState`、任务 `kind`、尝试能力或成员路由快照时继续
   加载、调度或冷恢复的分支。
5. 成员冷恢复缺少完整 Provider/模型时借用 Harness 描述符继续运行的分支。
6. 旧 AgentTeams 对话卡片投影、旧 archive 兜底和 pre-rc.8 普通成员会话导航。

以下名字中虽含 legacy / compatibility，但不因本次删除：

- 新调用仍使用的 `work` 任务类型和 `approval=automatic`；
- 当前 LLM 工具调用所需的成员认领参数规范化；
- 新格式 Team 的 continuable child 冷恢复、暂停、恢复和任务重派；
- panel geometry 等非对话数据的小型格式归一化；
- OpenCode、Kimi、CPA、Windows shell 和 console-hide 兼容处理。

## 旧数据行为

旧 `.agent-teams` 目录和旧桌面设置文件不删除、不重写。读取时区分两类错误：

- 缺少 V2 版本或版本不支持：`旧版 AgentTeams 状态不受支持，请创建新 Team`；
- 标记为 V2 但结构无效：`AgentTeams V2 状态无效`，并附团队或角色定位信息。

旧对话仍可作为普通聊天查看，但不展示旧 AgentTeams 活动卡，不允许恢复旧 Team
或旧成员。用户需要在新对话或当前对话中创建新 Team，后续全部使用 V2。

## Team 创建和恢复数据流

1. 用户在 Profiles 中保存 V2 角色配置并重启桌面。
2. wrapper 将 V2 Profile map 注入 AgentTeams patch。
3. `agent_teams_create` 解析 Profile 和全部角色策略。
4. 插件从共享目录解析每个角色的 Provider、模型、思考强度和 fallback。
5. 所有角色一次性通过验证后，才创建 Team 目录并写入 V2 staged/running 状态。
6. approval 需要的 Team 在最终 roster 再验证一次，然后启动全部成员。
7. 冷恢复只读取 V2 成员快照，并核对快照与 continuable child 描述符完全一致。

任一角色解析失败时，创建操作整体失败：不创建 Team 目录、不启动任何成员、
不留下部分 roster。错误必须包含 Profile 名、角色名和无效的 Provider/模型或强度，
但不得包含凭据、地址或 Token。

## 回归设计

### 角色选择策略

- 同一 Profile 的 implementer 使用 CPA 低成本模型，reviewer 使用 OpenCode 高阶
  模型，二者得到各自支持的思考强度；
- target-default 始终省略强度；
- route-aware 在同路由继承队长强度，跨路由使用目标默认；
- explicit 必须是目录支持的 Provider、模型和强度组合；
- 角色设置始终胜出，删除后的全局旧字段无法影响结果；
- Provider / 模型单边配置和 explicit 缺强度均在写状态前失败。

### 设置与目录

- 全局模型和推理设置控件、写操作和 locale 文案不存在；
- 每个角色拥有完整模型与思考控件；新增/复制角色生成 V2；
- CPA 和 OpenCode 由共享目录自然出现，不存在 AgentTeams 私有白名单；
- 目录错误保留草稿、禁止新显式保存并支持重试；
- Profile store 只读写 V2，旧 Profile 文档被明确拒绝且原文件不被改写。

### 状态与生命周期

- V2 Team 创建、staged approval、成员启动、任务调度、暂停/恢复和冷启动通过；
- 旧 Team、字符串 Profile、缺 phase、缺 member route、缺 task kind、空质量字段
  和 `round: 0` fixture 全部被拒绝；
- 冷恢复保持冻结的角色 Provider、模型和思考强度；
- 描述符与 V2 快照不一致时拒绝恢复；
- 任一角色模型无效时零 Team 状态写入、零成员启动；
- 旧活动卡、archive 兜底和旧普通成员导航回归被删除，并增加“不再注册旧入口”断言。

### 完整门禁

验证顺序：

1. 角色策略、Profile store、严格 V2 状态和设置 UI 的 focused RED / GREEN；
2. AgentTeams `pnpm test` 全量；
3. wrapper `npm test`；
4. 从 `win-desktop` 运行 `npm run verify:upstream`；
5. 通过门禁后才同步版本、README、UPSTREAM/provenance、lockfile 和安装包。

删除旧测试必须以新的拒绝测试替换，不得简单降低断言或跳过失败门禁。

## 版本与发布

实现时按项目现有预发布版本规则递增 wrapper 和 AgentTeams fork 版本，不在设计
阶段预先占用具体版本号。版本提交必须同时更新：

- AgentTeams package 与 release notes；
- wrapper package 与 lockfile 的本地插件版本；
- 根 README、`win-desktop/README.md`；
- `docs/UPSTREAM_MAINTENANCE.md` 与 AgentTeams `UPSTREAM.md`；
- capability integration assertions 和最终 Release notes。

发布说明必须明确这是有意的不兼容切换：旧 Team / Profile 不再加载，需要重建
Profile 和 Team。安装包仍须在用户验收后再发布。

## 风险与取舍

- 旧 Team 无法继续 AgentTeams 工作是明确接受的破坏性变化，换取单一状态合同和
  更低维护成本。
- 已经运行的子智能体不能安全热切换模型，因此不做状态重写或隐式 respawn。
- Profile 角色直接依赖当前模型目录；Provider 暂时离线会阻止新 Team 创建，但
  不会清空设置或泄露凭据。
- strict V2 会更早暴露写入端错误。所有写入端必须在删除 coercion 前完成 V2
  回归，不能依赖读取端修复自身输出。
- 保留旧文件而不读取，避免破坏用户证据；项目不提供自动转换工具。

## 验收标准

- 设置页不存在全局成员 Provider、模型和推理强度。
- 每个 Profile 角色可独立选择 CPA / OpenCode 模型和三种思考策略。
- implementer 与 reviewer 可稳定使用不同 Provider、模型和思考强度。
- 全局旧字段、旧会话标记和旧 Team 状态不能改变或绕过角色选择。
- 所有新 Team 都写入严格 V2，冷恢复只接受并保持 V2 模型快照。
- 旧文件不删除但被明确拒绝，错误提示可操作且不暴露敏感配置。
- 所有局部回归、AgentTeams 全量、wrapper 测试和 `npm run verify:upstream`
  通过后，才可进入版本同步和安装包构建。
