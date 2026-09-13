# AgentTeams v0.1.16-rc.1 升级与清理 Implementation Design

> 日期：2026-09-07
> 目标：升级 AgentTeams 到 v0.1.16-rc.1，移除 Session Markdown 导出，修复 woyaopro 配置

## 目标

完成三项独立但顺序执行的任务：

1. **AgentTeams 升级到 v0.1.16-rc.1**：按七步刷新流程，逐项分类本地能力，上游等价实现优先
2. **移除 Session Markdown 导出功能**：删除插件、依赖、测试、文档引用
3. **修复 woyaopro `maxTokensField` 校验错误**：将 `max_output_tokens` 改为合法值

## 架构

采用**串行三阶段**方案，每阶段完成后运行门禁验证才进入下一阶段。

```
Phase 1: AgentTeams 升级 (能力分类 + 三路合并)
    ↓ (验证门禁 pass)
Phase 2: 移除 Session Markdown (清理引用)
    ↓ (验证门禁 pass)
Phase 3: 修复 woyaopro (配置修复)
    ↓ (最终验收)
```

## 技术栈

- Git 三路合并
- PowerShell / Bash 脚本
- npm / pnpm 包管理
- TypeScript 编译
- 门禁：`npm run verify:upstream`

## 全局约束

1. **严格遵守 `AGENTS.md` 七步上游刷新流程**
2. **保留所有本地能力回归测试**，即使实现被上游替换
3. **上游等价实现优先**：本地 patch 只在上游未解决时保留
4. **每阶段必须通过门禁**才能进入下一阶段
5. **版本号、依赖、文档、provenance 同步更新**
6. **不删除用户数据**（已导出的 Markdown 文件、会话数据等）

---

## Phase 1：AgentTeams v0.1.16-rc.1 升级

### 1.1 当前状态确认

**本地 fork**：
- 路径：`win-desktop/agent-teams-plugin/`
- 版本：`0.1.15-desktop.7`
- 上游基线：`v0.1.15` / commit `232a338fc9a0d393f118912386f67e7f3a6c67d6`

**目标上游**：
- 版本：`v0.1.16-rc.1`
- Commit：`d659e5b`
- 临时源码路径：`C:\Users\spell\AppData\Local\Temp\dsh-upstream-refresh-20260907\NanmiCoder-dsh-agent-teams-d659e5b`
- 支持的 Harness 版本：`0.1.2-rc.1`（推荐）、`0.1.2-alpha.5`、`0.1.2-alpha.2`

**当前 Harness 依赖**：
- 已固定在 `dsh-v0.1.2-rc.1` / commit `a66e4702`

### 1.2 上游 v0.1.16-rc.1 主要改进

根据 `release-notes/v0.1.16-rc.1.md`，关键变更包括：

1. **新增 `src/harness-compat.ts`**：
   - 统一旧宿主（legacy setup）和新宿主（synchronous modern session setup）契约
   - 接收器安全调用
   - 拥有会话事件（own session events）
   - FIFO 延续队列
   - 退役成员交付守护

2. **Fallback 配置持久化**：
   - 手动添加成员时持久化 fallback 设置
   - 冷启动后恢复活跃 fallback 路由

3. **通知驱动协调**：
   - 移除 "重复轮询进度" 的指导
   - 对齐 status 工具和 captain 指令

4. **安全重分配**：
   - 要求 captain 使用安全重分配，而非代表成员声明任务
   - 保留对已激活 captain 接管的幂等读取

5. **Web 请求边界**：
   - 按字节限制 plan 和 halt JSON 请求
   - 拒绝畸形/非对象体
   - 保留 Connection 认证门禁

6. **UI 改进**：
   - 活动面板可调整大小
   - 活跃模型徽章
   - 工作指示器
   - 客户端服务声明

7. **Parked member/attempt 恢复**

### 1.3 本地能力分类（逐项对照 UPSTREAM_MAINTENANCE.md）

按照 `docs/UPSTREAM_MAINTENANCE.md` 的 "AgentTeams owner" 章节，当前本地能力包括：

**A. 核心能力集**：
- Harness-native `子智能体` 设置区
- 共享 Provider/模型目录（包括 CPA、OpenCode）
- 角色级 `provider`/`model`/`reasoning_mode` 策略
- 紧凑生命周期优先的 captain 提示词
- 空白可选 Profile 规范化
- 严格未知 Profile 拒绝
- Team/Native 路由标记
- 原生工具抑制
- 成员声明兼容性
- Captain/共享池任务所有权
- 干净的非活跃状态探测
- 质量保留只读状态摘要
- 显式邮箱确认
- Captain 独占恢复唤醒
- 需求依赖的实现排队
- 分阶段完整合同编辑
- 可操作的交付物范围验证
- 显式无变更证据
- V2 安全任务输入规范化
- 持久任务/成员/尝试生命周期
- 持久会话子智能体网关

**B. Profile 能力**：
- 持久化命名 Profiles
- 内置 `software-delivery` 角色卡
- 严格 Profile/Team `schemaVersion: 2`
- 旧数据拒绝（无迁移）
- Profile 编辑器和重启注入

**分类标准**：

| 上游变更 | 本地能力 | 分类结果 | 行动 |
|---------|---------|---------|------|
| `src/harness-compat.ts` 新增 | 宿主适配、会话事件、FIFO | **UPSTREAM_EQUIVALENT** | 使用上游实现，删除本地宿主适配 patch（如有） |
| Fallback 持久化 | Fallback 配置 | **UPSTREAM_EQUIVALENT** | 使用上游实现 |
| 通知驱动协调 | Status 工具、captain 提示词 | **UPSTREAM_EQUIVALENT** | 使用上游实现，移除轮询指导 |
| 安全重分配 | 成员声明兼容性 | **UPSTREAM_EQUIVALENT** | 使用上游实现 |
| Bounded JSON | Web routes 边界 | **UPSTREAM_EQUIVALENT** | 使用上游实现 |
| Parked member 恢复 | 生命周期 | **UPSTREAM_EQUIVALENT** | 使用上游实现 |
| UI 改进 | 活动面板、徽章、指示器 | **UPSTREAM_EQUIVALENT** | 使用上游实现 |
| - | 角色级 provider/model/reasoning 策略 | **REAPPLY** | 保留本地实现 |
| - | 严格 V2 persistence | **REAPPLY** | 保留本地实现 |
| - | 质量门禁 | **REAPPLY** | 保留本地实现 |
| - | 共享模型目录（CPA/OpenCode） | **REAPPLY** | 保留本地实现 |
| - | 紧凑 captain 提示词（3500 字符预算） | **REAPPLY** | 保留本地实现 |
| - | Team/Native 路由标记 | **REAPPLY** | 保留本地实现 |
| - | 持久会话子智能体网关 | **REAPPLY** | 保留本地实现 |
| - | Profile 编辑器和桌面集成 | **REAPPLY** | 保留本地实现 |

**预判关键冲突点**：
1. `src/harness-compat.ts` 是否与本地 `src/host-model-catalog.ts` 冲突？
2. 上游通知驱动是否与本地 `src/status-render.ts` Token 优化冲突？
3. 上游 UI 改进是否与本地 `src/client/AgentTeamsSettingsSection.tsx` 冲突？

### 1.4 三路合并执行步骤

**输入**：
- **Base**（共同祖先）：上游 `v0.1.15` / commit `232a338`
- **Ours**（本地分支）：`win-desktop/agent-teams-plugin` / `0.1.15-desktop.7`
- **Theirs**（上游新版）：临时目录中的 `v0.1.16-rc.1`

**步骤**：
1. 备份当前本地插件目录
2. 将上游 `v0.1.16-rc.1` 完整内容复制到 `win-desktop/agent-teams-plugin/`
3. 逐文件对比，识别需要 REAPPLY 的本地能力
4. 重新应用本地 patch：
   - `src/settings.ts`：角色级策略
   - `src/quality-gates.ts`：质量门禁
   - `src/host-model-catalog.ts`：共享目录
   - `src/tools.ts`：紧凑提示词
   - `src/routing-policy.ts`：Team/Native 标记
   - `src/subagent-gateway.ts`：持久会话网关
   - `src/client/AgentTeamsSettingsSection.tsx`：Profile 编辑器
5. 保留所有回归测试（即使实现已被上游替换）

**冲突解决原则**：
- 优先使用上游代码
- 仅在上游缺失时保留本地代码
- 保留本地测试验证上游实现

### 1.5 版本同步更新

需要同步修改的文件：

1. **`win-desktop/agent-teams-plugin/package.json`**：
   ```json
   {
     "name": "@nanmicoder/dsh-agent-teams",
     "version": "0.1.16-rc.1"
   }
   ```

2. **`win-desktop/package.json`**：
   - 依赖路径不变：`"@nanmicoder/dsh-agent-teams": "file:agent-teams-plugin"`
   - 添加注释说明当前版本

3. **`win-desktop/README.md`**：
   - 更新 AgentTeams 版本号为 `v0.1.16-rc.1`

4. **`docs/UPSTREAM_MAINTENANCE.md`**：
   - "Current local identities" 章节：
     ```markdown
     - AgentTeams fork: `0.1.16-rc.1`, based on upstream `v0.1.16-rc.1` at fixed commit `d659e5b`
     ```
   - 更新 "AgentTeams owner" 表格，标注分类结果

5. **`win-desktop/agent-teams-plugin/UPSTREAM.md`**（如有）：
   - 记录上游版本和 commit

### 1.6 门禁验证

```powershell
cd win-desktop
npm run verify:upstream
```

**预期结果**：
- 所有 AgentTeams 插件测试通过
- Wrapper 集成测试通过
- 无新的 TypeScript 错误

**如果失败**：
- 检查是否有遗漏的 REAPPLY 能力
- 检查测试是否需要适配新 API
- 不得删除或弱化回归测试

---

## Phase 2：移除 Session Markdown 导出

### 2.1 识别所有引用

**插件目录**：
- `win-desktop/session-markdown-export-plugin/`

**依赖声明**：
- `win-desktop/package.json`：
  ```json
  "@deepseek-ai/dsh-session-markdown-export": "file:session-markdown-export-plugin"
  ```

**配置引用**：
- `win-desktop/config/agent-teams.patch.yml`（检查是否有引用）
- `win-desktop/src/dsh-service.js`（检查是否有加载逻辑）

**测试文件**：
- `win-desktop/tests/session-markdown-export-integration.test.js`

**文档引用**：
- `win-desktop/README.md`
- `docs/UPSTREAM_MAINTENANCE.md`："Session Markdown owner" 章节
- `win-desktop/scripts/verify-upstream-regressions.mjs`（测试调用）

**门禁脚本**：
- `win-desktop/scripts/sync-local-plugin-artifacts.mjs`（可能有同步逻辑）

### 2.2 删除步骤

1. **删除插件目录**：
   ```powershell
   Remove-Item -LiteralPath 'win-desktop\session-markdown-export-plugin' -Recurse -Force
   ```

2. **删除 package.json 依赖**：
   - 移除 `"@deepseek-ai/dsh-session-markdown-export"` 行

3. **删除测试文件**：
   ```powershell
   Remove-Item -LiteralPath 'win-desktop\tests\session-markdown-export-integration.test.js' -Force
   ```

4. **清理配置引用**：
   - 检查 `config/agent-teams.patch.yml`，移除相关插件加载配置
   - 检查 `src/dsh-service.js`，移除加载逻辑

5. **清理文档引用**：
   - `win-desktop/README.md`：移除 Session Markdown 功能说明
   - `docs/UPSTREAM_MAINTENANCE.md`：删除 "Session Markdown owner" 整个章节

6. **清理脚本引用**：
   - `scripts/verify-upstream-regressions.mjs`：移除相关测试调用
   - `scripts/sync-local-plugin-artifacts.mjs`：移除同步逻辑（如有）

### 2.3 验证清理完成

**搜索残留引用**：
```powershell
rg -n 'session.*markdown.*export|dsh-session-markdown-export' win-desktop -g '!node_modules' -g '!package-lock.json'
```

**预期结果**：无匹配（或仅在 CHANGELOG/历史文档中）

**门禁验证**：
```powershell
cd win-desktop
npm run verify:upstream
```

必须通过，无与 Session Markdown 相关的测试失败。

---

## Phase 3：修复 woyaopro maxTokensField

### 3.1 定位配置文件

**错误信息**：
```
$.providers.woyaopro.models[5].compat.maxTokensField expected "max_completion_tokens" | "max_tokens" but got "max_output_tokens"
```

**定位策略**：

1. **搜索 woyaopro 配置**：
   ```powershell
   rg -n 'woyaopro' win-desktop --type-add 'json:*.json' --type-add 'yaml:*.{yml,yaml}' -g '!node_modules' -g '!package-lock.json'
   ```

2. **可能位置**：
   - `win-desktop/src/dsh-service.js`（硬编码配置）
   - `win-desktop/config/`（YAML 配置）
   - 用户设置目录（通常在 `%LOCALAPPDATA%` 或 `%USERPROFILE%`）
   - `win-desktop/src/model-fetcher.js`（模型目录加载）

3. **如果是用户设置**：
   - 需要检查 CPA/Models 插件的设置加载路径
   - 可能在 `~/.config/deepseek-harness/` 或类似位置

### 3.2 修复方案

**问题分析**：
- `max_output_tokens` 是非标准字段（可能是某个模型的特定命名）
- 标准字段：
  - `max_completion_tokens`（OpenAI 新标准，GPT-4 等）
  - `max_tokens`（通用标准，大多数模型）

**修复规则**：
- **优先使用 `max_completion_tokens`**（符合 OpenAI 最新规范）
- 如果模型明确不支持 `max_completion_tokens`，使用 `max_tokens`

**操作**：
找到 `providers.woyaopro.models[5].compat.maxTokensField`，将值从 `"max_output_tokens"` 改为 `"max_completion_tokens"`。

### 3.3 验证

1. **重新启动应用**：
   ```powershell
   cd win-desktop
   npm start
   ```

2. **检查控制台**：
   - 无 `maxTokensField` 校验错误

3. **运行相关测试**（如有）：
   ```powershell
   npm test -- --grep woyaopro
   ```

---

## 最终验收标准

### ✅ 必须满足的条件

1. **完整门禁通过**：
   ```powershell
   cd win-desktop
   npm run verify:upstream
   ```
   所有测试 pass，无错误。

2. **三项任务均有 Git commit 证据**：
   - Commit 1: `feat(agent-teams): upgrade to v0.1.16-rc.1 with capability classification`
   - Commit 2: `refactor: remove session markdown export plugin`
   - Commit 3: `fix(woyaopro): correct maxTokensField to max_completion_tokens`

3. **文档同步更新**：
   - `docs/UPSTREAM_MAINTENANCE.md` 已更新 AgentTeams 版本和分类结果
   - `win-desktop/README.md` 已更新版本号
   - Session Markdown 相关文档已清理

4. **无破坏性变更**：
   - 保留所有本地能力回归测试
   - 用户数据未被删除

5. **woyaopro 配置已修复**：
   - 启动无校验错误

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 上游 API 变更导致本地 patch 失效 | 中 | 高 | 逐文件对比，保留回归测试验证 |
| 门禁失败难以定位 | 低 | 中 | 分阶段执行，每阶段独立验证 |
| woyaopro 配置位置未知 | 低 | 低 | 全局搜索 + 运行时日志定位 |
| Session Markdown 残留引用 | 低 | 低 | 使用 ripgrep 全局搜索验证 |

---

## 附录：关键文件清单

### AgentTeams 插件关键文件

**需要 REAPPLY 的本地能力文件**：
- `src/settings.ts`
- `src/quality-gates.ts`
- `src/host-model-catalog.ts`
- `src/tools.ts`
- `src/routing-policy.ts`
- `src/subagent-gateway.ts`
- `src/client/AgentTeamsSettingsSection.tsx`
- `src/selection-policy.ts`
- `src/status-render.ts`
- `src/members.ts`
- `src/scheduler.ts`
- `src/agent-identity.ts`

**回归测试文件**：
- `pnpm test`（插件内部测试）
- `scripts/verify.mjs`
- `scripts/subagent-gateway-tdd.mjs`
- `scripts/lifecycle-verify.mjs`
- `scripts/quality-gates-tdd.mjs`
- `scripts/web-routes-verify.mjs`
- `scripts/profile-editor-verify.mjs`
- `scripts/settings-client-verify.mjs`

**Wrapper 集成测试**：
- `tests/agent-teams-integration.test.js`
- `tests/heal-desktop-plugins.test.js`
- `tests/win-hide-console.test.js`

### Session Markdown 清理清单

**需要删除的目录/文件**：
- `win-desktop/session-markdown-export-plugin/`（整个目录）
- `win-desktop/tests/session-markdown-export-integration.test.js`

**需要编辑的文件**：
- `win-desktop/package.json`（移除依赖项）
- `win-desktop/config/agent-teams.patch.yml`（检查并清理）
- `win-desktop/src/dsh-service.js`（检查并清理）
- `win-desktop/README.md`（移除功能说明）
- `docs/UPSTREAM_MAINTENANCE.md`（删除章节）
- `win-desktop/scripts/verify-upstream-regressions.mjs`（移除测试调用）
- `win-desktop/scripts/sync-local-plugin-artifacts.mjs`（检查并清理）

### woyaopro 配置可能位置

- `win-desktop/src/dsh-service.js`
- `win-desktop/src/model-fetcher.js`
- `win-desktop/config/*.yml`
- 用户设置目录（需运行时定位）
