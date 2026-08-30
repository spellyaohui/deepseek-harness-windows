# 统一模型能力兼容层设计

状态：设计稿，已通过分段讨论，等待书面复核。

## 摘要

DeepSeek Harness 需要把自定义 Provider、CPA、WOYAOPRO、OpenCode 和其他
pi-ai 路由的模型能力判断统一起来。当前图片输入已经有模型级三态设置，
但模型返回的能力元数据、推理档位和协议兼容字段还没有统一的可信入库流程，
因此同一个模型换供应商或换协议后容易重新出现“本地判断不支持”“思考强度
不存在”“工具请求形状不兼容”等问题。

本设计新增一个由 Windows wrapper 主进程持有的、provider-neutral 模型能力
探测层。用户在“设置 → 模型”中勾选模型并显式点击“探测并应用”，探测层
使用当前选择的协议和 pi-ai 适配器发出最小真实请求，生成只包含能力字段的
补丁。模型接口已经返回的规范化能力作为候选值；成功的真实探测覆盖候选值；
用户明确设置始终优先。探测不会按供应商名称、模型名称或关键词增加分支。

本设计扩展并取代 `2026-08-29-model-image-capability-overrides-design.md`
中“首版不发送真实图片请求”的限制，但保留其三态图片合同、字段保留、未知
模型安全回退和 provider-neutral 所有权边界。

## 目标

- 统一探测文本、图片、推理档位和可验证的 wire 兼容能力。
- 支持模型级 `自动`、`文本和图像`、`仅文本` 图片输入设置。
- 允许每个模型根据真实结果拥有独立的 reasoning 能力，而不是沿用全局或
  供应商名称规则。
- 当 `/models` 或其他模型目录已返回规范能力字段时直接填入草稿。
- 将成功探测结果保存到 pi-ai 已有的 `input`、`reasoningEfforts` 和 `compat`
  字段，保持 AgentTeams、图片准入和协议适配器使用同一份最终目录。
- 在协议或供应商变化时仍保持清晰的重新探测入口，不自动换协议或猜测。
- 让上游 Harness、AgentTeams 或 Pi 更新后可以通过回归和维护注册表保留本地
  兼容能力。

## 非目标

- 不按 `gemini`、`vision`、`omni` 等 ID 或名称关键词猜测能力。
- 不为 CommandCode、CPA、WOYAOPRO、OpenCode 各写一套重复探测器。
- 不自动切换协议，不因 500/502 自动重试另一个协议或地址。
- 不把用户对话、真实文件或敏感图片上传到探测请求；图片测试使用固定的
  最小测试图片。
- 不自动猜测多轮工具结果回放、思考内容回放等需要上下文语义的兼容行为。
- 不改变既有 `grep` 参数归一化边界；该边界处理工具参数语义，不是模型能力
  目录规则。
- 不增加旧对话迁移层，不重写历史会话。

## 架构与所有权

### 统一能力链

```text
模型发现 / 已安装 catalog
          │ 规范能力候选
          ▼
Windows 主进程统一探测器 ── 当前协议 + 临时凭据 + pi-ai 适配器
          │ 结构化能力补丁
          ▼
模型设置草稿 ── 用户确认 / 覆盖现有能力
          ▼
llm-pi-ai 模型级 input / reasoningEfforts / compat
          ▼
AgentTeams、图片准入、工具调用和协议适配器
```

- `win-desktop` wrapper 拥有探测执行、脱敏结果、请求取消和设置 IPC。
- Provider 或模型目录拥有发现响应到规范能力字段的归一化，不把原始供应商
  字段解析塞进 Models settings fork。
- Models settings fork 拥有模型级图片三态、探测草稿、结果展示、字段保留和
  provider-scoped 批量操作；不包含 Provider 名称或模型名称判断。
- `dsh-llm-pi-ai` 继续拥有 `input`、`reasoningEfforts`、`compat` 的 schema、
  解析优先级和实际请求形状。
- AgentTeams 只读取最终模型目录暴露的 `inputModalities` 与 reasoning levels，
  不自行探测或推断能力。
- 现有 wrapper `grep` 兼容层继续在 pi-ai durable tool-call 边界工作，并保持
  “缺 pattern 且 description 完全匹配单行 pattern 形式”这一窄规则。

## 能力来源与优先级

能力来源从高到低为：

1. 用户明确设置；
2. 本次成功的真实探测；
3. 模型发现接口返回的规范化能力字段；
4. 已验证静态 catalog 或 Provider 默认值；
5. pi-ai 安全默认值。

普通“探测并应用”不会覆盖已经存在的模型级能力字段，因为持久化后无法仅
凭字段本身区分“用户手动写入”和“上一次探测写入”。需要重新验证已有配置时，
用户先把对应字段恢复为自动，或者显式选择“覆盖现有能力”。覆盖操作只影响
探测涉及的能力字段，不影响模型身份、协议、地址、凭据、容量、成本或其他
未知字段。

能力补丁的合并规则是：先在当前未保存草稿中用成功的探测覆盖尚未落盘的发现
候选；再对已经存在的模型级字段执行“保留”策略；只有“覆盖现有能力”开启时，
才将本次 `supported` 或明确 `unsupported` 结果写入已有字段。`inconclusive` 和
`not-applicable` 无论是否开启覆盖都不改变字段。这样模型目录中的候选值可以
被真实探测纠正，而已确认的用户配置不会被普通重复探测悄悄改掉。

模型发现结果可携带一个可选的规范能力部分；这是现有发现边界的增量字段，
缺失时完全不报错。原始供应商扩展字段只有在能归一化为当前 pi-ai 合同并通过
严格校验时才可入候选值，未知字段不参与运行时判断。

## 探测请求与结果

### 请求输入

探测器接收：

- Provider route ID；
- 当前模型 ID；
- 当前选择的 wire protocol；
- base URL；
- 一次性 API key 或现有 credential seam；
- 当前模型草稿和已发现的规范能力候选；
- 可取消的 `AbortSignal`。

凭据只存在于主进程探测调用生命周期内。Renderer 不直接发请求，不接收密钥，
日志不记录 Authorization、请求正文、图片 base64 或完整供应商响应。

### 探测矩阵

每个用户勾选模型按当前协议串行执行以下检查，支持中途取消：

| 类别 | 最小检查 | 可写入结果 |
| --- | --- | --- |
| 文本 | 最小文本请求，确认基础请求与响应链路 | `supported` / `inconclusive` |
| 图片 | 固定 1×1 测试图片 | `input: ['text', 'image']` 或 `['text']` |
| 推理 | 依次尝试模型目录给出的档位；缺失时尝试 `minimal`、`low`、`medium`、`high`、`xhigh`、`max` 和 `none` | `reasoningEfforts` 或 `false` |
| developer | 对当前协议可用的 system/developer 形状做最小比较 | `compat.supportsDeveloperRole` |
| strict 工具 | 最小合法工具 Schema，分别验证 strict 形状 | `compat.supportsStrictMode` |
| store | 带 `store` 的最小请求 | `compat.supportsStore` |
| streaming usage | 带 usage 选项的最小流请求 | `compat.supportsUsageInStreaming` |
| 输出上限 | 分别验证 `max_tokens` 与 `max_completion_tokens` | `compat.maxTokensField` |

探测记录的是“端点接受的请求形状”，不是模型内部是否真正按预期思考或执行
工具。两种格式都成功、都失败或结果无法区分时，不强行选择，保留已有值或
catalog 值。

### 推理档位语义

`reasoningEfforts` 使用 pi-ai 已有的规范键：`off`、`minimal`、`low`、
`medium`、`high`、`xhigh`、`max`。值是当前协议真正接受的 wire 拼写。

- 非 `off` 档位成功：写入对应规范键和 wire 值。
- 非 `off` 档位明确 400/不支持：不写入该键。
- 所有非 `off` 档位均明确不支持：写入 `reasoningEfforts: false`。
- `none` 被拒绝：不写入 `off: 'none'`；若不发送 reasoning 参数的请求可用，
  写入 pi-ai 的 `off: null` 语义。
- 网络、限流、5xx、超时：不减少原有档位，标记该项 `inconclusive`。
- 供应商返回的 reasoning 列表或映射若已符合规范，直接作为候选；成功探测
  可以覆盖它，用户手动设置仍可覆盖探测结果。

`off: null` 的 UI 文案必须说明为“不发送 reasoning 参数”，不能承诺一定关闭
供应商的内部默认思考。AgentTeams 的 `explicit` 角色仍必须使用模型实际入库
的可用档位；`target-default` 和 `route-aware` 继续由现有路由策略处理。

### 错误分类

每个测试项返回脱敏后的结构化状态：

- `supported`：请求成功并满足该检查的最小判定；
- `unsupported`：明确 400、协议不支持或响应明确说明不接受；
- `inconclusive`：网络、凭据暂不可用、限流、超时、5xx/502 或流结束异常；
- `not-applicable`：当前协议没有该类可验证请求。

只有 `supported` 和明确的 `unsupported` 可以改变对应能力字段。探测失败不能
清空旧模型、Provider 配置或其他模型。

## 设置页交互

继续使用“设置 → 模型”现有 Provider 原生行，不增加第二张 Models 卡片。

### Provider 层

- 显示当前协议和探测说明；
- 勾选要探测的模型；
- `探测并应用`：按模型串行探测，结果先进入草稿；
- `取消探测`：停止后保留已经返回的结果，未完成项标记未完成；
- `覆盖现有能力`：明确允许探测结果覆盖当前模型已有的 `input`、
  `reasoningEfforts` 和被验证的 `compat` 字段；
- 原有保存按钮仍负责最终 settings mutation。

### 模型行

- 图片输入保持三态：`自动`、`文本和图像`、`仅文本`；
- 显示 reasoning 档位、探测状态和最近一次结果摘要；
- 显示当前协议适用的兼容字段摘要；
- 高级兼容设置使用 `自动 / 是 / 否` 或对应协议允许的枚举；
- 只有用户主动修改字段时才写入规范模型补丁；关闭或放弃草稿不产生写入。

### 图片三态持久化

- `自动`：删除模型级 `input`；
- `文本和图像`：写入 `input: ['text', 'image']`；
- `仅文本`：写入 `input: ['text']`。

缺失或空 `input` 显示为自动；非法 `input` 阻止保存，不能被过滤或静默降级。
批量操作只作用于当前 Provider 的未保存草稿。

## 高级兼容设置边界

自动探测只写入当前 pi-ai schema 能明确表达且请求能明确验证的字段。需要
多轮语义、无法区分“被接受”和“被忽略”的字段，不自动猜测，但可以在模型
级高级区域显式设置。

可见字段必须由当前协议的 pi-ai compat 类型动态派生，不按 Provider 名称过滤。
包括 `supportsDeveloperRole`、`supportsReasoningEffort`、`supportsUsageInStreaming`、
`supportsStrictMode`、`supportsStore`、`maxTokensField` 以及当前协议允许的
其他通用字段。pi-ai 标记为厂商私有的字段继续不在通用 UI 中开放。

高级设置写入前复用 pi-ai schema 验证：协议不接受的字段、非法枚举和空值均
返回可操作错误，不以删除字段或改写成默认值的方式隐藏错误。

## 安全、隐私和运行约束

- 完整探测可能产生少量供应商调用费用；用户必须显式点击才启动。
- 探测请求只使用固定最小文本、固定最小图片和最小合法工具，不携带用户会话
  内容或本地文件。
- 一次只探测一个模型，避免将一个供应商的限流或 502 放大为批量失败。
- 使用当前协议，不自动换协议，不自动改地址，不自动更换模型。
- UI、IPC 返回值和日志只包含模型 ID、测试类别、状态和脱敏错误摘要。
- 探测结果未应用前不写入 settings；应用时只提交能力字段补丁。

## 测试与验收

### 纯函数和 schema

- 三态图片映射、非法值拒绝、字段保留和批量草稿操作；
- reasoningEfforts 对 `none`、`off: null`、部分成功和全不支持的映射；
- compat 字段按协议动态筛选，非法字段和非法枚举被拒绝；
- 探测补丁不改变模型 ID、协议、容量、成本、凭据和未知字段。

### 探测器

- 文本、图片、reasoning、strict 工具、developer、store、streaming usage 和
  输出上限字段的成功/明确不支持/网络失败分支；
- CommandCode 风格的 `low/medium/high/xhigh/max` 成功、`none` 400，结果不
  把模型错误判为“不支持 reasoning”；
- 供应商返回规范能力时先填充，成功探测覆盖；
- 两种兼容格式都成功时保持现值，不做武断选择；
- 取消探测只终止未完成项，已完成结果仍可审阅。

### 集成与回归

- CPA、WOYAOPRO、OpenCode、自定义 OpenAI-compatible route 使用同一探测桥；
- OpenCode 已验证协议和图片 catalog 仍优先于未知自动模型的安全默认；
- AgentTeams 每个角色的 `explicit` effort 只能从最终模型能力中选择；
- `grep` 缺少 `pattern` 的既有 provider-neutral 回归继续通过；
- 上游刷新后执行 `npm run verify:upstream`，保留 capability manifest、模型输入
  回归、CPA、OpenCode、AgentTeams 和工具兼容回归。

### 用户验收

- 勾选一个 Gemini、一个 CPA 模型、一个 WOYAOPRO 模型和一个 OpenCode 模型，
  逐个探测并应用；
- 图片能力在重启后按入库结果生效；
- CommandCode 模型可显示实际支持的思考档位，不再因 `none` 400 隐藏其他档位；
- 更换 Provider 或协议后，不会自动继承错误的专属判断；
- 重新获取模型不会清空用户已确认的模型能力。

## 上游刷新与版本维护

本能力由 Windows wrapper 的统一探测桥、Models settings 的 provider-neutral
编辑器和 pi-ai 的既有模型 schema 共同实现。每次 Harness、AgentTeams、Pi 或
本地插件更新时，必须在 `docs/UPSTREAM_MAINTENANCE.md` 中将相关能力分类为
`UPSTREAM_EQUIVALENT`、`REAPPLY` 或 `SUPERSEDED_BY_DESIGN`，并保留对应回归。

若上游新增规范能力字段：

- 能被现有 canonical contract 直接表达的，作为增量候选来源接入；
- 不能表达的，先更新 schema、类型、探测结果和回归，再更新维护注册表；
- 不得因冲突删除三态图片设置、reasoning 能力、兼容设置或现有 grep 回归。

实现阶段必须同步 owner 插件版本、wrapper 依赖和 lockfile、产物断言、README、
维护注册表和发行说明。运行 `npm run verify:upstream` 通过后才允许构建 EXE/ZIP。

## 验收标准

- 所有可配置 pi-ai Provider 都可以通过统一入口为选定模型探测文本、图片、
  reasoning 和可验证的 wire 兼容能力。
- 图片能力可以在模型级选择自动、文本和图像或仅文本，并且重启后保持。
- `reasoningEfforts` 入库反映真实可接受档位；`none` 被拒绝不会误伤其他档位。
- 自动探测不包含供应商名称、模型名称或关键词特判。
- 网络失败保留原配置，明确不支持才写入不支持。
- 高级兼容字段使用现有 pi-ai 合同，不能写入未知或厂商私有字段。
- AgentTeams、CPA、OpenCode、grep 兼容和既有本地专属功能均通过回归。
- `npm run verify:upstream` 通过后，才进入实现版本、README、发行说明和安装包
  构建流程。
