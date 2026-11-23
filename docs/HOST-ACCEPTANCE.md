# 宿主端到端验收（0.2.4+）

本里程碑提供**可重复的路由输出判定器**与 **fixture 宿主 harness**；不替代 LLM 做关键词路由，也不把 fixture 成功等同于真实宿主遵从。

## 验证层级

| 层级 | 入口 | CI 默认 | 能否算作 live verified |
|---|---|---|---|
| fixture-sim | `node scripts/host-acceptance.mjs suite` | 是 | 否 |
| 离线契约 | `node scripts/route-adjudicate.mjs case --id …` | 是（经 verify） | 否 |
| host-import | `node scripts/host-acceptance.mjs import --input …` | 负例 fixture | 否（自报来源） |
| host-live | `DEEPSTACK_HOST_ACCEPTANCE` + `probe-live` | 未配置则 BLOCKED（不算失败） | 仅当 verificationTier=host-live 且证据完整 |

## 五字段契约

判定器要求宿主文本中出现**官方字段标签行**（见 `skills/deepstack/SKILL.md`）。仅 JSON、无标签的输出判为 **MALFORMED**，防止伪造捷径。

## 命令

```bash
# 统一离线（含 fixture 套件 + live 探针阻塞态）
node scripts/verify.mjs

# fixture 端到端：成功/失败/畸形/超时/导入拒绝
node scripts/host-acceptance.mjs suite

# 单用例判定
node scripts/route-adjudicate.mjs case --id routing-probe-wrapper-wins --text "$(cat host-out.txt)"

# 生成 fixture 证据包（默认写 /tmp，可 --out）
node scripts/host-acceptance.mjs record-fixture --out /tmp/deepstack-evidence.json

# 导入自报证据（不得提升为 live verified）
node scripts/host-acceptance.mjs import --input /path/evidence.json

# 可选 live（需用户自备 argv，无 shell 拼接）
export DEEPSTACK_HOST_ACCEPTANCE='{"hostId":"zcode","argv":["node","scripts/…"],"timeoutMs":60000}'
node scripts/host-acceptance.mjs probe-live
```

## 证据格式（schema 2）

必含：`repoSha`、`pluginVersion`、`caseSetDigest`、`verificationTier`、`selfReported`、`countsAsLiveVerified`、`host`、`execution`、每用例 `adjudicationStatus`。`repoSha` 或 `caseSetDigest` 与当前仓库不一致时 import 拒绝，避免旧证据当绿灯。

证据默认写在仓库外（`/tmp` 或 `--out`），**不**提交一次运行状态进 git。

## 主宿主与 admission

`evals/route-acceptance.json` 与 `evals/hosts.json` 的 `acceptance` 字段对齐：

- **zcode**：`experimental`，建议首个 live 捕获目标（需本地 opt-in）。
- **fixture-sim**：CI 唯一实跑宿主。
- **cursor-agent**：本云环境无 DeepStack 宿主 CLI → harness 已验证，真实宿主待运行。

## 边界

- 判定器对照 `evals/router-cases.json` 的**人工 curated 期望**与 `model-policy` 预检交叉约束，不保证任意新提示词路由正确。
- `readonly-guard` / `quality-gate` 在完整宿主探针中需单独采集；本 harness 字段预留为 `NOT_RUN`。
- 只读守卫**不是沙箱**；行为自报与真实隔离的差异见 `docs/VERIFICATION.md`。