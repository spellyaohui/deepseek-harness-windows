# Team Profile 委派边界实施计划

> For agentic workers: use subagent-driven-development task by task; no commits in this user-approved local test work.

**Architecture:** Reuse official SettingsForms/CAS, current Profile snapshots, real-user command evidence and the existing durable gateway. Restrict model-facing visibility and admission in the existing AgentTeams owner; no second dispatcher or prompt plugin.

**Tech Stack:** TypeScript, React, Schemastery, Harness 0.2.0-rc.2, Node integration tests.

**Spec:** User-approved team-default/temporary-exception design in this conversation, restated under Global Constraints.

## Review Focus

- A later turn cannot inherit old temporary authorization; quoted/refusal/child/skill messages never grant it (Task 1).
- Switching settings never rewrites routes of an already-created Team (Task 1).
- A blank binding, unavailable model or empty fixed template has zero durable writes/spawns (Task 1).
- Renaming/deleting a default Profile cannot leave a silent wrong binding; one official CAS or clear failure (Task 2).
- HMR/JSON hydration and real installed dependency synchronization preserve the boundary, not only source-level tests (Tasks 1–3).

## Goal

在现有 main/rc.20 未提交成果上实现用户已批准的“团队默认、临时例外”。不再次执行已完成的 v0.1.23 源码迁移。不改真实用户配置、会话或已安装程序；不提交、不发布。

## Global Constraints

- 保留 AgentTeams 的任务、调度、面板及唯一 durable subagent gateway；Native 模式行为不变。
- 普通 Team 委派绑定用户保存的默认 Profile 或本轮真实用户通过现有 Profile 命令指定的 Profile。没有绑定、未知 Profile、固定模板没有任务、配置模型不可用时，明确拒绝且零 durable 写入/启动；不猜第一个 Profile、不退回临时模型。
- 已创建 Team 的角色政策继续冻结；普通新增成员使用明确 role_template 或现有编号角色继承，不通过角色描述/任意名称猜路由。Profile 路由、显式指定 Provider/model/思考强度、质量门、严格 V2、认证/CAS 和网关并发边界保留。
- 临时委派只在当前轮真人直接明确授权时可用；模型参数、技能文本、引用、历史、子会话或工具输出都不是授权。保守识别；不明确时走团队或提示真人确认。并行/重复的授权临时调用仍受已有容量和 busy/pinned-policy 约束。
- 工具可见性及实际调用入口都执行边界。普通聊天不强制启动 Team，也不强制每个角色都工作。现有 ad-hoc 底层能力仅供授权临时入口使用。
- 新配置字段命名为 defaultProfile（可选字符串，空白视为未绑定）。通过现有官方 SettingsForms/CAS 存储；不增加桌面 JSON writer，不迁移旧 Team/Profile，不自动改用户保存的模板。
- 系统提示词增加上述边界，不靠提示词独自保障；完整内置 software-delivery 提示 ≤3500 字符，wrapper guidance ≤500 字符。
- Superpowers 官方 v7.0.0 原文 75 文件和 LICENSE 不变；仅本地 dsh-tools 映射适配。
- 所有改动用 apply_patch；保留全部既有 dirty 文件、上轮包和旧用户 plan/spec。没有 install/network/pack 进入回归门禁。
- 版本计划：AgentTeams 0.1.23-desktop.3；Superpowers 映射所有者 0.1.1；wrapper 0.2.0-rc.21；Harness 固定 0.2.0-rc.2。版本/provenance/lock/assertions/docs 在新代码及回归证据之后同步。

## Task 1: Team runtime boundary and regression tests

Ownership: agent-teams-plugin/src/ 下非 client 文件、对应 scripts（含新边界测试），但不改 package 版本、UPSTREAM 或 release notes。主 Agent 不同时改这些文件。

- 在现有 settings/index Schema 与 volatile 链加入 defaultProfile；归一化保留 optional 空白语义及 JSON-wire 安全。
- 复用 command/approval-evidence 的可信真人 source/当前轮读取模式，增加最小临时授权读取；明确命令 /agent-teams --temporary <goal> 是确定性授权入口，不占用现有 Profile 命令别名。自然语言只识别完整、无否定/引用的直接“临时子智能体”授权，不能用宽泛关键词。
- 统一解析本轮用户 Profile 命令或保存 defaultProfile；普通 create 即使模型省略也绑定同一 Profile；模型提供冲突 Profile/inline plan 不能绕过绑定。
- 普通新增成员明确绑定冻结角色，不再因 unbound custom 名称走 temporaryMember；授权临时调用保留现有独立默认、显式优先级和全部 gateway 操作。
- 未授权 subagent 不在 Team captain Schema 中暴露，实际调用也明确拒绝；授权后可用，跨轮不会沿用。Native/member 权限及 HMR disposer 不回退。
- 收紧 captain 系统提示边界但保留既有 lifecycle/quality/reasoning/approval/cleanup/deploy 约束及长度上限。
- TDD：先真实工具/AgentLoop 回归失败，再实现。覆盖保存 Profile 与角色路由、漏/空/冲突 Profile、固定模板零任务、未知模型零写入；临时真人授权与伪造/旧历史/引用/否定/child/skill 不授权；工具可见性+直接执行；现有 frozen Profile/显式模型/编号角色/Native/并发临时/CAS 回归。
- 运行 AT build + focused suites，再完整 pnpm test（离线；已装依赖；不 install）。记录 RED/GREEN 证据及改动清单。

## Task 2: Default Profile settings UI and local skill mapping

Depends on Task 1 passing review. Ownership: AT src/client、相应客户端回归脚本、Superpowers lib/dsh-tools.md 和映射行为回归；不碰官方 skills/LICENSE，不改 runtime 文件及全局版本。

- 在现有 Team 设置中显示明确默认团队 Profile 选择，未绑定也可见，不能自动猜第一项。选择通过现有 writer/CAS 保存 defaultProfile；Native 及临时 Provider/model/reasoning 编辑继续独立。
- 默认 Profile 与普通编辑选中项分离。Profile rename/delete 和绑定在同一次官方 CAS 中一致处理：rename 同步绑定；delete 明确清空/提示，不静默换另一个。取消和失败重试不得提交过期草稿。
- 明确提示固定任务模板为 0 项不能启动；不自动补造用户任务、切换规划方式或覆盖原配置。
- 本地 Superpowers 映射要求 ordinary Team 使用绑定 Profile/冻结角色；fresh reviewer 不等于临时授权；明确临时须真人授权入口。原技能文字和哈希不变。
- TDD + JSON hydration / SettingsForms save/restart / rename-delete-CAS / Native 独立 / narrow usable 回归；生成 lib 由正式 build 完成。

## Task 3: Integration, versioning and final verification

Ownership: 主 Agent 的 wrapper 配置 seam、package/lock、owner provenance/notes、wrapper tests、文档；若实施单元需要改代码则委派单独 laborer，避免重叠。

- 检查 wrapper 所有 AgentTeams 配置 allowlist、默认层、备份/恢复有效字段是否传递 defaultProfile（不写真实用户设置）。
- 核对并同步三方本地版本和声明；上游 Harness/AT 固定来源不变；更新能力登记及两级 notes，明确旧普通 ad-hoc 契约被本轮用户设计取代，旧已运行 Team 不迁移。
- 保留上轮所有 regression，新增测试加入 mandatory gate；从 win-desktop 运行完整 npm run verify:upstream，离线、不安装、不打包。
- 相对本轮 dirty rc.20 快照生成 diff 包，逐任务独立 spec/quality review，再最有能力模型做跨模块最终 review；修复重要问题。
- 用户追加确认：完整回归和独立复核通过后生成新 rc.21 本地 EXE 测试包，保留 rc.20 旧包，不提交、不发版。运行 npm run dist:win，验证真实 node_modules、win-unpacked 和隔离 ZIP 解析闭包、官方图标和原始技能哈希；记录 EXE/ZIP/blockmap 大小、SHA-256、Authenticode 状态。告知新边界需要用户显式选择默认 Profile。

## Acceptance

- [x] Task 1 complete and reviewed
- [x] Task 2 complete and reviewed
- [ ] Task 3 integration gate and final review complete
- [ ] No user settings/session/installed app or Git history changed
- [ ] rc.21 EXE/ZIP/blockmap and runtime/icon/hash checks complete (user authorized later)
