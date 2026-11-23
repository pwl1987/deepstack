# 宿主验证记录

这是一份 2026-11-22 在 macOS Apple Silicon 上进行的点时验证记录。它描述实际运行过的表面和限制，不替代持续集成，也不代表所有模型、账号或宿主版本都通过。

统一测试输入和能力状态见 [宿主路由基准](../evals/host-routing-benchmark.json) 与 [能力矩阵](../evals/host-capabilities.json)。

| 宿主 | 版本 | 验证内容 | 结果 | 边界 |
|---|---|---|---|---|
| Claude Code | 2.1.330 | 使用插件目录运行只读自然语言任务，检查自动路由、范围和证据契约 | 通过 | 出现一次模型不可识别警告，但任务成功完成 |
| Codex CLI | 0.171.0 | 刷新 `deepstack@deepstack` 到 `0.2.2`，用原生 `$deepstack` 在临时项目执行只读路由探针 | 通过 | 返回五字段；未确认宿主是否始终暴露确定性预检脚本 |
| Pi Agent | 1.6.0 | 刷新用户技能后用原生 `/skill:deepstack` 执行只读路由探针 | 通过 | 旧用户技能曾把同一输入误路由为 `feature`；刷新后临时项目保持 clean |
| ZCode | 3.19.1 | 用带 `#分支` 的 Git URL 安装包含 `7ae2525` 的 `0.2.2`，在临时本地 Git 仓库执行高风险只读探针 | 部分通过（本地路由） | 临时本地仓库保持 clean，返回 `UNVERIFIED + investigation + L2 + SAME_MODEL_REVIEW + 未确认`；历史 Comet 集成探针曾产生删除变更，但 Comet 不属于 DeepStack 支持面 |
| MiniMax Code | 3.1.17 | 在独立临时项目中用当前本机插件执行高风险只读路由探针 | 路由未通过（模型策略字段通过） | 当前本机插件为 `0.2.1`；返回 `L2 + SAME_MODEL_REVIEW + 未确认`，但路由为 `feature` 而非探针规则要求的 `investigation`。临时项目保持 clean，`0.2.2` 尚未在 MiniMax 重载验证 |

## 原生 Goal 与会话恢复专项核验

这组结果来自 2026-11-22 至 2026-11-23 的 Mac 点时测试。`原生 Goal` 表示界面或命令本身提供目标/计划/任务能力；`可恢复会话`表示用真实会话 ID 或会话文件开始一轮，再在下一轮恢复并读回标记。两者不能混为一谈。

| 宿主 | 原生能力观察 | 可恢复性证据 | 结论 |
|---|---|---|---|
| Claude Code 2.1.330 | `--permission-mode plan`、会话持久化、`--resume`、`--continue` 和后台会话 | 本机临时会话两轮读回 `GOAL_PROBE_CLAUDE_20261122` | 可恢复会话确认；原生 Goal 对象未单独观察 |
| Codex CLI 0.171.0 | `codex exec resume` 和持久线程 | 本机临时线程两轮读回 `GOAL_PROBE_CODEX_20261122` | 可恢复会话确认；CLI 未观察到独立 Goal 对象 |
| Pi Agent 1.6.0 | `--session`、`--continue`、`--resume` 和会话文件 | `/tmp/deepstack-pi-probe.jsonl` 两轮读回 `GOAL_PROBE_PI_20261122` | 可恢复会话确认；原生 Goal 对象未单独观察 |
| ZCode 3.19.1 | 在临时只读项目执行 `/goal Goal probe marker 20261123`，界面显示 `Goal Goal probe marker 20261123` | 从任务列表重新打开同一任务后 Goal 仍显示；新建任务不继承该 Goal；应用重启未测 | 原生 Goal 与任务内持久化确认；跨会话恢复未验证 |
| MiniMax Code 3.1.17 | 当前任务界面明确显示 `Goal @ROADMAP.md`、`进行中`、`暂停`、`清除目标`，任务列表中也有长期任务 | 现有活跃 Goal 可见；未暂停或重启用户现有任务做破坏性恢复探针 | 原生 Goal 界面确认；独立跨重启恢复未验证 |

## 证据边界

- 测试任务要求只读检查；没有对 DeepStack 仓库或远程 PR 执行写入。
- “通过”只表示该宿主表面完成了表中指定的验证，不表示宿主支持全部内部技能、并行代理或质量门能力。
- ZCode 的分支导入格式、旧缓存（`0.1.0`）、临时本地仓库的安全边界，以及 MiniMax Code 的多项目边界已经写入 README；Comet 只保留为历史风险记录，不属于后续支持面。
- 会话恢复探针使用临时目录和只读工具，没有修改 DeepStack 仓库；Claude/Codex/Pi 的标记往返证明的是会话恢复，不证明宿主有独立 Goal 调度器。
- MiniMax Code 的 Goal 控件来自当前已有任务；没有暂停、删除或重启该用户任务，因此跨重启恢复仍保持未验证。当前本机插件仍是 `0.2.1`；本轮临时项目探针暴露出路由规则未刷新（`feature`），所以不能把 MiniMax 记为路由通过。ZCode 的新探针只证明任务记录可再次打开，不足以把 `recovery` 升级为 `verified`。

## 模型策略跨宿主探针

2026-11-23 使用同一条生产认证字段迁移输入做单模型路由检查：Claude Code 用原生 `/deepstack`，Codex CLI 刷新 `deepstack@deepstack` 到 `0.2.2` 后用 `$deepstack`，Pi 刷新用户技能后用 `/skill:deepstack`，三者都返回完整五字段并命中 `investigation + L2 + SAME_MODEL_REVIEW + 未确认`。MiniMax Code 当前本机插件仍为 `0.2.1`，临时项目返回五字段和正确模型策略字段，但路由为 `feature`，因此标记为 `ROUTER_UNVERIFIED`。ZCode 刷新包含 `7ae2525` 的 `0.2.2` 后，临时本地 Git 仓库保持 clean，并返回 `UNVERIFIED + investigation + L2 + SAME_MODEL_REVIEW + 未确认`。Comet 结果仅为历史集成风险记录，不再纳入支持判断。机器可读记录见 [model-policy.json](../evals/model-policy.json)。
