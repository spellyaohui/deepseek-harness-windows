# 模型图像能力自动解析与手动覆盖设计

状态：用户已确认“每模型三态 + 批量操作”方案，等待书面复核。

## 背景

自定义 `llm-pi-ai` Provider（例如 `woyaopro`）可以通过“获取可用模型”读取
OpenAI 兼容 `/models` 列表，但当前发现合同只传递模型 ID、名称、上下文容量和
最大输出容量。标准 `/models` 响应没有可靠的输入模态字段，当前
`DiscoveredModelView` 也不携带图像能力。因此新发现的自定义模型没有
`input` 声明，pi-ai 最终采用 Provider 默认的 `['text']`，Harness 会正确但过于
保守地拒绝图片输入。

OpenCode Go 已由 Windows wrapper 维护经过验证的协议和图片能力目录；未知模型
仍安全回退为仅文本。该目录解决已知模型，但不能成为所有自定义 Provider 的
模型名称猜测表，也不能代替用户对实际网关能力的明确配置。

底层 pi-ai Provider profile 已支持每个模型的 `input` 字段。运行时解析顺序为：
模型条目声明、已安装目录中的同名模型声明、Provider `defaultInput`、适配器默认。
因此可在原生 Models 设置页增加 Provider 中立的模型级控制，无需把
`woyaopro`、CPA 或 OpenCode 特例写入 Models fork。

## 目标

1. 在“设置 → 模型”的 pi-ai 模型行中提供图像输入三态：自动、支持图片、仅文本。
2. 允许自定义 Provider 和 OpenCode 使用同一控制，不新增第二张 Models 卡片。
3. 已有可靠目录信息时继续自动采用；无法可靠识别时保持安全默认并允许用户覆盖。
4. 手动模型级选择始终高于静态目录、Provider 默认和未来自动发现结果。
5. 为“该 Provider 的全部模型都支持图片”提供批量设置与批量恢复自动操作。
6. 保留每个模型未由页面编辑的协议、容量、reasoning、compat 等字段。
7. 通过现有启动、模型目录、CPA、OpenCode 和包装器回归后再构建新安装包。

## 非目标

- 不按模型 ID、名称中的 `vision`、`gemini`、`omni` 等词进行猜测。
- 不在获取模型时自动发送真实图片请求；该做法会产生费用、外部副作用，并会把
  鉴权、限流、协议或网关故障误判为模型不支持图片。
- 不在本次本地改动中扩展 Harness 上游 `llm.discoverModels` RPC 合同。未来上游若
  正式返回可信模态元数据，可作为 `自动` 的新增来源，而不改变本设计的持久化语义。
- 不在 Models fork 中加入 CPA、OpenCode 或 `woyaopro` 专属规则。
- 不改变 AgentTeams 角色模型和思考强度策略；AgentTeams 只消费保存后的共享模型
  目录能力。
- 不建立旧格式迁移层。现有合法 `input` 直接生效，缺少 `input` 自然表示自动。

## 所有权边界

- Models settings fork 拥有 Provider 中立的三态控件、批量操作、草稿更新和字段
  保留。
- pi-ai 适配器继续拥有 `input` / `defaultInput` 的 schema 与运行时解析，不在
  wrapper 复制一套模型解析器。
- Windows wrapper 继续拥有 OpenCode 已验证基础目录的协议和图片能力修复。
- CPA 插件继续通过原生 Provider profile normalization seam 提供 CPA 默认模态，
  不注册第二个可见编辑器。
- AgentTeams、文件图片工具和 API proxy 继续只消费 `resolveModelInfo` 得到的最终
  `inputModalities`，不自行猜测模型能力。

## 三态合同

三态是编辑器语义，不新增持久化枚举。页面直接映射到 pi-ai 已有字段：

```ts
type ImageInputChoice = 'auto' | 'image' | 'text-only'

// auto
delete model.input

// image
model.input = ['text', 'image']

// text-only
model.input = ['text']
```

只要模型条目存在非空 `input`，它就是模型级明确声明；该值可能来自用户操作，也
可能由拥有该 Provider 的 normalization seam 根据可靠事实物化。解析优先级固定为：

1. 模型条目的合法非空 `input`；
2. 已安装、已验证基础目录中同 Provider、同模型 ID 的能力；
3. Provider 的 `defaultInput`；
4. pi-ai 的安全默认 `['text']`。

`自动` 不承诺一定识别为图片模型，只承诺不写人工覆盖并采用当前最可信的下层
事实。未知自定义模型显示“自动（当前无法确认，按仅文本处理）”，避免把未知能力
显示成已验证事实。

## 自动信息来源

首版只使用不会产生额外外部调用的可信信息：

- 当前共享模型目录对精确 Provider + 模型 ID 已声明的 `inputModalities`；
- pi-ai 已安装目录中的能力；
- Windows wrapper 已验证的 OpenCode 基础目录；
- Provider profile 的 `defaultInput`。

现有 `/models` 发现结果只负责列出候选模型和容量。新候选默认保持 `自动`；如果
当前共享目录已有同 Provider、同 ID 的能力，页面可显示其自动结果，但不会把该
结果复制成手动 `input`。接口未提供模态时不报“识别失败”，而是明确显示自动
结果未知。

未来若上游 `DiscoveredModelView` 增加经过校验的模态字段，模型采用动作仍默认保存
为 `自动`。发现元数据作为自动来源参与展示和解析，只有用户选择“支持图片”或
“仅文本”时才生成持久化覆盖。

## 设置页交互

每个 pi-ai 模型行的高级区域在容量字段旁增加“图片输入”选择：

- `自动`；
- `支持图片`；
- `仅文本`。

选择项下显示一行当前含义：

- 自动且目录确认图片：`自动：当前目录声明支持图片`；
- 自动且目录确认仅文本：`自动：当前目录声明仅文本`；
- 自动且无法确认：`自动：当前无法确认，按仅文本处理`；
- 非自动状态：`模型条目明确声明支持图片`或`模型条目明确声明仅文本`。

自动提示引用的是当前已加载的共享目录。卡片存在未保存修改时，提示补充“保存并
重启后重新解析”，不能把当前运行目录显示成新草稿的未来结果。

模型目录标题区域增加两个低强调度操作：

- `全部设为支持图片`：将当前草稿中的每个模型写为 `['text', 'image']`；
- `全部恢复自动`：删除当前草稿中每个模型的 `input`。

批量操作只影响当前 Provider 卡片中的模型草稿，不改变 API 地址、凭据、协议、
容量或其他 Provider。操作后仍需点击原有“保存”，因此误操作可通过关闭卡片放弃。

“获取可用模型”沿用现有候选选择流程：

- 已配置的同 ID 模型保留原条目和手动 `input`；
- 新采用的候选保存 ID、名称和已返回容量，但不虚构 `input`，初始为自动；
- 获取失败或返回空列表时，已有手工模型和三态设置保持不变。

## OpenCode 行为

OpenCode 的已验证协议与图片能力仍写入基础目录。Models 页面产生的模型级
`input` 位于 Provider profile，运行时优先于基础目录：

- `自动`：使用 wrapper 修复后的 OpenCode 基础能力；未知模型安全回退仅文本；
- `支持图片`：即使模型不在本地已验证表，也明确声明图片输入；
- `仅文本`：可主动关闭目录原本声明的图片输入。

OpenCode 启动修复、目录校验按钮和动态模型 hydration 不得写入或删除用户
Provider profile 中的 `input`。hydration 可为静态基础目录创建保守条目，但
pi-ai 加载 profile 后仍由模型条目的手动声明获胜。

## 数据校验与字段保留

Models 编辑器继续把模型对象视为开放记录。更新图片能力时先复制整条记录，只
修改或删除 `input`，不得重建模型对象。页面负责写出的 `input` 仅允许以下两种
非空形式：

```ts
['text']
['text', 'image']
```

现有合法值按三态显示；缺失或空数组显示自动。包含 `image` 的非空合法数组显示
支持图片，只有 `text` 的数组显示仅文本；用户没有操作该控件时保留原数组的顺序
和内容，只有切换或批量操作才写成页面的规范形式。schema 不接受的值不得静默
过滤成部分能力，而应拒绝保存并显示可操作错误。这样不会把损坏配置误写成
“仅文本”或意外清除。

CPA normalization 仍可把自动状态物化为其契约已知的 `['text', 'image']`，重新打开
时因此可能显示为模型级“支持图片”；页面不把该值错误宣称为用户手动来源。用户在
原生模型行明确改为仅文本后，CPA seam 必须保留该非空覆盖；该行为已有所有权边界，
不移入通用编辑器。

## 错误与安全语义

- 自动信息缺失是正常状态，不显示为网络错误。
- 模型发现请求失败只显示原有失败信息，绝不清空模型或模态草稿。
- 不新增 Token 读取、回显或持久化路径；仍使用现有 write-only credential seam。
- 批量操作不自动保存，不跨 Provider，不触发模型请求。
- 图片工具仍要求最终模型明确解析出 `image`，所以未知自动状态维持 fail-closed。

## 回归设计

### Models 编辑器

- `input` 缺失或空数组映射为自动；图片和仅文本合法数组映射到对应状态；
- 三态切换只改变 `input`，未知模型字段、容量和 compat 原样保留；
- 全部支持图片、全部恢复自动仅改变当前模型列表；
- 已配置模型重新获取时保留其手动状态，新采用模型保持自动；
- 非法 `input` 被拒绝，不被过滤或降级保存；
- 中英文标签、帮助文案和键盘可访问状态完整。

### 运行时能力

- 自定义 `woyaopro` 模型设为支持图片后，保存的 profile 包含
  `input: ['text', 'image']`，共享模型目录报告 image；
- 同模型设为仅文本后，图片准入仍被拒绝；
- 自动的未知自定义模型继续仅文本；
- Provider 级 `defaultInput` 与模型级手动覆盖遵循既定优先级。

### OpenCode 与 CPA

- OpenCode 已知模型在自动状态继续得到已验证能力；
- OpenCode 未知模型可由手动图片覆盖启用，且重启 hydration 后仍生效；
- 手动仅文本可覆盖已知 OpenCode 图片能力；
- OpenCode 校验按钮不修改 Provider profile；
- CPA 默认图片能力、显式 text-only 覆盖、容量和 reasoning vocabulary 不回归。

### 完整门禁

验证顺序为：

1. Models fork 的纯函数、组件静态合同和现有插件测试；
2. CPA profile / migration / normalization 回归；
3. OpenCode model-fetcher 与能力插件回归；
4. wrapper 集成和 capability manifest；
5. 从 `win-desktop` 运行 `npm run verify:upstream`；
6. 门禁通过后同步版本、README、UPSTREAM/provenance、lockfile，再构建 EXE/ZIP。

不得通过删除 OpenCode 未知模型 fail-closed、跳过图片准入或弱化既有测试来让门禁
通过。

## 版本与维护

Models settings fork 是本次主要 owner。实现提交必须同步其 package 版本、wrapper
本地依赖与 lockfile、插件产物断言、README、`UPSTREAM.md`、
`docs/UPSTREAM_MAINTENANCE.md` 和 wrapper release notes。OpenCode wrapper 只有在
需要保证 profile 手动覆盖不被 hydration 丢失时才改动；无变化则保留现有版本。

未来上游更新时，将该能力分类为 `UPSTREAM_EQUIVALENT`、`REAPPLY` 或
`SUPERSEDED_BY_DESIGN`。即使上游后来支持自动模态发现，也必须保留三态覆盖和
“用户手动优先”的回归。

## 验收标准

- `woyaopro` 的每个模型都能选择自动、支持图片或仅文本，并可批量设为支持图片。
- 保存并重启后，手动支持图片的模型不再收到“不支持图像输入”的本地准入错误。
- OpenCode 使用同一模型级控件，自动能力和用户手动覆盖均按优先级生效。
- 获取模型无法提供模态时不猜测、不误报成功，用户仍可明确配置。
- 模型其他字段、Provider 配置、凭据、CPA 能力及 AgentTeams 模型策略不丢失。
- 所有局部回归和 `npm run verify:upstream` 通过后，才构建新的 Windows 安装包。
