<p align="right">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="dsh-agent-teams 把一个 DeepSeek Harness 会话变成可协作的多智能体团队">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nanmicoder/dsh-agent-teams"><img src="https://img.shields.io/npm/v/@nanmicoder/dsh-agent-teams.svg" alt="npm 版本"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@nanmicoder/dsh-agent-teams.svg" alt="MIT 许可证"></a>
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-plugin-202724" alt="DeepSeek Harness 插件">
</p>

## 一句话，拉起一支真正协作的团队

`dsh-agent-teams` 让当前 DeepSeek Harness 会话成为队长：创建可续聊的子 Agent、把目标拆成有依赖的任务，并通过直达消息协调成员工作。

你只需用自然语言提出目标。插件会提供团队协议、10 个协作工具、持久化状态、自动共享任务调度和实时 Web UI，不需要额外的 Workflow 引擎。

<p align="center">
  <img src="./assets/ui.png" width="100%" alt="DeepSeek Harness 对话与 AgentTeams 实时活动面板，展示成员、任务依赖和回报">
</p>

## 版本更新

查看[最新版本说明](https://github.com/NanmiCoder/dsh-agent-teams/releases/latest)，或浏览[完整发布历史](https://github.com/NanmiCoder/dsh-agent-teams/releases)。同一份 Markdown 说明也会随 npm 包发布到 `release-notes/` 目录。

### v0.1.14-desktop.10

- 队长系统提示改为生命周期优先的状态机；内置 `software-delivery` 完整提示为 3,353 字符，同时保留审批、角色推理路由、依赖、attempt/reassign、质量门禁、停止/恢复、清理和部署确认规则。
- 可选 `profile` 缺失、空字符串或纯空白时创建相同的 ad-hoc Team，不会隐式选择默认 Profile。
- 非空未知 Profile 仍在持久化状态或启动成员前严格失败；创建工具会列出当前配置名称，并提示未指定时省略该属性。

### v0.1.14-desktop.9

- `agent_teams_create_task` 接受 `captain` 作为队长任务别名，并把空 `assignee` 归一化到共享任务池；其他名称仍必须对应活动成员。
- 交付物门禁会提示使用工作区相对 POSIX 路径，并引导把抽象成果写入任务标题、描述或验收条件。
- `.env`、密钥和 `.git` 等受保护路径继续被拒绝，同时返回明确的安全边界说明。

### v0.1.14-desktop.8

- running Team 误调用 `agent_teams_edit_plan` 时返回结构化下一步指引，不再产生工具异常；已批准计划保持不可变。
- staged 成员编辑器保留 `target-default`、`route-aware` 和 `explicit` 三种推理权威；从 `explicit` 切到非明确模式时清除旧的显式思考强度。
- staged 任务编辑支持完整质量契约，包括任务类型、目标、范围、验收、验证命令、交付物和覆盖项；Host 拒绝包含非字符串项的列表，空列表可明确清空字段。
- implementation/repair 的交付物必须由 `inScope` 覆盖；空 `changedPaths` 必须提供 `noChangesReason`，并且不能隐藏已声明交付物。

### v0.1.14-desktop.7

- 当前会话尚未创建或加入 Team 时，`agent_teams_status` 作为只读探测返回 `active: false`，不再显示红色参与者错误。
- `agent_teams_claim_task`、`agent_teams_update_task` 和 `agent_teams_send_message` 继续严格校验成员身份，非成员不能修改 Team 状态或冒充成员。
- running Team 可以把 implementation 预先排到活跃 requirements 之后，但必须声明依赖；调度仍会等待 requirements 以 `verdict=pass` 完成。

### v0.1.14-desktop.6

- 在任务写盘前省略空的可选字符串，避免非 GPT 模型的工具调用生成严格 V2 校验无法重新读取的 Team。
- 队长尚未创建 Team 时，`agent_teams_delete` 改为幂等返回“无需删除”，不再显示红色工具错误。
- 继续严格使用 V2 Profile/Team 和角色级 Provider、模型、推理策略；没有加入旧状态迁移层。

### v0.1.14-desktop.5

- 每个成员的 Provider、model 和 reasoning policy 都在 Profile 角色卡中配置。
- 不再支持全局成员模型和推理设置。
- Profile 文档与 Team 状态严格要求 `schemaVersion: 2`。旧数据保留在磁盘，但拒绝加载、不做迁移；请新建 Profile 和 Team。
- CPA 与 OpenCode 模型继续使用共享 Harness catalog。

## 为什么需要 AgentTeams？

| 能力 | 带来的变化 |
| --- | --- |
| **队长式委派** | 当前会话负责建队、分配角色并汇总最终结果。 |
| **可续聊成员** | 成员是可持续唤醒的 DSH 子 Agent，可以继续执行聚焦的后续轮次。 |
| **带依赖的任务** | 任务有明确状态；依赖未完成时不能领取。 |
| **自动续领与安全接管** | 成员空闲后自动领取下一项就绪任务；转派会撤销旧 attempt，冷恢复会重试遗留任务，迟到结果无法覆盖。 |
| **成员直达消息** | 成员通过持久化邮箱直接联系队友或队长，不需要队长中转。 |
| **实时活动面板** | Web UI 用分段进度、可折叠成员树和可交互 DAG 展示实时工作；团队结束后仍保留完整成员与任务历史。 |

对话卡片与活动面板接入 Harness 官方多语言服务，会随宿主在简体中文和英文之间实时切换；任务/成员状态、动态摘要、操作按钮、历史归档标识和无障碍文案都会同步更新，无需刷新页面，也不增加插件自己的语言设置。

## 安装

> [!NOTE]
> 使用前请确保已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。

### npm

```sh
dsh plugin --profile web add @nanmicoder/dsh-agent-teams@latest
```

### 从源码构建

```sh
git clone https://github.com/NanmiCoder/dsh-agent-teams.git
cd dsh-agent-teams
pnpm install
pnpm build
dsh plugin --profile web add .
```

修改源码后请重新执行 `pnpm build`。本地安装会继续链接到当前源码目录。

检查组合配置、重启 DSH，然后刷新 Web UI：

```sh
dsh --profile web --dump-config
dsh web
```

接着直接用自然语言拉团队：

> 使用 AgentTeams 审查 v0.5.3 之后的提交，分别从性能、安全和产品角度分工，最后输出一份汇总报告。

## 工作方式

1. 当前会话创建团队并成为队长。
2. 队长按角色添加由可续聊子 Agent 驱动的成员。
3. 目标被拆成有负责人和显式依赖的任务。
4. 共享调度器依据真实 `running / idle / ready` 状态，为每个空闲成员原子领取一项就绪任务并唤醒它；驻留成员被中断时会停驻当前 attempt，可通过直接消息继续而不丢 capability；只有冷进程重启后的遗留任务才会生成新 attempt 恢复。
5. 成员携带当前 `attempt_id` 更新任务；转派或队长接管会先撤销旧 attempt、等待原成员安静，再启动新 attempt。
6. 队长汇总结果，随后归档完整团队记录。

团队状态保存在 `<workspace>/.agent-teams/`；Web 面板读取这份磁盘真相，并与实时子 Agent 活动合并展示。

成员创建遵循当前 Profile 解析出的角色策略。每张角色卡携带自己的 `provider`、`model`、`reasoning_mode` 和可选 `reasoning_effort`，解析出的路由与强度会快照并用于后续续跑。内置 `software-delivery` Profile 提供 `analyst`、`implementer`、`tester`、`reviewer` 四个角色，默认使用 `reasoning_mode: target-default`。Profile 修改会在启动前注入，必须重启后才用于新团队。

## Slash 命令

无需再说“用 AgentTeams”。插件注册了封闭命名空间的 `/agent-teams` 宿主命令，Web GUI 的 slash 菜单会显示 `agent-teams` 占位项与输入提示：选中它（或直接输入命令）、描述目标、回车即可。

```
/agent-teams 调研三家竞品的定价页
```

这一行被命令管线认领后，会按用户提交的原文作为普通用户消息送入主会话，因此聊天记录中仍能看到完整的 `/agent-teams …`。手势边界会在 pre-step 注入确定性激活指令，队长协议仍会立即启动。调用也会持久化记录（`command/run` / `command/done`）。

没有命令裁决的表面（例如 headless CLI）也享有同等的确定性激活：任何以 `/agent-teams` 开头的真实用户消息，都会为其余文本激活该协议；句子中间出现的字样仍是普通文本。

## 配置

默认配置可以直接使用。受信任的 Profile 可以按角色定义成员行为：

```yaml
- id: agent-teams
  config:
    stateDir: .agent-teams
    memberProvider: spawn
    memberMaxDepth: 1
    maxMembers: 8
    profiles:
      software-delivery:
        schemaVersion: 2
        members:
          - name: analyst
            role: 需求分析
            reasoning_mode: target-default
          - name: implementer
            role: 实现工程
            reasoning_mode: target-default
          - name: tester
            role: 验证工程
            reasoning_mode: target-default
          - name: reviewer
            role: 代码与风险评审
            reasoning_mode: target-default
```

这里的 `memberProvider` 指子 Agent 的运行后端（`spawn` / `fork`），不是 LLM provider。每个 Profile 角色需要指定成对的 `provider` + `model` 才能路由到具体模型目录项，再选择 `target-default`、`route-aware` 或 `explicit` 作为 `reasoning_mode`；`explicit` 必须同时提供 `reasoning_effort`。角色卡是唯一权威，不再提供全局成员模型或推理覆盖。

`slashCommand: false` 可关闭确定性的 `/agent-teams` 激活面（slash 命令与手势边界），仅保留自然语言触发。

## 使用边界

- 一个队长同一时间只能带一个活动团队。
- 没有开放任务的空闲成员会自动续领就绪任务；仍持有开放 attempt 的空闲成员会停驻，队长可发消息让其沿用原 attempt 继续，或显式转派；冷重启遗留的开放任务才会生成新 attempt。暂时无法实时投递的消息会持久保存在邮箱中并在后续状态边界重投。
- 状态使用文件持久化，并在单个 DSH 进程内串行操作；多个进程同时修改同一团队不保证一致。
- 活动面板如实展示持久化状态；模型偶尔可能完成工作却没有按协议更新任务状态。

完整工具列表、状态模型、Web UI 行为、配置与已知限制见 [docs/usage.md](./docs/usage.md)。

## 插件开发 Skill

仓库同时提供开放 Agent Skills 包 [`dsh-plugin-development`](./skills/dsh-plugin-development/SKILL.md)：

```sh
npx skills add NanmiCoder/dsh-agent-teams --skill dsh-plugin-development
```

## 文档

| 指南 | 内容 |
| --- | --- |
| [使用指南](./docs/usage.md) | 架构、UI 行为、工具、配置、限制与验证 |
| [验证指南](./docs/verification-guide.md) | 离线、组合、真实 e2e 与 GUI 验证 |
| [插件开发](./docs/developing-dsh-plugins.md) | 基于本插件整理的人类可读开发指南 |
| [README 写作](./docs/readme-writing-guide.md) | 仓库文档约定 |

## 开发

```sh
pnpm install
pnpm build
pnpm verify
```

## 许可证

[MIT](./LICENSE)
