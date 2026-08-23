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
- 主程序设置界面中的“桌面”TAB。
- AgentTeams 和 Auto Mode 插件集成。
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

构建产物位于 `win-desktop/dist/`，不会提交到 Git。

## 公开仓库安全

本仓库不会跟踪运行态会话、`.agent-teams/`、本地编辑器配置、API Key、桌面用户设置、日志、安装包、`node_modules/` 或本地上游源码副本。提交前请阅读 [SECURITY.md](SECURITY.md)。

## License

[MIT](LICENSE)
