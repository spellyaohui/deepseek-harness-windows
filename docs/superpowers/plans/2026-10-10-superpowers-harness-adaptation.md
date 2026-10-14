# Superpowers / Harness Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this tightly coupled plan) or superpowers:subagent-driven-development to implement this plan task-by-task, only after execution approval. Steps use checkbox (`- [ ]`) syntax for tracking. In Harness, load skills by the current catalog's bare names; `superpowers:` above denotes the skill family, not a tool argument.

**Goal:** 在 Windows Harness 中交付官方 Superpowers 的按需自动匹配和现有 `/` 显式加载，正确适配 Team/Native，保留角色策略和 durable gateway。

**Architecture:** 一个本地技能插件复用官方 `FileSystemSkillProvider`，仅提供固定技能资产并在选中技能的全文后附加 DSH 工具映射。自动目录、显式加载和输入选择器继续由官方 Harness 实现；Team 调度与子会话生命周期仍由 AgentTeams 和既有 gateway 所有。新插件的运行资源全部位于受控 `lib`，复用现有同步及安装依赖路径。

**Tech Stack:** ESM JavaScript、Node `node:test` / `assert`、Cordis、Harness `0.2.0-rc.2` 的 `dsh-skill` / `dsh-skill-filesystem` / `dsh-tool-skill` / AgentLoop testkit，现有 Electron 44.0.0 外壳及闭包验证器。

**Spec:** [已确认设计](../specs/2026-10-10-superpowers-harness-adaptation-design.md)。执行者必须完整阅读本计划、设计及目标新版仓库的 AGENTS.md；无需本对话上下文。

## Global Constraints

- 本文件是实施计划，不是执行授权；当前仅允许写规划文档。用户确认执行方式后才开始产品改动。
- 实施基线是公共 `main` 的 `72dc27c090671d74873df44d44cbe562a690ffe4`（2026-10-10 复核）。wrapper `0.2.0-rc.18`，AgentTeams `0.1.22-desktop.11`，官方 Harness 固定 `0.2.0-rc.2`。
- 当前 checkout HEAD `42750ed1405ac4b088ed98cc0b7169e40ecf7b03` 是旧源码；不能直接在它上面交付或反向合并旧 fork。实施前复核远端；若基线已有新改动，先阅读差异并报告真实冲突，不盲目套旧计划。
- 官方 Superpowers `v7.0.0` 的内容 commit 固定 `bb92a77741419a4ab5f06e711a283343f1ada0c3`；annotated tag 为 `7f043e5eaf3522dc19178c673b76328de9b0c355`。导入 15 个技能及全部追踪的引用/脚本，原始字节和 MIT LICENSE 不改。
- 新本地包 `@deepseek-ai/dsh-superpowers@0.1.0`，wrapper 依赖 `file:superpowers-plugin`。不新增社区 `superpowers-dsh` 运行依赖，不新增第三方运行库，不改官方 tarball，不升级宿主或 AgentTeams。
- 插件 `name='superpowers'`、provider 名 `superpowers-bundled`、`inject=['skills']`。固定 bundled 根、`includeDefaultRoots:false`、`watch:false`、原生 bundled rank 600；用户/项目同名技能继续优先。
- 不新增工具、系统提示段、技能选择 UI、启动 Hook、持久状态、自动触发开关或第二个调度器。所有 Team 延续操作仍通过唯一 durable gateway；不改变 gateway API / Team Schema / 工具名。
- Native 与 Team 分开；成员不能获得队长权限。技能加载不能授权生产、密钥读取、安装、委派、commit/push/release；不把自审冒充独立复核。
- `tool-call-guidance` 保持不超过 500 字符，AgentTeams 内置 captain 提示保持不超过 3,500 字符；不恢复 AUTO、Session Markdown 导出或 legacy Team 迁移。
- 不改用户 `~/.codex`、`~/.dsh/skills`、AGENTS.md、Profile 缓存、全局 PATH、WSL 或 Hook 配置。SDK 测试全部使用受控临时目录和脱敏环境，不加载实际用户 Profile/凭据。
- 必需门禁是 `win-desktop` 下的 `npm run verify:upstream`：离线、无 install、无网络、无打包。依赖准备必须与门禁分离；不能删/跳/弱化旧测试。
- 默认不 commit/push/tag/release，不热覆盖安装目录，不清理用户文件。安装包、真实模型调用和发布分别需要授权。
- 开发期间 wrapper 版本保持 `0.2.0-rc.18`，新插件同步为 `0.1.0`；后续获准测试打包时再按仓库既有版本规则同步 wrapper/package-lock/集成断言/README/release notes，不能发布同号不同内容。

## Review Focus

1. 只读安装目录、中文/空格路径：资源必须按插件 `import.meta.url` 定位，不能依赖 cwd 或研究临时目录（任务 1）。
2. 用户同名技能与禁用配置：不截获上层技能，不在重启后强行恢复已禁用插件（任务 1、3）。
3. 子会话读取了要求 fresh reviewer 的技能：不得绕过 Team 成员权限或自动创建 Team（任务 2）。
4. 两轮请求、目录失效/恢复、compaction 和客户端重连：不能丢失显式正文、旧目录不能冒充当前可用项（任务 2、4）。
5. SDK 元数据、package.json 和 ZIP 都存在但内容缺失/篡改：闭包必须验证所有技能资源及映射字节，不只统计包数（任务 3）。

## 文件与职责

所有路径以下均相对**经核对的新版执行 worktree**，不是安装目录。设计/计划需一并带入该 worktree，保留本地当前这两份文档。

| 单元 | 创建/修改的准确路径 | 职责 |
| --- | --- | --- |
| 技能插件 | `win-desktop/superpowers-plugin/package.json`、`win-desktop/superpowers-plugin/lib/index.js`、`win-desktop/superpowers-plugin/lib/dsh-tools.md`、`win-desktop/superpowers-plugin/lib/upstream-manifest.json`、`win-desktop/superpowers-plugin/lib/LICENSE`、`win-desktop/superpowers-plugin/lib/skills/**`、`win-desktop/superpowers-plugin/UPSTREAM.md` | 原生 provider、映射、固定资产与来源 |
| 插件自测 | `win-desktop/superpowers-plugin/tests/assets.test.mjs`、`win-desktop/superpowers-plugin/tests/provider.test.mjs` | 真实 Registry 的发现、加载、覆盖、释放 |
| Host 测试 | `win-desktop/tests/superpowers-host.test.js`、`win-desktop/tests/fixtures/superpowers-harness.mjs` | 官方 pre-step / skill、真实 AgentLoop、权限与两轮语义 |
| 桌面挂载 | `win-desktop/src/dsh-service.js`、`win-desktop/src/desktop-profile-layer.js`、`win-desktop/config/agent-teams.patch.yml`、`win-desktop/tests/superpowers-integration.test.js`、`win-desktop/tests/heal-desktop-plugins.test.js` | default layer 与安装锚点；保留用户覆盖 |
| 依赖/同步/门禁 | `win-desktop/package.json`、`win-desktop/package-lock.json`、`win-desktop/scripts/sync-local-plugin-artifacts.mjs`、`win-desktop/scripts/verify-upstream-regressions.mjs`、`win-desktop/tests/local-plugin-artifacts.test.js`、`win-desktop/tests/local-capability-manifest.test.js` | 版本和真实 file 依赖、资源同步、离线门禁 |
| 资源闭包 | `win-desktop/scripts/verify-alpha2-runtime-closure.mjs`、`win-desktop/scripts/verify-alpha2-zip-closure.mjs`、`win-desktop/tests/verify-alpha2-runtime-closure.test.js`、`win-desktop/tests/verify-alpha2-zip-closure.test.js` | 解析新包及资源哈希，防 ZIP 资产丢失 |
| 维护/验收 | `README.md`、`docs/UPSTREAM_MAINTENANCE.md`、`docs/superpowers/plans/2026-10-10-superpowers-harness-acceptance.md` | 能力所有权、事实与分级验收记录 |

不修改 AgentTeams 产品源码；任务 2 只消费其现有 `lib/routing-policy.js`。若实际失败需要修改 AgentTeams、官方 SDK 或放宽权限，先报告证据，不能悄悄扩大任务。

## Task 0: 实施前置检查与正确基线（只读放行）

**Interfaces:** 输入用户的执行授权、上述设计/计划；输出经核对的执行 worktree 路径、HEAD、工具链及完整依赖状态。没有任何产品产物。

- [ ] 用户确认执行方式后，先检查现有 artifacts/worktrees；复用合适的新基线 worktree，否则通过 using-git-worktrees 流程建立隔离 worktree。不能 reset/clean 当前目录，不复制旧分支产品改动到新版。
- [ ] 执行只读检查并记录 HEAD/差异；确认包含 `72dc27c...` 的新版来源，wrapper、AgentTeams、宿主符合 Global Constraints。

```powershell
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/main
Get-Command node.exe, npm.cmd, pnpm.cmd -ErrorAction SilentlyContinue
Get-Item -LiteralPath '.\win-desktop\node_modules' | Select-Object FullName,Attributes,LinkType
```

- [ ] 核对研究目录 `C:\Users\spell\AppData\Local\Temp\sp-research\superpowers` 的 HEAD/tag/dirty 状态和追踪文件集。只取固定提交，不能把未追踪文件或 checkout 本身收录；缺失/失配就停下索要离线源档或单独下载授权。
- [ ] 检查新版本地 tarball、原生插件 build 依赖、Electron 44.0.0 和 pnpm 是否已准备好。2026-10-10 规划环境**没有找到 `pnpm.cmd`**；不能推断执行环境可直接过门禁。允许的离线依赖准备须在门禁外进行，未获安装授权/缓存不足就报告缺项；不使用浮动 `npx` 临时下载工具。
- [ ] 带入设计与计划，运行新版原始 `npm run verify:upstream` 作为 baseline。预期 exit 0；依赖缺失/原有失败不是新插件问题，必须先明确原因，不弱化测试。

**Gate:** 基线来源、现有改动保护及工具链明确后才进入任务 1。后续操作始终在确认过的真实 worktree 执行。

## Task 1: 固定技能资产与薄 provider（依赖任务 0）

**Files:** 创建插件及其两个自测文件；此任务不改 wrapper 挂载和 AgentTeams。

**Interfaces:**

- 插件标准导出 `name: 'superpowers'`、`inject: ['skills']`、`apply(ctx: Context): void`。
- 内部使用 `FileSystemSkillProvider(ctx, control, config)`，复用 `list(options)` / `get(candidate, options)` / `dispose()`；仅在本 provider 的 `get` 成功返回时追加 `dsh-tools.md`，保留其他返回字段和 `resourceBase`。原生返回 undefined、失败和 AbortSignal 取消不能被吞掉。
- `package.json`：`private:true`、`type:'module'`、main/exports 指向 `lib/index.js`，导出 `./package.json`；`files:['lib','UPSTREAM.md']`；必要非 optional peers 为 `@deepseek-ai/cordis:4.0.4`、`@deepseek-ai/dsh-skill:0.2.0-rc.2`、`@deepseek-ai/dsh-skill-filesystem:0.2.0-rc.2`。不声明第二份技能 registry，不新增运行依赖。
- 脚本 `build: node --check lib/index.js`、`test: npm run build && node --test tests/*.test.mjs`。本插件直接维护 ESM，不增加 TS/bundler；不得忽略此插件的受控 `lib`。
- Manifest Schema：`{schemaVersion:1, upstream:{repository:'https://github.com/obra/superpowers',version:'7.0.0',tag:'v7.0.0',commit:'bb92a77741419a4ab5f06e711a283343f1ada0c3'}, skills:string[], files:{path:string,sha256:string}[]}`。files 相对 `lib`，只包含原始 `skills/**` 和 `LICENSE`；路径为安全 POSIX 相对路径，哈希为原始字节 SHA-256。不能含绝对路径、`..`、链接、`.git` 或本机研究目录。

- [ ] **先写红测**：真实 Cordis/SkillRegistry，不照搬社区解析器；定义以下测试及准确断言。

```javascript
// assets.test.mjs
assert.equal(manifest.upstream.commit, 'bb92a77741419a4ab5f06e711a283343f1ada0c3');
assert.equal(manifest.upstream.version, '7.0.0');
assert.equal(manifest.skills.length, 15);
// 每个清单文件：sha256(readFileSync(path)) === entry.sha256；没有缺失或多余追踪资产。
// provider.test.mjs：apply → 实际 ctx.skills.list/get，不用自制 YAML mock。
assert.equal(loaded.resourceBase.kind, 'directory');
assert.match(loaded.content, /<dsh_tool_mapping>/u);
assert.ok(loaded.content.startsWith(originalNativeContent));
```

技能集合精确为：brainstorming、diagnosing-superpowers、dispatching-parallel-agents、executing-plans、finishing-a-development-branch、receiving-code-review、requesting-code-review、subagent-driven-development、systematic-debugging、test-driven-development、using-git-worktrees、using-superpowers、verification-before-completion、writing-plans、writing-skills。

测试名/情形：`fixed upstream assets are complete and unchanged`；`native registry loads all 15 bodies with one DSH mapping`；`project and user names beat bundled skills`；`foreign provider content is not decorated`；`abort and missing skill preserve native outcomes`；`dispose unregisters the provider`；`paths do not depend on cwd or writable installation`。

- [ ] 从 wrapper 运行 `node --test superpowers-plugin/tests/assets.test.mjs superpowers-plugin/tests/provider.test.mjs`。预期 FAIL：新包或技能资产不存在，不能因语法错误产生假红。
- [ ] 导入固定提交的完整追踪技能树与 LICENSE，生成哈希清单；将源码资源放入插件 `lib/skills/**` 和 `lib/LICENSE`。使用 `fileURLToPath(new URL('./skills/', import.meta.url))` 定位，不运行任何上游 helper/Hook 来完成导入。
- [ ] 实现薄 provider：注册工厂获得真实 control，原生 bundled provider 独立命名，加载正文末尾追加 `<dsh_tool_mapping>…</dsh_tool_mapping>`；不改原始正文、不扫描个人目录。复用 Cordis 的清理机制调用原生 dispose，无新 watcher。
- [ ] 按设计第 5.1 节编写**一份**映射。必须包含 Team 队长/成员与 Native 分支、claim 只传 task_id 的默认行为、真实证据质量门、未知策略不委派、技能裸名、缺 todo/ask 工具的回退、真实 Git Bash 与隐藏控制台、用户指令优先。根据已有策略提示和实际工具 Schema 行事；不实现第二个模式解析器或策略设置。
- [ ] 测试中挂载官方用户/项目 filesystem provider，并验证其同名正文不带本地映射。测试 cwd/安装路径含中文与空格；只读场景检查没有写入行为，不更改真实安装目录 ACL。真实资源路径必须能读取 nested reference 与 helper。
- [ ] 从插件目录运行 `npm test`。预期 syntax check 和上述测试全部 PASS，exit 0，无网络、无 model 请求。补写 UPSTREAM.md，说明只在内置资产加载后附加映射，不声称自动介入已经验收。

**Gate:** 15 个技能完整、官方解析语义保留、用户覆盖优先、provider 可释放。保留原始 hash 清单作为后续闭包输入。

## Task 2: Host 加载、两轮和权限回归（依赖任务 1）

**Files:** 创建 `win-desktop/tests/superpowers-host.test.js`、`win-desktop/tests/fixtures/superpowers-harness.mjs`。只用官方 Host 实现和既有 AgentTeams policy，不新增产品生命周期逻辑。

**Interfaces:** 测试 fixture 导出 `createSuperpowersHarness({cwd:string, policy:'teams-v1'|'native-v1', role:'captain'|'member'}): Promise<{ctx,agent,dispose():Promise<void>}>`。采用真实 `mountAgentLoopTestDependencies(ctx)`、`mountAgentLoopTestHarness(ctx)`，后者的 `create(id, options, meta)` 创建真实 Agent/session。加载顺序保留官方前置服务；无持久化 backend/用户 Profile/网络，测试 LLM 若需响应则仅用测试 adapter，不能接真实 Provider。

`policy` 仅传给既有 `installDelegationPolicy`；成员按既有 `MEMBER_TOOL_NAMES` 安装权限。不得为让测试通过在 fixture 中伪造新路由器或自制 skill 解析；正式调用覆盖官方 `skill` 和 `agent/pre-step`，不是仅读源码字符串。

- [ ] **先写红测** `explicit slash injects full skill and mapping`：以真实 user message `/brainstorming` 和 `/systematic-debugging` 分别驱动官方 pre-step。断言出现 `source.kind='skill-invocation'` 的全文，包含原技能正文与映射。未知技能不注入编造正文；用户禁用 model invocation 的技能仍遵从官方显式调用策略。
- [ ] **先写红测** `automatic catalog exposes summaries, not all full bodies`：模型可调用 skill 时，目录含 15 个名称/description；未被选中的全部全文不能提前塞进目录。调用 `skill` 的实际返回含原正文和映射；受限/同名 shadow 情形按官方工具可见性移除目录，不残留误导名称。
- [ ] **先写红测** `two turns and compaction preserve native skill semantics`：真实会话连续两轮，第二轮显式使用另一技能；更新/禁用 provider 后观察 replacement catalog，旧名称不能沿用。用官方 Session/Projection 的 compaction 行为构造后续上下文，不修改真实用户会话。确认之后显式加载仍成功，不要求新插件维护任何去重状态。
- [ ] **先写红测** `Team member cannot turn skill instructions into captain authority`：成员加载 subagent-driven-development 或 requesting-code-review 后，实际调用 create/add-member/Native 委派仍失败，且不写 Team、不启动真实子会话。Team captain 中 Native 绕行仍失败；Native 相应工具是否允许由既有策略决定。检查 plugin 本身没有调用 `ctx.subagents.*`、创建 Team 或写审批。
- [ ] **先写红测** `Team continuation still enters durable gateway`：参照既有 gateway fixture 接口，在本任务新建的测试/fixture 文件中增加加载技能场景，使用现有 gateway 实现记录 Team 启动/发送/中断进入 admission；记录与技能无关时一致。不修改 AgentTeams 脚本或产品源码，不把 `send_message` 的投递确认作为子任务完成，不伪造 commandsRun 或 review pass。
- [ ] 执行 `node --test tests/superpowers-host.test.js`（wrapper cwd）。预期红测来自新插件加载/缺少映射；若全部现有上游行为已经通过，不制造失败或复制上游代码，记录 `UPSTREAM_EQUIVALENT` 证据。
- [ ] 只修复任务 1 新插件的最小接缝并完善测试 fixture；若失败来自既有 AgentTeams/宿主，先定位并向用户报告，不扩展产品改动。
- [ ] 同时运行以下现有回归，保持 Team/Native、角色选择与质量门原样：

```powershell
node --test tests/superpowers-host.test.js
node agent-teams-plugin/scripts/routing-policy-verify.mjs
node agent-teams-plugin/scripts/subagent-gateway-tdd.mjs
node agent-teams-plugin/scripts/selection-policy-verify.mjs
node agent-teams-plugin/scripts/quality-gates-tdd.mjs
```

预期全部 exit 0。若新版源码中的既有脚本/fixture接口变化，先用该新版的 package verify 链和真实源码核对，不捏造一个通过的替代测试。

**Gate:** Host 显式加载与目录行为由代码验证；权限与网关未放宽。此单元不证明真实大模型自动选中了正确技能，后者属于任务 4。

## Task 3: 桌面集成、依赖同步和完整资源闭包（依赖任务 1、2）

**Files:** 修改文件表列出的桌面挂载、依赖/同步/门禁、闭包与维护登记；创建 `win-desktop/tests/superpowers-integration.test.js`。原有函数/API 不重命名。

**Interfaces:**

- `generateAgentTeamsPatch(...)` 和静态 Patch 增加唯一 `{id:'superpowers',name:'@deepseek-ai/dsh-superpowers'}`，无额外用户配置；`desktop-profile-layer.js` 的 `DESKTOP_ENTRIES` 同步登记。现有校验仍拒绝未知/重复条目，不能删除 whitelist 以适配新包。
- `LOCAL_PLUGIN_ARTIFACTS` 增加 `['superpowers-plugin','@deepseek-ai/dsh-superpowers']`；既有 `synchronizeLocalPluginArtifacts` 的签名、复制及失配拒绝规则不变，新插件全部运行资源已在 lib。
- wrapper package-lock 的 root 依赖、installed 包版本和本地来源保持一致，`link !== true`。新增本地依赖需要安装时，在任务 0 允许的准备阶段/门禁外处理；不能在 verifier 内调用 npm install 来修复缺包。
- 在现有 runtime closure 文件内新增 `verifySuperpowersAssets(packageRoot:string): {skillCount:number,assetCount:number,commit:string}`，解析清单、核对固定 commit/version/15 个名字、每个原始文件 hash、安全路径及所有必需本地运行文件；错误直接抛出。读取只是验证，不运行 helper。
- `verifyRuntimeClosure({appRoot,requiredPackages})` 保留现有返回结构，默认 REQUIRED_RUNTIME_PACKAGES 纳入新包；发现实际新包时调用资源验证。测试中的明确自定义 minimal closure 不假造一个新包；实际 release 默认链不能缺新包。
- `collectManifestHashes(appRoot)` 保留现有 API 和全部旧项，增加**新技能包的整个 lib 文件集**及包根 UPSTREAM.md 的比较。ZIP 内缺正文/脚本/映射或任意字节不同均失败；不能只比较 package.json。runtime verifier 同时校验解压后的原始 hash 清单。

- [ ] **先写红测**：静态/生成 Patch 均恰好一个 superpowers；真正 `readDesktopProfileLayer` 接受新完整所有权集合并拒绝 unknown/duplicate；官方 composition 尊重用户 disabled/override，重启不强行启用。
- [ ] **先写红测**：`createRuntimeResolution` 从 wrapper installation anchor 解析新包，不写 profile links；模型 Role/Profile 保存和别的 settings 仍不变。扩展 `heal-desktop-plugins.test.js` 的 PLUGINS 断言，不发明新的 healing 程序。
- [ ] **先写红测**：真实 installed `file:` 包和来源 lib 的每个运行文件相同，新增 artifact pair 存在，package/lock/manifest 版本是 `0.1.0`。普通同步 fixture 中加入 nested skill/reference/script，证明递归复制并删除旧 installed lib 中的 stale 文件（仅既有验证用临时目录）。
- [ ] **先写红测**：closure 在缺少 `.md`、嵌套脚本、LICENSE、映射、index 或清单时失败；原始 hash 失配、manifest path traversal、链接均失败。删除/篡改单个 ZIP 对应 lib 文件的 map 后，`compareManifestHashes` 失败；完整集合成功。

```javascript
assert.deepEqual(LOCAL_PLUGIN_ARTIFACTS.find(([p]) => p === 'superpowers-plugin'),
  ['superpowers-plugin', '@deepseek-ai/dsh-superpowers']);
assert.equal(packageJson.dependencies['@deepseek-ai/dsh-superpowers'], 'file:superpowers-plugin');
assert.equal(lock.packages['node_modules/@deepseek-ai/dsh-superpowers'].version, '0.1.0');
assert.notEqual(lock.packages['node_modules/@deepseek-ai/dsh-superpowers'].link, true);
assert.equal(verifySuperpowersAssets(packageRoot).skillCount, 15);
// 在受控 fixture 删除/更改 nested skill 文件后 assert.throws(...);
```

- [ ] 执行下方相关测试，确认新集成缺失时先失败；随后在准确落点增加登记和验证，不改原先权限或上游实现。
- [ ] 通过测试后，在 gate 的同步之前新增 `['superpowers-plugin','npm',['test']]`；保留原 Models/CPA/AgentTeams gate、pnpm 防安装环境和 windowsHide。新插件不需 bundler，gate 不能联网下载依赖。
- [ ] 在 local-capability-manifest 登记 `@deepseek-ai/dsh-superpowers:0.1.0`，断言 SDK pin、固定资源、映射/Native-Team 权限回归。README 与维护表写明：官方目录/显式加载为 UPSTREAM_EQUIVALENT，DSH 映射及包装器集成为独立本地所有权；旧能力、旧回归不删除。

```powershell
node --test tests/superpowers-integration.test.js tests/local-plugin-artifacts.test.js tests/local-capability-manifest.test.js tests/heal-desktop-plugins.test.js tests/agent-teams-profile-layering.test.js tests/verify-alpha2-runtime-closure.test.js tests/verify-alpha2-zip-closure.test.js
npm run verify:upstream
git diff --check
```

预期相关测试及完整 gate 全部 exit 0；gate 内无安装/网络/模型请求/打包。记录实际测试计数，不把旧计数硬当新目标，不以源代码 marker 代替真实 SDK 行为。

**Gate:** 新包在实际 node_modules 可解析，运行资源同步无缺项，default layer 保留用户优先级，全部旧回归仍通过。开发验收记录不能写“自动匹配已可靠”或“安装包已验证”。

## Task 4: 独立真实使用验收（任务 3 后，模型/UI 测试需授权）

**Files:** 创建 `docs/superpowers/plans/2026-10-10-superpowers-harness-acceptance.md`。仅记录版本、匿名化观察和 PASS/FAIL/NOT RUN，真实会话/截图/log 不入 Git。

**Interfaces:** 消费任务 3 的已验证源码/依赖；输出显式调用、自动选择、两轮委派、窗口行为分别判定。未获得授权不能消耗模型 Token、自动点击用户应用或更改其真实配置。

- [ ] 从真实 UI 输入 `/`，选择 brainstorming，再选择 systematic-debugging；验证菜单、提交后 Host 全文与映射、可见加载状态。切换 preset / 重连后仍按官方机制刷新，不添加第二套选择器。
- [ ] 在新空白会话使用自然请求 **“做一个 React 待办清单，先确定范围再实现。”**：记录是否在代码动作前加载 brainstorming，不能只接受模型自述。
- [ ] 新会话使用 **“这个最小测试用例失败了，先定位根因，不要直接改代码。”**（附一个不含敏感数据的 scratch fixture）：记录 systematic-debugging 加载顺序。
- [ ] 负例 **“只回答 1+1 的结果，不修改任何文件，也不要派遣子智能体。”**：允许上游 using-superpowers 广泛触发，但不得因此强制建 Team、写计划/产品文件或委派。
- [ ] 如果自动未触发，显式 `/技能名` 再测：将“自动失败 / 手动通过”分别记录并告知用户；不启用新 Hook 补救，也不声称自动触发达标。
- [ ] 用户另行授权后，在 scratch 工作区分别进行 Team captain 两轮实现→独立审查→同一成员修订及 Native 两轮委派→继续。Team 依据现有 Profile 的明确 Provider/model/reasoning，检查真实子会话/回执和 gateway 记录；Native 按官方路由，不能将 Team 规则套给它。
- [ ] 覆盖 Team 成员读到 fresh-review 指令后的边界、停止/恢复、compaction 后显式重新加载；不因为 transient error 就另起同名成员或篡改质量证据。
- [ ] 对 helper 有需要时检查真实 Git Bash 与引用路径；执行不敏感最小 helper 验证无 DOS 黑窗、取消/结束无残留进程。解释器缺失时明确标记 SKIPPED/UNAVAILABLE，不能使普通技能失效。
- [ ] 记录未测模型/场景，向用户展示事实差异。所有实测只写控制面结论，不把凭据/患者/业务内容、完整 session 或安装目录绝对路径写入发布文档。

**Gate:** 显式链路真实可用；自动介入的结论来自观察，失败按用户约定可接受手动回退但必须明确标识。真实模型/两轮/UI 未执行时，交付只能称为“源码及离线回归已验证，实测待验收”。

## Task 5: 后续安装包交付（不属于当前授权）

- [ ] 用户明确要求测试包后，确定下一 wrapper 测试版本并同步 package/lock/README/集成断言/两级 release notes；保留插件 0.1.0 的准确来源。仍不升级官方宿主/AgentTeams。
- [ ] 重新跑完整 `npm run verify:upstream`，检查真实 `node_modules` 非 Junction/symlink、官方鲸鱼图标及 `signAndEditExecutable:true`。
- [ ] 获打包授权后，从真实 wrapper cwd 运行 `npm run dist:win`（其内部仍先跑完整 gate）。不能热覆盖已运行的安装目录。
- [ ] 验证 unpacked，再验证 ZIP 解压闭包与整个技能 lib 的字节集合：

```powershell
node scripts/verify-alpha2-runtime-closure.mjs --from dist/win-unpacked
node scripts/verify-alpha2-zip-closure.mjs --zip '<本次实际生成 ZIP 的完整路径>' --against dist/win-unpacked
```

ZIP 参数必须来自本次 builder 的真实结果，不猜旧安装包名。输出需包含新插件版本/15 个技能以及全部资源验证，不只输出包数。

- [ ] 列出 EXE、ZIP、blockmap 的大小、SHA-256，核对 EXE 的 `Get-AuthenticodeSignature` 结果。用户测试通过前不发版；不把安装包、缓存、会话/日志加入源码提交。
- [ ] 仅在用户另行授权时进行精确路径 staging/commit/push/release/清理。发布和清理不在此计划默认动作中。

## 自审与交付状态

- 设计 1–3 节的介入选择：任务 1、2、4；不引入强制 Hook。
- 设计 2.1 / 4 节的版本、来源与用户文件保护：Global Constraints、任务 0、1、3。
- 设计 5 / 5.1 节的映射、权限与 gateway：任务 1、2；不修改调度器。
- 设计 6 节的所有集成落点：文件表、任务 3；额外核对了新版 DESKTOP_ENTRIES 白名单，不能只增加挂载 YAML。
- 设计 7 节的离线/真实/打包证据分级：任务 1–5；所有命令是待执行检查，不是本轮已通过的结果。
- 设计 8 节的风险/回退：任务 1 的释放测试、任务 3 的用户禁用测试、任务 4 的显式回退；不回滚宿主或清理用户技能。
- Review Focus 五项均有对应测试/实测任务，接口名称前后一致；没有 placeholder 产品接口或未定义的新工具。
- 当前只交付设计和计划。批准计划并选定执行方式后才能开始 Task 0；完成本计划的编写不代表插件已安装、测试通过或安装包已生成。
