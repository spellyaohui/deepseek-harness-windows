# DeepSeek Harness Windows

DeepSeek Harness 的 Windows 桌面封装，以及面向桌面使用场景的可维护插件增强。

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
- AgentTeams 和 Auto Mode 插件集成；AgentTeams 的成员模型、提供商与推理强度在“子智能体”TAB 中配置。
- AgentTeams 的 Team/Native 委派路由：新 Team 会话会记录 `teams-v1` 并只允许 AgentTeams 委派；Native 会话记录 `native-v1` 并保留官方原生委派工具。全局设置只影响未来创建的成员/会话，已有会话按其已记录的路由继续运行。
- 会话页头的 `续接 MD` 导出：生成一份可交给新智能体会话继续工作的 Markdown 上下文包。
- OpenAI 兼容流缺少 `finish_reason` 时的兼容处理。

## `v0.1.1-rc.9` 更新说明

- `CPA / CLIProxyAPI` 现在只保留一个原生提供方入口：在“设置 → 模型”中点击 CPA 行的“编辑”即可展开/收起配置，不再显示重复的 CPA 专用大卡片。
- CPA 的 `/v1` 地址规范化、Token 凭据隔离、模型发现、GPT-5.6 R 档位、原始上下文/输出容量，以及主会话和 AgentTeams 共用模型目录均保留。
- “桌面”设置取消“保存设置”按钮，关闭行为选择后立即保存；保存中控件暂时禁用，失败会恢复上次已提交的值并显示错误。
- 既有 AgentTeams 路由继承/明确指定规则、会话续接 Markdown 导出、OpenCode 流恢复和 Windows 文件工具提权兼容修复继续受 `npm run verify:upstream` 回归门禁保护。
- 上游 Harness 或 AgentTeams 更新后，必须先按 [上游维护注册表](docs/UPSTREAM_MAINTENANCE.md) 分类本地能力，再跑完整回归，不能通过删除本地插件或测试来解决冲突。

## CPA / CLIProxyAPI

打开“设置 → 模型”，找到 `CPA / CLIProxyAPI` 提供方行并点击“编辑”展开配置。填写 API 地址和 Token，展开模型目录后获取模型、选择需要启用的模型并应用。地址会规范到 `/v1`，模型固定通过 `openai-responses` 调用；Token 写入 Harness 凭据存储，不进入普通设置文件。

保存后，主会话可以选择 Provider `cpa`；“设置 → 子智能体”中的 AgentTeams 也会从同一个 Harness 模型目录读取 CPA 模型，不维护第二份模型清单。

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

完整的 AgentTeams 本地 fork 位于 `win-desktop/agent-teams-plugin/`，安装时以 `file:agent-teams-plugin` 进入包装器；其上游基线为 `@nanmicoder/dsh-agent-teams@0.1.13`（`v0.1.13` / `912aae5225d3d85fa841a1b0c8a5c77021876c25`），本地版本为 `0.1.13-desktop.3`。升级来源和差异记录见 [win-desktop/agent-teams-plugin/UPSTREAM.md](win-desktop/agent-teams-plugin/UPSTREAM.md)。

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
