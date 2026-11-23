# DeepStack 工程治理内核（Node.js）

> 该模块从 TVNEWS 的 Python 工程流程中提取**可复用行为**，以原生 Node.js 实现；不包含 TVNEWS 的状态、业务契约、标签、原始脚本或私有记录。**TVNEWS 项目及其 Python 流程工具独立保留，DeepStack 不删除、不修改、不自动替换 TVNEWS。** 各项目仓库仍然是各自唯一事实源。

## 当前边界

- Git：`main-only` 和 `branch-pr` 两种**显式**项目工作流。没有配置时不猜测模式，也不自动授予写入。
- 协作：同一 Git common-dir 内的协作式 Writer 锁；**不是跨主机分布式锁**，也不能代替服务端分支保护或用户授权。
- 证据：提交前检查与推送前重核真实远端基线；精确 SHA、必需工作流的 GitHub Actions 验证。没有工作流列表、网络不可用或数据缺失时返回 `UNKNOWN`，不能当作 `PASS`。
- 质量：保留 schema 1 的既有 `npm run` 清单；schema 2 以仓库内已跟踪 manifest 授权 argv 形式的 Python/Node 等检查命令。它是**可信项目命令执行器**，不是对不可信仓库的沙箱。
- 任务：DeepStack 的 Goal 与项目既有 CURRENT/TODO 不得并列为同一事实的第二份状态。项目已有权威任务入口时必须复用。

## 项目配置（示例，不自动向其他项目写入）

项目根目录 `deepstack.config.json`：

```json
{
  "git": {
    "workflow": "main-only",
    "baseBranch": "main",
    "remote": "origin",
    "writerPolicy": "local"
  }
}
```

`branch-pr` 使用 `"workflow": "branch-pr"`，没有声明 `writerPolicy` 时默认为 `none`；main-only 默认为 `local`。这是工作流配置，不是运行时进度数据库，也不修改 git 分支规则。已有 Git Hook、仓库 Authority 和实际 CI 仍须独立满足。

## 写入准入与 Git 工作流

```bash
# 在 DeepStack 源/插件目录运行，下方路径换为目标项目仓库：
node scripts/scm-workflow.mjs check /path/to/project
node scripts/writer-lease.mjs acquire /path/to/project my-agent
# acquire 返回一次性 token；安全地设置到当前会话环境，不提交或输出到仓库日志。
export DEEPSTACK_WRITER_TOKEN='<acquire-token>'
node scripts/scm-workflow.mjs preflight /path/to/project
# 按项目 Authority 完成授权的开发、测试、diff review 与 commit。
node scripts/scm-workflow.mjs push-check /path/to/project
# 在远端未发生变化、拥有推送授权且验证通过的前提下，由调用方安全推送。
node scripts/writer-lease.mjs release /path/to/project
```

`check` 仅检查 Git 与真实远端，不签发写入权限。`preflight` 仅在干净、与远端同步且满足本地 Writer 规则时生成 `.git/deepstack/preflight.json`；失败不会生成有效凭证。`push-check` 允许本地 HEAD 在原基线上增量提交，但远端不得发生变化；禁止使用 force push、reset 或历史重写来消除失败。

预检凭证是可复核的**本地缓存证据**，不是加密授权票据、操作系统隔离或网络分布式租约。跨机器写入必须另外使用已有的共享 Writer 控制、项目级权限和受保护的集成通道。锁遗留时**不自动抢锁**，须先独立确认持有者状态并人工恢复。

## 质量门：混合 Python + Node 项目

项目根目录声明并提交 `deepstack-quality-gate.json`：

```json
{
  "schema": 2,
  "readonlySkipCategories": ["format"],
  "components": {
    "backend": {
      "cwd": ".",
      "allow": {
        "test": {"executable": "python3", "args": ["-m", "unittest", "discover", "-s", "tests"]}
      }
    },
    "web": {
      "cwd": "web",
      "allow": {
        "test": {"executable": "npm", "args": ["run", "test"]},
        "type": {"executable": "npm", "args": ["run", "typecheck"]}
      }
    }
  }
}
```

```bash
node scripts/quality-gate.mjs plan /path/to/project --manifest /path/to/project/deepstack-quality-gate.json
node scripts/quality-gate.mjs run /path/to/project --manifest /path/to/project/deepstack-quality-gate.json --component backend --category test
node scripts/quality-gate.mjs run /path/to/project --manifest /path/to/project/deepstack-quality-gate.json --component web --category test
```

执行器以 `spawnSync(executable, args, {shell:false})` 执行，拒绝相对工作目录越界、未跟踪/仓库外 manifest、动态覆盖和 shell wrapper。**manifest 是与源码同等可信的可执行配置**；它授权的脚本仍可能改变文件或访问资源。`readonly` 仅限制指定的类别，不是操作系统只读沙箱。缺少命令不构成测试通过。

## CI 验证与诚实完成条件

```bash
node scripts/ci-evidence.mjs /path/to/project <完整40位实现提交SHA> --required '<必需工作流名>'
```

结果：`PASS` / `FAIL` / `UNKNOWN`，且必须逐个报告要求的工作流。当前使用已有 `gh` CLI 和 GitHub Actions；仅验证真实执行记录，不能证实模型语义评审或人工验收。项目的人工门禁不能被脚本代签。

## 离线测试

`node scripts/verify.mjs` 会额外执行本模块的 Node 内建测试，包含分支限制、远端变化、脏工作树、锁冲突、凭证伪造、混合栈命令、越界拒绝、超时及 CI 缺失等反例。现有 Goal、宿主路由和质量门 schema 1 均保留。

## Agent 项目冷启动（第四批：只读）

`/deepstack` 的宿主 Agent 必须优先确认**目标仓库**及项目 Authority。DeepStack 新增只读 Node.js 入口，不复制 TVNEWS 任务、状态或规则，也不从 Issue 候选直接决定执行。

```bash
# 在 DeepStack 安装目录运行；可以传目标 Git 仓库或其任意子目录
node scripts/project-doctor.mjs /path/to/project
```

输出 `READONLY_READY` / `BLOCKED` / `CONFLICT` / `UNKNOWN` / `NOT_CONFIGURED`；其中 `BLOCKED` 指不能自动写入，**不妨碍人工只读排障**。结果包括真实 Git 工作流检查、仓库权威文件**路径**、`.project/TODO.md` 中 `[>]` 声明的数量及有限摘要、根目录 Python/Node 探测。读取单条 CURRENT 只是识别**项目声明**，**不等于任务范围、Owner 授权或 Writer 准入**。遇到多条 CURRENT 会明确标记 `CONFLICT`；没有项目 `deepstack.config.json`，不猜测为 main-only，也不自行创建项目配置。探测不到技术栈不代表可以跳过验证；真正执行的检查仍由项目已授权的质量门清单定义。

可选会话启动适配器：

```bash
# 当前 Agent 宿主允许配置 SessionStart 命令时，将此脚本作为命令钩子。
# 宿主可通过 stdin 传入 JSON，包含 cwd；也可设置 DEEPSTACK_PROJECT_ROOT。
node /path/to/deepstack/scripts/agent-preflight.mjs
```

此适配器只把简短的诊断结果注入当前会话，**不自动安装 Hook**、不取 Writer 锁、不签发开工凭证、不运行测试，也不进行 git commit/push。不同 Agent 的 Hook 注册格式须依各宿主的真实接口配置并单独验收；仅复制 SKILL.md、缺少 Node.js 或不可访问 DeepStack 脚本时，应显示 `NOT_CONFIGURED/UNKNOWN`，不能声称自动冷启动已验证。

当目标仓库存在完整的项目 Authority 时，先由 Agent 读取相应文件和合同，再进入本仓库的受控 Git/质量门流程。避免另建通用任务阶段表、Goal 数据库或与既有 CURRENT 平行的第二套事实源。

## 暂存区一致性与只读评审证据（第三批）

TVNEWS 原有的 `precommit_gate.py` 有潜在的「已暂存 A、工作区变为 B，却对 B 执行检查后提交 A」风险。新增纯 Node.js 检查，不重新实现 Python 或 Node 技术栈的测试框架：

```bash
# 在 DeepStack 安装目录运行，下方路径为目标项目
node scripts/staged-check.mjs inspect /path/to/project
node scripts/staged-check.mjs run /path/to/project \
  --manifest /path/to/project/deepstack-quality-gate.json --component backend --category test \
  > /tmp/deepstack-backend-test.json
```

只有 Git index 有变更、暂存内容与工作区一致、没有未跟踪文件，才执行项目可信质量门。测试运行之后再次取 Git HEAD、index tree 与工作区快照，任何暂存区被改、未暂存改动或新生成的未跟踪文件都会使结果变为 `FAIL`。如果未暂存文件参与模块导入，风险尤其明显，故这里保守拒绝未跟踪文件。检查本身并非沙箱；忽略文件和运行中瞬时副作用不能由此保证。运行记录包含 `headSha`（提交前父提交）及 `indexTreeSha`（当时暂存的整棵树）；若测试只在非暂存工作区运行，不构成这种证据。

项目把需要的工程验证配置在**提交过的** `deepstack.config.json` 中：

```json
{
  "verification": {
    "requiredWorkflows": ["validate"],
    "requiredLocalChecks": [
      {"component": "backend", "category": "test"},
      {"component": "web", "category": "test"}
    ]
  }
}
```

其中的 `validate` 只是示例，真实必需工作流由该项目声明。`requiredLocalChecks: []` 必须**显式**写出才允许只用 CI 准备评审；不配置不会默认为零要求。提交前可将多个本地检查的 JSON 记录到仓库外临时路径；提交后运行：

```bash
node scripts/review-evidence.mjs /path/to/project <完整40位实现提交SHA> \
  --check-report /tmp/deepstack-backend-test.json \
  --check-report /tmp/deepstack-web-test.json
```

评审入口**从被评审提交自身读取版本化 `deepstack.config.json`**，核对真实 Git commit 的父 SHA 与 tree SHA 是否等于检查时的快照，并即时查询 GitHub Actions 的 exact-SHA 必需工作流。输出 `READY_FOR_HUMAN_REVIEW` / `INCOMPLETE` / `BLOCKED`；唯一人工裁决字段始终为 `WAIT_HUMAN`。本地 JSON 是调用者提供的未签名记录，不是可靠的远程证明；最终仍须通过独立 CI、diff review 和项目 Authority。CLI 不直接触发 `git commit`、push、PR 合并或 Issue 状态修改。

这些脚本不取代原有 `node scripts/quality-gate.mjs` 的执行能力，也不要求另建 CI/进度状态数据库。新项目不使用 DeepStack 的暂存区质量门时仍可单独使用原有质量门，但不能把它的检查输出冒充暂存一致性证明。

## GitHub Issues 与反例矩阵（第二批）

DeepStack 已提供原生 Node.js 的 `scripts/issue-governance.mjs`：从 GitHub Issues **实时读取**索引标签和验收边界，输出状态分布、按 `REWORK → READY → NEEDS_VERIFY` 排序的**候选列表**及未验证反例矩阵。**候选≠CURRENT≠执行授权**；具体执行仍必须先遵守项目 `AGENTS.md` / CURRENT / 权限约束。工具不修改 GitHub Issue、不维护离线任务数据库，也不会凭评论日期或提交关键词自动判定工程完成。

在项目 `deepstack.config.json` 增加适配声明（下列只是示例，状态标签完全由项目维护）：

```json
{
  "issueIndex": {
    "marker": "delivery-index/v1",
    "statusLabels": {
      "workflow:rework": "REWORK",
      "workflow:ready": "READY",
      "workflow:needs-verify": "NEEDS_VERIFY",
      "workflow:done": "DONE"
    },
    "ownerGateLabels": ["owner:required"],
    "boundarySection": "Acceptance Criteria",
    "matrixDir": ".project/matrices"
  }
}
```

```bash
node scripts/issue-governance.mjs status /path/to/project
node scripts/issue-governance.mjs candidates /path/to/project
node scripts/issue-governance.mjs matrix /path/to/project --issue 123
# 只有明确授权写文件时才指定 --write，且永不覆盖既有人工内容
node scripts/issue-governance.mjs matrix /path/to/project --issue 123 --write
```

其中 `issueIndex` 只描述如何读取已有原生 Issue，不得变成另一套人工维护的任务列表。`matrix` 只输出反例义务和 `UNVERIFIED`，不把文案匹配、测试文件存在或模型自述当作覆盖通过。

## 尚未迁移

TVNEWS 的 GitHub Issue 专属父子关系适配、S1–S9 阶段推导、完整 Review Pack、质量记分和进度视图**尚未搬入此核心**。这些能力需要先剥离 TVNEWS 业务语义，再用 Node.js 实现。不要复制旧 Python 脚本，也不要将当前工程模块声称为完整的 TVNEWS 流程替换。TVNEWS 项目及其现有 Python 流程工具**长期保留**，不因 DeepStack 新增功能而要求删除或停用；未来若 TVNEWS 自愿接入，需要以独立授权和完整兼容性验证为前提。
