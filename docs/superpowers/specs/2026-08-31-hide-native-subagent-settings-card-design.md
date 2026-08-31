# 隐藏原生 Subagent 插件配置卡设计

状态：用户已确认设计方向，等待书面规格复核。

## 背景

官方 DeepSeek Harness `dsh-v0.1.2-alpha.2` 的
`@deepseek-ai/dsh-client-ui-settings-plugins` 会在客户端 `apply` 中向 keyed Slot
`settings.plugin.item` 注册 Bash、Agent Loop、Subagent 和 Web Search 四张配置卡。
Subagent 卡使用 `SUBAGENT_MODEL_SELECTION_NS` 作为 key，并绑定原生 Subagent
设置命名空间。

本项目的 AgentTeams 仍依赖官方 `dsh-subagent`、进程内 fork/spawn 驱动及
Subagent Host 服务启动成员，不能卸载或停用这些依赖。与此同时，本项目已有辨识度
更高的独立“子智能体”设置页，继续在“插件 → 插件配置”显示原生 Subagent 卡会让
用户看到两套用途重叠的入口。

另经只读诊断，当前 `AgentTeams V2 状态无效` 来自既有 Team 状态中的
`round: 0`。V2 要求 `round >= 1`。这是旧状态数据，不属于 Subagent 卡片问题，
本设计不增加旧 Team 迁移、修复或兼容层。

## 目标

1. 仅在“插件 → 插件配置”中隐藏官方 Subagent 配置卡。
2. 保留原生 Subagent Host 服务、设置命名空间、Provider、运行时依赖及成员
   spawn/fork 能力。
3. 保留本项目独立“子智能体”设置页及其 AgentTeams Profile、模型和推理策略。
4. 保留用户已经保存的原生 Subagent 设置；隐藏操作不得迁移、删除或改写这些设置。
5. 将隐藏行为登记为 Windows Wrapper 所有的精确兼容重写，并用回归防止上游更新
   重新显示卡片或误删原生能力。

## 非目标

- 不卸载 `@deepseek-ai/dsh-subagent`、`dsh-subagent-fork-in-process`、
  `dsh-subagent-in-process-driver` 或 `dsh-subagent-spawn-in-process`。
- 不停用、删除或伪造 Host 提供的 Subagent 设置命名空间。
- 不把 AgentTeams 改造成不依赖官方 Subagent 的第二套成员运行时。
- 不使用 CSS 选择器、DOM 查询或显示后删除节点的方式隐藏卡片。
- 不维护完整的 `dsh-client-ui-settings-plugins` 本地 fork。
- 不修改、迁移或自动清理旧 `.agent-teams` Team 状态；用户在不需要历史记录时
  自行删除精确的 `.agent-teams/<team-id>/` 目录。
- 不改变 running Team 的工具契约：运行后新增任务仍使用
  `agent_teams_create_task`，review 任务仍必须提供真实 `reviewedTaskId`。

## 方案比较

### 方案 A：Wrapper 精确客户端注册重写（采用）

在 Wrapper 已有的 Node 模块加载重写边界识别官方
`@deepseek-ai/dsh-client-modules` Host 入口，让它在初次快照和 HMR 重建快照读取
`@deepseek-ai/dsh-client-ui-settings-plugins` 的 `lib/client.js` 时，只把 Subagent
卡片的 Slot key 替换成一个 Host 不提供的等长内部 key。官方 tarball、源文件、
Source Map 行列偏移、Host namespace 和 Subagent 运行时保持不变。

优点：改动面最小，不复制整包源码；隐藏发生在 Slot 注册层，卡片不会进入目录或
渲染生命周期；能沿用 Wrapper 现有精确匹配、幂等和上游漂移测试模式。

代价：官方入口源码改变时需要重新分类并更新精确锚点。测试必须 fail closed，
不能在锚点不匹配时退化为宽泛字符串删除。

### 方案 B：维护本地 ui-settings-plugins fork（不采用）

复制官方客户端包并删除 Subagent 卡注册及其客户端控制器 wiring，再让 Wrapper
依赖本地 fork。

优点：源码边界直观，可以完全移除隐藏卡对应的客户端后台订阅。

缺点：为隐藏一张卡接管整个官方插件设置页面，必须长期同步 Slot、Remote、locale、
表单和其他卡片更新，Owner 和锁文件维护成本明显过高。

### 方案 C：CSS/DOM 隐藏（拒绝）

优点是实现快，但依赖组件结构、class 或文本，升级后易失效；卡片控制器仍会创建、
订阅 Remote 并刷新目录，且自动化测试很难证明没有误隐藏其他卡片。

## 所有权与边界

- 官方 Alpha.2 `ui-settings-plugins` 继续拥有插件设置区、tab、Slot 和 Bash、
  Agent Loop、Web Search 卡片。
- Windows Wrapper 仅拥有“桌面发行版不贡献原生 Subagent 配置卡”的精确加载重写。
- AgentTeams 插件继续拥有独立“子智能体”设置页、Profile、角色模型策略和任务
  生命周期，但不修改官方插件设置 Slot。
- 官方 `dsh-subagent` 继续拥有成员 spawn/fork/interrupt/followup 的运行语义。
- 旧 Team V2 拒绝继续由 AgentTeams 严格状态校验拥有；Wrapper 不介入状态读取。

## 重写合同

重写必须满足以下合同：

1. Host 源码重写只对官方 `dsh-client-modules/lib/index.js` 模块 URL 生效；客户端
   bundle 重写只对精确包 ID `@deepseek-ai/dsh-client-ui-settings-plugins` 生效，
   不按 Provider、模型、页面文案或 DOM 结构判断。
2. 只匹配一次 Subagent 卡片注册中的
   `key: SUBAGENT_MODEL_SELECTION_NS`，并替换成等长内部 key；不删除常量导入、
   Host namespace、Subagent npm 依赖、客户端控制器或其他卡片注册。
3. 成功重写时写入唯一的 Wrapper 标记。输入不包含目标模块 URL 时原样返回；
   带该标记的目标入口再次处理结果不变。
4. 没有 Wrapper 标记且官方源码出现零个或多个候选注册块时不得猜测。focused
   回归必须失败并提示上游锚点漂移，阻止 provenance 更新和打包。
5. 重写后的 `settings.plugin.item` 仍按官方顺序贡献 Bash、Agent Loop 和 Web
   Search；配置页和空状态逻辑保持官方实现。
6. 隐藏是纯客户端目录行为，不发起设置写入，不删除保存值，也不改变 Host
   `settings.describe` 返回的命名空间集合。

## 运行数据流

1. Wrapper 启动官方 Alpha.2 Web 运行时，并启用现有 Node 模块加载器。
2. Node 加载器精确增强 `dsh-client-modules` 的初始和 HMR bundle 快照读取点。
3. Host 读取目标 `ui-settings-plugins/lib/client.js` 时，纯函数精确替换 Subagent
   卡片 key；其他客户端 bundle 原字节返回。
4. 官方 `ConfigurablePluginsTabController` 继续计算“Host 命名空间与已注册卡片”的
   交集；因为 Subagent 不再贡献卡片 key，它不会出现在插件配置页面。
5. Host 仍加载 Subagent namespace 和运行服务；AgentTeams 仍通过
   `memberProvider: spawn` 创建官方 Subagent 成员。
6. 本项目独立“子智能体”设置页通过自己的 Slot/section 注册继续显示。

## 错误处理与上游漂移

- 目标模块未加载时不影响其他模块。
- 目标模块加载但精确注册锚点变化时，自动化门禁应明确报告
  `Subagent settings card rewrite anchor drift` 一类定位信息，而不是静默打包。
- 运行时重写函数保持幂等；不能通过重复删除或正则跨块匹配造成其他卡片丢失。
- 未来上游若提供正式的“隐藏单卡”组合 API，应先分类为
  `UPSTREAM_EQUIVALENT`，保留回归后再删除本地重写。

## 回归设计

### focused 客户端注册回归

- 对官方 Alpha.2 真实客户端 bundle 执行重写后，Subagent 卡注册使用 Host
  不提供的内部 key，不再与 `SUBAGENT_MODEL_SELECTION_NS` namespace 相交。
- Bash、Agent Loop 和 Web Search 三项注册仍存在且顺序不变。
- 重写前后 bundle 字节长度和行数不变；非目标 bundle 原对象返回；重复重写幂等。
- 官方 `dsh-client-modules` Host 入口的初始快照和 HMR `rebuilt` 路径都调用同一
  客户端 bundle 重写函数。
- 缺失、重复或结构漂移的锚点被 focused 测试拒绝，不做宽泛删除。

### Wrapper 所有权回归

- `package.json` 和 lockfile 继续包含官方 Subagent 四项运行依赖。
- 静态和动态桌面 patch 继续保持 `memberProvider: spawn`。
- capability manifest 将“隐藏原生 Subagent 插件配置卡”登记到 Wrapper，并指向
  focused 回归、AgentTeams 集成回归和维护文档。
- AUTO 与 Stop That Shit 仍保持缺席，不能借本次设置页调整重新集成。

### AgentTeams 与 UI 回归

- 独立“子智能体”设置 section 仍注册并可显示。
- AgentTeams 的成员启动、followup、interrupt、冷恢复和任务调度现有测试继续通过。
- 插件配置页仍显示其他官方卡片，且不存在 Subagent 卡。
- 读取或隐藏卡片不会写入用户设置，也不会删除现有原生 Subagent 值。

### 完整门禁

实现顺序遵循 TDD：先增加失败回归，再完成最小重写。随后从 `win-desktop` 运行：

```powershell
npm run verify:upstream
```

该命令必须保持离线、无安装、无网络、无打包。完整 Alpha.2 RC1 计划的其他门禁
通过后，才允许重新构建本地 EXE、ZIP、blockmap 和 win-unpacked；用户人工安装
验收前仍禁止 commit、push、tag、Release 或上传资产。

## 文档与版本同步

实现和回归通过后，同步以下实际所有权记录，但不提前宣称未验证结果：

- `AGENTS.md` 的 Wrapper interaction invariants；
- `docs/UPSTREAM_MAINTENANCE.md` 的能力表和回归证据；
- `win-desktop/tests/local-capability-manifest.test.js`；
- Alpha.2 RC1 Release notes、README 和必要的 Wrapper 版本信息。

本行为不改变 AgentTeams 状态版本，不为旧 Team 增加兼容代码，也不需要迁移用户
Provider、模型、Profile 或原生 Subagent 设置。

## 验收标准

- “插件 → 插件配置”不显示原生 Subagent 卡。
- 左侧独立“子智能体”设置页保持可见、可用。
- 官方 Subagent 服务与四项运行依赖仍存在，AgentTeams 成员功能通过回归。
- 已保存原生 Subagent 设置未被删除、迁移或改写。
- 旧 `round: 0` Team 继续被严格拒绝，且没有新增迁移或自动修复层。
- focused、AgentTeams、Wrapper 和最终 `npm run verify:upstream` 全部通过。
- 上游锚点漂移会阻止门禁，而不会静默恢复卡片或误删其他卡片。
