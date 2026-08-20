import { type Kind, type OpenStatus, type Priority, SEC, type Status } from "./schema.ts";

export interface ParentRef {
  number: number;
  title: string;
}

export interface ChildRef {
  number: number;
  title: string;
  state: "open" | "closed";
  kind: Kind | null;
  /** effective status(closed → done)。フィールド未設定・不正値は null */
  status: Status | null;
  sp: number | null;
}

/**
 * Projects v2 の軸フィールド値。単一選択なので各軸は高々 1 値。
 * null は「未設定(またはプロジェクト未所属・不正なオプション)」。
 */
export interface AxisFields {
  kind: Kind | null;
  status: OpenStatus | null;
  priority: Priority | null;
}

/**
 * 分類・ディスパッチ・検証の唯一の入力。
 * フィールドは生のまま持ち、導出はすべて関数で行う。
 */
export interface Snapshot {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  fields: AxisFields;
  parent: ParentRef | null;
  children: ChildRef[];
  sections: Record<string, string>;
}

export function kindOf(s: Snapshot): Kind | null {
  return s.fields.kind;
}

export function priorityOf(s: Snapshot): Priority | null {
  return s.fields.priority;
}

/** effective status。closed は Status フィールドに関係なく done */
export function statusOf(s: Snapshot): Status | null {
  if (s.state === "closed") return "done";
  return s.fields.status;
}

/** Ready 以降(ready / in-progress / done)か */
export function isPlanned(status: Status | null): boolean {
  return status === "ready" || status === "in-progress" || status === "done";
}

/** 見積もり セクションの `SP: <N>` を読む */
export function parseSp(content: string | undefined): number | null {
  if (content === undefined) return null;
  const m = content.match(/^SP:\s*(\d+)\s*$/m);
  return m?.[1] !== undefined ? Number.parseInt(m[1], 10) : null;
}

export function spOf(s: Snapshot): number | null {
  return parseSp(s.sections[SEC.estimate]);
}
