# 从干净 Windows 机器构建

当前桌面源码版本为 `0.2.0-rc.27`，Harness 固定为 `0.2.1-rc.2`，Electron 固定为
`44.7.0`。不需要开发机目录、全局 DSH、用户配置或已有 `node_modules`。
运行安装包不需要安装 Node.js 或 pnpm；下面的工具链只用于编译源码。

## 本机统一工作目录

日常开发目录为 `D:\Trae\其他\deepseek-harness`，直接使用 `main`，不再使用
目录内的分支 checkout 或 worktree。`upstream/` 只存放本地构建输入、工具链
和验证资料；旧源码副本保存在项目目录之外的备份中。

同步软件不复制 `.git`。换机器继续工作时，先在这个目录执行
`git fetch origin main`，核对同步过来的源码与 `origin/main`。如果代码和 Git
元数据不一致，先备份并检查差异，不使用 `reset --hard` 或 `clean` 覆盖现有文件。

## 工具链与命令

使用 Windows x64，安装 Git、Node.js **26.7.0**，并确保系统 `tar.exe` 可用。
建议在普通本地目录克隆，不使用 node_modules Junction、网络盘或同步目录。

```powershell
git clone https://github.com/spellyaohui/deepseek-harness-windows.git
cd deepseek-harness-windows
npm install --global pnpm@11.7.0 --ignore-scripts
./win-desktop/scripts/prepare-clean-build.ps1
cd win-desktop
npm run verify:upstream
npm run dist:win
node scripts/verify-alpha2-runtime-closure.mjs --from dist/win-unpacked
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
node scripts/verify-alpha2-zip-closure.mjs --zip "dist/DeepSeek-Harness-$version-windows-x64.zip" --against dist/win-unpacked
```

准备脚本联网下载 rc.10 Release 中固定的 `Build-Inputs-0.2.0-rc.10.tar.gz`，验证完整
SHA-256、路径白名单和维护清单里的全部 **650 个**包哈希，恢复 `upstream/`
目录下历史来源回归需要的固定包。这 650 个历史包保持不变；另从官方 npm
固定地址下载当前 Harness 0.2.1 的 **352 个**归档，并逐一校验
`UPSTREAM_021_SOURCE_MANIFEST.md` 中的 SHA-256。运行时只包含桌面依赖图实际
需要的官方包，历史包和当前清单中的未引用包不会因此自动挂载。
准备脚本拒绝覆盖字节不同的现有文件。旧构建输入可预先下载并传入
`-InputArchive <绝对路径>`；当前官方归档仍在准备阶段单独校验和补齐。

这些输入不包含凭据、用户状态或 node_modules 副本。固定源码提交与归档哈希
见 `UPSTREAM_021_SOURCE_MANIFEST.md`，历史清单保留。当前版本使用官方 npm
发布归档，依赖准备与离线门禁分开；旧版固定归档只用于历史来源回归。

准备阶段分别执行本地插件 frozen pnpm install、包装器 npm ci，并下载固定
Electron。忽略无关安装钩子，Electron 下载作为显式步骤执行。`verify:upstream`
只编译、同步已安装的本地插件并运行离线回归，不安装、打包或联网。
`dist:win` 会再次跑完整门禁后生成 EXE、ZIP 和 blockmap。

## 安装后的首次运行验收

`.github/workflows/windows-release-validation.yml` 在全新 Windows runner 上
从源码构建，再把实际 NSIS EXE 交给第二台全新 runner 安装。第二个 job 不安装
工程依赖；直接启动安装后的桌面程序，验证生产 preload、已认证的模型目录、
全部内置预设、AgentTeams 保存与重启、关闭联网工具后的重启，以及旧
`web: disabled: true` 用户补丁仍可加载预设。测试不会发出真实模型请求。

这项验收覆盖普通 Windows x64 安装和首次启动。发布包未进行代码签名；系统
或安全软件可能提示未知发布者。使用模型仍需在程序里配置自己的账号或
供应商凭据。Release 附带 SHA256SUMS；重新编译的安装程序因时间戳等打包
元数据可以有不同哈希，因此每次构建均单独校验运行时闭包和实际安装行为。
