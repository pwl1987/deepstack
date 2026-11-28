# 宿主验证记录

这是一份 2026-11-22 至 2026-11-28 在 macOS Apple Silicon 上进行的点时验证记录。它描述实际运行过的表面和限制，不替代持续集成，也不代表所有模型、账号或宿主版本都通过。

表中的基础观测来自 `0.2.2`；当前分支已更新到 `0.2.5`。2026-11-28 对本机三个 CLI 宿主在隔离 `/tmp` Git 仓库重新执行 3 用例只读探针：仅 `Codex CLI 0.172.0` 产出可裁决的 `0.2.5` 部分通过结果（1/3 用例）；`Claude Code 2.1.332` 与 `Pi Agent 1.6.1` 在本次实机探针中均超时未输出有效结果，因此与 GUI 宿主（`ZCode`、`MiniMax Code`）一起保留 `0.2.2` 历史记录，未升级为 `0.2.5` 通过结论。

机器可读能力状态见 [evals/hosts.json](../evals/hosts.json)。下表为 2026-11-22 至 2026-11-28 的**手工观察摘要**；与 `hosts.json` 冲突时以 `hosts.json` 为准。GitHub Actions **不**把这些观察当作通过。

| 宿主 | 版本 | 验证内容 | 结果 | 边界 |
|---|---|---|---|---|
| Claude Code | 2.1.330 | （`0.2.2` 历史）使用插件目录运行只读自然语言任务，检查自动路由、范围和证据契约 | 通过（`0.2.2`） | 曾出现一次模型不可识别警告；2026-11-28 以 `2.1.332` 重跑 `0.2.5` 首例在 180s 超时（`[claude-code:unrecognized_model]`），`0.2.5` 仍未验证 |
| Codex CLI | 0.172.0 | （`0.2.5`）在隔离 `/tmp` Git 仓库通过 `.agents/skills` + `--ephemeral -s read-only` 执行 3 条只读路由用例，经 `route-adjudicate.mjs` 与 `readonly-guard` 核验（另有 `0.171.0 / 0.2.2` 历史记录） | 部分通过（1/3 用例） | `routing-probe-wrapper-wins`（23.2s）裁决 `PASS`（`UNVERIFIED + investigation + L2 + SAME_MODEL_REVIEW + 未确认`）；`explicit-readonly-wins` 与 `read-only-explanation` 在进入代码调查后于 120s 超时；`readonly-guard` 确认仓库 clean |
| Pi Agent | 1.6.0 | （`0.2.2` 历史）刷新用户技能后用原生 `/skill:deepstack` 执行只读路由探针 | 通过（`0.2.2`） | 旧用户技能曾把同一输入误路由为 `feature`；2026-11-28 以 `1.6.1`（`--no-extensions --no-skills --skill`）重跑 `0.2.5` 3 例均在 120s 超时且无输出，未更新为 `0.2.5` 通过 |
| ZCode | 3.19.1 | （`0.2.2` 历史）用带 `#分支` 的 Git URL 安装包含 `7ae2525` 的 `0.2.2`，在临时本地 Git 仓库执行高风险只读探针 | 部分通过（本地路由，`0.2.2`） | 临时本地仓库保持 clean，返回 `UNVERIFIED + investigation + L2 + SAME_MODEL_REVIEW + 未确认`；历史 Comet 集成探针曾产生删除变更，但 Comet 不属于 DeepStack 支持面；`0.2.5` 需重新加载确认 |
| MiniMax Code | 3.1.17 | （`0.2.2` 历史）在独立临时项目中加载本仓库 `0.2.2` 插件并执行高风险只读路由探针 | 通过（`0.2.2`） | 原生 `$deepstack` 返回 `investigation + L2 + SAME_MODEL_REVIEW + 未确认`；临时项目保持 clean；`0.2.5` 需重新加载确认 |

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
- MiniMax Code 的 Goal 控件来自当前已有任务；没有暂停、删除或重启该用户任务，因此跨重启恢复仍保持未验证。MiniMax 重新加载本仓库 `0.2.2` 后，临时项目路由探针通过；旧 `0.2.1` 结果保留为缓存失效的历史证据。ZCode 的新探针只证明任务记录可再次打开，不足以把 `recovery` 升级为 `verified`。

## 离线与实机边界

- 风险预检脚本回归见 `node scripts/verify.mjs` 与 [VERIFICATION.md](VERIFICATION.md)；那是**启发式契约**，不是模型路由盲测。
- 2026-11-23 各宿主上的五字段路由探针为手工记录，已迁入 `evals/hosts.json` 的 `manualObservations`；不再在 `model-policy.json` 中宣称 CI 通过。
