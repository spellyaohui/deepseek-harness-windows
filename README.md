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
- AgentTeams 和 Auto Mode 插件集成；AgentTeams 的成员模型、提供商与推理强度在“子智能体”TAB 中配置。
- AgentTeams 的 Team/Native 委派路由：新 Team 会话会记录 `teams-v1` 并只允许 AgentTeams 委派；Native 会话记录 `native-v1` 并保留官方原生委派工具。全局设置只影响未来创建的成员/会话，已有会话按其已记录的路由继续运行。
- 会话页头的 `续接 MD` 导出：生成一份可交给新智能体会话继续工作的 Markdown 上下文包。
- OpenAI 兼容流缺少 `finish_reason` 时的兼容处理。

## 续接 Markdown 导出

`续接 MD` 位于会话页头的 `Session log` 旁边。它先对当前会话及其已知子会话做一次预检，然后下载一个 `.md` 文件。导出是确定性程序渲染，不调用 LLM；同一快照会产生相同内容。

导出包含：

- 会话元数据、最新已渲染 system prompt、模型/提供商/推理强度等有效配置，以及可用工具名称列表。
- 当前模型可见 surface、完整可见时序 transcript、最新直接用户请求和最近助手文本。
- 精简执行状态：待办、已变更路径、失败/未完成工具的摘要、中断和 turn 边界。
- 已知后代会话的递归章节；子会话继承的 seed 历史只引用来源和计数，不重复展开。

它不包含成功工具调用的原始 arguments/result、二进制附件或原始工具流量，也不读取或声称包含隐藏思维链。产品中已可见的 reasoning 块会明确标记为 `可见推理`。需要完整原始会话事件、工具交互和附件时，继续使用官方 `Session log` 原始 ZIP 导出；两者是互补而非替代关系。

Markdown 可能包含 system prompt、工作区路径、对话和敏感项目上下文。下载后应按敏感数据保管，共享前先审查和脱敏，不得提交到公开仓库。文件中的文件系统与外部状态只是导出时的历史上下文，继续任务前必须重新验证。

## 开发

需要 Node.js 22.19 或 24+。

```powershell
cd win-desktop
npm ci
npm test
npm run dist:win
```

完整的 AgentTeams 本地 fork 位于 `win-desktop/agent-teams-plugin/`，安装时以 `file:agent-teams-plugin` 进入包装器；其上游基线为 `@nanmicoder/dsh-agent-teams@0.1.13`（`v0.1.13` / `912aae5225d3d85fa841a1b0c8a5c77021876c25`），本地版本为 `0.1.13-desktop.1`。升级来源和差异记录见 [win-desktop/agent-teams-plugin/UPSTREAM.md](win-desktop/agent-teams-plugin/UPSTREAM.md)。

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
