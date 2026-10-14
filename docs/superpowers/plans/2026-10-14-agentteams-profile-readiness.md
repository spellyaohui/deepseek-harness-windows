# AgentTeams Profile Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TEAM 模式能准确解释未启动原因，并按用户选择使用固定角色的队长动态规划，交付 rc.23 本地测试包。

**Architecture:** 复用严格 Profile 解析和官方设置编辑器；工具只作只读诊断，创建及唯一子会话网关的权限/路由保持不变。无团队提示只标明可信默认配置，当前直接用户命令仍优先；不能添加隐藏输出字段或全局调用缓存。

**Tech Stack:** TypeScript/AgentTeams、官方 Harness `0.2.0-rc.2`、真实离线 AgentLoop 回归、Electron Windows 包装器。

**Spec:** `docs/superpowers/specs/2026-10-14-agentteams-profile-readiness-design.md`

## Global Constraints

- 在当前 dirty main 原地实施；不建 worktree，不安装依赖，不改官方 tarball，不清理用户文件。
- 状态成功值仍为 `{active:false}`；不自动选 Profile/创建/派遣/修改配置，当前直接用户命令优先。
- 用户最新选择：本轮只改代码和打包，不访问/修改用户配置；交付说明由用户通过官方编辑器切换 `taskPlanning: captain`。
- 保留角色模型/思考、严格 V2、质量门、三次空查暂停、唯一网关、临时授权、Native 和 Superpowers。
- AgentTeams `0.1.23-desktop.5`，wrapper `0.2.0-rc.23`，宿主 `0.2.0-rc.2` 不变，队长完整提示 ≤3,500 字符。
- 本轮不 commit/push/tag/Release，不安装或重启客户端；旧包保留。

## Review Focus

- 保存默认和本轮直接用户选择不同：诊断不能把默认当成实际选中的 Profile 或额外权限。
- 格式无效、丢失/删除/重命名绑定：只报告修复指引，不能猜第一个 Profile 或写状态。
- 查询期间配置发生改变、并发会话：不能通过全局结果缓存串用另一会话的信息。
- 改规划方式：成员/显式思考/提示词/任务数据/临时模型原样保留，现有 Team 不被改变。
- 创建空动态 Team 不等于启动工作：必须真实建立任务并验证冻结角色和 durable gateway 投递。

---

### Task 1: 精确诊断与真实启动回归

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/inactive-poll-guard.ts`, `src/tools.ts`, `src/index.ts`, `src/profiles.ts`（只修改实际需要的调用点）
- Test: `win-desktop/agent-teams-plugin/scripts/inactive-poll-guard.test.mjs`、现有 Profile/路由/lifecycle 回归

**Interfaces:**
- Consumes: `ToolsConfig.settings.get()`、`ToolsConfig.profiles`、`resolveTeamProfile(profiles,name,maxMembers)`；官方工具 render 只有 args/value，无调用 Agent。
- Produces: 无团队只读内容的配置诊断及就绪指引；工具成功值/Schema、创建 admission、冻结模型策略不变。

- [x] Step 1: 在真实工具 fixture 添加缺失/未知/无效默认、seed 零任务、ready seed/captain、用户命令覆盖默认、并发配置刷新及无写入测试；在真实 AgentLoop 添加 status → create → create-task → 冻结 reviewer 子会话完成测试。
- [x] Step 2: 运行 `node --test scripts/inactive-poll-guard.test.mjs`（插件目录）。Expected: 新诊断断言 FAIL，原 26 个守卫回归仍 PASS。
- [x] Step 3: 实现最小配置诊断，复用严格解析；明确默认与用户命令的关系。保持状态值 `{active:false}`，不缓存调用结果或偷偷附加字段。更新紧凑系统提示/暂停提示，保持 3,500 字符预算。
- [x] Step 4: 运行同一测试以及插件 `pnpm test`。Expected: 全部 PASS，真实动态任务产生子成员工具执行记录，显式角色 Provider/model/effort 不变，空 seed 无 Team 写入。

### Task 2: 目标设置切换及版本登记

**Files:**
- 不修改正式用户设置；由用户自行通过现有官方 Profile 编辑器切换。
- Modify: 两级 package/lockfile、版本集成断言、README/UPSTREAM/维护登记；新增两级 rc.23/desktop.5 release notes。

**Interfaces:**
- Consumes: Task 1 的诊断/创建行为；现有 ProfileForm `onChange({...profile,taskPlanning:'captain'})` 和一次 SettingsForms/CAS Save。
- Produces: 精确设置切换的前后核对（或明确需用户保存的限制）、一致的版本/能力登记。

- [x] Step 1: 设置回归证明只改变 taskPlanning 并保留完整成员、任务、提示词、默认及临时策略；旧 Team 仍冻结。若现有回归覆盖，复用并运行，不为流程写重复测试。
- [x] Step 2: 保留所有用户配置不变，在交付说明提供 software-delivery → 队长动态规划 → 保存的人工步骤，不使用恢复默认。Expected: 本轮没有任何用户配置写入。
- [x] Step 3: 同步 AgentTeams `0.1.23-desktop.5`、wrapper `0.2.0-rc.23` 和所有版本断言；宿主/官方 provenance 不变。
- [x] Step 4: 从 `win-desktop` 运行离线 `npm run verify:upstream`。Expected: exit 0，无安装/网络/打包。

### Task 3: 独立复核与本地验收包

**Files:**
- 只在本计划 ignored workspace 记录证据；新包位于 `win-desktop/dist/rc23-acceptance-20261014`，旧包不动。

**Interfaces:**
- Consumes: Task 2 完整门禁和版本；现有 runtime/ZIP 闭包脚本和本地图标。
- Produces: EXE/ZIP/blockmap、大小/SHA-256/签名、准确的证据分层与测试入口。

- [x] Step 1: 单次全量 fresh-context 只读代码复核，明确本轮增量与已有 dirty 改动；重要问题一次 RED→GREEN 修复并重跑门禁。Expected: 无未解决关键/重要问题。
- [x] Step 2: `npm run dist:win -- --config.directories.output=dist/rc23-acceptance-20261014`。Expected: exit 0、rc.23 EXE/ZIP/blockmap。
- [x] Step 3: 运行实际安装目录、unpacked/隔离 ZIP 闭包；比较 AgentTeams runtime 源/安装/打包文件、官方图标与固定 Superpowers 资产。Expected: 闭包 PASS、实际插件版本 desktop.5、无外部解析。
- [x] Step 4: 获取文件大小、SHA-256 和 Authenticode，留下验收记录。Expected: 仅声明实际构建/自动回归证据，不声明真实模型或整夜运行验收。
- [x] Step 5: 运行 `node .superpowers/sdd/2026-10-14-agentteams-profile-readiness/verify-package.mjs` 作为最终 task-done。Expected: exit0，三份产物哈希与验收记录一致。
