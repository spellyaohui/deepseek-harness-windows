# DeepSeek Harness Windows

把官方 DeepSeek Harness 带到 Windows 桌面：保留上游 Harness 的插件生态和核心能力，再补上双击启动、Windows 进程兼容、CPA 多模型接入和 AgentTeams 子智能体配置等桌面生产力能力。

> 当前源码版本：`v0.2.0-rc.18`（本地安装包已构建并验证，未发布） · [已发布 rc.17 安装包与校验](https://github.com/spellyaohui/deepseek-harness-windows/releases/tag/v0.2.0-rc.17)

## 子智能体路由修复：`v0.2.0-rc.18`（未发布）

- AgentTeams `0.1.22-desktop.11`：队长规划和固定任务模板均保留 Profile 角色的指定模型与思考策略；未绑定角色的自定义成员与临时 `subagent` 共用“临时与自定义子智能体”默认配置。
- 编号角色继续继承当前团队的冻结配置；改名成员可用 `role_template` 明确绑定现有角色。工具明确指定优先，配置不可用直接拒绝，不悄悄切回队长模型。
- 成员卡片显示思考策略和配置来源；更改默认只影响后续成员，已有团队与重启续接保留原策略。Harness 保持 `0.2.0-rc.2`。
- 回归覆盖两种规划模式、审批、并发和续接；完整离线门禁、EXE/ZIP 依赖闭包、生产文件一致性及隔离启动/重启验证通过。构建状态与校验值见 [rc.18 构建记录](win-desktop/release-notes/v0.2.0-rc.18.md)。修复尚未包含在 rc.17 安装包中。

## 预发布治理更新：`v0.2.0-rc.17`

- AgentTeams `0.1.22-desktop.10` 统一完成审计，持久化 attempt 基线并明确缺证据失败；并发归属按实际观察核对，review/integration 在开始和完成时校验当前对象与版本。
- 区分成员报告、执行器命令证据与独立审查；保留原有设置布局和模型路由，防止慢保存响应跨取消或新设置回写；Windows 状态写入失败保持旧提交。
- 输出上限插件 `0.1.1` 补齐 usage 时序和通知绑定；loader 锚点按固定上游 revision 校验，删除已由官方实现的重复隐藏改写。Harness 保持 `0.2.0-rc.2`，永久移除项保持移除。
- 十项实现、回归、证据边界及回滚见 [治理验收记录](docs/GOVERNANCE_ACCEPTANCE_20261007.md)；最终门禁和本地打包状态见 [rc.17 记录](win-desktop/release-notes/v0.2.0-rc.17.md)。

## 历史本地构建：`v0.2.0-rc.16`（未发布）

- AgentTeams `0.1.22-desktop.9`：队长接管的任务跨回合保留；验收与验证证据按合同条目逐条匹配；Git 工作树快照核对变更清单；编号成员继承角色提示词；`amend_task` 拒绝合同外字段；integration（部署/发布）等待全部审查通过；输出截断时向队长说明原因。
- 新增 `dsh-output-limit-finish`：通过官方 `llm/stream` 扩展点，把“报告为 stop 但输出已用满上限”的回复统一改为官方 `max-tokens`，与具体网关和模型无关。
- 工具调用提示词补充：参数校验失败应补正字段后重试，不得报告为工具故障。
- 按用户要求移除全部 OpenCode 兼容代码；完整离线门禁通过，Harness 保持 `0.2.0-rc.2`。本地 EXE、ZIP 和 blockmap 已构建并通过两份依赖闭包、文件一致性和图标验收，校验值见 rc.16 发布记录。

## 已发布：`v0.2.0-rc.15`

- AgentTeams `0.1.22-desktop.8` 明确 implementation/repair 必须提供独立的 `inScope` 和 `verify` 数组；写在 description 或 deliverables 中不能替代范围声明。
- 范围中的文件为精确路径，目录必须以 `/` 结尾，例如 `server/src/modules/summary-report/`。创建、修改计划和修改合同的 Schema 统一说明，缺少字段或目录斜杠时返回具体重试步骤。
- `outOfScope` 优先于 `inScope`，目录型排除项同样必须带 `/`；不推断或自动放宽用户范围。完整离线门禁通过，Harness 保持 `0.2.0-rc.2`；本版 EXE、ZIP 和 blockmap 已构建并通过隔离启动/重启验收，GitHub 干净机器重新编译和实际安装验收通过，已发布；校验值见 rc.15 发布记录。

## 本地已构建，待发布：`v0.2.0-rc.14`

- 队长待执行任务保持归属；队长可追加成员终态证据、取消尚未开始的阻塞任务，保留并发接管和旧任务凭证检查。
- Team 成员只获得可用的团队消息工具与指引；保留队长临时 `subagent` 入口、角色独立模型和 Native 模式。
- 取消后的替代任务、多轮修复和需求复审统一覆盖与交付判断。审查和需求完成必须提供匹配当前合同的验收/命令证据；缩范围先正式修改合同。
- 成员空闲但任务未完成时，每次任务尝试向队长报告一次；不自动重派或把回合结束当作完成。
- 隐藏开发回归脚本的 Node/PowerShell 子进程；真实 Electron → PowerShell/npm shim → Node → CMD 链通过隐藏验证。运行中的间歇闪窗仍需实际进程证据。
- AgentTeams 为 `0.1.22-desktop.7`，Harness 保持 `0.2.0-rc.2`。完整离线门禁、打包运行时闭包和隔离启动/重启验证通过；EXE、ZIP 和 blockmap 已生成。大小、SHA-256 与验证限制见 [rc.14 记录](win-desktop/release-notes/v0.2.0-rc.14.md)。尚未上传 GitHub。

## 本地已构建，待发布：`v0.2.0-rc.13`

- “设置 → 扩展设置 → 配置备份”支持密码加密导出/导入，包含模型供应商声明、API Key / Token、模型的图像输入和思考档位、临时子智能体、团队 Profile 路由及中文提示词、原生子智能体配置。
- 使用同一密码在另一台机器导入；导入替换备份中的设置，成功后提示退出并重新启动程序。建议先导出当前配置。密码至少 8 个字符，无法找回；账户登录状态、对话和运行中的团队不迁移。
- 沿用官方紧凑按钮和密码输入框。密钥只在 Host 内解密，通过官方 Settings/CAS 和凭据服务保存；错误密码不写入，普通失败回滚已写入内容，冲突导致无法完整恢复时明确提示检查配置。
- Desktop Settings 更新为 `0.1.5`；Harness 保持 `0.2.0-rc.2`。完整离线门禁、打包运行时闭包、隔离配置目录启动和导入后重启恢复均通过；EXE、ZIP 和 blockmap 已生成，大小及 SHA-256 见 [rc.13 构建记录](win-desktop/release-notes/v0.2.0-rc.13.md)。尚未上传或在第二台机器实际安装。

## 待发布：`v0.2.0-rc.12`

- 模型“仅文本 / 图像输入”选项与官方控件统一为 14px 字号、20px 行高，沿用官方字体；Models 本地包更新为 `0.2.0-rc.2-desktop.4`。
- 修复临时子智能体保存后回读成“跟随队长”：设置校验改为可经过浏览器 JSON 传输的声明式 Schema，保留三种思考策略。
- Profile 角色配置改用官方设置文件和修订校验保存，页面与后续新团队使用同一配置。已有团队保留创建时的路由。
- 原桌面 JSON 记录保留；如曾遇到旧原生配置覆盖角色模型，在“设置 → AgentTeams 团队 → Profile 配置”点击“导入桌面保存配置”，检查草稿后保存，再创建新团队。
- Windows 隐藏保护传入 MCP、npm shim、捆绑 Node 和后代进程；过滤环境也会保留该保护。修复不修改全局 Node 环境变量。
- 本地启动跳过 Chromium 禁用端口，避免随机选中 `6697` 等端口后打不开页面；错误提示隐藏临时认证 Token。
- 需求依赖错误会列出任务 ID、状态及重试方法；实现任务仍须等待需求通过。
- AgentTeams 本地包为 `0.1.22-desktop.6`，Harness 继续固定 `0.2.0-rc.2`。

## 本机构建：`v0.2.0-rc.11`（未发布）

- 设置 → AgentTeams 团队新增“临时子智能体”，单独选择 Provider、模型及思考策略，适用于 Team 模式下主智能体的临时 `subagent` 调用。
- 支持连续和同时调用多个子智能体；无需创建四角色团队。Profile 中各角色的指定模型保持独立，Native 模式仍使用原生设置。
- 未设置临时默认时沿用现有路由；指定模型不可用会明确报错。保存影响后续调用，已创建成员保留原路由。
- Windows 控制台补丁补齐同步 `execSync` 和合法空 options 参数的覆盖，保留显式显示选项、原生参数校验、输出及退出错误。
- 本地 AgentTeams 为 `0.1.22-desktop.5`，Harness 继续固定 `0.2.0-rc.2`。这些源码更新尚未包含在 rc.10 安装包中。

## `v0.2.0-rc.10` 更新说明

- 修复关闭内置联网工具后，旧 `web: disabled: true` 配置导致 Agent 预设加载失败的问题；不改写用户配置。
- 提供 650 个逐包校验的固定构建输入，以及干净 Windows 构建与安装后首次启动的自动验收。构建步骤见 [干净机器构建指南](docs/CLEAN_WINDOWS_BUILD.md)。
- Harness 继续固定为 `0.2.0-rc.2`。

## `v0.2.0-rc.9` 更新说明

- “桌面”改为“扩展设置”，增加 DSH 内置网页搜索和网页读取开关，默认开启，自动保存，重启应用生效。
- 关闭覆盖所有 Agent 预设和后续成员；保留底层网络服务、用户预设配置和独立 MCP 工具。
- 使用官方开关样式，保持官方字体；保存失败回滚，窄窗口正常布局。
- Harness 固定 `0.2.0-rc.2`，AgentTeams `0.1.22-desktop.4`，桌面设置插件 `0.1.4`。

## 历史：`v0.2.0-rc.8` 更新说明

- 修复 Team 模式主模型调用原生 `subagent` 被策略拒绝的问题，自动接入真实 AgentTeams 成员、任务与持久子会话。
- 后台返回成员会话 ID，前台等待真实团队任务完成并返回结果；兼容调用遵守角色路由、成员上限、暂停与审批限制。
- Native 模式与团队成员权限不变；保留 rc.7 的字体布局、中文提示词和模型手动设置。
- Harness 固定 `0.2.0-rc.2`，AgentTeams 更新为 `0.1.22-desktop.4`。

## 历史：`v0.2.0-rc.7` 更新说明

- 桌面和 AgentTeams 配置页沿用官方字体，统一普通文字 14px、辅助说明 12px、表单标签与输入 13px。
- 提示词使用官方表单的 19.5px 行高；保留多行编辑空间，修正标题字重、控件高度、圆角与间距。
- 桌面设置去掉额外的卡片内缩，与官方内容列对齐；关闭行为仍即时保存并保留失败回滚。
- 保留中文职责提示、保存重试、显式恢复内置、七档手动模型配置与原有路由。
- Harness 固定 `0.2.0-rc.2`，AgentTeams `0.1.22-desktop.3`，桌面设置插件 `0.1.3`。

## 历史：`v0.2.0-rc.6` 更新说明

- 修正 AgentTeams 保存失败时的“重试保存”按钮：长错误信息自动换行，窄窗口内按钮保持单行，重试沿用原保存操作和修订保护。
- 内置 `software-delivery` 的描述、协作协议和职责说明改为中文，补全团队执行提示及需求分析、开发、测试、审查四成员的专用中文提示词。
- “恢复内置”按当前配置与内置默认的差异启用，已保存的旧配置无需先修改即可恢复；恢复只更新草稿，保存后重启用于新团队。用户保存的提示词保持原样。
- 底层 Harness 仍为 `0.2.0-rc.2`；AgentTeams 本地界面版本为 `0.1.22-desktop.2`。保留 rc.4 模型设置调整和 rc.5 保存修复。

## 历史：`v0.2.0-rc.5` 更新说明

- 修复 AgentTeams 团队设置保存时报“被 Home Patch 或命令行覆盖”的问题。桌面自带插件作为默认层加载，用户设置随后叠加，保存后重启仍保留。
- 真实 Home／命令行覆盖保护、修订冲突保护及现有团队 Profile 保留；不改写用户配置文件来绕过检查。
- 保留 rc.4 的七档思考强度、手动输入类型与模型页面布局。底层 Harness 仍为 `0.2.0-rc.2`，AgentTeams、Models、CPA 版本不变。

## 历史：`v0.2.0-rc.4` 更新说明

- 移除 OpenCode 模型能力卡片与第三方模型能力探测，不再通过测试请求推断能力。
- 每条第三方模型可手动勾选 Minimal、Low、Medium、High、Xhigh、Max；Default 始终可用，使用服务端默认值。新模型默认提供全部档位。
- 图像输入只有“图像输入 / 仅文本”两种选择；新添加的供应商和模型默认仅文本，保存后重启生效。
- 模型目录的添加、获取列表、批量输入类型与单模型设置分组排列，保存和取消固定在编辑器底部。
- 官方 Harness 仍固定为 `0.2.0-rc.2`；Models `0.2.0-rc.2-desktop.3`，CPA `0.1.11`。

## 历史：`v0.2.0-rc.3` 更新说明

- 修复新电脑首次启动后模型能力探测提示“Host Remote 尚未挂载”的问题。Models 描述符采用 Harness 0.2 的 strict codec 工厂，并由 TypeScript 检查挂载接口。
- 官方 Harness 保持 `0.2.0-rc.2` 固定提交；Models 本地分支更新为 `0.2.0-rc.2-desktop.2`。能力探测结果先写入编辑草稿，点击保存后才写入设置。
- 新增真实 Client Gateway/注册器回归，覆盖 Remote 挂载、调用、取消、卸载和严格校验。

## 历史：`v0.2.0-rc.2` 更新说明

- 跟随 AgentTeams 稳定版 `v0.1.22` 的推荐宿主，固定官方 Harness `dsh-v0.2.0-rc.2`（commit `639ed015397290b3745d163aafe02ffee4aa3f84`）与 AgentTeams `0.1.22-desktop.1`（上游 commit `9cba4fe4171f27c019991cafd2a107f87ef3517b`）；完整官方包来源见 [0.2.0 来源清单](docs/UPSTREAM_020_SOURCE_MANIFEST.md)。
- 保留上游计划审核、模型搜索、文件侧栏、终端、插件提示、模型目录及可选异步提问；本地角色路由、严格 V2、质量门、统一子会话网关、CPA 和 provider-neutral Models 扩展继续各归其主。官方 Native 与 AgentTeams 设置继续分开显示。
- Windows 托盘新增手动“管理 dsh 命令…”；仅已安装应用在用户明确确认后才按官方所有权规则修改当前用户 PATH，启动时不自动安装。系统 PATH 已有优先命令时会拒绝无效安装。本轮没有执行真实 PATH 修改。
- 发布前重新通过离线 `verify:upstream`：Models 50/50、CPA 27/27、AgentTeams 全套及包装器 149/149；打包目录和 ZIP 依赖闭包通过。发布的是用户确认可发布的同一份本地测试包，未重新打包或修改已安装程序。
- 实际安装已完成，安装目录全部 25,783 个文件与打包目录的大小及 SHA-256 一致，已安装运行时闭包通过。安装中途退出在用户暂停卡巴斯基后用同一 EXE 重试成功，尚未确认具体拦截规则。安装包未作 Authenticode 签名；此发布不宣称新增真实模型、PATH 命令或长时间运行的独立验收。

## 历史：`v0.1.7-rc.2` 更新说明

- 跟随 AgentTeams 稳定版 `v0.1.21` 的推荐宿主，固定官方 Harness `dsh-v0.1.7-rc.2`（commit `477b4f420553e8a52c2fbccc464d7561b239c443`）与 AgentTeams `0.1.21-desktop.1`（上游 commit `f60d40d7dddbdd2283a2d79f823a9c9852e19d13`），不采用 `0.1.22-rc.1` 预发布。
- 优先采用上游团队工作区/右侧栏、历史团队卡与成员会话导航、过期报告与重复证据治理，以及新宿主的插件管理、Agent 预设、快捷键、文件预览和 Session format v4。统一 durable gateway 已适配成员首次启动前设置、后续投递、中断、退役与 drain。
- 按用户决策保留两个职责不同的入口：官方“插件 → 子智能体”管理 Native 深度、并发和允许模型；“设置 → AgentTeams 团队”管理 Team/Native 委派与 Profile 角色的 Provider、模型和思考策略。移除旧的原生卡片隐藏重写，不增加旧 Team 迁移层。
- Models 基于官方 `0.1.7-rc.2` 的自定义 API 引导、账户优先排列、共享模型行和逐模型输入模态重新适配；保留 provider-neutral 的图片三态、串行草稿探测、协议合法兼容字段、推理档位和保存校验，CPA 继续独立维护。
- 桌面运行时固定 Electron `44.0.0`，与新宿主官方桌面锁定版本一致。真实 Electron 原生加载器回归、隔离启动及界面加载通过；完整离线 `verify:upstream` 包含 Models 50/50、CPA 27/27、AgentTeams 全套和包装器 134/134。
- 来源清单与逐项能力分类见 [上游维护登记](docs/UPSTREAM_MAINTENANCE.md)。本轮未生成安装包、未提交、未推送或创建 Release。

## 历史：`v0.1.5-rc.5` 更新说明

- AgentTeams 更新为本地 `0.1.19-desktop.1`，对应上游 `v0.1.19`（commit `6ef77bff4893fb22bd5ba39cb6b2c5693eba85be`）。成员因明确的 host tool-filter 拒绝无法启动时，可使用上游恢复路径；repair scope 推断和仅 captain 可修改任务契约也采用上游实现。
- 所有子会话的启动、投递、打断、退役和 drain 仍经由本地统一 durable gateway；严格 V2、角色路由、Team/Native、质量门、Profile 和认证 Web/CAS 边界保持不变。
- 官方 Harness 仍固定 `dsh-v0.1.5-rc.1`，未变更 tarball 或 peer range。

## 历史：`v0.1.5-rc.4` 更新说明

- 修复随机 loopback 端口长期累积 `dsh-auth-*` Cookie，最终让聚合插件请求返回 HTTP 431、启动时显示插件加载失败的问题；启动认证前只清理 `127.0.0.1` 上的旧 DSH 认证 Cookie。
- 若当前 loopback 服务的 `/plugins/` 请求仍返回 431，桌面包装器会清理同一类 Cookie 并使用原始一次性认证地址自动重载一次；单次恢复锁避免循环，不影响其他 Cookie、缓存、会话、设置或凭据。
- 官方 Harness 仍固定 `dsh-v0.1.5-rc.1`，AgentTeams 仍为本地 `0.1.18-desktop.1`，没有改动上游 tarball 或子智能体治理边界。

## 历史：`v0.1.5-rc.3` 更新说明

- AgentTeams 更新为本地 `0.1.18-desktop.1`：队长领取任务时，空字符串或纯空白 `assignee` 与省略该属性等价；非空成员名会先去除首尾空白。
- `assignee="captain"`、未知成员、越权领取和质量证据缺失仍严格拒绝且不写状态。创建/重分配与领取语义已在紧凑提示中分开，完整提示仍不超过 3,500 字符。
- 修复默认 `memberMaxDepth: 0` 的真实成员启动仍把 scope-local `subagent` 放入 child `toolFilter`，导致任务已领取但成员持续 `idle/unspawned` 的问题；启动过滤现在只隐藏 global `send_message`，Team 执行 guard 和 durable gateway 边界保持不变。
- 不增加第二套子智能体工具或提示插件；AgentTeams 继续管理任务和面板，所有子会话操作继续独占通过 durable subagent gateway。
- 上游来源仍是 AgentTeams `v0.1.18`，推荐宿主仍是 Harness `dsh-v0.1.5-rc.1`，未修改官方 tarball。

## 历史：`v0.1.5-rc.2` 更新说明

- 修复 AgentTeams Team 路由把官方 scope-local `subagent` 误传给仅支持 global tool 的 `tools.restrict()`，从而报 unknown global tool 的问题。全局原生委派工具仍由 `restrict` 隐藏；Team 内 scope-local `subagent` 改在执行边界由 scoped guard 拒绝，Native 路由保持可用。
- `agent_teams_claim_task` 不接受 `assignee="captain"`：已有 captain-owned 任务应省略 `assignee` 认领；要由 captain 接管 member 任务时，先使用 `agent_teams_reassign_task(assignee="captain")`。错误反馈提供对应的自恢复下一步。
- implementation/repair 完成仍严格要求 `commandsRun` 为每条声明的 `verify` 命令提供 `passed` 证据；缺少任一项会继续拒绝，未为绕过错误而放宽质量门。
- 嵌入的官方 Harness 推荐宿主仍是 `dsh-v0.1.5-rc.1`，AgentTeams 仍是上游 `v0.1.18`；本次只提升 Windows wrapper 到 `v0.1.5-rc.2`，不改固定 tarball 依赖。

## 历史：`v0.1.5-rc.1` 更新说明

- 基线升级到官方 Harness `dsh-v0.1.5-rc.1`（commit `183f08e9c6dde7e36cd2318eaee70b0da08fb35e`）：采用上游 Session format v3、通用文件上传、资源/侧栏、代理环境与新版 Web/启动闭包，不回退到旧 0.1.2 运行时。
- AgentTeams 升级到上游稳定版 `v0.1.18`（commit `68fe529d602b1eea1f1ecaee99857d20a4f94be0`），并保持其推荐宿主 `0.1.5-rc.1`：采用原子 roster/DAG、lazy-start、下一步消息投递、过期消息去重、后代/排队输入清理、退役冷恢复拒绝、缺失 attempt 恢复和 `memberMaxDepth: 0` 默认值。
- 0.1.5 已原生隐藏普通 Node subprocess；Windows Job runner 的原生 `CreateProcessW` 另由桌面 preload 继承隐藏控制台配置，避免执行 `pwsh` 时出现黑色命令窗口。
- 仅保留上游未覆盖的本地治理：角色级模型/思考策略、严格 V2 与质量门、Team/Native 与 durable-session 子智能体网关、provider-neutral 模型能力探测，以及严格的 grep 参数与周期额度分类边界。
- 补齐新版 `dsh-client-ui-primitives` 在外部平铺安装中实际使用的运行时闭包；所有版本均固定到官方 0.1.5 锁定解析，不使用浮动 `latest`。

## 历史：`v0.1.2-rc.8` 更新说明

- 修复官方返回 `You've reached your weekly usage limit...` 时仍被识别为普通 `RATE_LIMIT` 的问题；Windows loader 现在只对明确的周/月等周期用量耗尽文本分类为终止性 `QUOTA`，避免继续重试已经耗尽的额度。
- 普通瞬时 `429 rate limit` 仍保持可重试；单独的额度重置提示不会被误判为已耗尽。回归覆盖真实 `@deepseek-ai/dsh-llm` 模块、loader 注入和 132 项 Windows wrapper 测试。
- AgentTeams 升级到上游 `v0.1.16-rc.3`（commit `bf17f93d35ef75964e96333ff644ab2c9c57b3cb`）；推荐宿主仍为 `dsh-v0.1.2-rc.1`，并保留本地角色策略、严格 V2、质量门禁、共享目录、紧凑提示词、Team/Native 与持久会话网关。
- 移除本地 Session Markdown 续接导出插件；已导出的用户 Markdown 文件保留在磁盘上。

## 历史：`v0.1.2-rc.7` 更新说明

- 新增统一子智能体网关：连续子 Agent 的启动、续接消息、打断、退休和冷恢复都经过同一条 durable Session 身份边界。
- 续接句柄必须解析到当前真实在线 Agent；同 ID 的旧句柄、伪句柄和退休竞态会在调用前 fail-closed，并由每个子 Agent 的锁保证发送、退休和 drain 串行化。
- RC.1 的 `agent/created` 生命周期下，角色级 Provider、模型和 reasoning effort 在首次请求、后续请求、并发启动和冷恢复时保持有效，不会被通用 Host 监听器覆盖。
- AgentTeams fork 更新到 `0.1.15-desktop.7`，并把删除、重分配、停止及异常清理纳入同一子 Agent 锁，保留 Alpha.2/RC.1、严格 V2、质量门禁、Revision/CAS、自动委派和既有兼容回归。

## 历史：`v0.1.2-rc.4` 更新说明

- 修复动态新增编号角色的模型继承：`reviewer2/3/4/5/6`、`analyst2`、`implementer2`、`tester2` 等会从当前 Team 的基础角色快照继承 Provider、模型和思考策略，不再错误回落到队长模型。
- 显式指定 Provider、模型或思考策略时仍以调用参数为准；无法唯一匹配的自定义角色安全要求显式配置，不随机选择模型。
- AgentTeams fork 更新到 `0.1.15-desktop.4`，保留 Alpha.2、严格 V2、质量门禁、Revision/CAS、自动委派和既有兼容回归。

## 历史：`v0.1.2-rc.3` 更新说明

- 修复普通 `captain-planning` 委派被错误强制进入 staged Web 确认的问题：现在由主模型自动生成 Team 名称和任务图，只有用户明确要求“先审计划”才使用 `approval="required"`。
- 修复 Team 仍处于 `building` 或等待对话反馈时 Web 页面提前暴露编辑控件的问题；此时成员、任务和批准操作会安全禁用，避免 `team ... is not ready for Web plan editing`。
- AgentTeams fork 更新到 `0.1.15-desktop.3`，新增上述生命周期与 Web 编辑边界回归，并保留 Alpha.2、角色级模型、严格 V2、质量门禁和 Revision/CAS 能力。

## 历史：`v0.1.2-rc.2` 更新说明

- 普通子智能体委派现在明确使用 `approval="automatic"`：Team 名称由 AgentTeams 根据任务目标自动生成，主模型自行建立任务名称、质量契约与依赖，不再要求用户在 Web 面板手工命名或确认。只有用户明确要求“先审计划”时才进入 `approval="required"` 的 staged 流程。
- 修复 staged Web 编辑器与本地 Revision/CAS 后端没有接通的问题。成员编辑、任务新增/保存/删除和 Web 确认都会携带当前 `planRevision`；Host 校验 revision 后使用一次性审批凭据提交，解决 `staged plan update requires revision-aware options`。
- 补齐上游 AgentTeams `v0.1.15` 的 Alpha.2 原始 Web 路由认证与 Host/Origin 门禁；未认证、跨站来源和 Connection 未就绪均 fail closed，不会读取或修改 Team 状态。
- AgentTeams Windows fork 更新到 `0.1.15-desktop.2`，继续保留角色级 Provider/模型/思考策略、严格 V2、质量门禁和上游提交 `232a338fc9a0d393f118912386f67e7f3a6c67d6` 的成员失败结算。

## 历史：`v0.1.2-rc.1` 更新说明

- 主运行时迁移到官方 `dsh-v0.1.2-rc.1` 固定提交 `a66e4702047846cdaa10c66c9d3df3951f5ea70d`。官方源码以 Node 26 / pnpm 11.7.0 完成构建，分别打包 9 个 vendor 与 242 个 dsh 包，并通过 packed-install；Windows Wrapper 只引用这 251 个已记录 SHA-256 的固定本地 tarball，不混用旧版运行时。
- 保留并适配模型统一兼容层：每模型 `自动 / 文本和图像 / 仅文本`、显式协议、容量、reasoning 档位与兼容字段仍由同一原生 Models 编辑器管理；能力探测继续按当前 Provider/地址/协议串行运行，认证、超时、限流、5xx 和网络失败不会被误判为“不支持”。
- AgentTeams 适配 Alpha.2 的 Remote/Slot 与会话接口，并迁入已验证的 wait、身份作用域、Revision/CAS 和事件恢复结构；角色级 Provider/模型/思考策略、严格 V2、质量门禁、紧凑只读状态、Team/Native 路由和桌面 Profile 编辑仍由本地 fork 独立维护。
- Windows 兼容重写迁移到 Alpha.2 实际模块边界，保留通用 `grep` 参数归一化、OpenCode/Kimi Schema/流恢复/会话头、隐藏控制台和启动 healing。AUTO 继续完全移除，也不增加旧 Team/旧对话迁移层。
- Windows 启动器会保留 Alpha.2 就绪地址中的一次性认证 token，再由 Electron 完成 cookie 交换和干净根页面跳转，避免无认证 loopback 地址造成黑屏提示。
- “插件 → 插件配置”隐藏了与独立“子智能体”设置页重复的原生 Subagent 卡；官方 Subagent 服务、已有设置和 AgentTeams 成员运行链保持不变。
- 新增源码与安装包依赖闭包门禁：从 `src/dsh-service.js` 使用 Node `createRequire` 遍历实际生产依赖，并在打包后复核 `dsh-app-boot`、Cordis loader/include、`js-yaml`、`argparse` 及 RC.1 运行时闭包。完整来源见 [RC.1 来源清单](docs/UPSTREAM_RC1_SOURCE_MANIFEST.md)。

## 历史：`v0.1.1-rc.32` 更新说明

- AgentTeams 监视降耗：`agent_teams_status` 默认返回紧凑、只读摘要，不会自动唤醒成员或确认邮箱消息；处理完已显示的消息后才显式使用 `acknowledge=true`，只有队长明确使用 `wake="recover"` 才执行冷启动/卡住任务恢复。
- 摘要仍保留任务、依赖、attempt/attempt_id、verdict/findings、Coverage、Delivery 阻塞和新消息；完整任务报告、Provider/模型、Profile 协议等详细内容通过 `detail="full"` 按需读取。
- 状态未变化时返回小型心跳摘要，减少总控上下文重复内容；正常的创建、批准、任务更新和成员 idle 事件调度保持不变，并新增 AgentTeams 生命周期、压力和质量门禁回归。

## 历史：`v0.1.1-rc.31` 更新说明

- 修复点击“模型能力探测”时出现 `cannot get property "remote.model-capabilities" without inject`：能力探测在用户发起操作时通过 Cordis 的可选服务查询解析 Remote namespace，不再读取当前 Fiber 未声明注入的 `ctx.remote` 属性。
- 保留 rc.30 的页面级降级：能力探测 Remote 缺失或晚到时，模型设置页、Provider 编辑、图片三态、协议、容量与保存仍可使用；Remote 挂载完成后无需重启页面即可发起探测。
- 已对照官方 Gateway 源码、测试和同插件挂载范例固化回归。官方 `dsh-v0.1.2-alpha.1` 目前只有 GitHub 源码 Release，npm 未发布对应 `@deepseek-ai/dsh*` 包且 Release 无可安装资产，因此本安装包继续使用官方可安装基线 `dsh-v0.1.1-rc.2`；AgentTeams 最新版仍为 `v0.1.14`。

## 历史：`v0.1.1-rc.30` 更新说明

- 修复 rc.29 中“设置 → 模型”页面可能完全空白：能力探测 Remote 异步挂载时不再成为整个页面的启动前置条件。
- Remote 尚未就绪时，Provider、模型列表、协议、容量、图片三态和保存功能仍正常显示与编辑；只有“模型能力探测”局部禁用并显示明确提示，Remote 可用后新打开的编辑器恢复探测。
- 新增 Remote 缺失/延迟场景回归，继续保留 rc.29 的统一能力探测、AgentTeams、CPA/OpenCode/Kimi、通用 grep、多模态和 AUTO 移除能力。

## 历史：`v0.1.1-rc.29` 更新说明

- “设置 → 模型”的现有模型编辑器新增统一的模型能力探测：可逐模型选择，按当前 Provider、API 地址和协议顺序探测文本、图像、思考强度、developer、严格工具、store、流式 usage 和输出 token 字段，并把结果先应用到未保存草稿。
- 支持“自动 / 文本和图像 / 仅文本”输入模态、逐模型 reasoning 档位和兼容字段探测；普通探测不会覆盖已有明确配置，只有勾选“覆盖已有能力配置”才会覆盖。401/403/407 认证失败、429、502/503、超时和网络失败保持“无法确认”，不会误判为不支持。
- CPA、WOYAOPRO、OpenCode、CommandCode 和自定义 Provider 共用同一个 provider-neutral Host Remote，不按供应商或模型名称特判，不自动切换协议；已完成的 AgentTeams 角色模型/思考策略、OpenCode/Kimi、grep、多模态和 AUTO 移除成果继续受上游门禁保护。
- 增加 Windows 生成目录映射保护：编译前对现有生成文件做内容不变的目录项脱离，避免运行中的消费者或索引器触发 `os error 1224`，并保留对应回归测试。

## 历史：`v0.1.1-rc.28` 更新说明

- 完整移除 AUTO 权限插件，新的安装包只保留上游官方 `Read Only`、`Workspace Write`、`Full Access` 权限模式；不迁移旧 AUTO 会话，也不删除用户目录中可能残留但已不再挂载的缓存文件。
- 新增包装器自有的通用工具调用约束：可选参数未知或空白时默认省略，只有工具明确赋予空值语义时才保留；工具失败后必须先读取错误或结构化下一步，不能用同一组无效参数原样重试。该系统提示不超过 500 字符。
- AgentTeams 提示保持 `unknown / inactive / staged / running / halted` 生命周期状态机；当前中文内置 `software-delivery` Profile 的队长提示为 3,424 字符，低于 3,500 字符上限，同时保留角色级模型/思考策略、审批、依赖、attempt/reassign、质量门禁、resume/delete 和部署确认约束。
- `agent_teams_create` 的可选 `profile` 缺失、空字符串或纯空白时统一视为未传，创建无 Profile 的 ad-hoc Team；非空未知 Profile 仍在写入状态或启动成员前严格拒绝，且工具说明会列出当前可用 Profile。
- 394 个工具的目录、CPA/OpenCode、多模态图片设置、协议、通用 `grep` 兼容和严格 V2 状态规则均未改动。本次同步修复了 Windows 打包依赖闭包：必须从实体 `node_modules` 的主工作区构建，并在发布前验证 `cordis` 等启动链依赖确实进入安装包；对应 EXE/ZIP 作为 GitHub Release 资产发布。

## 历史：`v0.1.1-rc.27` 更新说明

- 模型设置新增按模型独立编辑的图片输入三态：`自动`、`文本和图像`、`仅文本`；支持按当前提供方批量设为图像或恢复自动，保存会保留协议、容量、思考强度、成本和兼容字段。
- 自动模式不猜测未知模型：没有可确认能力时继续按文本处理；检测到非法 `input` 数据会阻止保存，必须由用户明确选择有效状态。保存后重启，新的模型能力覆盖才会加载。
- CPA 的“自动”现在保持为 Provider 默认继承，不会在保存或后续启动时被改写成显式图像覆盖；真正的旧 CPA 配置仍会通过一次性迁移补齐图片能力，显式仅文本设置保持不变。
- 修复通用 `grep` 工具参数兼容：只有缺少自有 `pattern` 且 `description` 完整匹配单行 `pattern: <内容>` 时才转换；已有 `pattern` 或其他 malformed 参数继续交给上游严格校验，不绑定供应商或模型。
- 延续 AgentTeams `.9` 的队长任务别名、共享任务池和可操作交付物提示修复；所有既有 CPA、OpenCode、子智能体角色模型/思考策略和严格 V2 状态能力继续受回归门禁保护。

## 历史：`v0.1.1-rc.26` 更新说明

- AgentTeams 创建任务时，`assignee="captain"` 现在明确表示队长负责，空值或纯空白则归一化到共享任务池；修复 `no active member named "captain"` 和 `no active member named ""`，其他非空名称仍必须对应活动成员。
- 交付物质量门继续拒绝抽象描述和受保护路径，但会直接提示使用真实的工作区相对 POSIX 路径，并把抽象成果写入任务标题、描述或验收条件；`.env`、密钥和 `.git` 边界没有放宽。
- 新增队长/共享任务池生命周期与交付物提示回归，并同步 AgentTeams 运行时产物；角色级 Provider、模型、思考强度、CPA/OpenCode、严格 V2 状态和既有质量门保持不变。

## 历史：`v0.1.1-rc.25` 更新说明

- Team 已运行后，误调用 `agent_teams_edit_plan` 不再产生红色工具异常；返回明确的下一步指引，已批准计划仍保持不可变。
- staged 成员编辑会保留“目标模型默认 / 路由感知 / 明确指定”三种推理策略；从明确指定切到继承或路由时会清除旧的显式思考强度，避免保存失败或把旧强度继续当成角色覆盖值。
- staged 计划编辑支持完整质量契约字段，包含任务类型、目标、`inScope`、验收、验证命令、交付物和覆盖范围；Host 会拒绝包含非字符串项的列表，避免非法输入被误当成清空操作。
- implementation/repair 的声明交付物必须被 `inScope` 覆盖；完成时不能用空 `changedPaths` 隐藏声明交付物。确实没有文件变更时，必须提供 `noChangesReason`。
- 新增运行中计划误调用、显式策略降级、Host 列表边界、完整 staged 契约与清空往返、交付物范围和无变更证据回归测试；保留本项目既有的角色级模型、CPA/OpenCode 路由、V2 严格状态和质量门。

## 历史：`v0.1.1-rc.24` 更新说明

- `agent_teams_status` 在当前会话尚未创建或加入 Team 时改为返回干净的 `active: false` 状态，不再显示 `you do not lead or belong to any active team yet` 红色错误；任务认领、更新和消息发送仍严格要求真实 Team 成员身份。
- 运行中的 Team 允许把 `implementation` 任务预先排在尚未完成的 requirements 任务之后；只有明确依赖该 requirements 才能创建，调度仍须等待其 `completed + verdict=pass`，不会绕过质量门。
- 修复非 GPT 模型在 `agent_teams_create_task` 中补出空可选字段后，Team 虽创建成功却在下一次读取时报“AgentTeams V2 状态无效”的问题；空的 `objective`、`reviewedTaskId`、`sourceTaskId` 现在会在持久化前省略。
- `agent_teams_delete` 在当前会话尚未创建 Team 时改为幂等返回“无需删除”，不再显示 `you are not leading any team yet` 红色错误。
- 没有 staged Team 时，模型把“继续/确认”误判为审批会得到 inactive 引导，不再显示同类红色工具错误；不会隐式创建或写入 Team。
- 继续严格使用 V2 Profile/Team 与角色级 Provider、模型、思考强度设置；不新增旧状态迁移或旧对话兼容层。

## 历史：`v0.1.1-rc.22` 更新说明

- AgentTeams 将成员 Provider、model 和 reasoning policy 收敛到 Profile 角色卡；全局成员模型与推理设置已移除。
- Profile 文档与 Team 状态严格要求 `schemaVersion: 2`；旧 Profile/Team 数据保留在磁盘但拒绝加载、不做迁移，请新建 Profile 和 Team。
- CPA 与 OpenCode 模型继续来自共享 Harness catalog；Profile 保存后需重启，才会注入并用于新团队。

## 历史：`v0.1.1-rc.20` 更新说明

- 修复未配置 `memberModel` 时把默认空字符串误判为非法配置的问题；普通成员现在会按设计继承队长当前的 provider、模型和思考强度。

## 历史：`v0.1.1-rc.19` 更新说明

- `设置 → 子智能体` 增加贴近上游结构的 **Profile 配置**：可编辑成员、角色、Provider/模型、推理强度、协议、执行提示、fallback、captain/seed 任务模板、依赖和 review policy。
- 内置 `software-delivery` Profile 默认提供 analyst、implementer、tester、reviewer 四角色；自定义 Profile 保存到本机桌面设置，保存后重启生效。

## 为什么选择这个项目

上游 Harness 适合通过 Node.js 命令行启动和扩展；本项目面向希望在 Windows 上直接使用、又不想放弃上游生态的用户，提供一层可维护的桌面组合与兼容增强。

| 关注点 | 直接使用上游 Harness | DeepSeek Harness Windows |
| --- | --- | --- |
| 启动方式 | 需要 Node.js 和命令行环境 | Electron 独立窗口，支持双击启动 |
| Windows 体验 | 依赖本机终端和子进程行为 | 随机 loopback 端口、隐藏控制台、启动自愈和 shell 兼容处理 |
| CPA / CLIProxyAPI | 需要自行组合 Provider | 原生“设置 → 模型”入口，支持地址、Token、模型发现、图片输入和 R 协议档位 |
| 子智能体 | 使用上游默认委派路径 | AgentTeams 按 Profile 角色卡配置 Provider/模型/思考强度，并可选择 Team 或 Native 路由 |
| 会话延续 | 依赖原始日志导出 | 使用官方 Session log 导出；本地续接 MD 插件已移除，已导出文件保留 |
| 上游升级 | 由使用者自行验证兼容性 | 维护能力注册表和 `verify:upstream` 回归门禁，避免本地功能在刷新后悄悄丢失 |

## 核心卖点

- **上游兼容，而不是另起炉灶**：运行时核心来自锁定提交构建并逐包校验的官方 DeepSeek Harness release family，本项目主要负责 Windows 包装、插件组合和窄范围兼容修复。
- **开箱即用的 Windows 桌面入口**：随机本地端口避免冲突，隐藏 Node/命令行窗口，启动失败提供更清晰的恢复路径。
- **CPA 多模型与多模态**：通过 `CPA / CLIProxyAPI` 原生提供方接入 OpenAI Responses 兼容网关，自动获取模型；CPA 新模型默认仅文本，可逐模型启用图像输入，支持图片附件和模型级纯文本覆盖。
- **完整的思考协议映射**：支持 `off / low / medium / high / xhigh / max`，其他模型保留完整七档词汇，GPT-5.6 按其可用档位过滤。
- **子智能体可控可追踪**：AgentTeams 的 Profile 角色卡分别管理 Provider、模型和 reasoning policy；保存后重启用于新团队，Team/Native 委派路由仍在主程序设置 TAB 中管理。
- **网关截断识别**：任意 OpenAI 兼容网关把“输出用满上限”误报为正常结束时，统一按官方 `max-tokens` 处理，不针对单个网关打补丁。
- **面向长期维护的插件边界**：CPA、AgentTeams、Models 设置、桌面设置和 Windows 包装器各自负责清晰能力，便于后续独立升级和回归。

## 与上游项目的关系

本项目不是官方 DeepSeek Harness 的替代实现，也不声称获得官方认证。官方 Harness 负责核心运行时、Web UI 和插件接口；本项目负责 Windows 桌面启动层以及独立维护的本地插件和兼容性重写。上游版本更新后，必须先阅读 [上游维护注册表](docs/UPSTREAM_MAINTENANCE.md)，逐项标记 `UPSTREAM_EQUIVALENT`、`REAPPLY` 或 `SUPERSEDED_BY_DESIGN`，再运行完整回归门禁。这样既能获得上游生态的持续更新，也能避免 CPA、子智能体和 Windows 修复在合并时丢失。

## 适合谁

- 想在 Windows 上双击使用 DeepSeek Harness，而不是每次打开终端的开发者。
- 使用 CLIProxyAPI 统一管理多个模型、思考档位或图片输入的用户。
- 需要对子智能体模型和委派路由进行明确控制的 AgentTeams 用户。

## 仓库内容

- `win-desktop/`：Electron 桌面包装器、Windows 启动兼容、插件和测试。
- `docs/superpowers/specs/`：已确认的功能设计。
- `docs/superpowers/plans/`：分阶段实施计划。

官方 DeepSeek Harness checkout、构建缓存和 tarball 仅作为本地核对材料使用，不纳入本仓库；仓库内保留固定 tag/commit、工具链、包身份与全部 SHA-256 的可审计清单。

## 当前能力

- 在独立 Electron 窗口中启动官方 `dsh web`。
- 使用随机 loopback 端口，避免固定端口冲突。
- Windows 子进程隐藏控制台窗口。
- 主程序设置中的“桌面”与“AgentTeams 团队”入口沿用 Harness 设置外壳和主题；官方“插件 → 子智能体”单独管理 Native 配置。
- “模型”设置中的 `CPA / CLIProxyAPI` 插件：填写 API 地址和 Token，从 `/v1/models` 获取模型，并供主会话与 AgentTeams 共用。
- AgentTeams 插件集成；成员 Provider、模型与 reasoning policy 在 Profile 角色卡中配置。权限模式由上游 Harness 官方预设负责。
- AgentTeams 的 Team/Native 委派路由：新 Team 会话会记录 `teams-v1` 并只允许 AgentTeams 委派；Native 会话记录 `native-v1` 并保留官方原生委派工具。角色 Profile 保存后需重启才用于新团队。
- 网关把用满输出上限的回复报告为 `stop` 时，按官方 `max-tokens` 结束回合并提示截断。

## 历史：`v0.1.1-rc.19` 更新说明

- `设置 → 子智能体` 增加贴近上游结构的 **Profile 配置**：可编辑成员、角色、Provider/模型、推理强度、协议、执行提示、fallback、captain/seed 任务模板、依赖和 review policy。
- 内置 `software-delivery` Profile 默认提供 analyst、implementer、tester、reviewer 四角色；V2 自定义 Profile 保存到本机桌面设置，内置项可恢复。
- Profile 保存经过主进程边界校验，启动前注入 AgentTeams；坏配置不会阻断 Harness 启动。保存后需重启，才会用于新团队；不兼容的旧 Profile 不会被迁移。

## 历史：`v0.1.1-rc.18` 更新说明

- AgentTeams 本地 fork 刷新至上游 `v0.1.14`：接入执行前审查、可编辑 staged plan、原子审批、profile、可选质量门禁、fallback 和更安全的停止/恢复能力。
- 为保持本项目既有行为，普通 AgentTeams 请求继续即时执行；显式 `approval=required` 和队长规划 profile 使用审查流程。`子智能体` 设置、角色级模型策略、CPA 共用模型目录、Team/Native 路由、成员认领兼容和 OpenCode 等本地功能继续保留。
- AgentTeams 的模型计划编辑器复用 Harness 原生模型目录，并与本地设置/连接注入共同挂载；未把 CPA 专属规则移入 AgentTeams 或 Models fork。

## 历史：`v0.1.1-rc.17` 更新说明

- 修复 OpenCode Go 模型的会话粘性：参考 OpenCode 官方客户端，为所有 `opencode-go` 请求注入当前 Harness 会话的 `x-opencode-session`，并与提示缓存开关解耦。Kimi K3 不再因无会话头被网关路由到返回 403 的后端；Kimi K2.7 Code 等模型也使用同一稳定路由。
- 新增真实 Pi 请求链回归：验证 `cacheRetention: 'none'` 仍发送会话头，且普通 `openai` Provider 不会收到 OpenCode 专用头。Muse Spark 仍固定走上一版已验证的 `openai-responses` 路由；本次只补会话头，不改协议、地址或 Token。

## 历史：`v0.1.1-rc.16` 更新说明

- 修复 OpenCode Go 的 `Kimi K3 (2x usage)` 首轮工具调用兼容性：保留 Chat Completions 路由，避免发送 Kimi 原生目录禁用的 `strict` 字段，并补齐推理内容与延迟工具处理。该覆盖不读取或修改 API Key、地址或套餐设置。
- Kimi K3 的工具参数会在发送前采用 OpenCode 官方客户端同类归一化：移除 `$ref` 节点的同级字段、把数组式 `items` 收敛为单一 Schema。真实 Pi 请求回归同时验证 `strict` 未发送及 Schema 已处理。

## 历史：`v0.1.1-rc.15` 更新说明

- 修复 `OpenCode 模型能力` 插件在 Harness 加载器中错误使用 CommonJS `exports` 而导致“Failed to load plugins”的问题。现在按 Harness 浏览器加载器约定返回插件定义，并新增真实加载器运行回归。

## 历史：`v0.1.1-rc.14` 更新说明

- 扩展 OpenCode Go 图片能力校正，覆盖旧目录中容易被误标为仅文本的 `ox-alpha-free`、DeepSeek V4 Flash Vision、Qwen 3.8 Max、Kimi K2.5、Qwen 3.5 Plus、MiMo V2 Omni，以及已修复的 Muse Spark 1.2 Contributor、GPT-5.6 Luna。
- “设置 → 模型”新增独立的 **OpenCode 模型能力** 卡片；点击“校验模型能力”会以同一份离线验证规则修复本机 OpenCode 目录，显示修复数量，并提示重启后生效。不会访问、读取或写入 API Token。
- 纯文本模型和未知模型不被猜测为支持图片；HTTP 500 仍按服务端错误保留，不切换协议重试。

## 历史：`v0.1.1-rc.13` 更新说明

- 修复 OpenCode Go 模型目录的协议错配：Muse Spark 1.2 Contributor 和 GPT-5.6 Luna 现在固定走 `openai-responses`；Qwen3.7 Max 与 Qwen3.7 Plus 固定走 `openai-completions`。
- Windows 启动前会统一校正官方静态目录、既有目录和实时发现目录中的已验证模型能力，包含图片、思考档位和原始上下文/输出容量；未知模型不会因一次 500 被自动改协议或重试，避免重复请求并保留真实服务端错误。
- 将 OpenCode 协议档案覆盖层及其启动、离线回退、实时发现回归纳入 `verify:upstream`，后续上游刷新必须先分类并保留该能力。

## 历史：`v0.1.1-rc.12` 更新说明

- 修复从旧版本升级后，已有 CPA 模型配置缺少图片输入能力元数据，导致粘贴图片后发送仍提示“当前模型不支持图片”的问题。
- CPA 插件会在启动时仅迁移既有 `cpa` Provider：补齐路由和模型的 `text + image` 声明，同时保留 Token 引用、API 地址、上下文/输出容量、其他 Provider，以及模型显式 `input: ['text']` 覆盖。
- 新增旧配置迁移回归并继续纳入 `npm run verify:upstream`，防止后续上游刷新再次丢失升级兼容。

## 历史：`v0.1.1-rc.11` 更新说明

- Electron 更新至 `43.4.1`，electron-builder 更新至 `26.15.7`；保留全部本地插件和上游回归门禁。
- 继续包含 CPA 图片输入修复、AgentTeams 子智能体设置和 Windows 兼容修复。

## 历史：`v0.1.1-rc.10` 更新说明

- 修复 CPA / CLIProxyAPI 图片附件在 Harness 中被误判为“当前模型不支持图片”的问题。CPA 路由和模型现在声明 `text + image` 输入模态，同时保留单模型显式纯文本覆盖。

Windows 安装包请从 [GitHub Releases](https://github.com/spellyaohui/deepseek-harness-windows/releases) 下载；仓库源码不会跟踪 `win-desktop/dist/` 中的安装包和绿色压缩包。

## 历史：`v0.1.1-rc.9` 更新说明

- `CPA / CLIProxyAPI` 现在只保留一个原生提供方入口：在“设置 → 模型”中点击 CPA 行的“编辑”即可展开/收起配置，不再显示重复的 CPA 专用大卡片。
- CPA 的 `/v1` 地址规范化、Token 凭据隔离、模型发现、文本/图片输入、GPT-5.6 R 档位、原始上下文/输出容量，以及主会话和 AgentTeams 共用模型目录均保留。
- “桌面”设置取消“保存设置”按钮，关闭行为选择后立即保存；保存中控件暂时禁用，失败会恢复上次已提交的值并显示错误。
- 既有 AgentTeams 路由继承/明确指定规则、OpenCode 流恢复和 Windows 文件工具提权兼容修复继续受 `npm run verify:upstream` 回归门禁保护。
- 上游 Harness 或 AgentTeams 更新后，必须先按 [上游维护注册表](docs/UPSTREAM_MAINTENANCE.md) 分类本地能力，再跑完整回归，不能通过删除本地插件或测试来解决冲突。

## CPA / CLIProxyAPI

打开“设置 → 模型”，找到 `CPA / CLIProxyAPI` 提供方行并点击“编辑”展开配置。填写 API 地址和 Token，展开模型目录后获取模型、选择需要启用的模型并应用。地址会规范到 `/v1`，模型固定通过 `openai-responses` 调用；Token 写入 Harness 凭据存储，不进入普通设置文件。

保存后，主会话可以选择 Provider `cpa`；“设置 → AgentTeams 团队”中的 Profile 角色也会从同一个 Harness 模型目录读取 CPA 模型，不维护第二份模型清单。

CPA 新模型默认仅文本，可逐模型启用图像输入 输入模态，以便 CLIProxyAPI 的 Responses 网关接收图片；如果某个网关中的具体模型确实是纯文本，可在原生提供方编辑器中保留该模型的显式 `input: ['text']` 覆盖。

CPA R 协议线级别为 `none / minimal / low / medium / high / xhigh / max`。Harness 中的 `off` 会发送为 `none`；GPT-5.6 模型不提供 `minimal`，因此可选项为 `off / low / medium / high / xhigh / max`。

## 开发

固定构建工具链为 Node.js 26.7.0 / pnpm 11.7.0。完整步骤见 [干净机器构建指南](docs/CLEAN_WINDOWS_BUILD.md)。

```powershell
npm install --global pnpm@11.7.0 --ignore-scripts
./win-desktop/scripts/prepare-clean-build.ps1
cd win-desktop
npm run verify:upstream
npm run dist:win
```

AgentTeams、Models 和 CPA 的 `lib/` 是可重建输出，不进入 Git；`verify:upstream` 会先编译插件并同步已安装依赖，再执行完整测试。不要在首次编译前直接启动应用。

完整的 AgentTeams 本地 fork 位于 `win-desktop/agent-teams-plugin/`，安装时以 `file:agent-teams-plugin` 进入包装器；其上游基线为 `@nanmicoder/dsh-agent-teams@0.1.22`（固定提交 `9cba4fe4171f27c019991cafd2a107f87ef3517b`），本地版本为 `0.1.22-desktop.8`，推荐宿主固定为 Harness `0.2.0-rc.2`。上游负责团队工作区、成员导航、任务生命周期和证据治理；仅重应用上游未覆盖的严格 V2、角色模型/思考策略、统一 durable gateway、质量扩展、Revision/CAS 和认证边界。升级来源和差异记录见 [win-desktop/agent-teams-plugin/UPSTREAM.md](win-desktop/agent-teams-plugin/UPSTREAM.md)。

同步上游前必须按 [上游维护与本地能力注册表](docs/UPSTREAM_MAINTENANCE.md) 逐项分类并通过 `verify:upstream`；不能为了消除冲突删除本地插件、设置或回归测试。

验证本地 fork 与 Windows 包装器：

```powershell
cd win-desktop/agent-teams-plugin
pnpm typecheck
pnpm test
cd ..
npm test
npm audit
npm run dist:win
```

这些扩展不读取或暴露隐藏推理，也不修改 Harness 核心预设；它们仅通过插件设置域、持久化的会话标记和官方插件组合接口实现路由。

构建产物位于 `win-desktop/dist/`，不会提交到 Git。

## 公开仓库安全

本仓库不会跟踪运行态会话、`.agent-teams/`、本地编辑器配置、API Key、桌面用户设置、日志、安装包、`node_modules/` 或本地上游源码副本。提交前请阅读 [SECURITY.md](SECURITY.md)。

## License

[MIT](LICENSE)
