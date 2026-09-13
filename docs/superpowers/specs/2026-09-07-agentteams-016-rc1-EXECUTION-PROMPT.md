# AgentTeams v0.1.16-rc.1 升级执行话术

**重要说明**：此话术是完全自包含的，可在新对话中独立执行，无需依赖本对话的上下文。

---

## 执行目标

在项目 `D:\Trae\其他\deepseek-harness` 中完成三项任务：

1. **AgentTeams 插件升级到 v0.1.16-rc.1**：按七步上游刷新流程，逐项分类本地能力，上游等价实现优先
2. **移除 Session Markdown 导出功能**：删除插件、依赖、测试、文档引用
3. **修复 woyaopro `maxTokensField` 校验错误**：将 `max_output_tokens` 改为合法值

---

## 背景上下文

### 项目结构

- **主目录**：`D:\Trae\其他\deepseek-harness`
- **桌面包装器**：`win-desktop/`
- **当前分支**：`codex/unified-model-capability-compatibility`
- **当前 Harness 版本**：`dsh-v0.1.2-rc.1`
- **当前 Wrapper 版本**：`0.1.2-rc.8`

### AgentTeams 插件当前状态

- **本地 fork 路径**：`win-desktop/agent-teams-plugin/`
- **当前版本**：`0.1.15-desktop.7`
- **上游基线**：`v0.1.15` / commit `232a338fc9a0d393f118912386f67e7f3a6c67d6`
- **目标版本**：`v0.1.16-rc.1` / commit `d659e5b`
- **上游源码位置**：`C:\Users\spell\AppData\Local\Temp\dsh-upstream-refresh-20260907\NanmiCoder-dsh-agent-teams-d659e5b`

### Session Markdown 导出插件当前状态

- **插件路径**：`win-desktop/session-markdown-export-plugin/`
- **当前版本**：`0.1.1`
- **package.json 依赖名**：`@deepseek-ai/dsh-session-markdown-export`

### woyaopro 错误

**错误信息**：
```
$.providers.woyaopro.models[5].compat.maxTokensField expected "max_completion_tokens" | "max_tokens" but got "max_output_tokens"
```

### 七步上游刷新流程

根据 `docs/UPSTREAM_MAINTENANCE.md`：

1. 创建隔离 worktree（可选，根据需要）
2. 运行当前门禁基线验证
3. 对比新上游源码，逐项分类每个本地能力
4. 导入上游变更，重新应用或迁移本地能力
5. 同步更新版本号、依赖、锁文件、README、provenance
6. 运行 `npm run verify:upstream` 门禁
7. 审查 diff 是否包含敏感信息

### 本地能力分类标准

- **UPSTREAM_EQUIVALENT**：上游已实现相同可观察行为 → 使用上游，保留测试验证
- **REAPPLY**：上游未实现 → 保留本地实现
- **SUPERSEDED_BY_DESIGN**：架构变更但需求仍存在 → 迁移到新架构，保留测试

---

## 执行计划

### Phase 1：AgentTeams v0.1.16-rc.1 升级

#### 步骤 1.1：基线门禁验证

**在 `win-desktop/` 目录下运行**：
```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop
npm run verify:upstream
```

**预期结果**：所有测试通过

**如果失败**：停止，报告失败原因，等待用户修复后再继续。

---

#### 步骤 1.2：读取上游 v0.1.16-rc.1 源码

**读取以下关键文件**（位于 `C:\Users\spell\AppData\Local\Temp\dsh-upstream-refresh-20260907\NanmiCoder-dsh-agent-teams-d659e5b`）：

1. **package.json**：确认版本号
2. **release-notes/v0.1.16-rc.1.md**：了解主要变更
3. **src/harness-compat.ts**（新增文件）：宿主适配器
4. **src/tools.ts**：检查通知驱动协调
5. **src/members.ts**：检查 parked member 恢复
6. **src/settings.ts**：检查 fallback 持久化
7. **src/web-routes.ts**：检查 bounded JSON
8. **src/client/**：检查 UI 改进（面板调整、徽章、指示器）

---

#### 步骤 1.3：本地能力分类

**对照 `docs/UPSTREAM_MAINTENANCE.md` 的 "AgentTeams owner" 章节**，逐项分类以下本地能力：

**需要分类的本地能力清单**：
1. 宿主适配、会话事件、FIFO
2. Fallback 配置持久化
3. 通知驱动协调（移除轮询指导）
4. 安全重分配
5. Web routes bounded JSON
6. Parked member/attempt 恢复
7. UI 改进（活动面板、徽章、指示器）
8. 角色级 provider/model/reasoning 策略
9. 严格 V2 persistence
10. 质量门禁
11. 共享模型目录（CPA/OpenCode）
12. 紧凑 captain 提示词（3500 字符预算）
13. Team/Native 路由标记
14. 持久会话子智能体网关
15. Profile 编辑器和桌面集成

**分类方法**：
- 读取上游源码中对应的实现
- 读取本地 `win-desktop/agent-teams-plugin/` 中的实现
- 判断上游是否已包含相同功能
- 记录分类结果（UPSTREAM_EQUIVALENT / REAPPLY）

**输出**：生成一份分类表格，格式如下：

```markdown
| 能力 | 上游状态 | 分类结果 | 行动 |
|------|---------|---------|------|
| 宿主适配 | src/harness-compat.ts 新增 | UPSTREAM_EQUIVALENT | 使用上游 |
| 角色级策略 | 未发现 | REAPPLY | 保留本地 |
| ... | ... | ... | ... |
```

---

#### 步骤 1.4：三路合并执行

**备份本地插件**：
```powershell
Copy-Item -Path 'D:\Trae\其他\deepseek-harness\win-desktop\agent-teams-plugin' -Destination 'D:\Trae\其他\deepseek-harness\win-desktop\agent-teams-plugin.backup' -Recurse
```

**导入上游代码**：
```powershell
# 清空当前插件目录（保留 .git 如果有）
Remove-Item -Path 'D:\Trae\其他\deepseek-harness\win-desktop\agent-teams-plugin\*' -Recurse -Force -Exclude '.git'

# 复制上游代码
Copy-Item -Path 'C:\Users\spell\AppData\Local\Temp\dsh-upstream-refresh-20260907\NanmiCoder-dsh-agent-teams-d659e5b\*' -Destination 'D:\Trae\其他\deepseek-harness\win-desktop\agent-teams-plugin\' -Recurse
```

**重新应用 REAPPLY 能力**：

根据步骤 1.3 的分类结果，逐文件对比并重新应用本地 patch。

**关键文件**（从备份中恢复或手动合并）：
- `src/settings.ts`：角色级策略
- `src/quality-gates.ts`：质量门禁
- `src/host-model-catalog.ts`：共享目录
- `src/tools.ts`：紧凑提示词
- `src/routing-policy.ts`：Team/Native 标记
- `src/subagent-gateway.ts`：持久会话网关
- `src/client/AgentTeamsSettingsSection.tsx`：Profile 编辑器
- `src/selection-policy.ts`
- `src/status-render.ts`
- `src/members.ts`
- `src/scheduler.ts`
- `src/agent-identity.ts`

**保留所有回归测试文件**（即使实现被上游替换）。

---

#### 步骤 1.5：版本同步更新

**更新以下文件**：

1. **`win-desktop/agent-teams-plugin/package.json`**：
   ```json
   {
     "name": "@nanmicoder/dsh-agent-teams",
     "version": "0.1.16-rc.1"
   }
   ```

2. **`win-desktop/README.md`**：
   - 搜索 AgentTeams 版本号引用，更新为 `v0.1.16-rc.1`

3. **`docs/UPSTREAM_MAINTENANCE.md`**：
   - 找到 "Current local identities" 章节
   - 更新为：
     ```markdown
     - AgentTeams fork: `0.1.16-rc.1`, based on upstream `v0.1.16-rc.1` at fixed commit `d659e5b`
     ```
   - 更新 "AgentTeams owner" 表格，添加分类结果注释

4. **`win-desktop/agent-teams-plugin/UPSTREAM.md`**（如果存在）：
   - 记录上游版本和 commit

---

#### 步骤 1.6：门禁验证

```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop
npm run verify:upstream
```

**预期结果**：所有测试通过

**如果失败**：
- 检查是否有遗漏的 REAPPLY 能力
- 检查测试是否需要适配新 API
- **不得删除或弱化回归测试**
- 修复后重新运行门禁

---

#### 步骤 1.7：Git 提交

```powershell
cd D:\Trae\其他\deepseek-harness
git add win-desktop/agent-teams-plugin docs/UPSTREAM_MAINTENANCE.md win-desktop/README.md
git commit -m "feat(agent-teams): upgrade to v0.1.16-rc.1 with capability classification

- Import upstream v0.1.16-rc.1 (commit d659e5b)
- Use upstream harness-compat, fallback persistence, notification-driven coordination
- Reapply local role-level policy, V2 persistence, quality gates, shared catalog
- Update docs/UPSTREAM_MAINTENANCE.md with classification results
- All verify:upstream tests pass"
```

---

### Phase 2：移除 Session Markdown 导出

#### 步骤 2.1：识别所有引用

**搜索所有 Session Markdown 引用**：
```powershell
cd D:\Trae\其他\deepseek-harness
rg -n 'session.*markdown.*export|dsh-session-markdown-export' win-desktop -g '!node_modules' -g '!package-lock.json'
```

**记录所有匹配项**。

---

#### 步骤 2.2：删除插件和依赖

**删除插件目录**：
```powershell
Remove-Item -LiteralPath 'D:\Trae\其他\deepseek-harness\win-desktop\session-markdown-export-plugin' -Recurse -Force
```

**删除测试文件**：
```powershell
Remove-Item -LiteralPath 'D:\Trae\其他\deepseek-harness\win-desktop\tests\session-markdown-export-integration.test.js' -Force
```

**编辑 `win-desktop/package.json`**：
- 移除依赖项：`"@deepseek-ai/dsh-session-markdown-export": "file:session-markdown-export-plugin"`

---

#### 步骤 2.3：清理配置和文档引用

**检查并清理以下文件**：

1. **`win-desktop/config/agent-teams.patch.yml`**：
   - 搜索 `session-markdown-export`
   - 移除相关插件加载配置

2. **`win-desktop/src/dsh-service.js`**：
   - 搜索 `session-markdown-export`
   - 移除加载逻辑

3. **`win-desktop/README.md`**：
   - 移除 Session Markdown 功能说明

4. **`docs/UPSTREAM_MAINTENANCE.md`**：
   - 删除 "Session Markdown owner" 整个章节

5. **`win-desktop/scripts/verify-upstream-regressions.mjs`**：
   - 移除 Session Markdown 测试调用

6. **`win-desktop/scripts/sync-local-plugin-artifacts.mjs`**：
   - 检查并移除 Session Markdown 同步逻辑（如有）

---

#### 步骤 2.4：验证清理完成

**搜索残留引用**：
```powershell
cd D:\Trae\其他\deepseek-harness
rg -n 'session.*markdown.*export|dsh-session-markdown-export' win-desktop -g '!node_modules' -g '!package-lock.json'
```

**预期结果**：无匹配（或仅在 CHANGELOG/历史文档中）

**门禁验证**：
```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop
npm run verify:upstream
```

**预期结果**：所有测试通过，无与 Session Markdown 相关的测试失败

---

#### 步骤 2.5：Git 提交

```powershell
cd D:\Trae\其他\deepseek-harness
git add -A
git commit -m "refactor: remove session markdown export plugin

- Delete session-markdown-export-plugin directory
- Remove dependency from package.json
- Clean up config, tests, and documentation references
- Update UPSTREAM_MAINTENANCE.md
- All verify:upstream tests pass"
```

---

### Phase 3：修复 woyaopro maxTokensField

#### 步骤 3.1：定位配置文件

**搜索 woyaopro 配置**：
```powershell
cd D:\Trae\其他\deepseek-harness
rg -n 'woyaopro' win-desktop --type-add 'json:*.json' --type-add 'yaml:*.{yml,yaml}' -g '!node_modules' -g '!package-lock.json'
```

**检查可能位置**：
1. `win-desktop/src/dsh-service.js`
2. `win-desktop/src/model-fetcher.js`
3. `win-desktop/config/*.yml`
4. 用户设置目录（如果是运行时生成的）

**读取匹配的文件**，找到包含 `max_output_tokens` 的配置项。

---

#### 步骤 3.2：修复字段值

**找到 `providers.woyaopro.models[5].compat.maxTokensField`**，将值从 `"max_output_tokens"` 改为 `"max_completion_tokens"`。

**示例**：
```json
{
  "providers": {
    "woyaopro": {
      "models": [
        ...
        {
          "compat": {
            "maxTokensField": "max_completion_tokens"  // 从 "max_output_tokens" 改为此值
          }
        }
      ]
    }
  }
}
```

---

#### 步骤 3.3：验证修复

**重新启动应用**（如果正在运行）：
```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop
npm start
```

**检查控制台**：无 `maxTokensField` 校验错误

**运行相关测试**（如有）：
```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop
npm test -- --grep woyaopro
```

---

#### 步骤 3.4：Git 提交

```powershell
cd D:\Trae\其他\deepseek-harness
git add <修改的文件>
git commit -m "fix(woyaopro): correct maxTokensField to max_completion_tokens

- Change models[5].compat.maxTokensField from max_output_tokens to max_completion_tokens
- Comply with OpenAI standard field naming
- No validation errors on startup"
```

---

## 最终验收

### 验收清单

- [ ] Phase 1: AgentTeams 升级完成，门禁通过
- [ ] Phase 2: Session Markdown 删除完成，门禁通过
- [ ] Phase 3: woyaopro 修复完成，无校验错误
- [ ] 三项任务均有独立 Git commit
- [ ] `docs/UPSTREAM_MAINTENANCE.md` 已更新
- [ ] `win-desktop/README.md` 已更新
- [ ] 完整门禁通过：`npm run verify:upstream`

### 最终报告格式

请按以下格式提供最终报告：

```markdown
## 执行结果

### Phase 1: AgentTeams v0.1.16-rc.1 升级
- ✅ 基线门禁通过
- ✅ 能力分类完成（X 个 UPSTREAM_EQUIVALENT，Y 个 REAPPLY）
- ✅ 三路合并完成
- ✅ 版本同步更新完成
- ✅ 门禁验证通过
- ✅ Git commit: <commit hash>

### Phase 2: 移除 Session Markdown 导出
- ✅ 插件目录删除
- ✅ 依赖项清理
- ✅ 配置和文档清理
- ✅ 残留引用验证（0 处）
- ✅ 门禁验证通过
- ✅ Git commit: <commit hash>

### Phase 3: 修复 woyaopro maxTokensField
- ✅ 配置文件定位：<文件路径>
- ✅ 字段值修复
- ✅ 启动验证（无错误）
- ✅ Git commit: <commit hash>

### 最终验收
- ✅ 完整门禁通过
- ✅ 所有文档已更新
- ✅ 三个独立 commit 已创建

## 能力分类表格（Phase 1 输出）
<此处粘贴分类表格>
```

---

## 注意事项

1. **严格遵守七步刷新流程**
2. **每个 Phase 必须通过门禁才能进入下一 Phase**
3. **不得删除或弱化回归测试**
4. **上游等价实现优先**
5. **保留用户数据**（已导出的 Markdown 文件等）
6. **如果遇到冲突或失败，停止并报告，不要强行继续**

---

## 可选：使用 worktree 隔离工作

如果您希望在隔离环境中工作，可以先创建 worktree：

```powershell
cd D:\Trae\其他\deepseek-harness
git worktree add .worktrees/agentteams-016-upgrade -b temp/agentteams-016-upgrade
cd .worktrees/agentteams-016-upgrade/win-desktop
npm install
```

然后在该 worktree 中执行 Phase 1-3。

完成后合并回主分支：

```powershell
cd D:\Trae\其他\deepseek-harness
git merge temp/agentteams-016-upgrade
git worktree remove .worktrees/agentteams-016-upgrade
git branch -d temp/agentteams-016-upgrade
```

---

## 结束语

此话术包含了所有必要的上下文、步骤和验证标准。您可以将此话术复制到新对话中，执行智能体将能够独立完成所有三项任务。

如有疑问或遇到阻塞，请停止执行并向用户报告具体问题。
