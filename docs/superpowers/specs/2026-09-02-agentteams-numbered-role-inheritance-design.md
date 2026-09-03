# AgentTeams 编号角色模型继承设计

状态：实现中。

## 问题

`agent_teams_add_member` 新增 `reviewer2`、`reviewer3` 或其他编号角色时，
当前只在请求参数中寻找 Provider/模型。参数为空时会直接使用队长路由，
导致同一 Profile 的角色模型策略在第二个及后续成员上失效。

## 目标

- 对所有规则角色统一支持无界的正整数编号后缀：任意基础角色名加数字，
  以及 `role-2`、`role_2`、`role 2` 等分隔写法。
- 从当前 Team 已持久化成员快照匹配未编号基础角色，继承其 Provider、模型、
  reasoning mode、显式 reasoning effort 和 fallback。
- 基础角色匹配优先于其他编号成员，确保 `reviewer3` 不会被先创建的
  `reviewer2` 的临时配置覆盖。
- 当名称无法匹配时保持现有自定义角色语义：未提供模型则使用队长路由。
- 调用者显式提供 Provider、模型、reasoning mode 或 reasoning effort 时，显式
  配置优先，不进行模板继承。
- 角色描述相同可作为名称匹配失败后的后备匹配；多个候选无法唯一确定时拒绝，
  要求显式配置，避免随机选路由。

## 边界

匹配只消费当前 Team 的冻结成员快照，不重新读取或改变全局 Profile，不热切换
已有成员，不增加旧 Team/对话迁移层。角色匹配保持 Provider 中立，不加入 CPA、
OpenCode 或模型名称判断。所有原有 `target-default`、`route-aware` 和 `explicit`
选择规则仍由 `selectMemberCandidate` 与 `resolveCallConfig` 最终校验。

## 验收

- `reviewer2`、`reviewer3`、`analyst2`、`implementer2`、`tester2` 继承各自基础
  角色的路由和 reasoning 策略；更高编号同样成立。
- 显式 Provider/模型/思考配置覆盖匹配到的基础角色。
- 无匹配的自定义编号角色仍继承队长路由。
- role 描述后备匹配可用，歧义匹配 fail-closed。
- 纯策略测试、实际 `agent_teams_add_member` 生命周期回归和 AgentTeams 完整
  构建验证通过。
