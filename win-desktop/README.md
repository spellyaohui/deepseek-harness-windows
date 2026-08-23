# DeepSeek Harness Windows 桌面版

本目录把官方 npm 包 `@deepseek-ai/dsh@0.1.1-rc.2` 封装成可双击运行的 Windows 程序。桌面包装器当前版本为 `0.1.1-rc.3`。

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
6. 预装 [`@nanmicoder/dsh-agent-teams`](https://github.com/NanmiCoder/dsh-agent-teams)，可用自然语言拉起多 Agent 团队，右上角会出现活动面板

不重新实现聊天界面，模型和插件能力全部来自官方 Harness。

## 生成安装包

需要 Node.js 22.19 或 24+（本机已用 Node 24 验证）。

```powershell
cd win-desktop
npm ci
npm run dist:win
```

产物在 `win-desktop/dist/`：

| 文件 | 说明 |
| --- | --- |
| `DeepSeek-Harness-0.1.1-rc.3-windows-x64.exe` | NSIS 安装程序，会创建桌面快捷方式 |
| `DeepSeek-Harness-0.1.1-rc.3-windows-x64.zip` | 绿色免安装包，解压后运行 `DeepSeek Harness.exe` |

## 使用注意

- 当前为开发者预览（RC），官方仍可能做破坏性变更。
- 安装包未做商业代码签名，Windows SmartScreen 可能提示“未识别的应用”，选择“仍要运行”即可。
- 首次启动需要填写 DeepSeek API Key（或兼容的模型配置）。
- 用户数据写在本机 Harness home 目录，卸载安装包不会自动删除这些数据。
- 本仓库是公开仓库。不要提交 API Key、会话日志、导出的会话 Markdown、本机设置或包含敏感项目数据的截图。
