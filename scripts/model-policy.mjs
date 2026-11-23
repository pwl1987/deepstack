import fs from "node:fs";

const rawArgs = process.argv.slice(2);
let independentReview = "unknown";
const textParts = [];
for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === "--single-model") {
    independentReview = "absent";
    continue;
  }
  if (arg === "--independent-review") {
    const value = rawArgs[index + 1];
    if (!["unknown", "absent", "present"].includes(value)) {
      console.error("model-policy: --independent-review 只能是 unknown、absent 或 present");
      process.exit(2);
    }
    independentReview = value;
    index += 1;
    continue;
  }
  textParts.push(arg);
}

const input = textParts.join(" ").trim() || fs.readFileSync(0, "utf8").trim();
if (!input) {
  console.error("model-policy: task text is required");
  process.exit(2);
}

const text = input.toLocaleLowerCase("zh-CN");
// ponytail: 只按标点和近距否定看动作对象，不做句法分析。
const criticalRules = [
  ["production", /生产|线上环境|线上|production|\bprod\b/],
  ["data-migration", /数据迁移|数据库迁移|迁移数据|迁移到[^，。；]{0,12}(?:新库|新表|库)|data[ -]?migration|database[ -]?migration|backfill|migrate\b/i],
  ["security", /认证|鉴权|密码|密钥|凭证|令牌|auth field|\bauth\b|(?:api|access|auth|bearer|refresh|session)\s+tokens?|\bcredentials?\b|\bsecurity\b/],
  ["permission", /权限|授予权限|\bpermission\b|\bprivilege\b|access control/],
  ["external-write", /提交|推送|合并|发布|部署|上线|外部写入|\bcommit\b|\bpush\b|\bmerge\b|\brelease\b|\bdeploy\b/],
  ["rollback", /回滚|不可逆|高代价|\brollback\b|\birreversible\b|恢复(?:生产|线上|数据库|数据|备份)/],
  ["deletion", /清理数据|删库|清空(?:表|数据|用户|数据库)|删除[^，。；]{0,8}(?:生产|线上|数据库|用户|表|记录|数据)|drop table|delete records?/],
];
const engineeringRules = [
  ["multi-file", /多文件|跨模块|跨仓库|多服务|跨\s*(?:api|前端|后端|测试)|多端|multi[ -]?file|cross[ -]?(?:module|repo|service|api)/],
  ["ambiguity", /需求歧义|多个方案|不确定|ambiguous|multiple options?/],
  ["regression", /回归|兼容性|缺少测试|regression|compatibility|without tests?/],
  ["architecture", /架构|设计方案|重构|行为不变|architecture|refactor|\bdesign\b(?!\s+tokens?\b)/],
  ["code-cleanup", /删除[^，。；]{0,16}(?:重复(?:代码|分支|实现)?|旧接口|死代码|无用代码)|去掉[^，。；]{0,12}重复|remove duplicate|duplicate branches|dead code/i],
];

function clausesOf(value) {
  return value.split(/[，,。；;！？!?\n]/).map((part) => part.trim()).filter(Boolean);
}

function negated(clause, matchIndex) {
  const before = clause.slice(0, matchIndex);
  const marks = [...before.matchAll(/先不要|不要|先别|别(?!的)|勿|无需|不用|禁止|不可以|不能|不得|don't|do not/g)];
  const last = marks.at(-1);
  if (!last) return false;
  const between = before.slice(last.index + last[0].length);
  return !/(?:但是?|并且|同时|而且)|直接|必须|需要/.test(between);
}

function falseFriend(clause, name, matchIndex, raw) {
  if (name !== "external-write") return false;
  const tail = clause.slice(matchIndex);
  if ((raw === "发布" || raw === "release") && /^(?:发布(?:说明|记录|笔记|日志)|release notes)/.test(tail)) return true;
  if ((raw === "合并" || raw === "merge") && /^(?:合并冲突|merge conflict)/.test(tail)) return true;
  return false;
}

function collect(clause, rules, found) {
  for (const [name, pattern] of rules) {
    for (const match of clause.matchAll(new RegExp(pattern.source, "g"))) {
      if (falseFriend(clause, name, match.index, match[0])) continue;
      if (negated(clause, match.index)) continue;
      found.add(name);
    }
  }
}

const critical = new Set();
const engineering = new Set();
for (const clause of clausesOf(text)) {
  collect(clause, criticalRules, critical);
  collect(clause, engineeringRules, engineering);
}

const tier = critical.size ? "L2" : engineering.size ? "L1" : "L0";
let fallback = "无";
if (tier === "L2" && independentReview === "absent") fallback = "SAME_MODEL_REVIEW";
if (tier === "L2" && independentReview === "unknown") fallback = "未确认";

process.stdout.write(`${JSON.stringify({
  version: 1,
  source: "deterministic-preflight",
  tier,
  fallback,
  independentReview,
  triggers: [...critical, ...engineering],
  availableModels: "未确认",
})}\n`);
