import fs from "node:fs";

const input = process.argv.slice(2).join(" ").trim() || fs.readFileSync(0, "utf8").trim();
if (!input) {
  console.error("model-policy: task text is required");
  process.exit(2);
}
const text = input.toLocaleLowerCase("zh-CN");

const criticalRules = [
  ["production", /生产|线上|线上环境|production|prod\b/],
  ["data-migration", /数据迁移|数据库迁移|迁移数据|data[ -]?migration|database[ -]?migration|backfill/],
  ["security", /认证|鉴权|安全|密码|密钥|auth|security|credential|token/],
  ["permission", /权限|授权|permission|privilege|access control/],
  ["external-write", /提交|推送|合并|发布|部署|上线|外部写入|commit|push|merge|release|deploy/],
  ["rollback", /回滚|恢复|不可逆|高代价|rollback|irreversible/],
  ["deletion", /删除|清理数据|drop table|delete records?/]
];

const engineeringRules = [
  ["multi-file", /多文件|跨模块|跨仓库|多服务|跨\s*(api|前端|后端|测试)|多端|multi[ -]?file|cross[ -]?(module|repo|service|api)/],
  ["ambiguity", /需求歧义|多个方案|不确定|ambiguous|multiple options?/],
  ["regression", /回归|兼容性|缺少测试|regression|compatibility|without tests?/],
  ["architecture", /架构|设计方案|重构|architecture|design|refactor/]
];

function matched(rules) {
  return rules.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

const critical = matched(criticalRules);
const engineering = matched(engineeringRules);
const tier = critical.length ? "L2" : engineering.length ? "L1" : "L0";

const result = {
  version: 1,
  source: "deterministic-preflight",
  tier,
  fallback: tier === "L2" ? "SAME_MODEL_REVIEW" : "无",
  triggers: [...new Set([...critical, ...engineering])],
  availableModels: "未确认"
};

process.stdout.write(`${JSON.stringify(result)}\n`);
