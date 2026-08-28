# DeepSeek Harness Windows

把官方 DeepSeek Harness 带到 Windows 桌面：保留上游 Harness 的插件生态和核心能力，再补上双击启动、Windows 进程兼容、CPA 多模型接入、AgentTeams 子智能体配置和会话续接等桌面生产力能力。

> 当前版本：`v0.1.1-rc.25`（开发者预览）

## `v0.1.1-rc.25` 更新说明

- Team 已运行后，误调用 `agent_teams_edit_plan` 不再产生红色工具异常；返回明确的下一步指引，已批准计划仍保持不可变。
- staged 成员编辑会保留“目标模型默认 / 路由感知 / 明确指定”三种推理策略；从明确指定切到继承或路由时会清除旧的显式思考强度，避免保存失败或把旧强度继续当成角色覆盖值。
- staged 计划编辑支持完整质量契约字段，包含任务类型、目标、`inScope`、验收、验证命令、交付物和覆盖范围；Host 会拒绝包含非字符串项的列表，避免非法输入被误当成清空操作。
- implementation/repair 的声明交付物必须被 `inScope` 覆盖；完成时不能用空 `changedPaths` 隐藏声明交付物。确实没有文件变更时，必须提供 `noChangesReason`。
- 新增运行中计划误调用、显式策略降级、Host 列表边界、完整 staged 契约与清空往返、交付物范围和无变更证据回归测试；保留本项目既有的角色级模型、CPA/OpenCode 路由、V2 严格状态和质量门。

## `v0.1.1-rc.24` 更新说明

- `agent_teams_status` 在当前会话尚未创建或加入 Team 时改为返回干净的 `active: false` 状态，不再显示 `you do not lead or belong to any active team yet` 红色错误；任务认领、更新和消息发送仍严格要求真实 Team 成员身份。
- 运行中的 Team 允许把 `implementation` 任务预先排在尚未完成的 requirements 任务之后；只有明确依赖该 requirements 才能创建，调度仍须等待其 `completed + verdict=pass`，不会绕过质量门。
- 修复非 GPT 模型在 `agent_teams_create_task` 中补出空可选字段后，Team 虽创建成功却在下一次读取时报“AgentTeams V2 状态无效”的问题；空的 `objective`、`reviewedTaskId`、`sourceTaskId` 现在会在持久化前省略。
- `agent_teams_delete` 在当前会话尚未创建 Team 时改为幂等返回“无需删除”，不再显示 `you are not leading any team yet` 红色错误。
- 继续严格使用 V2 Profile/Team 与角色级 Provider、模型、思考强度设置；不新增旧状态迁移或旧对话兼容层。

## `v0.1.1-rc.22` 更新说明

- AgentTeams 将成员 Provider、model 和 reasoning policy 收敛到 Profile 角色卡；全局成员模型与推理设置已移除。
- Profile 文档与 Team 状态严格要求 `schemaVersion: 2`；旧 Profile/Team 数据保留在磁盘但拒绝加载、不做迁移，请新建 Profile 和 Team。
- CPA 与 OpenCode 模型继续来自共享 Harness catalog；Profile 保存后需重启，才会注入并用于新团队。

## `v0.1.1-rc.20` 更新说明

- 修复未配置 `memberModel` 时把默认空字符串误判为非法配置的问题；普通成员现在会按设计继承队长当前的 provider、模型和思考强度。

## `v0.1.1-rc.19` 更新说明

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
| 会话延续 | 依赖原始日志导出 | 提供可审查、可继续工作的 `续接 MD` 上下文包，同时保留原始 Session log |
| 上游升级 | 由使用者自行验证兼容性 | 维护能力注册表和 `verify:upstream` 回归门禁，避免本地功能在刷新后悄悄丢失 |

## 核心卖点

- **上游兼容，而不是另起炉灶**：运行时核心来自锁定版本的官方 DeepSeek Harness npm 包，本项目主要负责 Windows 包装、插件组合和窄范围兼容修复。
- **开箱即用的 Windows 桌面入口**：随机本地端口避免冲突，隐藏 Node/命令行窗口，启动失败提供更清晰的恢复路径。
- **CPA 多模型与多模态**：通过 `CPA / CLIProxyAPI` 原生提供方接入 OpenAI Responses 兼容网关，自动获取模型；CPA 模型默认声明 `text + image`，支持图片附件和模型级纯文本覆盖。
- **完整的思考协议映射**：支持 `off / low / medium / high / xhigh / max`，其他模型保留完整七档词汇，GPT-5.6 按其可用档位过滤。
- **子智能体可控可追踪**：AgentTeams 的 Profile 角色卡分别管理 Provider、模型和 reasoning policy；保存后重启用于新团队，Team/Native 委派路由仍在主程序设置 TAB 中管理。
- **会话可续接**：`续接 MD` 以确定性程序导出时间线、可见上下文、工具摘要和子会话 lineage，方便交给新的智能体继续；隐藏思维链和成功工具原始载荷不会被伪装导出。
- **OpenCode 图片能力自愈**：启动时校正已验证的协议和图片能力；遇到旧目录或可疑模型时，可在“设置 → 模型”一键校验，不会修改 API 地址或 Token。
- **OpenCode Go 会话路由兼容**：所有 OpenCode Go 模型沿用 Harness 当前会话的 `x-opencode-session` 粘性路由，避免 Kimi K3 等模型被网关误路由后伪装成“API key 无效”；通用 Provider 不受影响。
- **面向长期维护的插件边界**：CPA、AgentTeams、Models 设置、桌面设置、Session Markdown 和 Windows 包装器各自负责清晰能力，便于后续独立升级和回归。

## 与上游项目的关系

本项目不是官方 DeepSeek Harness 的替代实现，也不声称获得官方认证。官方 Harness 负责核心运行时、Web UI 和插件接口；本项目负责 Windows 桌面启动层以及独立维护的本地插件和兼容性重写。上游版本更新后，必须先阅读 [上游维护注册表](docs/UPSTREAM_MAINTENANCE.md)，逐项标记 `UPSTREAM_EQUIVALENT`、`REAPPLY` 或 `SUPERSEDED_BY_DESIGN`，再运行完整回归门禁。这样既能获得上游生态的持续更新，也能避免 CPA、子智能体、会话导出和 Windows 修复在合并时丢失。

## 适合谁

- 想在 Windows 上双击使用 DeepSeek Harness，而不是每次打开终端的开发者。
- 使用 CLIProxyAPI 统一管理多个模型、思考档位或图片输入的用户。
- 需要对子智能体模型和委派路由进行明确控制的 AgentTeams 用户。
- 需要把一次会话整理成可审查上下文，再交给另一个智能体继续处理的团队。

## 仓库内容

- `win-desktop/`：Electron 桌面包装器、Windows 启动兼容、插件和测试。
- `docs/superpowers/specs/`：已确认的功能设计。
- `docs/superpowers/plans/`：分阶段实施计划。

官方 DeepSeek Harness 源码仅作为本地核对材料使用，不纳入本仓库。运行时能力来自锁定版本的官方 npm 包。

## 当前能力

- 在独立 Electron 窗口中启动官方 `dsh web`。
- 使用随机 loopback 端口，避免固定端口冲突。
- Windows 子进程隐藏控制台窗口。
- 主程序设置界面中的“桌面”与“子智能体”TAB，沿用同一 Harness 设置外壳和主题。
- “模型”设置中的 `CPA / CLIProxyAPI` 插件：填写 API 地址和 Token，从 `/v1/models` 获取模型，并供主会话与 AgentTeams 共用。
- AgentTeams 和 Auto Mode 插件集成；AgentTeams 的成员 Provider、模型与 reasoning policy 在 Profile 角色卡中配置。
- AgentTeams 的 Team/Native 委派路由：新 Team 会话会记录 `teams-v1` 并只允许 AgentTeams 委派；Native 会话记录 `native-v1` 并保留官方原生委派工具。角色 Profile 保存后需重启才用于新团队。
- 会话页头的 `续接 MD` 导出：生成一份可交给新智能体会话继续工作的 Markdown 上下文包。
- OpenAI 兼容流缺少 `finish_reason` 时的兼容处理。

## `v0.1.1-rc.19` 更新说明

- `设置 → 子智能体` 增加贴近上游结构的 **Profile 配置**：可编辑成员、角色、Provider/模型、推理强度、协议、执行提示、fallback、captain/seed 任务模板、依赖和 review policy。
- 内置 `software-delivery` Profile 默认提供 analyst、implementer、tester、reviewer 四角色；V2 自定义 Profile 保存到本机桌面设置，内置项可恢复。
- Profile 保存经过主进程边界校验，启动前注入 AgentTeams；坏配置不会阻断 Harness 启动。保存后需重启，才会用于新团队；不兼容的旧 Profile 不会被迁移。

## `v0.1.1-rc.18` 更新说明

- AgentTeams 本地 fork 刷新至上游 `v0.1.14`：接入执行前审查、可编辑 staged plan、原子审批、profile、可选质量门禁、fallback 和更安全的停止/恢复能力。
- 为保持本项目既有行为，普通 AgentTeams 请求继续即时执行；显式 `approval=required` 和队长规划 profile 使用审查流程。`子智能体` 设置、角色级模型策略、CPA 共用模型目录、Team/Native 路由、成员认领兼容和 OpenCode/会话导出等本地功能继续保留。
- AgentTeams 的模型计划编辑器复用 Harness 原生模型目录，并与本地设置/连接注入共同挂载；未把 CPA 专属规则移入 AgentTeams 或 Models fork。

## `v0.1.1-rc.17` 更新说明

- 修复 OpenCode Go 模型的会话粘性：参考 OpenCode 官方客户端，为所有 `opencode-go` 请求注入当前 Harness 会话的 `x-opencode-session`，并与提示缓存开关解耦。Kimi K3 不再因无会话头被网关路由到返回 403 的后端；Kimi K2.7 Code 等模型也使用同一稳定路由。
- 新增真实 Pi 请求链回归：验证 `cacheRetention: 'none'` 仍发送会话头，且普通 `openai` Provider 不会收到 OpenCode 专用头。Muse Spark 仍固定走上一版已验证的 `openai-responses` 路由；本次只补会话头，不改协议、地址或 Token。

## `v0.1.1-rc.16` 更新说明

- 修复 OpenCode Go 的 `Kimi K3 (2x usage)` 首轮工具调用兼容性：保留 Chat Completions 路由，避免发送 Kimi 原生目录禁用的 `strict` 字段，并补齐推理内容与延迟工具处理。该覆盖不读取或修改 API Key、地址或套餐设置。
- Kimi K3 的工具参数会在发送前采用 OpenCode 官方客户端同类归一化：移除 `$ref` 节点的同级字段、把数组式 `items` 收敛为单一 Schema。真实 Pi 请求回归同时验证 `strict` 未发送及 Schema 已处理。

## `v0.1.1-rc.15` 更新说明

- 修复 `OpenCode 模型能力` 插件在 Harness 加载器中错误使用 CommonJS `exports` 而导致“Failed to load plugins”的问题。现在按 Harness 浏览器加载器约定返回插件定义，并新增真实加载器运行回归。

## `v0.1.1-rc.14` 更新说明

- 扩展 OpenCode Go 图片能力校正，覆盖旧目录中容易被误标为仅文本的 `ox-alpha-free`、DeepSeek V4 Flash Vision、Qwen 3.8 Max、Kimi K2.5、Qwen 3.5 Plus、MiMo V2 Omni，以及已修复的 Muse Spark 1.2 Contributor、GPT-5.6 Luna。
- “设置 → 模型”新增独立的 **OpenCode 模型能力** 卡片；点击“校验模型能力”会以同一份离线验证规则修复本机 OpenCode 目录，显示修复数量，并提示重启后生效。不会访问、读取或写入 API Token。
- 纯文本模型和未知模型不被猜测为支持图片；HTTP 500 仍按服务端错误保留，不切换协议重试。

## `v0.1.1-rc.13` 更新说明

- 修复 OpenCode Go 模型目录的协议错配：Muse Spark 1.2 Contributor 和 GPT-5.6 Luna 现在固定走 `openai-responses`；Qwen3.7 Max 与 Qwen3.7 Plus 固定走 `openai-completions`。
- Windows 启动前会统一校正官方静态目录、既有目录和实时发现目录中的已验证模型能力，包含图片、思考档位和原始上下文/输出容量；未知模型不会因一次 500 被自动改协议或重试，避免重复请求并保留真实服务端错误。
- 将 OpenCode 协议档案覆盖层及其启动、离线回退、实时发现回归纳入 `verify:upstream`，后续上游刷新必须先分类并保留该能力。

## `v0.1.1-rc.12` 更新说明

- 修复从旧版本升级后，已有 CPA 模型配置缺少图片输入能力元数据，导致粘贴图片后发送仍提示“当前模型不支持图片”的问题。
- CPA 插件会在启动时仅迁移既有 `cpa` Provider：补齐路由和模型的 `text + image` 声明，同时保留 Token 引用、API 地址、上下文/输出容量、其他 Provider，以及模型显式 `input: ['text']` 覆盖。
- 新增旧配置迁移回归并继续纳入 `npm run verify:upstream`，防止后续上游刷新再次丢失升级兼容。

## `v0.1.1-rc.11` 更新说明

- Electron 更新至 `43.4.1`，electron-builder 更新至 `26.15.7`；保留全部本地插件和上游回归门禁。
- 继续包含 CPA 图片输入修复、AgentTeams 子智能体设置、续接 Markdown 和 Windows 兼容修复。

## `v0.1.1-rc.10` 更新说明

- 修复 CPA / CLIProxyAPI 图片附件在 Harness 中被误判为“当前模型不支持图片”的问题。CPA 路由和模型现在声明 `text + image` 输入模态，同时保留单模型显式纯文本覆盖。

Windows 安装包请从 [GitHub Releases](https://github.com/spellyaohui/deepseek-harness-windows/releases) 下载；仓库源码不会跟踪 `win-desktop/dist/` 中的安装包和绿色压缩包。

## `v0.1.1-rc.9` 更新说明

- `CPA / CLIProxyAPI` 现在只保留一个原生提供方入口：在“设置 → 模型”中点击 CPA 行的“编辑”即可展开/收起配置，不再显示重复的 CPA 专用大卡片。
- CPA 的 `/v1` 地址规范化、Token 凭据隔离、模型发现、文本/图片输入、GPT-5.6 R 档位、原始上下文/输出容量，以及主会话和 AgentTeams 共用模型目录均保留。
- “桌面”设置取消“保存设置”按钮，关闭行为选择后立即保存；保存中控件暂时禁用，失败会恢复上次已提交的值并显示错误。
- 既有 AgentTeams 路由继承/明确指定规则、会话续接 Markdown 导出、OpenCode 流恢复和 Windows 文件工具提权兼容修复继续受 `npm run verify:upstream` 回归门禁保护。
- 上游 Harness 或 AgentTeams 更新后，必须先按 [上游维护注册表](docs/UPSTREAM_MAINTENANCE.md) 分类本地能力，再跑完整回归，不能通过删除本地插件或测试来解决冲突。

## CPA / CLIProxyAPI

打开“设置 → 模型”，找到 `CPA / CLIProxyAPI` 提供方行并点击“编辑”展开配置。填写 API 地址和 Token，展开模型目录后获取模型、选择需要启用的模型并应用。地址会规范到 `/v1`，模型固定通过 `openai-responses` 调用；Token 写入 Harness 凭据存储，不进入普通设置文件。

保存后，主会话可以选择 Provider `cpa`；“设置 → 子智能体”中的 AgentTeams 也会从同一个 Harness 模型目录读取 CPA 模型，不维护第二份模型清单。

CPA 模型默认声明 `text + image` 输入模态，以便 CLIProxyAPI 的 Responses 网关接收图片；如果某个网关中的具体模型确实是纯文本，可在原生提供方编辑器中保留该模型的显式 `input: ['text']` 覆盖。

CPA R 协议线级别为 `none / minimal / low / medium / high / xhigh / max`。Harness 中的 `off` 会发送为 `none`；GPT-5.6 模型不提供 `minimal`，因此可选项为 `off / low / medium / high / xhigh / max`。

## 续接 Markdown 导出

`续接 MD` 位于会话页头的 `Session log` 旁边。它先对当前会话及其已知子会话做一次预检，然后下载一个 `.md` 文件。导出是确定性程序渲染，不调用 LLM；同一快照会产生相同内容。

导出包含：

- 会话元数据、最新已渲染 system prompt、模型/提供商/推理强度等有效配置，以及可用工具名称列表。
- 当前模型可见 surface、完整可见时序 transcript、最新直接用户请求和最近助手文本；兼容当前 Harness 直接载荷和旧版包装载荷的用户消息。
- 精简执行状态：待办、已变更路径、失败/未完成工具的摘要、中断和 turn 边界。
- 已知后代会话的递归章节；子会话继承的 seed 历史只引用来源和计数，不重复展开。

如果选中的根会话本身继承自父会话，导出会保留这段有效上下文，并明确标出父会话、seed 数量以及“继承历史/本会话日志”的 sequence 边界。消息时间同时显示 UTC ISO-8601 和原始 epoch 值，sequence 仍是规范排序依据。

它不包含成功工具调用的原始 arguments/result、二进制附件或原始工具流量，也不读取或声称包含隐藏思维链。产品中已可见的 reasoning 块会明确标记为 `可见推理`。需要完整原始会话事件、工具交互和附件时，继续使用官方 `Session log` 原始 ZIP 导出；两者是互补而非替代关系。

Markdown 可能包含 system prompt、工作区路径、对话和敏感项目上下文。下载后应按敏感数据保管，共享前先审查和脱敏，不得提交到公开仓库。文件中的文件系统与外部状态只是导出时的历史上下文，继续任务前必须重新验证。

## 开发

需要 Node.js 22.19 或 24+。

```powershell
cd win-desktop
npm ci --legacy-peer-deps --install-links=true
npm test
npm run verify:upstream
npm run dist:win
```

完整的 AgentTeams 本地 fork 位于 `win-desktop/agent-teams-plugin/`，安装时以 `file:agent-teams-plugin` 进入包装器；其上游基线为 `@nanmicoder/dsh-agent-teams@0.1.14`（`v0.1.14` / `5fe388f1a30da7b1374294b25bd6f8ad74ab6aa5`），本地版本为 `0.1.14-desktop.8`。升级来源和差异记录见 [win-desktop/agent-teams-plugin/UPSTREAM.md](win-desktop/agent-teams-plugin/UPSTREAM.md)。

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

验证续接 Markdown 插件、Windows 包装器与可发布产物：

```powershell
cd win-desktop/session-markdown-export-plugin
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
