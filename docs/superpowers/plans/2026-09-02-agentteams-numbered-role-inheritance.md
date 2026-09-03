# AgentTeams 编号角色模型继承实施计划

## 目标

修复动态新增规则角色只继承队长模型的问题，让所有基础角色的编号实例从
当前 Team 快照继承完整模型策略，同时保留显式配置和真正自定义角色行为。

## 阶段 1：先建立失败回归

- 修改 `win-desktop/agent-teams-plugin/scripts/selection-policy-verify.mjs`，
  增加任意基础角色的多位数编号、分隔符、显式覆盖、描述后备、歧义和未匹配场景。
- 修改 `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`，使用真实
  `agent_teams_add_member` 验证基础四角色及多个编号实例的持久化路由。
- 运行现有编译产物上的定向测试，确认新测试因缺少实现而失败。

## 阶段 2：最小实现

- 在 `win-desktop/agent-teams-plugin/src/selection-policy.ts` 增加纯函数
  `findMemberRoleTemplate`，规范化大小写、空白和 `-/_/空格` 分隔的正整数后缀。
- 名称去编号后优先只匹配未编号基础成员；基础成员不存在时按完整 role 描述
  唯一匹配；多候选返回 `ambiguous`，不自行选路由。
- 在 `win-desktop/agent-teams-plugin/src/tools.ts` 的
  `agent_teams_add_member` 中，仅在模型调用未提供任何模型/思考选择时读取
  `fresh.members` 做模板继承；显式参数保持原有优先级。
- 继承的 `target-default` / `route-aware` 不把已物化的非 explicit effort 当作
  新的显式覆盖；`explicit` 角色保留其 effort。

## 阶段 3：验证与产物

- 构建 AgentTeams `src -> lib`，运行选择策略和生命周期回归。
- 运行 AgentTeams `pnpm verify`；失败时只定位并重跑受影响验证。
- 运行 `win-desktop` 现有 `npm run verify:upstream`，确认上游门禁与所有既有
  兼容层回归不受影响。
- 检查 `git diff --check` 和工作区状态；不改真实用户配置、`.agent-teams`、
  凭据或打包产物。

## 完成条件

- 新增编号角色从正确基础角色继承，测试能证明 `reviewer3` 不会继承
  `reviewer2` 的配置。
- 显式、route-aware、target-default、自定义和歧义路径均有回归证据。
- 源码与生成 `lib` 一致，所有受影响门禁通过。
