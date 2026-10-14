# 累计改进保留索引 — 2026-10-14

本记录把当前对话形成的产品要求固定在仓库里，不上传聊天原文、附件、会话、用户配置或凭据。它是后续上游适配的入口，不是第二套运行时配置；逐项所有权与历史证据以 [维护登记](UPSTREAM_MAINTENANCE.md) 和根 `AGENTS.md` 为准。

## 当前固定来源

- Harness `0.2.0-rc.2`：`639ed015397290b3745d163aafe02ffee4aa3f84`。跟随 AgentTeams 声明的推荐宿主，不因 Harness 单独发版就浮动升级。
- AgentTeams 上游 `v0.1.23`：`1094b84add6f2fb19edf659367fe2fd5f7f14154`。保留上游新功能；本地补丁仅补上游未覆盖的合同。
- Superpowers 官方 `v7.0.0`：`bb92a77741419a4ab5f06e711a283343f1ada0c3`，15 个技能、75 份原始文件及 LICENSE，总摘要 `4b646fcbb694f25c32d5840657cc20becb1b0e9791a9de5d4081898cf09116c7`。只做 Harness 工具映射，不创建第二套工具、Hook 或调度器。
- Electron `44.0.0`。本轮发布包身份、校验和与验收边界见 [rc.25 发布记录](../win-desktop/release-notes/v0.2.0-rc.25.md)；rc.24 因干净 CI 未通过保持草稿。

## 必须保留的现行能力

| 所有者 / 分类 | 不能丢失的合同 | 必须保持的回归入口 |
| --- | --- | --- |
| AgentTeams / UPSTREAM_EQUIVALENT + REAPPLY | 上游 Unicode 面板身份、Provider/模型成对解析、结算后失败通知、内容绑定 verdict、修复/复验链、范围外升级、队长多级 fork 身份、当前 session source、owner tool policies。保留上游实现，不用旧本地逻辑反向覆盖。 | `verify:upstream-023`；`issue-188/189/203-card/205.test.mjs`、`lineage-identity.test.mjs`、`quality-gates-content-bound/cross-binding/repair-wiring/excluded-scope/work-order.test.mjs`、`tool-policies.test.mjs` |
| AgentTeams / REAPPLY | 三种角色思考模式、显式 Provider/model/effort 优先、当前 Team 冻结配置、编号角色及精确 `role_template` 继承模型/提示词；**省略工具策略时还要继承冻结的 toolPolicy/toolFilter**，不重读后来改变的策略。 | `custom-member-routing.test.mjs`、`selection-policy-verify.mjs`；实际 AgentLoop 工具可见性、强行调用拒绝、审批和冷恢复 |
| AgentTeams / REAPPLY | 普通 TEAM 使用可信保存的 defaultProfile 或当前直接用户明确选择；缺失/无效绑定及零任务固定模板在写入/启动前拒绝。模型、技能、历史文本不能授权临时绕行；临时通道需当前真人 `/agent-teams --temporary <目标>`。显式模型也不能绕过角色绑定。 | `team-subagent-compat.test.mjs`、`default-profile-client.test.mjs`、`custom-member-routing.test.mjs`、`routing-policy-lifecycle-verify.mjs` |
| AgentTeams / REAPPLY | 无团队 status 是只读成功 `{active:false}`；delete 幂等，approve 需真实 staged 证据。只诊断保存的默认，不覆盖本轮用户选择。动态规划必须创建真实任务并分派角色，空团队不等于子代工作。仅 TEAM 根队长同轮三次真实空查暂停；新用户输入按序恢复，Native/子成员/其他会话不受影响。 | `inactive-poll-guard.test.mjs`、`verify.mjs`（完整队长提示 ≤3500 字符）、`lifecycle-verify.mjs` |
| AgentTeams / REAPPLY | 唯一 durable gateway 管理启动、投递、中断、退役与 drain；真实 Agent 身份、子会话串行化、忙子代不复用、route/reasoning 不串线；final error 才结束 attempt，空闲后才能继续调度。 | `subagent-gateway-tdd.mjs`、`member-failure-tdd.mjs`、`member-spawn-recovery.test.mjs`、`stress-verify.mjs` |
| AgentTeams / UPSTREAM_EQUIVALENT + REAPPLY | 严格 V2、不自动历史迁移；质量合同完整往返，空数组清除、非法数组整体拒绝。acceptance/verify 按文本身份覆盖，Git attempt 快照审计真实变更，独立 review/current-code integration gate，队长跨轮接管不撤销，amend 非合同字段零写入。 | `quality-gates-tdd.mjs`、`quality-gates-amend/repair-scope.test.mjs`、`coverage-contract-consistency.test.mjs`、`lifecycle-verify.mjs`、`workspace-activity.test.mjs` |
| AgentTeams / REAPPLY | 官方 SettingsForms/CAS 单次保存 Profile map/default 及 rename/delete，保留角色/临时策略和原始提示词；取消与旧 retry 不反写新草稿；staged revision + 一次性 approval；Web state/model/artwork 认证、Host/Origin 与 Connection 失效关闭。 | `settings-client-verify.mjs`、`profile-editor-verify.mjs`、`web-routes-verify.mjs`；wrapper `agent-teams-settings-save/profile-layering/profile-store.test.js`、`configuration-backup.test.js` |
| 官方 Native + AgentTeams / SUPERSEDED_BY_DESIGN | 两个设置页面同时保留、职责分开：Native 管深度/容量/允许模型，AgentTeams 管角色策略与 Team 生命周期。Team 不得绕过网关；Native 保持官方工具。 | wrapper `subagent-settings-card-visibility.test.js`、`agent-teams-integration.test.js`；插件 routing/compat suites |
| Models / UPSTREAM_EQUIVALENT + REAPPLY | 通用原生 Provider 编辑器、发现模型、onboarding、凭据边界与 CAS；图像/纯文本手动声明；Default + 六个显式思考档位及用户子集/已有 wire mappings；非法声明阻止 Save，不根据模型名称猜能力。窄窗口布局和生成输出脱链保留。 | Models `pnpm test`；`model-reasoning/model-input/model-input-ui/provider-profile/output-link-safety.test.js`；wrapper `model-capability-probe-integration.test.js`（历史名称，验证手动声明和探测已移除） |
| CPA / REAPPLY | 单个原生 CPA 行，地址/Token、模型发现、原始上下文/输出容量、文本/图像和 R 档位；启动归一化限路径/版本、保留凭据和用户手工子集。CPA 专属规则不能搬到 Models。 | CPA `pnpm test`；wrapper `cpa-provider-integration.test.js`、`configuration-backup.test.js` |
| Desktop Settings / REAPPLY | `扩展设置` stable desktop slot；窗口行为无 Save 即时持久化/失败回滚；内置 Web tools 可退出但独立 MCP 不变；密码加密可携带备份，官方 CAS/guarded rollback，重启说明。 | `desktop-settings-plugin/desktop-settings/desktop-web-tools/configuration-backup.test.js` |
| Windows wrapper / UPSTREAM_EQUIVALENT + REAPPLY | 保留上游官方命令管理与外壳；Windows shell/隐藏控制台及后代 NODE_OPTIONS，合法 overload/callback/stdio/error 不变，显式 windowsHide:false 与非法值保留原生行为，不改全局环境/MCP 命令。 | `command-management.test.js`、`win-hide-console.test.js`、`win-hide-console-descendants.test.js`、`dsh-service-syntax.test.js` |
| Windows wrapper / UPSTREAM_EQUIVALENT + REAPPLY | 官方含 token 的完整 loopback readiness URL、安全端口、诊断脱敏；只清过期 loopback auth Cookie，当前 origin 的 plugins 431 有界恢复，防止长时间运行的重复加载循环。 | `dsh-web-auth-url.test.js`、`loopback-auth-cookies.test.js`、`loopback-port.test.js` |
| Windows wrapper / REAPPLY | exact grep 单行 description 别名仅在缺 pattern 且无歧义时归一；有界周期耗尽判 terminal QUOTA，而瞬时 RATE_LIMIT/单独 reset 不误判；手动模型声明优先。 | `grep-tool-argument-compatibility.test.js`、`win-hide-console.test.js`、`model-capability-probe-integration.test.js` |
| Output-limit / REAPPLY | provider/model 中立的 llm/stream finish 校正，只有 stop 且达到 maxTokens 才变官方 max-tokens；usage 时序与通知绑定，其他 finish 不变，不自动重试原预算。 | `output-limit-finish.test.js` |
| Guidance / REAPPLY | 独立工具参数提示 ≤500 字符，不注册工具/UI/生命周期；省略无意义空值，保留工具声明的清空语义，错误后按字段修正，不原样重试或虚报工具故障。 | `tool-call-guidance.test.js` |
| Superpowers / REAPPLY | 官方 registry、`/` 调用与用户/项目技能优先；原始75文件固定摘要，本地 adapter/provider 与原文分开；自动选技仍取决于模型，不能承诺必定遵守。 | `superpowers-host.test.js`、`superpowers-integration.test.js`、插件 `assets.test.mjs`；installed/unpacked/ZIP skill closure |
| 构建与发布 / REAPPLY | 真实 node_modules（不是 Junction），固定官方 tarballs；离线无安装门禁编译并同步 local lib；实际 installed/unpacked/隔离 ZIP createRequire/manifest/生产文件一致、官方鲸鱼图标、SHA-256、签名状态。 | `npm run verify:upstream`、`verify-alpha2-runtime-closure.mjs`、`verify-alpha2-zip-closure.mjs` 及 wrapper closure tests |

以上文件名在各所有者目录解析；缺失或改名必须迁移回归，不得通过删除、跳过或弱化断言解决冲突。

## 已取代或永久移除：不要以“保留全部改进”为由恢复

- AUTO 权限插件、Session Markdown 导出、OpenCode 专属兼容与 model-fetcher、能力自动探测及 Remote/Host 探测服务保持移除。
- 原生 Subagent 卡隐藏 → 双页面职责分离；独立桌面 Profile JSON writer → 官方 SettingsForms/CAS（旧 V2 cache 只作显式草稿来源）。
- 无 Profile 普通 ad-hoc 与无绑定 custom-member 全局默认 → trusted default/current-user Profile 与冻结角色合同；临时默认仅用于当前真人授权通道。
- 全局成员模型覆盖、自动 Profile/旧 Team 迁移保持不存在。旧记录是历史证据，不是现行功能要求。
- 旧 `supportsStore/maxTokensField/max_output_tokens` 探测保存事故由移除探测 + 手动合法声明取代；不重新引入探测来恢复历史补丁。

## 下次上游更新检查单

1. 在 canonical main 比较 origin/main 与本地；保留差异，不 reset/clean。核对插件正式版本及其推荐宿主；固定 tag/commit/tarball，不能运行时浮动 latest。
2. 先跑当前离线门禁，再逐项登记 `UPSTREAM_EQUIVALENT`、`REAPPLY` 或 `SUPERSEDED_BY_DESIGN`。等价必须由同一回归证明，上游替换代码不替换证据。
3. 上游新增功能优先；若与仍有效的本地合同有真正产品冲突，由用户决定。检查入口 Schema、提示、tool admission、durable gateway、状态/UI/CAS 和冷恢复全链，不只改版本号。
4. 同步 owner/package/lock/断言/README/provenance，完整门禁通过后才打包。代码证据、打包闭包、付费模型、安装和隔夜运行分别陈述。
5. 发布只提交审查后的精确源路径；EXE/ZIP/blockmap 进 Release，不进 Git。上传后复读 main/tag peeled commit、每项资产大小/摘要；清理只移除已核对且可重建的构建缓存和本次临时材料。

## 本轮证据与边界

- rc.25 / AgentTeams desktop.7：真实 Windows 共享锁复现 idle 调度写入失败后 pending 丢失唤醒；顺序化状态观察、锁内过时/替换 Agent 拒绝，官方释放事件提供第二次机会。只允许确实发出过 idle 的精确 Agent；独立复核发现的创建失败循环经真实冷恢复 RED→GREEN 修复。保留 team-subagent-compat/stability 全部回归；不直接覆写、不无限重试、不轮询重跑已执行 attempt。持久文件锁仍需显式恢复，代码/CI/安装/付费模型/隔夜验收分开。
- rc.25 CI 补充根因：进程自己的 Node 异步读句柄也会阻止 Windows 原子替换。state.ts 的 Team/revision/inbox/retired 异步读取与 replace 复用同一规范化文件队列；文件队列内不得反向获取 Team 锁。保留 state-file-io.test.mjs 的读先/替换先双向完整 generation、零队列泄漏及原外部持久锁失败回归，verify:state-io 进入完整链。不得通过删除断言、放宽预算或直接覆写解决刷新冲突。

- 累计只读复核发现并阻断：角色副本漏冻结工具限制。4 个实证失败后最小修复，5 个权限回归通过；完整门禁与新包校验另记 rc.24。
- 轻微遗留：临时成员设置的旧帮助文字未完全表达当前真人授权边界；运行时严格拒绝仍有效，本轮不扩大范围修 UI 文案。
- 已知旧 create 工具的 inline-plan 说明仍可能让模型尝试一条被执行边界拒绝的入口；这是提示准确性遗留，不是临时权限绕过。此前 tsdown CommonJS 建议警告保持上游构建方式，未影响本轮门禁或闭包。
- 用户配置切换仍由用户操作；发布与清理不修改真实 Profile、会话、API key、安装目录或已导出文件。无真实付费模型、人工安装或隔夜运行的新验收承诺。

## 清理前保存的历史实施判断

- 历史候选只允许本地代码/包而禁止提交时，使用脏工作区增量快照审核；本轮已补做累计源代码复核，不将那些增量审核冒充累计审核。
- strict V2 与不自动迁移优先于上游历史值自动 coercion；上游新 finding 校验/诊断及显式非破坏恢复工具保留，但不得自动处理用户旧 Team。
- `/agent-teams --temporary` 使用现有命令命名空间，避免与名为 temporary 的 Profile 别名冲突；optional host-only temporaryAdmission 区分真实授权的临时 lane，不改变老记录。
- inactive guard 不把有 parentSession 的 root fork 当 child；官方 depth/origin 才决定成员排除。真实 queued user 通过官方 Inbox/steer 唤醒，plugin 上下文不能冒充用户或重新授权。
- 包内验证遵循 builder 对 metadata/dev declarations 的既有处理，不为字节相等而强行装入开发文件，也不删除用户 Syncthing 副本；生产代码、脚本、资产、版本与固定摘要保持严格。
- unpacked 可观察到开发祖先中的可选 jiti，但发行证明必须由独立 ZIP 的 external0 关闭泄漏风险。源码、离线运行、资产闭包、安装、真实供应商与隔夜运行始终分开，不因发布授权变成未经验证的成功声明。
- 本轮用户已明确授权 main、发布和可重建缓存清理；没有理由恢复历史“不提交/不清理”限制，但仍不操作不相关旧 scratch、真实 Profile 或固定构建输入。
