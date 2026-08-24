# DeepSeek Harness Windows 桌面版

本目录把官方 npm 包 `@deepseek-ai/dsh@0.1.1-rc.2` 封装成可双击运行的 Windows 程序。桌面包装器当前版本为 `0.1.1-rc.9`。

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
- 设置更改只影响之后创建的成员和新会话。现有成员及会话继续使用其创建时的提供商、模型、推理与路由标记；重启也不会改写该标记。

本地 fork 位于 `win-desktop/agent-teams-plugin/`，通过 `file:agent-teams-plugin` 安装；它基于上游 `@nanmicoder/dsh-agent-teams@0.1.13`、`v0.1.13`、提交 `912aae5225d3d85fa841a1b0c8a5c77021876c25`，桌面 fork 版本是 `0.1.13-desktop.3`。完整升级来源和重新验证规则见 [agent-teams-plugin/UPSTREAM.md](agent-teams-plugin/UPSTREAM.md)。实现只使用插件设置域和已持久化会话标记：不读取或暴露隐藏推理，也不更改 Harness 核心预设。

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
| `DeepSeek-Harness-0.1.1-rc.9-windows-x64.exe` | NSIS 安装程序，会创建桌面快捷方式 |
| `DeepSeek-Harness-0.1.1-rc.9-windows-x64.zip` | 绿色免安装包，解压后运行 `DeepSeek Harness.exe` |

## 使用注意

- 当前为开发者预览（RC），官方仍可能做破坏性变更。
- 安装包未做商业代码签名，Windows SmartScreen 可能提示“未识别的应用”，选择“仍要运行”即可。
- 首次启动需要填写 DeepSeek API Key（或兼容的模型配置）。
- 用户数据写在本机 Harness home 目录，卸载安装包不会自动删除这些数据。
- 本仓库是公开仓库。不要提交 API Key、会话日志、导出的会话 Markdown、本机设置或包含敏感项目数据的截图。
