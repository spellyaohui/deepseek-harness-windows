# AgentTeams 分阶段审批与自动命名设计

状态：用户已复核确认，进入实施规划。

## 背景

当前 AgentTeams 的 `approval=required` 只把 Team 区分为 `staged` 和
`running`。Captain 创建采用 `taskPlanning: captain` 的 Profile 后，会先得到一个
已有成员但没有完整任务图的 staged Team；Web 页面却只用“至少一个成员且至少一个
任务”判断是否可启动。Captain 刚写入第一项任务时，页面已经显示完整编辑器和
“批准并运行”按钮，按钮单击即向 Host 发送 `action: approve`。

Host 路由收到该动作后直接调用 `approveStagedTeam()`。这个路径没有计划版本
compare-and-swap（CAS）、没有二次确认，也没有记录审批来源或向 Captain 会话注入
可信审批事实。因此一个尚未完成的 DAG 可能被页面提前启动；Team 随后从 staged
变成 running 时，Captain 又无法区分这是用户真实批准、陈旧页面操作还是异常状态
变化，可能为了 fail-closed 而撤销已经启动的 Team。

另一个可见问题是用户在 Team 尚处于半成品阶段时就看到“新增任务”输入框，容易
误以为必须手工填写任务名称。实际上 `software-delivery` 已由 Captain 自动生成 Team
名和任务标题，只是页面过早暴露了人工编辑入口；同时 `agent_teams_create.name`
仍是必填参数，模型漏填时 Host 也不能兜底。

本设计把“Captain 正在构造计划”和“计划已经可以交给用户审核”明确拆开，并让
Web 与聊天审批都只能消费可验证的用户授权证据。

## 目标

1. 将审批生命周期改为 `building → ready_for_review → running`，半成品计划不可
   审批、不可启动。
2. Captain 用一次原子计划更新提交完整 DAG，并显式标记 `ready_for_review`。
3. Web 审批使用二次确认、计划 revision/CAS 和 Host 签发的一次性审批凭据。
4. 聊天工具审批必须引用本轮真实直接用户消息，不能只相信模型填写的
   `confirmation` 字符串。
5. 审批成功后持久化来源、批准的计划 revision 和时间，并向 Captain 注入可信的
   Host 审批上下文。
6. `agent_teams_create.name` 改为可选：主模型优先生成描述性 Team 名；缺省时 Host
   根据目标生成可读名称和唯一后缀。
7. 任务标题继续由 Captain 自动生成。Web 中的标题输入只作为用户审核完整计划时的
   人工编辑入口，不再表现为启动 Team 的必填步骤。
8. 保留 Profile 角色模型、reasoning、质量门禁、依赖调度、halt/resume、compact
   status 和原生 Subagent spawn 语义。

## 非目标

- 不让 AgentTeams 自动连接生产、部署、重启服务或扩大 Captain 原有授权。
- 不让模型自行代表用户批准 staged Team。
- 不根据旧 Team 猜测或补齐新字段，不增加 Team/Profile/对话迁移层。
- 不恢复 AUTO，不集成 Stop That Shit，也不改变原生 Subagent Host 依赖。
- 不取消 Web 人工编辑能力；它只在完整计划进入审核态后显示。
- 不把任务 `subject` 改为可空。Captain 与人工编辑都必须为每项任务提供可读标题。
- 不在本改动中打包、发布、push、tag 或创建 GitHub Release。

## 方案比较

### 方案 A：显式构建态、计划 revision 和可信审批凭据（采用）

在现有 staged phase 内扩展明确的 review 子状态，增加 Team 级 `planRevision`，让
Captain 提交计划、Web 编辑和审批都通过同一个原子 runtime 边界。Web 先申请与
Team、Captain 和 revision 绑定的一次性凭据，再由第二次点击消费；聊天工具从
Session 事件中验证本轮直接用户消息。

优点：状态、UI 和授权证据一致；陈旧页面、重复点击、模型伪造 confirmation、
Captain 半成品 DAG 都 fail closed；不建立第二套调度器或运行时。

代价：需要同步 TeamState、snapshot、Host 路由、React 编辑器、提示词和多组回归，
并严格更新所有新 V2 fixture。

### 方案 B：只给现有批准按钮增加浏览器二次确认（拒绝）

这种做法能减少误点，但仍以“成员和任务非空”代表计划完成，也没有 revision/CAS。
页面确认期间 Captain 若修改任务，旧页面仍可能批准另一个版本；Captain 会话仍看
不到可信来源。

### 方案 C：删除聊天审批，只允许 Web 按钮（拒绝）

授权边界最窄，但会破坏已有“在聊天中明确批准”的工作流，也让无 Web 操作场景
无法继续。正确做法是让两条路径使用不同的可验证证据并汇聚到同一批准 runtime。

## 状态与持久化合同

### 生命周期

继续保留顶层 `phase: 'staged' | 'running'`，避免建立并行运行时；staged Team 的
`planReviewState` 改为以下严格值：

- `building`：Captain 正在生成或修订成员与 DAG。Web 只显示进度状态，不显示
  计划编辑器或审批按钮。
- `ready_for_review`：完整 roster 和 DAG 已通过 staged graph 校验，可以由用户
  查看、编辑或批准。
- `awaiting_feedback`：用户选择“回到聊天继续修改”；页面停止审批，Captain 收到
  插件来源的修改上下文。Captain 开始写入后回到 `building`，原子提交完成后再回到
  `ready_for_review`。
- `running`：审批已提交，成员已经完整创建，调度器可运行；此时不得再出现
  `planReviewState`。

### Team 级计划 revision

每个新 Team 必须有正整数 `planRevision`：

1. 创建 Team 时从 `1` 开始，初始 Profile roster 和 seed tasks 都属于 revision 1。
2. 任一用户可审核的 roster 或 task graph 内容变化恰好增加一次 revision；同一批
   原子操作只增加一次。这里的计划内容包括成员名称、角色、Provider、模型、
   reasoning 策略、execution prompt，以及任务标题、依赖、assignee 和质量合同；
   不包括成员运行时 session ID、任务执行状态、attempt、output 或 mailbox。
3. 单纯轮询 snapshot 不增加 revision。`building/ready/awaiting_feedback` 状态变化
   不单独制造额外 revision；若状态和计划在同一原子写入中变化，仍只增加一次。
4. Web 修改和审批必须携带 `expectedPlanRevision`。不匹配时返回结构化
   `stale_plan`，不写状态、不 spawn 成员，并要求刷新页面。
5. `TeamActivitySnapshot` 和客户端 `ActivityTeam` 必须暴露 `planRevision`，使页面
   展示和提交使用同一版本。
6. 审批时写入成员 session ID 和后续调度产生的任务状态不增加 plan revision；
   `approvedPlanRevision` 因而始终指向用户实际看到并批准的计划版本。

### 审批 provenance

staged Team 不得携带批准字段。进入 running 时一次性写入：

- `approvedAt`：Host 完成批准提交的时间；
- `approvedPlanRevision`：实际批准的 `planRevision`；
- `approvalSource`：`web`、`chat` 或 `automatic`；前两者用于 required-approval，
  `automatic` 只记录调用方明确选择 `approval=automatic` 的既有即时执行策略；
- `approvalEvidenceId`：Web 一次性凭据的非秘密 receipt ID、聊天直接用户事件的
  Session seq 标识，或 `automatic:create:<team-id>` 策略标识。

运行态校验要求这四个字段同时存在，且 `approvedPlanRevision === planRevision`。
Web/Chat running Team 还必须保留有限的 `planReadyAt`；automatic Team 没有人工审核
时不得伪造该时间。staged 状态出现任一批准字段、running 状态缺字段或 revision
不一致都视为严格 V2 状态无效。

`planReadyAt` 在每次进入 `ready_for_review` 时刷新，用于聊天审批确认用户消息发生
在最新计划可审核之后。它不是用户输入，也不作为授权本身。

### 不兼容策略

仍使用项目既定 `schemaVersion: 2`，但新字段和新状态对新实现是必需合同。旧 Team
缺少 `planRevision`、使用旧 `awaiting_review`，或 running Team 缺少审批 provenance
时继续被 `AgentTeams V2 状态无效` 严格拒绝；不读取后修复、不自动迁移、不保留
双解析分支。用户不需要历史 Team 时可删除精确的 `.agent-teams/<team-id>/`。

## Captain 计划提交合同

`agent_teams_create` 的 required-approval 路径创建 `building` Team。对于
`taskPlanning: captain` Profile，Captain 负责从目标自动生成最小完整 DAG；Profile
仍提供 roster、角色模型和质量约束。

`agent_teams_edit_plan` 增加 `submit_for_review` 布尔参数：

- 普通编辑保持或进入 `building`；
- `submit_for_review: true` 与本批 operations 在同一 Team lock 中执行，随后运行
  完整 `validateStagedGraph(..., true)`；只有全部通过才原子写为
  `ready_for_review`；
- operations 可为空的唯一情况是 `submit_for_review: true`，用于 Profile 已经提供
  完整 seed graph 的场景；
- 任一 operation 或严格 graph 校验失败时整批不落盘，也不改变 review 状态；
- running Team 继续返回现有 `already_running` 结构化指引。

同一个 runtime 通过明确的调用来源区分 Captain 与 Web：Captain 编辑在最终提交前
处于 `building`；Web 只允许编辑 `ready_for_review` 的计划，成功保存后仍保持
`ready_for_review`，同时增加 revision、刷新 `planReadyAt` 并使所有旧审批凭据失效。

模型提示明确要求：不要逐项创建后让用户补标题；应自动生成任务 `subject`、依赖、
assignee 和所需质量合同，优先一次 `agent_teams_edit_plan` 原子提交。只有完整提交
成功后才向用户说明计划可审核，绝不在同一轮调用审批工具。

## 自动 Team 名称与任务标题

`agent_teams_create.name` 从必填字符串改为可选字符串：

1. 主模型应根据用户目标生成简短、可读、无凭据和患者标识的 Team 名。
2. 省略、空白或非字符串在 Host 边界都视为“未提供”，不会报空名称错误。
3. Host 兜底从 `description` 的首个有效短语生成有限长度 Unicode 可读前缀；没有
   可用目标时使用 `agent-team`。生成前剔除 URL、邮箱、UUID、长数字和 token-like
   片段；命中患者/凭据类敏感标记时直接使用通用前缀。随后添加短唯一后缀，并在
   captain lock 内分配未占用的 Team ID。
4. 模型显式提供的非空名称继续保持原样；若其 ID 已占用仍返回冲突，不静默改名。
5. 自动名称只用于 Team 展示和本地状态目录，不写入用户配置，也不影响 Profile。

任务 `subject` 仍是严格必填字段。区别只在于 Captain 会根据目标自动生成完整任务
标题；`building` 页面不显示“新增任务”表单。进入 `ready_for_review` 后，原有表单
保留为人工增补入口，空标题继续禁止保存。

## Web 审批协议

### 页面状态

- `building`：显示“主模型正在生成团队计划”和当前 roster/task 数量；不渲染成员
  编辑器、任务编辑器、新增任务输入或批准按钮。
- `awaiting_feedback`：显示“已返回主对话，等待主模型修订”；允许用户回到聊天或
  丢弃，不允许审批。
- `ready_for_review`：显示完整成员、模型、reasoning、任务、依赖和质量合同编辑器。
  人工编辑保存后返回新的 `planRevision` 并刷新审核摘要。
- `running`：沿用现有活动面板和任务监控，不显示 staged 编辑器。

### 二次确认

第一次点击“批准并运行”调用 `prepare_approval`，提交当前
`expectedPlanRevision`。Host 在 Team lock 下确认 Captain、Team、
`ready_for_review` 和 revision 后，签发一个进程内、一次性、短时有效的随机凭据，
绑定 workspace、captain session、team ID 和 revision。凭据不持久化、不进入日志，
进程重启后自然失效。

页面收到凭据后进入明显的确认态，显示 Team 名、成员数、任务数和 revision。第二次
点击才发送 `approve`。runtime 原子消费凭据并再次做 CAS；成功、失败、超时或取消
后都销毁凭据。重复消费、过期凭据、其他 Team 的凭据、revision 变化和 Captain
脱离都返回 409 结构化错误且零写入。

页面 snapshot revision 变化时必须自动解除确认态。用户可以显式取消确认，不影响
Team。批准提交成功后页面等待 snapshot 进入 running，不通过本地乐观状态伪造成功。

## 聊天审批合同

`agent_teams_approve` 增加必填 `expected_plan_revision`，并继续接收
`confirmation`，但不再把非空字符串视为证据。工具必须在 Captain Session 中：

1. 通过当前 `exec.callId/rootCallId` 找到本次真实工具调用所在的 turn；
2. 找到该 turn 在工具调用前的直接 `user/message`，且 `source.kind === 'user'`；
3. 要求该事件晚于最新 `planReadyAt`，证明批准发生在完整计划展示之后的新用户轮；
4. 要求 `confirmation` 等于该直接用户消息的规范化文本，不接受模型自写摘要；
5. 要求文本包含明确的批准意图和计划/Team 指代。单独“继续”“确认”“可以”或插件
   注入消息不构成批准；工具返回 `approval_required` 并提示 Captain 请求清晰授权；
6. 最后在 Team lock 内重验 `ready_for_review` 和 `expected_plan_revision`，再提交。

没有 Team 返回既有 `inactive` no-op；Team 尚在 building/feedback 返回 `not_ready`；
revision 不一致返回 `stale_plan`；没有可信直接用户证据返回 `approval_required`。这些
拒绝都不得 spawn、写 Team 或 kick scheduler。

## 统一批准 runtime 与 Captain 通知

Web 与聊天不各自实现状态转换，而是汇聚到同一 `approveStagedTeam()` runtime。
runtime 接收可区分的审批证据：

- Web：一次性 Host credential + expected revision；
- Chat：已验证的直接用户 event seq + expected revision。

`approval=automatic` 不伪装成 Web/Chat 用户审批，也不进入 staged 批准 runtime；
它沿用现有即时创建路径，并以 `approvalSource=automatic` 和策略 evidence ID 写入
同一严格 provenance 结构。这样所有 running Team 形状一致，同时不会把自动策略
误报为人类批准。

runtime 在 lock 内完成最终 graph 校验、模型路由校验、成员 spawn、phase/provenance
提交和 scheduler kick。任一步在 durable commit 前失败时沿用现有成员清理逻辑；
commit 后 kick 失败继续作为可恢复告警，不把已经 running 的 Team 伪报为未批准。

提交成功后，Host 用 `source.kind = 'plugin'`、`plugin = 'dsh-agent-teams'` 向 Captain
注入一条不含用户原文的可信上下文，包含 Team ID、批准来源、revision 和 receipt
标识，明确说明该 running 转换已由 Host 验证。注入失败不回滚已提交审批，但记录
脱敏警告；durable provenance 仍是最终事实。Captain 不得因为看见 running 而将其
当成未经批准，也不得把插件上下文当作新的业务授权。

## 接口与文件边界

主要实现边界如下：

- `src/types.ts`：staged review 状态、Team `planRevision` 和审批 provenance。
- `src/state.ts`：严格 V2 校验、Team 计划 revision 连续性和 CAS helper。
- `src/tools.ts`：自动命名、Captain 原子提交、聊天用户事件验证、Host credential、
  统一批准 runtime 和结构化拒绝结果。
- `src/snapshot.ts` 与 `src/client/activity-monitor.ts`：向 Web 暴露 review state 和
  `planRevision`。
- `src/index.ts`：Web `prepare_approval`/`approve` 路由，严格 payload 解析和错误码。
- `src/staged-plan-payload.ts`：Web mutation 的 `expectedPlanRevision` 边界校验。
- `src/client/StagingPlanEditor.tsx`：building/feedback/ready 三态、人工编辑 CAS、
  二次确认和 stale-plan 恢复。
- `src/client/ActivityPanel.tsx`、locale 与 CSS：状态文案、确认态和可访问性。
- `src/command.ts`、AgentTeams system prompt 与内嵌 Skill：自动命名、原子提交、
  明确审批和禁止同轮自批规则。

Host payload 中所有 revision 必须是正安全整数；字符串、浮点、零、负数或缺失值
在边界拒绝。Web 列表字段仍保持现有“非字符串项整体拒绝”合同，不因本改动放宽。

## 错误处理

- `building` 或 `awaiting_feedback` 的批准请求：`not_ready`，零写入。
- revision 不匹配：`stale_plan`，返回当前 revision 和“刷新计划”下一步，零写入。
- Web credential 缺失、过期、重复、跨 Team 或跨 Captain：`approval_required`，
  零写入。
- 聊天没有本轮直接用户事件、引用旧消息、confirmation 不一致或只有泛化短语：
  `approval_required`，零写入。
- 完整 graph 不合法：保留具体 staged graph 错误，Team 仍 staged。
- 模型路由或成员 spawn 失败：不得写 running provenance；已创建成员按现有退休和
  interrupt 路径清理。
- approved commit 后 scheduler kick 失败：返回成功并记录可恢复警告。
- Captain 会话未附着：Web 返回 409；不把浏览器请求映射到其他 Captain。

所有错误只返回可操作的状态、当前 revision 和下一步，不输出 credential、完整用户
消息、Provider Token 或 `.agent-teams` 文件内容。

## 回归设计

### 先建立失败回归

实现前先证明当前行为存在：

- required-approval Team 创建后直接显示为可审核，而不是 building；
- 首项任务出现时 Web 即可单击批准；
- Web `approve` 不需要 revision 或 Host credential；
- `agent_teams_approve` 只检查非空 confirmation；
- `agent_teams_create` 缺少 name 在 schema/execute 边界失败；
- Web 半成品页面显示手工“新增任务”输入。

### 状态与 CAS

- 新 Team 从 `planRevision=1`、`building` 开始；旧 `awaiting_review` 或缺 revision
  Team 被严格拒绝，不迁移。
- 一个原子 mutations batch 只把 plan revision 增加一次；失败 batch 零写入。
- `submit_for_review` 只有在完整 graph 通过时进入 ready；空 operations 只有 submit
  场景合法。
- Web 修改使用正确 expected revision 成功并返回新 revision；陈旧 revision 不写入。
- running provenance 四字段同时存在且匹配；缺失、部分存在或 revision 不一致拒绝。

### Web 审批

- building/feedback 不签发 credential；ready 才可 prepare。
- credential 绑定 workspace、Captain、Team、revision，且单次、限时、重启失效。
- 第二次点击成功；取消、过期、重复、跨 Team、跨 Captain、revision 冲突均零写入。
- snapshot revision 变化解除确认；请求进行中禁用重复点击并有可访问状态文案。
- 成功后 Captain 收到可信插件上下文；上下文不包含用户原文或秘密。

### 聊天审批

- 最新直接用户消息在 ready 之后、文本与 confirmation 相符且意图明确时成功。
- 旧轮消息、插件注入消息、模型自写 confirmation、同轮创建后自批、单独“继续”或
  “确认”全部返回 `approval_required`。
- no-team 继续是 inactive no-op；building/feedback 是 not_ready；stale revision 是
  stale_plan。

### 自动命名与 UI

- 模型显式名称保持不变；省略/空白名称由 Host 生成可读唯一名称；并发冲突不会
  覆盖其他 Team。
- description 缺失时仍有通用唯一名称；自动名称经过现有 Unicode 安全路径归一化。
- building 页面没有任务标题输入、编辑器或审批按钮；ready 页面保留完整人工编辑。
- Captain 自动产生的任务标题、依赖、质量字段通过 snapshot 完整显示。

### 既有回归

必须继续通过 selection policy、Profile、reasoning、quality gates、requirements
依赖、task revision/CAS、wait/event recovery、halt/resume、stress、Subagent spawn、
compact status 和 build-path 测试。不得删除、跳过或放宽现有回归换取绿色。

实现后至少运行：

```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop\agent-teams-plugin
pnpm test

cd D:\Trae\其他\deepseek-harness\win-desktop
npm run verify:upstream
```

最终门禁必须保持离线、无安装、无网络、无打包。

## 版本、文档与上游维护

实现与 focused 回归通过后，再同步：

- AgentTeams fork 版本从 `0.1.14-desktop.12` 增加到下一 desktop patch；
- Wrapper `package.json`/lockfile 中本地包版本与集成断言；
- `AGENTS.md` 的 staging、审批 provenance、自动命名和无旧状态迁移 invariant；
- `agent-teams-plugin/README.md`、`README_ZH.md`、`UPSTREAM.md` 和对应 release notes；
- 根 README、`win-desktop/README.md`、`docs/UPSTREAM_MAINTENANCE.md` 与
  local capability manifest。

只有全部回归证据存在后才更新 provenance。未来上游更新必须把该能力分类为
`UPSTREAM_EQUIVALENT`、`REAPPLY` 或 `SUPERSEDED_BY_DESIGN`，并保留本设计的
focused 回归；不能重新退化为“成员和任务非空即可一键运行”。

本设计本身不授权构建 EXE、提交实现、push、tag 或发布资产。实现完成后是否打包与
发布，仍由用户另行确认。

## 验收标准

- 半成品 Team 明确显示为 building，不出现人工任务名称要求或批准入口。
- Captain 自动命名 Team、自动生成完整任务 DAG，并原子提交 ready_for_review。
- Web 只有在 ready 状态经过两次用户动作、有效 Host credential 和 revision/CAS 后
  才能启动 Team。
- 聊天审批只有本轮真实直接用户明确批准最新 revision 时才能启动 Team。
- running Team 持久化可审计的来源、revision、时间和 evidence ID；Captain 收到
  可信 Host 上下文，不再误判为无授权自动启动。
- 陈旧页面、重复审批、跨 Team credential、泛化“继续/确认”、同轮自批和无 Team
  审批均 fail closed 且零写入。
- 自动命名不覆盖显式名称，不引入旧 Team/Profile/对话迁移层。
- AgentTeams focused 测试、既有完整测试和最终 `npm run verify:upstream` 全部通过。
