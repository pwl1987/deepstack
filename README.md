# DeepStack 深栈

> 先把问题想清楚，再写足够少、能够证明的代码。

DeepStack 是一个以 pstack 为骨架的工程工作流插件。用户只需要调用一个入口：`/deepstack`。它先判断任务类型，再按需组合内部工作流、质量门和证据报告。

DeepStack 不把“更多模型、更多代理、更多命令”当作质量。默认目标是：最小必要改动、清晰边界、真实验证和可恢复的工作状态。

借鉴来源和实现边界见 [借鉴、来源与边界](docs/INSPIRATIONS.md)。pstack 是直接设计骨架；其他项目按“方法参考”或“对比研究”标记，不把未实现的能力写成承诺。

Mac 宿主的实际验证范围、版本和未验证项见 [宿主验证记录](docs/HOST-VALIDATION.md)。

宿主能力与手工观察的单一机器来源是 [evals/hosts.json](evals/hosts.json)；协议见 [宿主能力探测](docs/HOST-CAPABILITIES.md)，离线验收入口见 [验证契约](docs/VERIFICATION.md)。

## 唯一入口

```text
/deepstack 修复导出丢失最后一行的问题，先复现，只修改本地代码并给出测试证据
```

路由器会自动选择调查、修复、功能、重构、目标推进、续接或交付流程。内部技能在支持该元数据的宿主中标记为不可直接调用；用户只需要记住 `/deepstack`，模型由路由器按需组合 `tdd`、`architect`、`arena`、`interrogate`、`ship` 和 `quality-gate`。

当任务明确需要分阶段推进或跨会话恢复时，路由器才进入目标模式。它优先使用宿主原生的 Goal、任务或会话恢复能力；只有原生能力不可用且用户明确需要跨会话恢复时，才使用小型的 `.deepstack/goal.md` 回退检查点。普通任务不会因此增加状态文件或流程负担。详见 [目标模式](docs/GOAL-MODE.md)。

模型策略先经过仓库内的确定性风险预检，再由宿主判断可用模型和审查方式，自动选择 `L0`、`L1` 或 `L2`。只有一种模型时，DeepStack 会采用顺序化的方案、实现和自检；关键任务会标记 `SAME_MODEL_REVIEW`，不会把同一模型伪装成独立审查。详见 [模型能力分级与升级策略](docs/MODEL-POLICY.md)。

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

目标模式的回退状态只在用户明确要求跨会话恢复、且宿主没有原生持久化时创建。使用 `scripts/goal-state.mjs` 维护 `.deepstack/goal.md`，使用 `scripts/quality-gate.mjs plan|run`（manifest 授权）执行质量门；两者都不安装依赖、不运行后台进程、不执行任务文本中的任意命令。

## 质量和授权边界

质量门优先读取项目已有的 scripts、Makefile、CI 和贡献文档，不自动安装工具。只读任务不会写工作区或外部系统。提交、推送、PR、合并、发布和持久记忆修改只在用户明确授权范围内执行。

只读探针可以在仓库外保存基线并在结束后复核：

```sh
node scripts/readonly-guard.mjs snapshot "$(git rev-parse --show-toplevel)" /tmp/deepstack-readonly-baseline.json
# 执行只读探针
node scripts/readonly-guard.mjs verify "$(git rev-parse --show-toplevel)" /tmp/deepstack-readonly-baseline.json
```

复核发现文件、Git 状态或提交发生变化时返回非零；它是发现门禁，不是宿主沙箱，也不能覆盖探针启动前的宿主钩子写入。

没有运行证据的结果会标为 `NOT_CONFIGURED`、`SKIPPED` 或 `UNVERIFIED`，不会写成通过。

## 工程治理核心：原生 Node.js（增量迁移）

支持只读 `node scripts/project-doctor.mjs <project>` 和可选 `agent-preflight.mjs` 会话前置探测，自动识别项目 Git、Authority 与技术栈，**不自动授予写入**。详情见 [工程治理内核](docs/ENGINEERING-GOVERNANCE.md)。

DeepStack 在当前开发分支增加了可选的 **Git/main-only、同机单 Writer、前置凭证、推送前远端核验、混合 Python/Node 质量门、exact-SHA CI 证据、GitHub Issue 候选/反例矩阵，以及暂存区/评审证据一致性检查**。这是对 TVNEWS Python 通用流程能力的重新设计，不要求 DeepStack 运行 Python 模块。**TVNEWS 项目和现有 Python 流程代码全部保留，DeepStack 不自动修改或删除它们**；后续如有接入需求另行审计授权。

`main-only` 不会自动强加给所有项目；项目须通过 `deepstack.config.json` 明确选择。无 Git 基线、无必需 CI 或无有效 Writer 时不能假装具备完成证据。详细配置、执行边界和**仍未迁移的功能**见 [Node.js 工程治理内核](docs/ENGINEERING-GOVERNANCE.md)。

本阶段首先实现可验证的机器检查；后续只抽象通用阶段证据、Review Pack 与质量度量，不照搬 TVNEWS 的业务阶段判据，也不把两个项目写入同一套状态数据库。`/deepstack` 的宿主依赖与实际验证范围仍以本仓库宿主验收为准。

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

当前 Codex CLI 已确认能加载 `$deepstack`，单模型生产迁移探针返回 `L2 + SAME_MODEL_REVIEW`；一次探针观察到确定性预检脚本被调用，但脚本调用本身不作为宿主保证，可用模型仍写 `未确认`。插件未安装或没有确认技能加载和 `model-policy` 时，必须标记 `ROUTER_UNVERIFIED`。

### ZCode

在插件市场添加本仓库并安装 `deepstack`。本仓库保留 `.zcode-plugin/` 清单；ZCode 可用带分支片段的 Git URL 导入当前 PR，例如：

```text
https://github.com/pwl1987/deepstack.git#improve/single-entry-routing-quality-gates
```

安装成功后应在插件卡片或会话中看到 `deepstack`。当前默认源仍可能显示缓存的 `0.1.0`；升级后先确认插件卡片版本已经变为 `0.2.2`，如果仍显示旧版本，停用并重新安装，不能用旧缓存的探针结果证明当前路由器已生效。首次在 ZCode 中验证时应使用临时或可恢复工作区；只读探针一旦出现文件变更，立即停止并恢复变更。

2026-11-23 本机验证结论：ZCode `3.19.1` 已加载当前 `0.2.2`，在临时本地 Git 仓库中可正常执行 `$deepstack` 路由；高风险只读探针返回 `investigation + L2 + SAME_MODEL_REVIEW`，工作区保持 clean。DeepStack 不依赖 Comet，Comet 插件不属于支持面；此前的 Comet 结果只保留为历史风险证据，不影响本机插件使用。

### MiniMax Code

在“插件・技能 → 更多创建选项 → 从 Git 仓库导入”粘贴公开 GitHub 仓库地址；MiniMax Code 支持指定 GitHub 分支或子目录。导入预览应显示 `deepstack`、当前版本 `0.2.2` 和技能数量，安装后在管理页启用插件，再用自然语言任务验证路由。若仍显示 `0.2.0` 或加载的 `SKILL.md` 没有“模型策略”字段，先删除旧插件并重新导入；旧缓存的结果只能记为 `ROUTER_UNVERIFIED`。多项目工作区应先切换到目标项目，避免把父目录当成单一仓库扫描。

### 其他支持 Agent Skills 的宿主

将 `skills/` 安装到宿主的技能目录，然后使用宿主的用户技能入口（例如 `/deepstack` 或 `$deepstack`）。宿主不支持技能命令时，可以把 `skills/deepstack/SKILL.md` 作为项目规则入口，但自动路由、内部技能调用和质量门能力取决于宿主；没有确认 `single-entry`、`skill-loading` 和 `model-policy` 时，必须标记 `ROUTER_UNVERIFIED`，不能宣称 DeepStack 的模型升级已生效。

## 验证插件自身

```bash
node scripts/verify.mjs
```

`verify` 串联结构检查、风险预检可执行回归、宿主注册表约束、**宿主 fixture 路由判定**、质量门 fixture、只读守卫与 Goal 检查点。真实宿主捕获见 [HOST-ACCEPTANCE.md](docs/HOST-ACCEPTANCE.md)（opt-in，自报证据不能升格为 live verified）。

```bash
node scripts/host-acceptance.mjs suite          # fixture 端到端
node scripts/host-acceptance.mjs record-fixture --out /tmp/evidence.json
```

## License

MIT
