export const KINDS = ["epic", "feature", "bug", "tooling", "refactor"] as const;
export type Kind = (typeof KINDS)[number];

/** open な issue が取りうる Status。Done は issue の closed 状態から導出する */
export const OPEN_STATUSES = ["backlog", "ready", "in-progress"] as const;
export type OpenStatus = (typeof OPEN_STATUSES)[number];

/** effective status。closed な issue は常に "done" */
export type Status = OpenStatus | "done";

export const PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type Priority = (typeof PRIORITIES)[number];

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
} as const;

/** 本文内の正規セクション順。未知のセクションは末尾(挿入順)。 */
export const SECTION_ORDER: readonly string[] = [
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
export const INTAKE_SECTIONS: Record<Kind, readonly string[]> = {
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
export const READY_SECTIONS: Record<Kind, readonly string[]> = {
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
export function requiredSections(kind: Kind, status: Status, hasParent: boolean): string[] {
  if (hasParent) return [SEC.description];
  const intake = [...INTAKE_SECTIONS[kind]];
  if (status === "backlog") return intake;
  return [...intake, ...READY_SECTIONS[kind]];
}

/** 顧客 / 参考URL を持てる Kind */
export const CONTEXT_KINDS: readonly Kind[] = ["epic", "feature", "bug"];

// --- Projects v2 フィールドの語彙 --------------------------------------------
// 状態 3 軸は GitHub Projects v2 の単一選択フィールドに保存する(ラベルは使わない)。
// ensure がこの定義どおりにフィールドとオプションを冪等に作成・矯正する。

export type OptionColor =
  | "GRAY"
  | "BLUE"
  | "GREEN"
  | "YELLOW"
  | "ORANGE"
  | "RED"
  | "PINK"
  | "PURPLE";

export interface SelectOptionDef {
  name: string;
  color: OptionColor;
  description: string;
}

/** フィールド名(Projects v2 上の表示名) */
export const FIELD = {
  kind: "Kind",
  status: "Status",
  priority: "Priority",
  sp: "SP",
} as const;

// in-progress の表示は GitHub Projects built-in の "In Progress" に合わせる。
// built-in workflow(PR linked 等)が書くオプションと同一にすることで、
// 自動化と CLI が同じ値を指し、上書き合戦にならない。
const STATUS_DISPLAY: Record<Status, string> = {
  backlog: "Backlog",
  ready: "Ready",
  "in-progress": "In Progress",
  done: "Done",
};

export function formatStatus(s: Status | null): string | null {
  return s === null ? null : STATUS_DISPLAY[s];
}

/** Status → フィールドのオプション名 */
export const statusOptionName = (s: Status): string => STATUS_DISPLAY[s];

/**
 * フィールドのオプション名 → open な issue の Status。
 * "Done" は closed からの導出でしか生まれないため、open の値としては不正(null)。
 */
export function statusFromOptionName(name: string | null): OpenStatus | null {
  const entry = (Object.entries(STATUS_DISPLAY) as [Status, string][]).find(([, v]) => v === name);
  return entry !== undefined && entry[0] !== "done" ? entry[0] : null;
}

export function kindFromOptionName(name: string | null): Kind | null {
  return (KINDS as readonly string[]).includes(name ?? "") ? (name as Kind) : null;
}

export const priorityOptionName = (p: Priority): string => p.toUpperCase();

export function priorityFromOptionName(name: string | null): Priority | null {
  const lower = (name ?? "").toLowerCase();
  return (PRIORITIES as readonly string[]).includes(lower) ? (lower as Priority) : null;
}

export const STATUS_OPTIONS: readonly SelectOptionDef[] = [
  { name: statusOptionName("backlog"), color: "GRAY", description: "起票済み・未計画" },
  { name: statusOptionName("ready"), color: "BLUE", description: "計画済み・着手可能" },
  { name: statusOptionName("in-progress"), color: "YELLOW", description: "作業中" },
  { name: statusOptionName("done"), color: "GREEN", description: "完了(closed と対応)" },
];

export const KIND_OPTIONS: readonly SelectOptionDef[] = [
  { name: "epic", color: "PURPLE", description: "複数 feature を束ねる施策" },
  { name: "feature", color: "BLUE", description: "製品目標に向けた変更" },
  { name: "bug", color: "RED", description: "約束どおり動いていない" },
  { name: "tooling", color: "GREEN", description: "開発基盤のための変更" },
  { name: "refactor", color: "YELLOW", description: "挙動を変えない内部変更" },
];

export const PRIORITY_OPTIONS: readonly SelectOptionDef[] = [
  { name: priorityOptionName("p0"), color: "RED", description: "緊急" },
  { name: priorityOptionName("p1"), color: "ORANGE", description: "高" },
  { name: priorityOptionName("p2"), color: "YELLOW", description: "中" },
  { name: priorityOptionName("p3"), color: "GREEN", description: "低" },
];

/** 単一選択フィールドの構成(ensure の正) */
export const SELECT_FIELD_DEFS: ReadonlyArray<{
  name: string;
  options: readonly SelectOptionDef[];
}> = [
  { name: FIELD.status, options: STATUS_OPTIONS },
  { name: FIELD.kind, options: KIND_OPTIONS },
  { name: FIELD.priority, options: PRIORITY_OPTIONS },
];
