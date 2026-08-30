# ADR-001: AgentTeams 状态监视采用质量保真的分级输出

## 状态

Accepted

## 日期

2026-08-30

## 背景

AgentTeams 的右侧活动面板使用本地状态接口轮询，不直接调用模型；但队长模型调用 `agent_teams_status` 时，工具结果会进入后续上下文。原状态结果同时携带成员路由、Profile 协议、全部任务输出和邮箱内容，重复查询会放大队长输入 Token。原工具还在每次队长查询时执行调度 kick，使“查看状态”和“唤醒成员”耦合。

目标是在不削弱任务质量、依赖门禁、验收证据、失败恢复和消息汇报的前提下，降低重复状态查询的上下文成本。

## 决策

- `agent_teams_status` 默认是只读的 `summary` 查询，不触发成员唤醒或邮箱确认；处理已显示消息后使用显式 `acknowledge=true` 消费对应邮箱。
- 摘要保留任务状态、依赖、attempt/attempt_id、verdict/findings、Coverage、Delivery 阻塞、成员活动状态和新邮箱信息；完整任务输出、Provider/模型、Profile 协议等详细内容通过 `detail="full"` 显式读取。
- 连续查询的 summary-visible 状态没有变化时，摘要收敛为心跳计数，仍保留活动成员、运行/阻塞/完成任务计数、Delivery 和邮箱计数。
- 仅队长在重启恢复或明确发现 ready work/mail 卡住时使用 `wake="recover"`；正常创建、批准、任务更新和成员 idle 边缘继续由事件驱动调度。
- 将摘要/完整渲染和状态指纹隔离到 AgentTeams 自有 `status-render` 模块，并为它保留构建产物、生命周期和压力回归。

## 备选方案

### 保持原状

无需改动，但每次 status 都重复携带长任务报告和稳定路由信息，也继续把读取与唤醒绑定，Token 和误唤醒风险最高。

### 永久只返回极简计数

Token 最低，但队长可能看不到依赖、验收、失败和交付阻塞等决策所需信息，不能满足质量要求。

### 仅降低 UI 轮询频率

只能减少本地 HTTP/磁盘访问，不能减少模型上下文 Token；不解决主要成本来源。

## 后果

- 普通监视查询更短，重复查询可进一步压缩为心跳。
- 需要审查报告、验证证据或核对模型路由时，队长必须显式请求 `detail="full"`，完整任务输出和 Profile 协议不会被摘要截断。
- 冷启动或真正卡住时需要队长显式 `wake="recover"`；这避免查看状态时产生隐式模型回合，同时保留恢复能力。
- 上游刷新时必须将此行为按 `REAPPLY` 或 `UPSTREAM_EQUIVALENT` 分类，并保留 `verify.mjs`、`lifecycle-verify.mjs`、`stress-verify.mjs` 和 Wrapper 门禁。
