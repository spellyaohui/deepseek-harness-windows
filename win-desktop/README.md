# DeepSeek Harness Windows 桌面版

本目录把官方 npm 包 `@deepseek-ai/dsh@0.1.1-rc.2` 封装成可双击运行的 Windows 程序。桌面包装器当前版本为 `0.1.1-rc.25`。

## `v0.1.1-rc.25` 更新说明

- Team 运行后误调用 `agent_teams_edit_plan` 改为结构化提示，不再产生红色异常；已批准计划仍不可编辑。
- staged 成员编辑完整保留目标默认、路由感知、明确指定三种策略；从明确指定切换到继承或路由时会清除旧的显式思考强度。
- staged 任务编辑支持完整质量契约，包含 `inScope`、交付物、验收、验证命令、任务类型和覆盖范围；Host 拒绝列表中的非字符串项，空列表仍可明确清空字段。
- implementation/repair 的交付物必须在 `inScope` 内；空 `changedPaths` 必须说明无变更，且不能掩盖声明交付物。
- 新增策略切换、Host 边界、完整字段持久化/清空等 TDD、生命周期和包装器回归；角色级 Provider、模型、思考强度、CPA/OpenCode 支持保持不变。

## `v0.1.1-rc.24` 更新说明

- 创建 Team 前调用只读的 `agent_teams_status` 现在返回 `active: false`，不再产生 `you do not lead or belong to any active team yet` 红错；有写入能力的参与者工具仍保留严格身份检查。
- `implementation` 可以在 running Team 中作为 pending 节点排到活跃 requirements 之后；必须声明依赖，且调度仍等待 requirements 以 `verdict=pass` 完成，避免把安全的 DAG 预创建误报为门禁失败。
- 修复非 GPT 模型补出空任务可选字段时，新 Team 随后被严格 V2 校验拒绝的问题；创建边界会省略空的 `objective`、`reviewedTaskId` 和 `sourceTaskId`，并保留有效的角色级模型与思考强度。
- 创建 Team 前调用 `agent_teams_delete` 现在幂等返回“无需删除”，不再产生 `you are not leading any team yet` 红错。
- 仍然不迁移旧 Profile、旧 Team 或旧对话状态；新版本继续强制 V2 数据和角色级路由策略。

## `v0.1.1-rc.22` 更新说明

- AgentTeams 成员 Provider、模型与 reasoning policy 现在通过 Profile 角色卡分别配置；全局成员模型与推理设置已移除。
- Profile 文档和 Team 状态严格要求 `schemaVersion: 2`。旧数据留在磁盘但拒绝加载、不迁移；请新建 Profile 和 Team。
- CPA 与 OpenCode 模型继续使用共享 Harness catalog；Profile 保存后需重启，才会用于新团队。

## `v0.1.1-rc.19` 更新说明

- `设置 → 子智能体` 增加可编辑的 Profile 配置区，贴近上游 profile 字段，支持四角色内置 `software-delivery`、自定义/复制/重命名/删除、成员路由、fallback、captain/seed 任务依赖和 review policy。
- Profile 写入本机 `desktop-settings.json`，主进程在启动前安全注入 AgentTeams；保存后需重启，内置 profile 可恢复。
- 保留 AgentTeams v0.1.14 的 staged plan、质量门、fallback、生命周期与压力回归，以及本项目的 CPA 共用模型目录、Team/Native、OpenCode、Session Markdown 和 Windows 兼容能力。

## `v0.1.1-rc.18` 更新说明

- AgentTeams 本地 fork 刷新至上游 `v0.1.14`：加入 staged plan、原子审批、profile、可选质量门禁、fallback 和更安全的停止/恢复控制。
- 普通 AgentTeams 请求继续使用本项目原有即时执行默认；显式 `approval=required` 与队长规划 profile 才进入执行前审查。现有 `子智能体` 设置、角色级模型策略、CPA 共用模型目录、Team/Native 路由、成员认领兼容及其他本地插件功能均保留。
- staged plan 编辑器使用 Harness 原生 Provider/模型目录，和本地设置/连接注入共同挂载；CPA 专属行为仍由 CPA 插件负责。

## `v0.1.1-rc.17` 更新说明

- OpenCode Go 所有模型请求现在携带当前 Harness 会话的 `x-opencode-session`，即使提示缓存设置为 `none` 也保持会话路由；修复 Kimi K3、Kimi K2.7 Code 等模型被网关误路由后显示“API key is invalid”的问题。
- Muse Spark 继续使用上一版已验证的 `openai-responses` 协议；本次 Responses 兼容层只补会话头，不改变既有路由、地址、Token 或模型能力配置。
- 普通 OpenAI-compatible Provider 保持原有请求头不变；新增真实 Pi 请求链回归覆盖 OpenCode Go 与通用 Provider 的边界。

## `v0.1.1-rc.16` 更新说明

- 修复 OpenCode Go `Kimi K3 (2x usage)` 在全新 Harness 会话的工具调用兼容：启动前为该模型保留 Kimi 原生目录所需的无 `strict` 工具格式、推理内容回放和延迟工具处理；工具 Schema 同步应用 OpenCode 官方客户端的 Kimi 归一化；不改变 API 地址、Token 或套餐路由。

## `v0.1.1-rc.15` 更新说明

- 修复 OpenCode 模型能力卡片的浏览器插件加载格式：不再引用加载器环境中不存在的 CommonJS `exports`，避免启动时报 `Failed to load plugins`。
- 增加加载器工厂真实执行回归，验证客户端正确返回 `inject` 与 `apply` 定义。

## `v0.1.1-rc.14` 更新说明

- 将 OpenCode Go 的图片能力校正扩展到完整的已验证目录：`ox-alpha-free`、DeepSeek V4 Flash Vision、Qwen 3.8 Max、Kimi K2.5、Qwen 3.5 Plus、MiMo V2 Omni，以及此前已修复的 Muse Spark 1.2 Contributor、GPT-5.6 Luna。
- “设置 → 模型”新增 **OpenCode 模型能力** 卡片，可手动校验并修复本机模型目录；只使用离线验证规则，不读取或修改 API 地址、凭据或 Token，重启 Harness 后生效。
- 已确认的纯文本模型和未知模型继续保持纯文本，HTTP 500 不触发猜测性协议切换或重试。

## `v0.1.1-rc.13` 更新说明

- 增加 OpenCode Go 模型协议档案覆盖层：启动前统一修复静态目录、已保存目录和实时发现目录中的已验证协议错配。
- Muse Spark 1.2 Contributor、GPT-5.6 Luna 通过 `openai-responses` 调用；Qwen3.7 Max、Qwen3.7 Plus 通过 `openai-completions` 调用，并同步已验证的图片、思考和容量能力。
- 未知模型继续使用原有 Completions 默认值；不会在 HTTP 500 后猜测另一协议重试，避免重复请求并保留上游服务故障。

## `v0.1.1-rc.12` 更新说明

- 修复旧 CPA 配置升级后的图片能力迁移：启动时自动补齐缺失的 `text + image` 元数据，解决图片已粘贴到输入框、发送阶段却被误判为不支持的问题。
- 迁移仅写入 `llm-pi-ai.providers.cpa`，保留其他 Provider、凭据引用、原始容量和模型显式纯文本覆盖；已是新格式时不重复写入。

## `v0.1.1-rc.11` 更新说明

- Electron 更新至 `43.4.1`，electron-builder 更新至 `26.15.7`；全部本地插件和回归门禁保持不变。

## `v0.1.1-rc.10` 更新说明

- 修复 CPA 图片输入能力声明；CPA 路由和模型默认接受 `text + image`，单模型显式 `input: ['text']` 仍可覆盖。

## `v0.1.1-rc.9` 更新说明

- CPA 只保留原生 `CPA / CLIProxyAPI` 提供方行；点击“编辑”即可展开/收起，原生模型目录继续承载 API 地址、Token、模型发现、模型选择、文本/图片输入和容量设置。
- 桌面关闭行为改为即时保存，不再提供单独的“保存设置”按钮；保存失败会恢复此前已提交的选择。
- CPA 思考协议、AgentTeams 子智能体独立模型/思考设置、会话续接 Markdown、OpenCode 流恢复和文件工具提权兼容修复均纳入上游回归门禁。

## 它做了什么

DeepSeek Harness 本身是 Node.js 插件式 Agent 框架，官方入口是：

```bash
npx @deepseek-ai/dsh web
```

桌面包装器会：

1. 用 Electron 打开一个独立窗口
2. 在后台以 `ELECTRON_RUN_AS_NODE` 启动官方 `dsh web`
3. 监听 `127.0.0.1` 随机端口
4. 等到日志出现 `dsh web: http://127.0.0.1:<port>` 后加载官方 Web UI
5. 预装 [`@nanmicoder/dsh-auto-mode`](https://github.com/NanmiCoder/dsh-auto-mode)，Web UI 的权限菜单里会出现 **Auto**
6. 预装本地维护的 [`@nanmicoder/dsh-agent-teams`](agent-teams-plugin/)，可用自然语言拉起多 Agent 团队，右上角会出现活动面板
7. 预装本地 `CPA / CLIProxyAPI` Provider 插件，在 Harness 的“模型”设置中配置，并由主会话和 AgentTeams 共用

## 子智能体设置与委派路由

Harness 主设置中有两个独立、同主题的 section：`桌面` 管理窗口行为，`子智能体` 管理 AgentTeams 的委派模式、成员提供商/模型和推理强度。模型目录会在十秒内显示就绪、空列表或可重试的错误状态。

- **Team**：新会话写入 `AgentTeams delegation policy: teams-v1`，仅保留 `agent_teams_*` 的真实委派路径，并隐藏官方原生/间接委派工具。
- **Native**：新会话写入 `AgentTeams delegation policy: native-v1`，保留官方原生委派工具；AgentTeams 可作为显式团队能力使用。
- Team/Native 委派策略继续由会话标记决定；Profile 角色策略保存后必须重启，才会注入并用于新团队。只有严格 V2 的 Profile 与 Team 状态会被加载，旧数据不会被迁移。

本地 fork 位于 `win-desktop/agent-teams-plugin/`，通过 `file:agent-teams-plugin` 安装；它基于上游 `@nanmicoder/dsh-agent-teams@0.1.14`、`v0.1.14`、提交 `5fe388f1a30da7b1374294b25bd6f8ad74ab6aa5`，桌面 fork 版本是 `0.1.14-desktop.8`。完整升级来源和重新验证规则见 [agent-teams-plugin/UPSTREAM.md](agent-teams-plugin/UPSTREAM.md)。实现只使用插件设置域和已持久化会话标记：不读取或暴露隐藏推理，也不更改 Harness 核心预设。

不重新实现聊天界面，模型和插件能力全部来自官方 Harness。

## CPA / CLIProxyAPI 模型

1. 打开“设置 → 模型”。
2. 找到 `CPA / CLIProxyAPI` 提供方行并点击“编辑”。
3. 在展开的原生编辑区域输入 API 地址和 Token，打开模型目录并获取模型。
4. 选择需要启用的模型并点击“应用”。
5. 主会话直接选择 Provider `cpa`；子智能体则在“设置 → 子智能体”中选择同一个 Provider 和模型。

API 地址会自动规范到 `/v1`，调用协议固定为 `openai-responses`。Token 只写入 Harness 凭据存储 `CPA_API_KEY`，不会写入普通设置、桌面 patch 或仓库文件；编辑已有配置时留空 Token 会保留已配置的凭据。

CPA 完整 R 协议线级别为 `none / minimal / low / medium / high / xhigh / max`。Harness 的选择项 `off` 在线上会映射为 `none`，其余英文档位保持同名。GPT-5.6 不提供 `minimal`，因此显示 `off / low / medium / high / xhigh / max`；其他模型默认显示完整七档。

## 续接 Markdown

会话页头的 `Session log` 旁边有一个 `续接 MD` 按钮。点击后会先预检根会话和已知后代，再下载一份用于新智能体会话继续工作的 `.md` 文件。多次点击不会并发发起同一会话的预检；预检失败时对话框会退出加载状态并提供重试。

文件包含最新 system prompt 和请求配置、工具名称、当前模型可见 surface、完整可见 transcript、精简执行状态，以及已知子会话的递归章节。当前 Harness 的直接 `user/message` 载荷和旧版包装载荷都会保留，直接用户请求与插件上下文会分别标记。

选中的根会话如果继承自父会话，会保留有效 seed 上下文，并明确显示父会话、seed 数量以及“继承历史/本会话日志”的 sequence 边界。所有消息和执行状态时间同时显示 UTC ISO-8601 与原始 epoch 值；sequence 仍是规范排序依据。子会话继承的 seed 只记录来源和数量，不重复全文。已在产品中可见的 reasoning 会标记为 `可见推理`；导出器不读取、推断或声称包含隐藏思维链。

为了让续接内容紧凑且可审查，Markdown 排除成功工具的原始 arguments/result、二进制附件和原始工具流量。官方 `Session log` 原始 ZIP 下载仍保留，用于完整会话事件、原始工具交互和附件的归档。两种导出互不取代。

该 Markdown 由确定性程序直接渲染，不调用 LLM；对同一快照重复渲染会得到字节一致的内容。导出可能含有 system prompt、对话、工作区路径和敏感项目信息；请将它按敏感数据保管，共享前审查并脱敏，不要提交到公开仓库。文件中的约束是历史上下文，不是新用户指令；文件系统和外部状态在续接前必须重新验证。

## 生成安装包

需要 Node.js 22.19 或 24+（本机已用 Node 24 验证）。

```powershell
cd win-desktop
npm ci --legacy-peer-deps --install-links=true
npm run dist:win
```

完成 AgentTeams 改动后，从包装器目录运行完整验收：

```powershell
cd agent-teams-plugin
pnpm typecheck
pnpm test
cd ..
npm test
npm run verify:upstream
npm audit
npm run dist:win
```

上游同步的能力清单、所有权边界与强制回归流程见 [上游维护文档](../docs/UPSTREAM_MAINTENANCE.md)。

续接 Markdown 的完整验证命令：

```powershell
cd session-markdown-export-plugin
pnpm typecheck
pnpm test
cd ..
npm test
npm audit
npm run dist:win
```

产物在 `win-desktop/dist/`：

| 文件 | 说明 |
| --- | --- |
| `DeepSeek-Harness-0.1.1-rc.25-windows-x64.exe` | NSIS 安装程序，会创建桌面快捷方式 |
| `DeepSeek-Harness-0.1.1-rc.25-windows-x64.zip` | 绿色免安装包，解压后运行 `DeepSeek Harness.exe` |

## 使用注意

- 当前为开发者预览（RC），官方仍可能做破坏性变更。
- 安装包未做商业代码签名，Windows SmartScreen 可能提示“未识别的应用”，选择“仍要运行”即可。
- 首次启动需要填写 DeepSeek API Key（或兼容的模型配置）。
- 用户数据写在本机 Harness home 目录，卸载安装包不会自动删除这些数据。
- 本仓库是公开仓库。不要提交 API Key、会话日志、导出的会话 Markdown、本机设置或包含敏感项目数据的截图。
