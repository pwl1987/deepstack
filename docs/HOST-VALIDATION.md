# 宿主验证记录

这是一份 2026-11-22 在 macOS Apple Silicon 上进行的点时验证记录。它描述实际运行过的表面和限制，不替代持续集成，也不代表所有模型、账号或宿主版本都通过。

统一测试输入和能力状态见 [宿主路由基准](../evals/host-routing-benchmark.json) 与 [能力矩阵](../evals/host-capabilities.json)。

| 宿主 | 版本 | 验证内容 | 结果 | 边界 |
|---|---|---|---|---|
| Claude Code | 2.1.330 | 使用插件目录运行只读自然语言任务，检查自动路由、范围和证据契约 | 通过 | 出现一次模型不可识别警告，但任务成功完成 |
| Codex CLI | 0.166.0 CLI；exec 显示 0.170.0 | 在临时项目中加载 `skills/`，分别验证无源代码和有源代码的只读调查 | 通过 | 临时项目中的一次沙箱探测警告未导致写入 |
| Pi Agent | 1.6.0 | 通过 `--skill` 加载 DeepStack，执行只读调查并返回代码行证据 | 通过 | 无测试入口时正确标记运行验证未完成 |
| ZCode | 3.19.1 | 从插件市场安装并加载 `deepstack` | 部分通过 | 本地路径对客户端不可见；GitHub 分支页面 URL 不被接受；只验证了默认分支安装，当前 PR 分支路由未验证 |
| MiniMax Code | 3.1.17 | 从 Git 仓库导入当前 PR 分支，预览 `v0.2.0`、13 个技能，启用后运行只读调查 | 部分通过 | DeepStack 成功加载并进入调查流程；宿主工作区是多项目集合，任务扩大了搜索范围，最终规范化路由输出未完成验证 |

## 原生 Goal 与会话恢复专项核验

这组结果来自 2026-11-22 的 Mac 点时测试。`原生 Goal` 表示界面或命令本身提供目标/计划/任务能力；`可恢复会话`表示用真实会话 ID 或会话文件开始一轮，再在下一轮恢复并读回标记。两者不能混为一谈。

| 宿主 | 原生能力观察 | 可恢复性证据 | 结论 |
|---|---|---|---|
| Claude Code 2.1.330 | `--permission-mode plan`、会话持久化、`--resume`、`--continue` 和后台会话 | 本机临时会话两轮读回 `GOAL_PROBE_CLAUDE_20261122` | 可恢复会话确认；原生 Goal 对象未单独观察 |
| Codex CLI 0.166.0 | `codex exec resume` 和持久线程 | 本机临时线程两轮读回 `GOAL_PROBE_CODEX_20261122` | 可恢复会话确认；CLI 未观察到独立 Goal 对象 |
| Pi Agent 1.6.0 | `--session`、`--continue`、`--resume` 和会话文件 | `/tmp/deepstack-pi-probe.jsonl` 两轮读回 `GOAL_PROBE_PI_20261122` | 可恢复会话确认；原生 Goal 对象未单独观察 |
| ZCode 3.19.1 | 在对话输入 `/goal` 后，命令提示明确显示 `命令 /goal — Show or set the current session goal`；同时观察到项目/任务列表和活跃任务 | 未发送命令，也未做独立重启/恢复探针，避免改变当前任务 | 原生 Goal 命令确认；跨会话恢复未验证 |
| MiniMax Code 3.1.17 | 当前任务界面明确显示 `Goal @ROADMAP.md`、`进行中`、`暂停`、`清除目标`，任务列表中也有长期任务 | 现有活跃 Goal 可见；未暂停或重启用户现有任务做破坏性恢复探针 | 原生 Goal 界面确认；独立跨重启恢复未验证 |

## 证据边界

- 测试任务要求只读检查；没有对 DeepStack 仓库或远程 PR 执行写入。
- “通过”只表示该宿主表面完成了表中指定的验证，不表示宿主支持全部内部技能、并行代理或质量门能力。
- ZCode 的分支限制和 MiniMax Code 的多项目边界已经写入 README；后续宿主版本变化后应重新验证。
- 会话恢复探针使用临时目录和只读工具，没有修改 DeepStack 仓库；Claude/Codex/Pi 的标记往返证明的是会话恢复，不证明宿主有独立 Goal 调度器。
- MiniMax Code 的 Goal 控件来自当前已有任务；没有暂停、删除或重启该用户任务，因此跨重启恢复仍保持未验证。

## 模型策略跨宿主探针

2026-11-23 使用同一条生产认证字段迁移输入做单模型路由检查：Claude Code 已加载 DeepStack，输出 `L2 + SAME_MODEL_REVIEW`；Codex CLI 的直接调用未加载仓库内 DeepStack 路由，输出了自定义模型档位；Pi Agent 的显式技能调用也未输出 DeepStack 的 `L2/SAME_MODEL_REVIEW` 契约。后两者标为 `ROUTER_UNVERIFIED`，不把宿主自身的模型建议当作 DeepStack 结果。机器可读记录见 [model-policy.json](../evals/model-policy.json)。
