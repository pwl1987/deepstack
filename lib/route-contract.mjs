import crypto from "node:crypto";

/** 技能契约要求的五字段路由输出（非关键词路由，仅解析与判定）。 */
const FIELD_PATTERNS = {
  routerStatus: /^路由器状态[：:]\s*(.+)\s*$/m,
  route: /^路由[：:]\s*(.+)\s*$/m,
  modelPolicy: /^模型策略[：:]\s*(.+)\s*$/m,
  downgrade: /^降级[：:]\s*(.+)\s*$/m,
  availableModels: /^可用模型[：:]\s*(.+)\s*$/m,
};

const ALLOWED_ROUTES = new Set([
  "investigation",
  "pickup",
  "delivery",
  "goal",
  "bug-fix",
  "refactor",
  "feature",
]);

const ROUTER_STATUSES = new Set(["已路由", "UNVERIFIED"]);
const MODEL_POLICIES = new Set(["L0", "L1", "L2"]);
const DOWNGRADES = new Set(["无", "SAME_MODEL_REVIEW", "ROUTER_UNVERIFIED", "未确认"]);

const POLICY_ORDER = { L0: 0, L1: 1, L2: 2 };

function tierAtLeast(actual, minimum) {
  if (!MODEL_POLICIES.has(actual) || !MODEL_POLICIES.has(minimum)) return false;
  return POLICY_ORDER[actual] >= POLICY_ORDER[minimum];
}

function tierAtMost(actual, maximum) {
  if (!MODEL_POLICIES.has(actual) || !MODEL_POLICIES.has(maximum)) return false;
  return POLICY_ORDER[actual] <= POLICY_ORDER[maximum];
}

/**
 * 从宿主文本输出解析五字段；拒绝仅靠 JSON 字段名的伪造（须出现官方字段标签行）。
 */
export function parseRouteOutput(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return { ok: false, status: "MALFORMED", reasons: ["empty output"], fields: null };
  }

  // 拒绝「仅 JSON、无五字段标签」的捷径伪造
  const looksLikeBareJson = raw.startsWith("{") && !raw.includes("路由器状态");
  if (looksLikeBareJson) {
    return { ok: false, status: "MALFORMED", reasons: ["bare JSON without required field labels"], fields: null };
  }

  const fields = {};
  const missing = [];
  for (const [key, pattern] of Object.entries(FIELD_PATTERNS)) {
    const match = raw.match(pattern);
    if (!match) missing.push(key);
    else fields[key] = match[1].trim();
  }
  if (missing.length) {
    return { ok: false, status: "MALFORMED", reasons: [`missing fields: ${missing.join(", ")}`], fields: null };
  }

  const reasons = [];
  if (!ROUTER_STATUSES.has(fields.routerStatus)) reasons.push(`invalid routerStatus: ${fields.routerStatus}`);
  if (!ALLOWED_ROUTES.has(fields.route)) reasons.push(`invalid route: ${fields.route}`);
  if (!MODEL_POLICIES.has(fields.modelPolicy)) reasons.push(`invalid modelPolicy: ${fields.modelPolicy}`);
  if (!DOWNGRADES.has(fields.downgrade)) reasons.push(`invalid downgrade: ${fields.downgrade}`);
  if (!fields.availableModels) reasons.push("empty availableModels");

  if (reasons.length) {
    return { ok: false, status: "MALFORMED", reasons, fields };
  }

  return { ok: true, status: "PARSED", reasons: [], fields };
}

export function caseSetDigest(routerCasesJson) {
  return crypto.createHash("sha256").update(JSON.stringify(routerCasesJson)).digest("hex").slice(0, 16);
}

/**
 * 对照用例期望判定宿主输出（不替 LLM 选路由）。
 */
export function adjudicateCase(caseDef, parsed, options = {}) {
  const reasons = [];
  let status = "PASS";

  if (!parsed?.ok) {
    return { status: parsed?.status === "MALFORMED" ? "MALFORMED" : "FAIL", ok: false, reasons: parsed?.reasons || ["unparseable"] };
  }

  const { fields } = parsed;
  const expect = caseDef.expect || {};

  if (caseDef.expectedRoute && fields.route !== caseDef.expectedRoute) {
    reasons.push(`route ${fields.route} != expected ${caseDef.expectedRoute}`);
    status = "FAIL";
  }

  if (expect.routerStatusAnyOf?.length && !expect.routerStatusAnyOf.includes(fields.routerStatus)) {
    reasons.push(`routerStatus ${fields.routerStatus} not in ${expect.routerStatusAnyOf.join("|")}`);
    status = "FAIL";
  }

  if (expect.modelPolicyMax && !tierAtMost(fields.modelPolicy, expect.modelPolicyMax)) {
    reasons.push(`modelPolicy ${fields.modelPolicy} above max ${expect.modelPolicyMax}`);
    status = "FAIL";
  }

  if (expect.modelPolicyMin && !tierAtLeast(fields.modelPolicy, expect.modelPolicyMin)) {
    reasons.push(`modelPolicy ${fields.modelPolicy} below min ${expect.modelPolicyMin}`);
    status = "FAIL";
  }

  if (expect.modelPolicyExact && fields.modelPolicy !== expect.modelPolicyExact) {
    reasons.push(`modelPolicy ${fields.modelPolicy} != ${expect.modelPolicyExact}`);
    status = "FAIL";
  }

  if (expect.fallbackAnyOf?.length && !expect.fallbackAnyOf.includes(fields.downgrade)) {
    reasons.push(`downgrade ${fields.downgrade} not in ${expect.fallbackAnyOf.join("|")}`);
    status = "FAIL";
  }

  if (expect.fallbackExact && fields.downgrade !== expect.fallbackExact) {
    reasons.push(`downgrade ${fields.downgrade} != ${expect.fallbackExact}`);
    status = "FAIL";
  }

  if (expect.availableModelsMustBe === "未确认" && fields.availableModels !== "未确认") {
    reasons.push(`availableModels must be 未确认, got ${fields.availableModels}`);
    status = "FAIL";
  }

  if (options.modelPolicySnapshot) {
    const mp = options.modelPolicySnapshot;
    if (expect.modelPolicyMaxPreflight && mp.tier && !tierAtMost(mp.tier, expect.modelPolicyMaxPreflight)) {
      reasons.push(`preflight tier ${mp.tier} above max ${expect.modelPolicyMaxPreflight}`);
      status = "FAIL";
    }
    if (expect.modelPolicyMin && mp.tier && !tierAtLeast(mp.tier, expect.modelPolicyMin)) {
      reasons.push(`preflight tier ${mp.tier} below min ${expect.modelPolicyMin}`);
      status = "FAIL";
    }
    if (mp.tier === "L2" && fields.modelPolicy !== "L2") {
      reasons.push("L2 preflight requires 模型策略 L2 in host output");
      status = "FAIL";
    }
    if (mp.tier === "L2" && mp.fallback === "SAME_MODEL_REVIEW" && fields.downgrade !== "SAME_MODEL_REVIEW") {
      reasons.push("SAME_MODEL_REVIEW preflight requires matching 降级");
      status = "FAIL";
    }
  }

  if (caseDef.id === "routing-probe-wrapper-wins" && fields.route !== "investigation") {
    reasons.push("routing probe wrapper must keep investigation as primary route");
    status = "FAIL";
  }

  return { status, ok: status === "PASS", reasons, fields };
}

export function formatCanonicalOutput(caseDef, overrides = {}) {
  const route = overrides.route ?? caseDef.expectedRoute;
  const modelPolicy = overrides.modelPolicy ?? caseDef.expect?.modelPolicyExact ?? "L0";
  const downgrade = overrides.downgrade ?? caseDef.expect?.fallbackExact ?? "无";
  const routerStatus = overrides.routerStatus ?? "已路由";
  const availableModels = overrides.availableModels ?? "未确认";
  return [
    `路由器状态：${routerStatus}`,
    `路由：${route}`,
    `模型策略：${modelPolicy}`,
    `降级：${downgrade}`,
    `可用模型：${availableModels}`,
  ].join("\n");
}

export { ALLOWED_ROUTES, ROUTER_STATUSES, MODEL_POLICIES, DOWNGRADES };