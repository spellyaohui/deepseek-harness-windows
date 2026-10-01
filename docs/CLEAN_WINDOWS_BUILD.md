# 从干净 Windows 机器构建

桌面版本为 `0.2.0-rc.10`，Harness 固定为 `0.2.0-rc.2`，Electron 固定为
`44.0.0`。不需要开发机目录、全局 DSH、用户配置或已有 `node_modules`。
运行安装包不需要安装 Node.js 或 pnpm；下面的工具链只用于编译源码。

## 工具链与命令

使用 Windows x64，安装 Git、Node.js **26.7.0**，并确保系统 `tar.exe` 可用。
建议在普通本地目录克隆，不使用 node_modules Junction、网络盘或同步目录。

```powershell
git clone https://github.com/spellyaohui/deepseek-harness-windows.git
cd deepseek-harness-windows
git checkout v0.2.0-rc.10
npm install --global pnpm@11.7.0 --ignore-scripts
./win-desktop/scripts/prepare-clean-build.ps1
cd win-desktop
npm run verify:upstream
npm run dist:win
node scripts/verify-alpha2-runtime-closure.mjs --from dist/win-unpacked
node scripts/verify-alpha2-zip-closure.mjs --zip dist/DeepSeek-Harness-0.2.0-rc.10-windows-x64.zip --against dist/win-unpacked
```

准备脚本联网下载本 Release 的 `Build-Inputs-0.2.0-rc.10.tar.gz`，验证完整
SHA-256、路径白名单和维护清单里的全部 **650 个**包哈希，恢复 `upstream/`
目录下锁文件引用的固定包。650 个包包括当前运行时的 327 个包，以及保留来源
回归所需的 323 个历史包；历史包不会混入安装包。准备脚本不会覆盖不同字节的
已有文件。也可先手动下载构建输入，传入 `-InputArchive <绝对路径>`。

这些输入是固定官方提交已经构建并逐包登记的 release family，不是开发机
node_modules 的副本，也不包含上游 checkout、凭据或用户状态。官方源码、
固定提交与逐包哈希见 `UPSTREAM_020_SOURCE_MANIFEST.md` 和
`UPSTREAM_017_SOURCE_MANIFEST.md`。重建上游源码可能生成不同打包字节；本指南
使用与锁文件一致的官方构建输入，重建的是 Windows 包装器及所有本地插件。

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
