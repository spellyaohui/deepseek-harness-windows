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
- OpenAI 兼容流缺少 `finish_reason` 时的兼容处理。

正在实施的增强设计：

- AgentTeams 原生设置、成员模型路由和原生委派屏蔽。
- 面向会话续接的 Markdown 导出。

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

这些扩展不读取或暴露隐藏推理，也不修改 Harness 核心预设；它们仅通过插件设置域、持久化的会话标记和官方插件组合接口实现路由。

构建产物位于 `win-desktop/dist/`，不会提交到 Git。

## 公开仓库安全

本仓库不会跟踪运行态会话、`.agent-teams/`、本地编辑器配置、API Key、桌面用户设置、日志、安装包、`node_modules/` 或本地上游源码副本。提交前请阅读 [SECURITY.md](SECURITY.md)。

## License

[MIT](LICENSE)
