# DeepStack 深栈

> 先把问题想清楚，再写足够少、能够证明的代码。

DeepStack 是一个以 pstack 为骨架的工程工作流插件。用户只需要调用一个入口：`/deepstack`。它先判断任务类型，再按需组合内部工作流、质量门和证据报告。

DeepStack 不把“更多模型、更多代理、更多命令”当作质量。默认目标是：最小必要改动、清晰边界、真实验证和可恢复的工作状态。

## 唯一入口

```text
/deepstack 修复导出丢失最后一行的问题，先复现，只修改本地代码并给出测试证据
```

路由器会自动选择调查、修复、功能、重构、续接或交付流程。`tdd`、`architect`、`arena`、`interrogate`、`ship` 和 `quality-gate` 是内部步骤，不要求用户记忆。

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

### 其他支持 Agent Skills 的宿主

将 `skills/` 安装到宿主的技能目录，然后调用 `/deepstack`。宿主不支持技能命令时，可以把 `skills/deepstack/SKILL.md` 作为项目规则入口，但自动路由、内部技能调用和质量门能力取决于宿主。

## 验证插件自身

```bash
node scripts/check-plugin.mjs
claude plugin validate .claude-plugin/plugin.json --strict
```

## License

MIT
