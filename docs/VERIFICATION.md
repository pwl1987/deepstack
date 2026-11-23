# 离线验证契约

DeepStack 在本仓库内提供一套**可重复、免费、离线**的验证入口，覆盖确定性脚本契约；不宣称真实模型会遵守技能 Markdown，也不代替宿主实测。

## 统一入口

```bash
node scripts/verify.mjs
```

`verify` 会依次执行：

1. `scripts/check-plugin.mjs` — 清单、技能 frontmatter、eval 结构与交叉约束
2. `evals/hosts.json` 负例扫描 — 手工宿主记录不得写入 `ciAsserts`
3. `evals/verification-suite.json` — 质量门安全执行 fixture
4. `scripts/readonly-guard.mjs` — 一次性 git 仓库快照/复核
5. `scripts/goal-state.mjs` — 回退检查点 init/validate 与 blocked 拒绝
6. `scripts/host-acceptance.mjs` — fixture 宿主路由判定 + live 探针（未配置为 BLOCKED，非失败）

输出为 JSON 摘要：`ran` / `passed` / `failed` / `limitations` / 每项 `results`。

宿主判定细节见 [HOST-ACCEPTANCE.md](./HOST-ACCEPTANCE.md)。

GitHub Actions 工作流 `validate` 调用同一命令。

## 保证与不保证

| 离线 CI 保证 | 离线 CI 不保证 |
|---|---|
| `model-policy.mjs` 对 `executableCases` 的分级与触发器 | 任意宿主上的 `/deepstack` 自然语言路由 |
| 质量门对 **manifest 白名单** 内 `npm run <script>` 的执行结果 | 自动发现后未经 manifest 授权的执行 |
| `readonly-guard` 对 git 根目录文件/状态的 delta 检测 | 宿主沙箱；探针启动前已有写入 |
| `hosts.json` 能力矩阵内部一致性 | 把 `unknown` 当成支持；把手工笔记当成 CI 通过 |
| Goal 回退文件的 schema 与 blocked 约束 | 原生 Goal 跨重启恢复（见 `hosts.json` 手工记录） |

## 质量门执行

```bash
node scripts/quality-gate.mjs plan <repo>
node scripts/quality-gate.mjs run <repo> --manifest <file> --mode <readonly|write-authorized> --category test
```

- **plan**：只发现命令，不执行。
- **run**：schema 1 仅当 manifest 白名单与 `package.json` scripts 一致、命令形状为 `npm run <script>` 才执行；schema 2 要求 manifest 位于目标仓库并与 Git HEAD 中已提交的同一路径**字节完全一致**，再执行被授权的 `executable`/`args`/`cwd` 命令。
- **readonly** 模式跳过 `readonlySkipCategories`（默认含 `format`）。
- 状态：`PASS` / `FAIL` / `NOT_CONFIGURED` / `SKIPPED` / `TIMEOUT` / `REJECTED`。

manifest 与 fixture 位于 `fixtures/quality-gate/`；行为期望在 `evals/verification-suite.json`。

## 风险预检

```bash
node scripts/model-policy.mjs "<任务原文>"
node scripts/model-policy.mjs --independent-review absent "<L2 任务>"
```

`executableCases` 在 `evals/model-policy.json`；由 `check-plugin` 实际调用脚本断言，而非只读字段。

## 宿主证据单一来源

`evals/hosts.json` 是能力 **confirmed/unknown** 与 **manualObservations** 的唯一机器可读来源。`docs/HOST-VALIDATION.md` 为人类摘要；若与 `hosts.json` 冲突，以 `hosts.json` 为准，并应通过 PR 修正文档。

`arena` / `swarm` 在 `hosts.json` 的 `skillGates` 中声明所需能力；未知能力不得在执行层伪装为已支持。

## 与 RSI 的边界

本里程碑**不是** RSI（仓库未定义）。它不自动改写技能、记忆或规则，只提供失败时会变红的契约测试，为后续受控改进提供基线。
## 工程治理 Node.js 迁移测试

`node scripts/verify.mjs` 额外运行 `tests/scm-workflow.test.mjs`、`tests/quality-gate-mixed.test.mjs` 与 `tests/ci-evidence.test.mjs`、`tests/issue-governance.test.mjs`。其中 main-only 检查执行真实本地 Git 仓库与模拟远端，验证分支、脏树、推送前远端变化、Writer 租约及凭证失效；质量门 schema 2 测试运行 Python unittest 和 npm，含越界、缺工具和超时反例；CI 证据测试验证完整 SHA 与必需工作流的严格匹配。

真实仓库的 CI 查询入口：`node scripts/ci-evidence.mjs <repo> <full-sha> --required <workflow>`。完整配置与限制见 [工程治理内核](./ENGINEERING-GOVERNANCE.md)。原有 `quality-gate.mjs` schema 1 fixture 继续回归。

第二批 Issue 适配测试覆盖精确索引、状态优先级、owner 门禁、否定式约束与人工矩阵防覆盖；不把模拟 Issue 的单测当作真实 GitHub Issue 自动开发验收。

## 暂存区 / 评审一致性反例

`tests/staged-check.test.mjs` 检测 index 与工作区不一致、未跟踪文件、无暂存、测试运行中的源码修改，以及 index tree 在测试前后的变化。`tests/review-evidence.test.mjs` 将该 tree 与真实待审提交的 parent/tree 配对，并要求精确 SHA 的必需 CI 和项目明确声明的本地检查均满足，且永不把机器证据视为 owner 验收。实际复核入口见 [工程治理内核](./ENGINEERING-GOVERNANCE.md)。

## Project doctor / Agent hook 测试（第四批）

`node scripts/verify.mjs` 额外执行 `tests/project-doctor.test.mjs` 与 `tests/agent-preflight.test.mjs`，覆盖真实 Git bare origin、混合技术栈探测、CURRENT 多声明冲突、工作区差异、无配置行为、子目录定位、无 Git 仓库和畸形宿主输入。`project-doctor` 与 Hook 仅做只读事实扫描，单元测试通过不代表实际宿主已经自动注册 Hook；宿主验收仍按 `HOST-ACCEPTANCE.md` 单独执行。

## Manifest 授权来源完整性（第五批）

`tests/manifest-provenance.test.mjs` 覆盖 HEAD 已提交的清单可执行、工作区篡改/已暂存替换/`git add -N` 未提交清单必须拒绝。相比仅用 `git ls-files` 检查路径，此门禁验证实际命令来源的**字节级提交完整性**。它不是操作系统沙箱；项目本身所声明的命令脚本仍是可信可执行代码。
