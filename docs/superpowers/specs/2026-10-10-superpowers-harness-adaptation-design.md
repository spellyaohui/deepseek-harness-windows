# Superpowers / DeepSeek Harness 适配设计（已确认）

日期：2026-10-10。当前只做设计，不安装、不修改产品代码或用户配置，不提交、打包、发布。

用户于 2026-10-10 确认设计，授权继续编写实施计划；此确认不是实现、安装、模型调用、打包或发布授权。

## 1. 用户目标与范围

将官方 Superpowers 的开发流程技能接入本项目，采用 Codex 式介入方式：先在模型上下文提供技能名称和说明，任务匹配后按需加载全文；没有自动触发时，用户可通过 Harness 现有 `/技能名` 入口手动选择。

用户不要求用强制会话启动 Hook 保证每轮介入，也不要求重造子智能体调度器。自动选择依赖模型，不能宣传为百分之百自动执行。手动调用必须在 Host 侧加载全文，不把可靠性全部交给模型猜测。

保留 AgentTeams 的任务、成员、角色模型/思考强度、质量门和活动面板；保留 durable subagent gateway 的独占生命周期职责。Native 模式仍使用官方原生委派。

## 2. 已独立核对的事实

### 2.1 实施基线必须先对齐

- 当前 checkout：`codex/unified-model-capability-compatibility`，HEAD `42750ed`，Windows wrapper `0.2.0-rc.2`。
- 2026-10-10 公共远端 `main`：`72dc27c090671d74873df44d44cbe562a690ffe4`。
- 该远端源文件与已安装客户端一致：wrapper `0.2.0-rc.18`、AgentTeams `0.1.22-desktop.11`，官方 Harness 仍固定 `0.2.0-rc.2`。
- 不能在旧 checkout 直接实现后打包，不能把安装目录的生成 JS 当作新版源码回拷。实施时先只读复核远端及干净状态，再在完整新版源码基线上落地；已有用户文件必须保留。这不是本轮的分支切换授权。

### 2.2 Codex 的介入方式

官方文档描述了两条路径：按名称/说明进行隐式匹配，或用户显式选择技能。先提供元数据、被选中后再读取 `SKILL.md` 全文。Codex CLI/IDE 的显式入口是 `/skills` 或 `$技能名`；不能把这些语法直接当成 Harness 的命令。

Codex App Server 支持显式 `skill` 输入项，由服务端注入全文。此处借鉴“显式调用由宿主加载”的原则，不复制它的 RPC 协议。

### 2.3 当前 Harness 已有能力

以下内容核对了真实安装目录中的官方包，不只参考导出会话里智能体的结论：

- `dsh-skill`：统一技能注册表，按作用域和优先级选择技能。
- `dsh-skill-filesystem`：官方 YAML 解析、目录发现和完整内容读取；导出 `FileSystemSkillProvider`。内置技能 rank 600，项目、自定义及用户技能优先。
- `dsh-tool-skill`：模型可见的技能目录和 `skill` 工具；显式 `/技能名` 在 `agent/pre-step` 中加载并注入全文；不会仅凭目录摘要当成完整指令。
- `dsh-client-ui-skill`：输入 `/` 可选择技能，选中后插入 `/技能名 `；已有加载状态、失败提示和正文展示。子会话 UI 不提供此选择器，不应为此新增第二套子会话命令。
- AgentTeams 的 Team/Native 策略已有代码侧边界：Team 禁止原生委派绕行。技能文字不得扩大工具权限。

先前已用真实安装 SDK 验证：官方 Superpowers 的 15 个技能可发现并加载全文/目录资源；社区 `superpowers-dsh@0.2.0` 也可加载，但其工具映射直接指向 Native 委派，不能不经适配就当作本项目的完整集成。

## 3. 推荐方案与取舍

### 方案 A：薄技能适配插件（推荐，设计者选择）

新增一个独立本地技能插件，只承担“提供固定版本技能 + 加载时附加 DSH 工具映射”。复用官方 `FileSystemSkillProvider`，不自写 frontmatter 解析器、不注册新工具、不增加系统提示段、不接管任务生命周期。

需要这层插件的理由：只加目录虽能发现技能，但官方技能没有 DSH 工具映射；而单独增加一个供模型自行寻找的映射文件，不能保证手动直接加载某个技能时读到了它。插件在返回已选中技能全文时附加同一份短映射，自动与手动共用一个加载路径。

### 方案 B：只配置原生技能目录

代码更少，但缺乏可靠的 DSH 工具映射交付，特别是 Team/Native 与成员权限。不能独立满足完整适配，因此不采用。

### 方案 C：会话 Hook 强制全文引导

Harness 有 Hook 能力，但目前没有必要增加启动脚本、额外注入和去重生命周期。本轮不采用；自动触发未通过真实验收时，按用户意见保留手动触发，不擅自切换到强制 Hook。

## 4. 技能来源与独立所有权

- 推荐使用官方 `obra/superpowers` **v7.0.0**：annotated tag `7f043e5eaf3522dc19178c673b76328de9b0c355`，内容 commit `bb92a77741419a4ab5f06e711a283343f1ada0c3`，共 15 个技能。实施前复核该固定来源，不用浮动 `main` / `latest`。
- 首次取材使用本机已有只读研究目录 `C:\Users\spell\AppData\Local\Temp\sp-research\superpowers`；本轮重新核对 HEAD 对应上述 tag 的 peeled commit，`git status --short` 无输出。获准实施后，只导入该提交追踪的技能资产和 LICENSE，不能把未追踪文件、个人修改或 checkout 本身带进包。临时目录不作为应用运行依赖；缺失或版本/哈希不符时停止导入，请求离线源档或单独确认固定提交的下载，不在门禁里自动补下载。
- 不把社区适配器的旧技能快照当成官方最新版；不新增 `superpowers-dsh` npm 运行依赖。
- 本地插件建议路径 `win-desktop/superpowers-plugin/`，建议包名 `@deepseek-ai/dsh-superpowers`，初始插件版本 `0.1.0`。这是独立本地包，不冒充官方 DeepSeek 发布包。
- 原始 `skills/**`（含脚本、引用、模板）按固定提交收录在插件内，保持字节不改。保留 MIT LICENSE，记录 commit、tag 与文件哈希清单；不收录完整上游 checkout、`.git`、hooks 或其他宿主安装文件。
- 实施布局采用 `lib/skills/**`、`lib/LICENSE`、`lib/dsh-tools.md` 和 `lib/upstream-manifest.json`；这些 `lib` 文件在新插件中是受控源码/固定资产，不是忽略的编译缓存。现有同步入口会递归复制 `lib`，因此无需另造资产复制框架。插件的 UPSTREAM.md 留在包根作为维护说明。
- 本地维护 `dsh-tools.md`，加载时在返回内容末尾附加，而不是批量替换上游 `SKILL.md`。资源根仍指向原技能目录，引用文件和 helper 脚本不会失去定位。
- 复用官方文件系统 provider：独立 provider 名、`includeDefaultRoots:false`、固定 bundled 根、rank 600、`watch:false`。不重复扫描用户目录；注册和释放跟随现有 Cordis 插件机制，卸载后不残留 provider 或 watcher。
- 项目/用户同名技能继续优先。本插件不能覆盖用户技能，不能把 DSH 映射附加到非本插件拥有的内容。若环境已有同优先级同名 provider，按照真实 Registry 的冲突规则报告，不偷偷抬高优先级。
- 不读写 `~/.codex`、`~/.dsh/skills`、用户 AGENTS.md、个人 Hook 或用户设置来安装技能。随应用正常插件挂载交付，默认可发现；遵守用户在上层关闭插件/技能的配置，不增加本地自动触发开关。

## 5. 工具映射与权限边界

映射是工具使用说明，不是路由器；最终权限继续由现有 Host / AgentTeams / gateway 严格执行。映射跟随每次选中的本插件技能全文交付，不需要另一个 bootstrap 状态机。少量重复映射文本是接受的取舍，不为去重添加持久状态。

必须明确以下契约：

- **加载技能**：使用当前目录里的准确裸名和官方 `skill`；不使用 `superpowers:xxx` 命名，不捏造 Claude 的 `Skill` / `Task`。
- **文件、命令、进度**：使用本次可用工具及其当前 Schema；无 todo 工具时用计划文档，不创造工具。
- **Team 队长**：委派通过已可用的 `agent_teams_*`；先探测生命周期，只有用户授权委派时才创建 Team；不能借技能自动 approve、重分配或补造质量证据。
- **Team 成员**：只执行当前合同内工作并按既有权限汇报。不因技能要求 fresh reviewer 而自行创建新 Team、充当队长或调用 Native 委派。需要独立审查时向队长请求安排；若当前授权不能委派，采用技能允许的本地回退或明确报告缺失能力。
- **Native**：仅在实际 Native 策略和当前授权允许时，使用官方原生委派及延续工具；不承诺本地 AgentTeams 角色模型设置会控制 Native 路径。
- **策略不明/工具缺失**：先只读核对当前可用工具和现有策略，不能猜测。没有授权则不委派，不自动切换 Team/Native。既有策略提示与代码门禁优先于技能文字。
- **子会话生命周期**：技能插件不调用 `ctx.subagents.*`，不直接启停/投递/中断子会话。Team 所有延续操作仍由 AgentTeams 进入唯一 durable gateway。
- **Windows helper**：需要 `.sh` 时查找实际 Git Bash（可执行路径含空格要正确引用），不能把 WindowsApps 的 `bash.exe` 别名当作验证通过。仅对 helper 调用处理解释器；不改用户全局 PATH、不启用 WSL、不安装 Bash。缺失时明确降级，不能妨碍普通技能加载。沿用已有隐藏控制台逻辑。
- **用户指令优先**：技能不授权读取密钥、生产变更、网络安装、commit/push/release；计划和审查请求仍然不是执行授权。

`tool-call-guidance` 的 500 字符与 AgentTeams captain 的 3,500 字符预算不变；本适配不往它们塞技能全文。上游流程及所有 15 个技能保留，包括其引用/脚本；不是删掉并行、审查技能来避免适配问题。

### 5.1 映射文件的具体契约

以下名称已在安装的官方工具实现及新版 AgentTeams `tool-names.ts` 核对；它们是映射候选，不能据包已安装就认定某个 Agent 已获授权。当前模型实际可见 Schema 是调用时的唯一参数依据；不复制 Codex 的 `fork_turns`、`agent_type` 或 `Task` 参数到 DSH。

| 技能中的动作 | DSH 表达 | 工具缺失/权限边界 |
| --- | --- | --- |
| 调用技能 | `skill`，例如 `{"name":"brainstorming"}` | 仅用当次目录里的名字；显式 `/` 已加载的全文不必重复调用 |
| 读写/编辑文件 | `read` / `write` / `edit`，或模型实际提供的 `str_replace_editor` | 不兼容时使用可见替代；无文件能力就报告，不虚构调用 |
| 运行测试、Git 只读检查、执行 helper | Windows 常规命令用可见 `pwsh`；`.sh` helper 通过已核实的 Git Bash，若用 `pwsh` 启动则正确引用绝对解释器路径；已有 `bash` 工具仍需核对其 executor | 不擅自安装解释器；超时字段遵循 Schema，不用 0 充当无限等待 |
| 跟踪计划/清单 | 可见 `todo_write`，或工作区计划文档 | 无此工具时不调用 Codex `update_plan`；Task 进度不等于 AgentTeams 质量验收 |
| 请求用户决策 | 可见 `ask_user_question`，或直接向用户提问 | 不伪造回答；无人确认则不执行需要批准的动作 |
| 新建独立实现/审查者（Team 队长） | `agent_teams_status` 观察当前状态；已获委派授权后按现有生命周期使用 `agent_teams_create` / `agent_teams_add_member`，以 `agent_teams_create_task` 建立实现/审查合同 | 角色模型/思考策略由现有 Profile 选择；不以技能中的模型名覆盖角色，不省略既有质量门字段，不自行消费 staged 审批 |
| 领取并完成 Team 工作（当前参与者） | `agent_teams_claim_task` / `agent_teams_update_task`，依当前 task 与 attempt_id 契约执行；已分配任务优先只传 task_id | 不猜成员名；captain 不是 claim 的成员名；changedPaths、commandsRun、verdict 等只报实际证据，不自动通过 |
| 让同一 Team 实现者修订、等待审查 | `agent_teams_send_message` / 只读 `agent_teams_status`；队长在必要时按现有 `agent_teams_reassign_task` / `agent_teams_resume` 合同安排 | 不把“发消息成功”当成工作已完成；成员仅用 status/claim/update/send_message 四种参与者工具，不能扩大为队长工具 |
| 独立实现/审查/延续（Native） | 实际可见且 Native 策略允许的 `subagent` / `subagent_fork`，延续用 `send_message`，中断用 `interrupt_agent` | Provider/model/effort 按官方当前路由 Schema 与用户授权；不照抄 AgentTeams 参数。不把 Native ID 当成 Team 成员名；不可用时走技能已有 inline 回退或报告缺失 |
| 并行、fresh reviewer、分支收尾 | 有授权且相互独立时按上面的委派路径安排审查；Git/worktree/commit/push 只由实际可用工具和仓库授权实施 | 技能加载不授权建 worktree、提交或发布；无独立审查者时明确降级，不把自审称作独立复核 |

`dsh-tools.md` 必须保留此表的语义，但可压缩成模型易读的短说明。检测模式使用已经注入的 `AgentTeams delegation policy: teams-v1` / `native-v1` 与当前工具权限，不读取个人全局设置来猜模式，也不引入第二个策略解析器。没有可靠策略信息时，不选委派路径；向用户报告或按已有技能做非委派部分。

## 6. 新版基线上的预计落点

以下是边界，不是对旧 checkout 的实施指令；详细任务在设计确认后编写：

- `win-desktop/superpowers-plugin/`：包元数据、薄 provider、固定 skills、LICENSE、映射与 UPSTREAM.md。
- `win-desktop/src/dsh-service.js` 与静态 Patch：通过现有 desktop default layer 挂载，不覆盖用户上层配置，不增加 CLI 优先覆盖层。
- wrapper package/lock：记录本地包与宿主固定关系，保持真正的 `file:` 依赖和真实 `node_modules`，不把浮动 upstream 版本写进运行依赖。
- 现有 artifact 同步、`verify:upstream`、运行闭包与打包 files：纳入技能插件和完整资源。
- 现有 capability manifest / integration 测试：登记独立所有权与下述回归。
- README、`docs/UPSTREAM_MAINTENANCE.md` 和插件 UPSTREAM.md：同步事实、版本、来源和限制。不在实装验证前写“已完成”。

不改官方 Harness tarball，不升级 Harness / AgentTeams，不恢复 AUTO/MD 导出，不改变 Team 状态 Schema、既有工具名或 gateway API。若实现发现必须改变这些边界，停下说明冲突，由用户决定。

## 7. 验收与证据分级

### 离线自动化（实现后的必需门禁）

1. 在固定宿主实际 SDK 下发现 15 个技能；能加载全文、脚本/引用路径正确、原始文件哈希一致。
2. 官方 `skill` 路径返回选中技能及 DSH 映射；用户/项目覆盖优先，不能被本插件的加载器截走；格式无效和未知名称仍拒绝。
3. 模型目录只带名称/说明，不强制加入全部技能全文；显式 `/brainstorming` 和 `/systematic-debugging` 在实际 `agent/pre-step` 注入全文和映射，重复路径不需要模型重新猜名称。
4. 客户端现有 `/` 列表包含新技能，选择/提交走官方路径；重连或 preset 切换按上游规则刷新。测试区分 Host 自动化与实际可见 UI，不把源代码断言当成鼠标验收。
5. Team/Native、队长/成员权限、未知策略/缺失工具都覆盖；Team 中原生绕行仍被拒绝，正常 Team 启动与延续仍经过 durable gateway，角色模型/思考模式不变。
6. 两轮会话、子会话 scope、停止/恢复与 compaction 后目录/手动调用符合宿主现有行为；不能把注册表 list/get 通过误写成真实模型触发通过。
7. helper 使用真实 Git Bash 或明确不可用，不弹 DOS 黑窗；卸载 provider 无残留。不新增长期监听或启动 Hook。
8. 从完整新基线的 `win-desktop` 运行 `npm run verify:upstream`，离线、无 install、无网络、无打包；保留全部现有回归，不删/跳/弱化断言。

### 单独的真实使用验收（需要模型调用/测试授权）

- 新会话、不点技能：提出新增小功能，观察是否在代码动作前加载 brainstorming；报告真实触发顺序。
- 新会话、不点技能：提出明确 bug 诊断，观察是否加载 systematic-debugging；加入无关简单问答负例，记录 using-superpowers 本身广泛触发与是否误启动重型开发流程，不能保证它绝不加载。
- 自动未触发时：通过 `/` 选择以上技能，证明 Host 注入成功、用户能看到加载内容；用户可接受此为降级路径，但不得仍宣称自动介入已可靠。
- 用户明确授权的两轮 Team 与 Native 测试分别进行；检查真实子会话模型/思考策略、委派记录、任务回执、恢复/继续。纯静态测试不能替代此级别。
- 若特定模型不遵循技能，先报告范围；不擅自引入强制 Hook 或绕过权限的调度代码。

### 安装包与发布（本轮不做）

另获授权后才运行 `npm run dist:win`。验证真实安装目录、unpacked/ZIP 模块解析和技能资产闭包，记录 EXE/ZIP/blockmap 大小、SHA-256 和 Authenticode 状态。GitHub 提交/发布及清理还需单独授权，不与规划捆绑。

## 8. 风险、回退与未定实现细节

- **自动介入不是强保证**：Codex/Harness 目录让模型能够选择，不等于各模型必然按序执行。显式 `/` 是主要可靠回退。
- 官方 v7 的 `using-superpowers` 描述针对所有新会话。保留上游原文，不谎称只会在编程请求出现；真实负例验收评估它是否把简单请求变成过重流程。
- 安装路径只读、带中文/空格、脚本文件模式及用户同名覆盖是必须验证的边缘条件。
- 回退为禁用新技能插件，保留用户配置和已有会话；不清理用户技能，不回滚 AgentTeams 或 Harness。部署必须走正常安装流程，不能热覆盖已运行安装目录。
- 具体测试 fixture、脚本命令引用形式和下一次 wrapper 版本按新版仓库惯例由实施者决定；所有外部依赖和新增权限不是自由裁量事项。
- 本文提出方案，未声称当前应用已安装本适配。设计确认后才写逐项可执行计划；实现/打包/发版分别验收。

## 9. 参考与可复核定位

- [OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills)：渐进加载、隐式/显式调用。
- [Codex App Server / Skills](https://learn.chatgpt.com/docs/app-server#skills)：显式技能输入与服务端注入。
- [Superpowers v7.0.0 Codex 插件](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/.codex-plugin/plugin.json)：声明技能目录和空 hooks。
- [Superpowers 移植说明](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/docs/porting-to-a-new-harness.md)：技能内容不改、独立工具映射、skill-index 回退及真实模型验收。
- [已复核新版 wrapper 源码](https://github.com/spellyaohui/deepseek-harness-windows/blob/72dc27c090671d74873df44d44cbe562a690ffe4/win-desktop/src/dsh-service.js)：desktop default layer。
- 本机真实安装包：`resources/app/node_modules/@deepseek-ai/dsh-tool-skill/lib/index.js`（显式注入 168 起、目录 203 起），`dsh-client-ui-skill/lib/client.js`（`/` 来源 374 起），`dsh-skill-filesystem/lib/index.js`（provider 50 起、roots 150 起）。这些是调查证据，不是实施时修改的目标。
