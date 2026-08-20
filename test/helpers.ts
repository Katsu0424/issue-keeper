import type { AxisFields, ChildRef, Snapshot } from "../src/domain/types.ts";

/** 軸フィールドの部分上書きビルダ */
export function fields(over: Partial<AxisFields> = {}): AxisFields {
  return { kind: "feature", status: "backlog", priority: "p2", ...over };
}

/** ドメイン層テスト用の Snapshot ビルダ */
export function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    number: 1,
    title: "テスト issue",
    url: "https://example.test/1",
    state: "open",
    fields: { kind: "feature", status: "backlog", priority: "p2" },
    parent: null,
    children: [],
    sections: { 概要: "何かの概要" },
    ...over,
  };
}

export function child(over: Partial<ChildRef> = {}): ChildRef {
  return {
    number: 10,
    title: "子",
    state: "open",
    kind: "feature",
    status: "ready",
    sp: null,
    ...over,
  };
}
