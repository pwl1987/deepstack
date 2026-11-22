# DeepStack 深栈

> 先把问题想清楚，再写足够少、能够证明的代码。

DeepStack 是一个以 pstack 为骨架的工程工作流插件。用户只需要调用一个入口：`/deepstack`。它先判断任务类型，再按需组合内部工作流、质量门和证据报告。

DeepStack 不把“更多模型、更多代理、更多命令”当作质量。默认目标是：最小必要改动、清晰边界、真实验证和可恢复的工作状态。

借鉴来源和实现边界见 [借鉴、来源与边界](docs/INSPIRATIONS.md)。pstack 是直接设计骨架；其他项目按“方法参考”或“对比研究”标记，不把未实现的能力写成承诺。

Mac 宿主的实际验证范围、版本和未验证项见 [宿主验证记录](docs/HOST-VALIDATION.md)。

路由基准和内部步骤的宿主能力探测规则见 [宿主路由基准](evals/host-routing-benchmark.json)、[能力矩阵](evals/host-capabilities.json) 和 [宿主能力探测协议](docs/HOST-CAPABILITIES.md)。

## 唯一入口

```text
/deepstack 修复导出丢失最后一行的问题，先复现，只修改本地代码并给出测试证据
```

路由器会自动选择调查、修复、功能、重构、目标推进、续接或交付流程。内部技能在支持该元数据的宿主中标记为不可直接调用；用户只需要记住 `/deepstack`，模型由路由器按需组合 `tdd`、`architect`、`arena`、`interrogate`、`ship` 和 `quality-gate`。

当任务明确需要分阶段推进或跨会话恢复时，路由器才进入目标模式。它优先使用宿主原生的 Goal、任务或会话恢复能力；只有原生能力不可用且用户明确需要跨会话恢复时，才使用小型的 `.deepstack/goal.md` 回退检查点。普通任务不会因此增加状态文件或流程负担。详见 [目标模式](docs/GOAL-MODE.md)。

模型策略按任务风险自动选择 `L0`、`L1` 或 `L2`。只有一种模型时，DeepStack 会采用顺序化的方案、实现和自检；关键任务会标记 `SAME_MODEL_REVIEW`，不会把同一模型伪装成独立审查。详见 [模型能力分级与升级策略](docs/MODEL-POLICY.md)。

每次开始时输出：

```text
路由：bug-fix
理由：已有可观察的错误行为，需要先复现并固定回归行为。
内部步骤：架构判断 → TDD → 质量门
写入范围：当前工作区；外部系统需授权
完成证据：原始失败、修复后通过和相邻测试结果
```

## 设计骨架

| 层 | 责任 |
|---|---|
| 路由 | 从自然语言任务选择一个主流程 |
| 工作流 | 调查、修复、功能、重构、续接、交付 |
| 原则 | 最小改动、根因优先、边界清晰、行为验证、可恢复执行 |
| 质量门 | 格式、lint、类型/编译、测试、安全检查；只使用项目已有入口 |
| 证据 | 命令、结果、覆盖范围、未验证项和剩余风险 |

## 内部技能

- `deep-fix`：复现、根因、回归验证
- `tdd`：行为契约和红-绿-重构
- `architect`：跨边界设计和方案选择
- `refactor`：特征测试、等价迁移和删除旧接口
- `goal`：多阶段目标、检查点和跨会话恢复
- `arena` / `swarm`：仅在宿主能力和任务依赖实际满足时使用
- `interrogate`：高风险或大 diff 的独立审查
- `quality-gate`：项目感知的格式、静态检查、类型检查、测试和安全检查
- `ship` / `reflect` / `pickup`：交付、复盘和续接

## 质量和授权边界

质量门优先读取项目已有的 scripts、Makefile、CI 和贡献文档，不自动安装工具。只读任务不会写工作区或外部系统。提交、推送、PR、合并、发布和持久记忆修改只在用户明确授权范围内执行。

没有运行证据的结果会标为 `NOT_CONFIGURED`、`SKIPPED` 或 `UNVERIFIED`，不会写成通过。

## 安装

### Claude Code

```text
/plugin marketplace add pwl1987/deepstack
/plugin install deepstack@deepstack
```

### Codex CLI

在 Codex CLI 中先把仓库加入插件 marketplace，再安装 `deepstack`；Codex 的用户技能入口使用 `$deepstack`：

```text
codex plugin marketplace add pwl1987/deepstack --ref improve/single-entry-routing-quality-gates
codex plugin add deepstack@deepstack
$deepstack 修复导出丢失最后一行的问题，先复现并给出测试证据
```

当前 Codex CLI 已确认能加载 `$deepstack`，但单模型生产迁移探针没有返回规定的 `L2 + SAME_MODEL_REVIEW` 字段，因此 `model-policy` 仍是 `ROUTER_UNVERIFIED`。插件未安装或没有确认技能加载和 `model-policy` 时，必须标记 `ROUTER_UNVERIFIED`。

### ZCode

在插件市场添加本仓库并安装 `deepstack`。本仓库保留 `.zcode-plugin/` 清单；如果客户端无法访问本地路径，可使用公开 GitHub 仓库的默认分支。当前 ZCode 客户端不接受 GitHub 分支页面 URL 作为 marketplace 地址，因此 PR 分支需要先合并或通过客户端支持的归档/本地方式提供。安装成功后应在插件卡片或会话中看到 `deepstack`。

### MiniMax Code

在“插件・技能 → 更多创建选项 → 从 Git 仓库导入”粘贴公开 GitHub 仓库地址；MiniMax Code 支持指定 GitHub 分支或子目录。导入预览应显示 `deepstack`、当前版本和技能数量，安装后在管理页启用插件，再用自然语言任务验证路由。多项目工作区应先切换到目标项目，避免把父目录当成单一仓库扫描。

### 其他支持 Agent Skills 的宿主

将 `skills/` 安装到宿主的技能目录，然后使用宿主的用户技能入口（例如 `/deepstack` 或 `$deepstack`）。宿主不支持技能命令时，可以把 `skills/deepstack/SKILL.md` 作为项目规则入口，但自动路由、内部技能调用和质量门能力取决于宿主；没有确认 `single-entry`、`skill-loading` 和 `model-policy` 时，必须标记 `ROUTER_UNVERIFIED`，不能宣称 DeepStack 的模型升级已生效。

## 验证插件自身

```bash
node scripts/check-plugin.mjs
claude plugin validate .claude-plugin/plugin.json --strict
```

`evals/router-cases.json` 是路由契约样例。它检查案例覆盖和文件结构，不等同于真实模型行为评估；真实路由效果仍需在目标宿主和模型上运行盲测。

## License

MIT
