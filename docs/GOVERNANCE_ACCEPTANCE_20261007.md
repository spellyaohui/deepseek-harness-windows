# 十项治理验收记录 — 2026-10-07

基线为 canonical workspace `D:\Trae\其他\deepseek-harness`、`main`、
`d8e0a729d5cdb3dd24218b782ce874e2bf655814`；开始时工作区干净。初验阶段只修改本地代码、
回归和治理文档并进行授权的构建验证，没有提交、推送、tag 或发布。随后用户明确授权保留成果并
提交、推送及发布 rc.17 预发布；仍不部署或安装到用户环境、不调用收费模型、不迁移用户数据。

当前 owner：wrapper `0.2.0-rc.17`、AgentTeams `0.1.22-desktop.10`、
output-limit-finish `0.1.1`。Harness 仍固定 `0.2.0-rc.2` /
`639ed015397290b3745d163aafe02ffee4aa3f84`，AgentTeams 上游仍固定 `v0.1.22` /
`9cba4fe4171f27c019991cafd2a107f87ef3517b`。Models、CPA、Desktop Settings 与 guidance
版本不变。以下扩展由各自原 owner 持有，不新增状态或模型路由所有者。

| 项目 | 已落实行为 | 主要回归证据 |
| --- | --- | --- |
| 1 统一完成审计 | 按最终有效 `changedPaths` 审计，完成时省略不能绕过预存清单；普通开始与队长接管共用捕获基线入口；保留 claimed→completed 禁止规则 | `quality-gates-tdd.mjs` 的预存清单省略、takeover、隐藏文件与空清单案例 |
| 2 重启与审计状态 | 在原 Team/Task 文档内保存独立 schemaVersion 1 基线，绑定真实 workspace、Team、task、attempt 和文件哈希；明确 observed/not-git/failed；缺基线、身份不符、Git 超时或权限失败拒绝严格完成 | `governance-audit.test.mjs` 的 JSON 重启、缺基线、身份、EACCES、超时与非 Git；严格 V2 state 回归 |
| 3 并发归属 | 取消按其他任务 scope 的概括豁免；仅当前 attempt 中实际工具执行观察到、合同匹配且最终内容仍匹配的具体文件可解释并发变化；排除、保护和重叠范围不会被豁免 | governance 的 pending 大范围、排除、重叠、哈希变化、两种完成顺序；`agent-teams-governance-runtime.test.js` 的真实 Tools/native 子进程 |
| 4 review/integration 合同 | review 绑定审查对象 attempt、合同、代码版本和不同逻辑执行者；integration 开始、dispatch/claim/takeover 与完成均重验所需独立通过审查，包括开始后新增审查；取消必须有有效替代通过，失败必须有完整 finding 修复链及新通过 | governance 的无 review、取消、修复不等于通过、版本陈旧、完整 finding 覆盖；quality-gates 的 late-review 零写拒绝 |
| 5 证据来源 | 成员报告保留兼容但明确标记；真实前台 bash 执行观察记录退出码、call、attempt、合同和代码版本；新 attempt、合同修改或代码变化不能沿用旧观察；status summary/full 展示来源与绑定 | governance 的 attempt/contract/code 失效及 status 来源；真实 Cordis Tools 观察；合同逐条规范化精确匹配旧回归 |
| 6 UI 与模型路由 | 保留现有入口、布局和 `resolveCallConfig`；临时默认、冻结 Profile 角色、工具显式请求与 Native 各自作用域；旧 Save 响应不能跨新 Save、取消、会话/设置替换或卸载修改页面 | `settings-client-verify.mjs` 延迟响应；真实 SettingsForms/ConfigEditor 保存、回读、重启；`team-subagent-compat.test.mjs` 三种 reasoning、显式优先、不可用零写、并发/忙成员、冻结角色和 Native |
| 7 状态持久化 | 保留现有锁和单一 store；完整 temp 写入、fsync、四次 rename 尝试及 750ms 有限等待；不再失败后直接覆盖；提交成功后才推进调用方 revision；未提交 crash temp 不晋升 | `verify.mjs` 真实 Windows 持久占用保旧、400ms 晚释放恢复、临时文件回收及 archive 重试；governance/runtime crash temp |
| 8 截断链路 | 唯一 provider-neutral `llm/stream` listener 等到 usage/stream 结束再判定；显式请求预算优先，默认预算、缺失/后到/多次 usage、取消和其他 finish 保留语义；通知从 durable session 最新对应 turn/task/attempt 解析并按 attempt 去重 | `output-limit-finish.test.js` 真实 AgentLoop 与流矩阵；governance 的重启、陈旧 attempt/task、新未完成 turn；default/modern lifecycle |
| 9 兼容与 Models | 固定 revision 的可执行 loader 锚点登记精确命中数、分类、失败和回归；关键漂移在执行前失败；官方已等价的 spawn/taskkill 删除重复本地改写；保留必要 preload/profile/shell/fs/quota/grep/web；Models draft/Save fork 保留 | `compatibility-anchors.test.js` 真实安装闭包、命中/重复/丢失/idempotence；console/descendants/grep/web；routing 生命周期 HMR/dispose/tools.get 组合；Models 全套 |
| 10 版本与治理 | 同步 owner package、wrapper lock、断言、README、UPSTREAM 和兼容登记；canonical main 替代旧 fresh-worktree 流程；历史方案明确不是恢复指令 | local-capability/artifacts/integration 断言、完整离线门禁与文档审查 |

## 严格完成与证据的边界

基线不是第二套存储系统：它是 strict V2 Team 的可选、单独版本化扩展，由原 state owner 原子提交。
不伪造旧 attempt 历史，不迁移旧 Team。Git 工作区中旧进行中任务缺基线时，应明确失败/重新分派并
开始新 attempt，不能补一个当前快照冒充过去。Git 失败不改变已提交任务状态。明确非 Git 工作区仍
执行合同与路径校验，但不宣称完成 Git 变更审计或 Git 代码版本保证。

工具执行前后 Git 净变化及最终哈希是可观察归属证据，并非取证级作者证明：外部编辑器若在同一
执行窗口修改文件，无法证明是哪一方写入；写入后恢复原内容也不在净变化中。无法匹配当前证据的
并发变化不会静默通过。观察条数到达有界上限时报告失败，不丢弃历史以继续通过。

执行器证据只来自实际官方前台 bash 返回的可信执行 DTO，包含非超时、非取消的真实退出码。
后台任务、任意 MCP 文本、成员 `commandsRun` 和自然语言不会提升为已执行证据。成员自报仍可用于
原有完成合同，但来源单独显示；独立 review 是不同逻辑 assignee 对明确对象/版本的审查，不证明其
自然语言意见客观正确。格式规范化后的逐条合同文本匹配继续保留。

integration 必须覆盖上游 implementation/repair 的当前独立通过审查。真正下游的交付后审查不阻塞
自身前置而造成死锁，但不能代替输入审查；失败/取消审查的替代链必须满足当前对象、版本和 finding
覆盖。交付汇总不是执行准入，也不是部署授权；任务名称和普通确认不能产生发布/部署权限。

输出恰好达到实际预算是官方 max-tokens 的边界分类依据，无法断言自然结束还是推理消耗导致。
缺 usage 不猜测、取消不改写、其他 finish 不动；没有对应 durable turn/task/attempt 标记时不猜历史原因。
不自动无限重试，不新增规划模型自动切换。

## 验证与未验证范围

第一次完整源码门禁通过：Models 25、CPA 27、AgentTeams 全部脚本、运行时闭包、wrapper 194 项
（零失败、零跳过）。该门禁发生在 owner 版本和 provenance 同步之前。最终同步后的门禁和隔离
Windows 构建/启动均通过，结果记录在 [rc.17 发布记录](../win-desktop/release-notes/v0.2.0-rc.17.md)。
门禁全程离线，不运行 install、网络或打包。

模型实际调用以真实 Cordis/AgentLoop/Settings runtime 加受控适配器验证；未调用收费模型或真实
用户网关、未使用用户凭据。隔离打包验证不等于真实 NSIS 安装、第二台机器验证或线上发布。

2026-10-07 单独只读核对 [官方 Harness releases](https://github.com/deepseek-ai/deepseek-harness/releases)
与 [官方 AgentTeams releases](https://github.com/NanmiCoder/dsh-agent-teams/releases)：前者已有
`v0.2.1-alpha.1`，后者为 `v0.1.22`；按用户约束不擅升 alpha，也不改固定运行时依赖。
参考项目的固定 commit 页面读取不可用；未复制其 catalog、HTTP 路由或替代本地角色 allowlist/Connection 边界。

## 回滚

初验阶段没有提交或修改 Git metadata；后续授权提交后，可通过新的 revert 提交回滚源码，或先保留
当前差异再选择性反向应用本次 source/test/docs/version 补丁。恢复 owner 版本及 lock/断言后，
运行离线门禁以重新同步生成 lib。不要 force-push、改写发布标签、`reset --hard`、
`clean`、删除 Profile/会话或覆盖其他并行改动。新扩展只记录新 attempt 的证据，回滚不要求迁移或
清空用户数据；旧代码不会获得新审计保证。构建产物仅在隔离临时输出目录，未写入发布仓库。
