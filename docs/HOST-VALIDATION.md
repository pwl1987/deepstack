# 宿主验证记录

这是一份 2026-11-22 在 macOS Apple Silicon 上进行的点时验证记录。它描述实际运行过的表面和限制，不替代持续集成，也不代表所有模型、账号或宿主版本都通过。

统一测试输入和能力状态见 [宿主路由基准](../evals/host-routing-benchmark.json) 与 [能力矩阵](../evals/host-capabilities.json)。

| 宿主 | 版本 | 验证内容 | 结果 | 边界 |
|---|---|---|---|---|
| Claude Code | 2.1.330 | 使用插件目录运行只读自然语言任务，检查自动路由、范围和证据契约 | 通过 | 出现一次模型不可识别警告，但任务成功完成 |
| Codex CLI | 0.166.0 CLI；exec 显示 0.170.0 | 在临时项目中加载 `skills/`，分别验证无源代码和有源代码的只读调查 | 通过 | 临时项目中的一次沙箱探测警告未导致写入 |
| Pi Agent | 1.6.0 | 通过 `--skill` 加载 DeepStack，执行只读调查并返回代码行证据 | 通过 | 无测试入口时正确标记运行验证未完成 |
| ZCode | 3.19.1 | 用带 `#分支` 的 Git URL 安装包含 `7ae2525` 的 `0.2.1`，分别在远程 Comet 项目和临时本地 Git 仓库执行高风险只读探针 | 部分通过（本地路由） | 远程 Comet 项目探针产生 `.comet/config.yaml`、`AGENTS.md`、`CLAUDE.md` 三个删除变更，已停止并恢复；修正探针优先级并刷新缓存后，临时本地仓库保持 clean，返回 `UNVERIFIED + investigation + L2 + SAME_MODEL_REVIEW + 未确认` |
| MiniMax Code | 3.1.17 | 在独立新任务中加载 DeepStack，执行高风险只读路由探针 | 通过（模型策略） | 首次探针命中旧缓存；卸载后重新导入 PR 分支 `0.2.1`，返回 `L2 + SAME_MODEL_REVIEW + 未确认`。其他并行、质量门和跨重启能力仍未确认 |

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
- ZCode 的分支导入格式、旧缓存（`0.1.0`）、远程 Comet 项目只读探针写入风险和临时本地仓库的安全边界，以及 MiniMax Code 的多项目边界已经写入 README；后续宿主版本变化或默认分支更新后应重新验证。
- 会话恢复探针使用临时目录和只读工具，没有修改 DeepStack 仓库；Claude/Codex/Pi 的标记往返证明的是会话恢复，不证明宿主有独立 Goal 调度器。
- MiniMax Code 的 Goal 控件来自当前已有任务；没有暂停、删除或重启该用户任务，因此跨重启恢复仍保持未验证。首次路由探针暴露出插件缓存问题；卸载旧副本并重新导入版本 `0.2.1` 后，当前模型策略契约已通过。

## 模型策略跨宿主探针

2026-11-23 使用同一条生产认证字段迁移输入做单模型路由检查：Claude Code 已加载 DeepStack，输出 `L2 + SAME_MODEL_REVIEW`；Codex CLI 刷新 `deepstack@deepstack` 后使用 `$deepstack`，重复探针均输出 `L2 + SAME_MODEL_REVIEW` 与 `可用模型：未确认`，其中一次明确运行了确定性预检脚本，另一次没有暴露该工具调用，因此只确认路由契约，不把脚本调用本身写成宿主保证；Pi Agent 加载当前路由器并允许只读工具后，运行确定性预检并输出完整的五字段契约，同样得到 `L2 + SAME_MODEL_REVIEW` 与 `可用模型：未确认`。MiniMax Code 在清除旧缓存并重新导入 `0.2.1` 后返回 `feature` 路由，但模型策略字段符合 `L2 + SAME_MODEL_REVIEW + 未确认`。ZCode 先在旧缓存中暴露了探针封装优先级歧义；刷新包含 `7ae2525` 的 `0.2.1` 后，临时本地 Git 仓库保持 clean，并返回 `UNVERIFIED + investigation + L2 + SAME_MODEL_REVIEW + 未确认`。远程 Comet 项目仍触发过文件删除并已恢复，所以 ZCode 只记为本地路由部分通过，不升级为宿主全面通过。机器可读记录见 [model-policy.json](../evals/model-policy.json)。
