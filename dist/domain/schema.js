export const KINDS = ["epic", "feature", "bug", "tooling", "refactor"];
/** open な issue が取りうる Status。Done は issue の closed 状態から導出する */
export const OPEN_STATUSES = ["backlog", "ready", "in-progress"];
export const PRIORITIES = ["p0", "p1", "p2", "p3"];
/** セクション名(日本語)の語彙 */
export const SEC = {
    overview: "概要",
    symptom: "事象",
    reproduction: "再現手順",
    expectedVsActual: "期待される動作と実際の動作",
    background: "背景",
    requirements: "要件",
    acceptance: "受け入れ条件",
    report: "原因調査",
    decision: "決定",
    alternatives: "検討した選択肢",
    scope: "スコープ",
    description: "内容",
    estimate: "見積もり",
    customer: "顧客",
    referenceUrl: "参考URL",
    memory: "Memory",
};
/** 本文内の正規セクション順。未知のセクションは末尾(挿入順)。 */
export const SECTION_ORDER = [
    SEC.overview,
    SEC.symptom,
    SEC.reproduction,
    SEC.expectedVsActual,
    SEC.background,
    SEC.scope,
    SEC.description,
    SEC.requirements,
    SEC.acceptance,
    SEC.report,
    SEC.decision,
    SEC.alternatives,
    SEC.estimate,
    SEC.customer,
    SEC.referenceUrl,
    SEC.memory,
];
/** Backlog(起票時)の必須セクション。トップレベル issue に適用。 */
export const INTAKE_SECTIONS = {
    feature: [SEC.overview],
    epic: [SEC.overview],
    bug: [SEC.symptom, SEC.reproduction, SEC.expectedVsActual],
    tooling: [SEC.background],
    refactor: [SEC.background],
};
/**
 * Ready 以降に追加で必須のセクション。
 * 見積もり は missing-sp 検証が単独で扱うためここには含めない(二重違反を避ける)。
 */
export const READY_SECTIONS = {
    feature: [SEC.requirements, SEC.acceptance],
    epic: [SEC.scope],
    bug: [SEC.report],
    tooling: [SEC.decision],
    refactor: [SEC.decision],
};
/**
 * Kind × Status の必須セクション。
 * 子 issue(parent 持ち)は Kind 表ではなく 内容 セクションを要求する。
 */
export function requiredSections(kind, status, hasParent) {
    if (hasParent)
        return [SEC.description];
    const intake = [...INTAKE_SECTIONS[kind]];
    if (status === "backlog")
        return intake;
    return [...intake, ...READY_SECTIONS[kind]];
}
/** 顧客 / 参考URL を持てる Kind */
export const CONTEXT_KINDS = ["epic", "feature", "bug"];
/** フィールド名(Projects v2 上の表示名) */
export const FIELD = {
    kind: "Kind",
    status: "Status",
    priority: "Priority",
    sp: "SP",
};
// in-progress の表示は GitHub Projects built-in の "In Progress" に合わせる。
// built-in workflow(PR linked 等)が書くオプションと同一にすることで、
// 自動化と CLI が同じ値を指し、上書き合戦にならない。
const STATUS_DISPLAY = {
    backlog: "Backlog",
    ready: "Ready",
    "in-progress": "In Progress",
    done: "Done",
};
export function formatStatus(s) {
    return s === null ? null : STATUS_DISPLAY[s];
}
/** Status → フィールドのオプション名 */
export const statusOptionName = (s) => STATUS_DISPLAY[s];
/**
 * フィールドのオプション名 → open な issue の Status。
 * "Done" は closed からの導出でしか生まれないため、open の値としては不正(null)。
 */
export function statusFromOptionName(name) {
    const entry = Object.entries(STATUS_DISPLAY).find(([, v]) => v === name);
    return entry !== undefined && entry[0] !== "done" ? entry[0] : null;
}
export function kindFromOptionName(name) {
    return KINDS.includes(name ?? "") ? name : null;
}
export const priorityOptionName = (p) => p.toUpperCase();
export function priorityFromOptionName(name) {
    const lower = (name ?? "").toLowerCase();
    return PRIORITIES.includes(lower) ? lower : null;
}
export const STATUS_OPTIONS = [
    { name: statusOptionName("backlog"), color: "GRAY", description: "起票済み・未計画" },
    { name: statusOptionName("ready"), color: "BLUE", description: "計画済み・着手可能" },
    { name: statusOptionName("in-progress"), color: "YELLOW", description: "作業中" },
    { name: statusOptionName("done"), color: "GREEN", description: "完了(closed と対応)" },
];
export const KIND_OPTIONS = [
    { name: "epic", color: "PURPLE", description: "複数 feature を束ねる施策" },
    { name: "feature", color: "BLUE", description: "製品目標に向けた変更" },
    { name: "bug", color: "RED", description: "約束どおり動いていない" },
    { name: "tooling", color: "GREEN", description: "開発基盤のための変更" },
    { name: "refactor", color: "YELLOW", description: "挙動を変えない内部変更" },
];
export const PRIORITY_OPTIONS = [
    { name: priorityOptionName("p0"), color: "RED", description: "緊急" },
    { name: priorityOptionName("p1"), color: "ORANGE", description: "高" },
    { name: priorityOptionName("p2"), color: "YELLOW", description: "中" },
    { name: priorityOptionName("p3"), color: "GREEN", description: "低" },
];
/** 単一選択フィールドの構成(ensure の正) */
export const SELECT_FIELD_DEFS = [
    { name: FIELD.status, options: STATUS_OPTIONS },
    { name: FIELD.kind, options: KIND_OPTIONS },
    { name: FIELD.priority, options: PRIORITY_OPTIONS },
];
