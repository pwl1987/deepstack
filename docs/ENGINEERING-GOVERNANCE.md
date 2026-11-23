# DeepStack 工程治理内核（Node.js）

> 该模块从 TVNEWS 的 Python 工程流程中提取**可复用行为**，以原生 Node.js 实现；不包含 TVNEWS 的状态、业务契约、标签、原始脚本或私有记录。项目仓库仍然是唯一事实源。

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

## 尚未迁移

TVNEWS 的 GitHub Issue 标记/父子关系适配、S1–S9 阶段推导、反例矩阵与评审包、质量记分和进度视图**尚未搬入此核心**。这些能力需要先剥离 TVNEWS 业务语义，再用 Node.js 实现。不要复制旧 Python 脚本，也不要将当前工程模块声称为完整的 TVNEWS 流程替换。TVNEWS 旧脚本在完成兼容性迁移前必须保留。
