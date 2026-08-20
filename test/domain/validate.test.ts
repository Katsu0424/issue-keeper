/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: yes
*/
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../src/domain/types.ts";
import { validate } from "../../src/domain/validate.ts";
import { child, fields, snap } from "../helpers.ts";

const codes = (s: Snapshot): string[] => validate(s).map((v) => v.code);

describe("validate(§2.10)", () => {
  it("[正常系] 整合した Note は違反なし", () => {
    expect(validate(snap())).toEqual([]);
  });

  it("[正常系] 違反には必ず recovery が付く", () => {
    for (const v of validate(snap({ sections: {} }))) {
      expect(v.recovery.length).toBeGreaterThan(0);
    }
  });

  describe("[異常系] 壊れた・欠落した issue を違反として検出する", () => {
    it.each<[string, Snapshot, string]>([
      [
        "malformed-fields: status フィールド未設定",
        snap({ fields: fields({ status: null }) }),
        "malformed-fields",
      ],
      [
        "malformed-fields: priority フィールド未設定",
        snap({ fields: fields({ priority: null }) }),
        "malformed-fields",
      ],
      [
        "missing-sections: セクションが空の Backlog feature は 概要 欠落",
        snap({ sections: {} }),
        "missing-sections",
      ],
      [
        "missing-sections: Ready の bug に 原因調査 がない",
        snap({
          fields: fields({ kind: "bug", status: "ready" }),
          sections: {
            事象: "x",
            再現手順: "y",
            期待される動作と実際の動作: "z",
            見積もり: "SP: 2",
          },
        }),
        "missing-sections",
      ],
      [
        "missing-sp: Ready の Task に 見積もり がない",
        snap({
          fields: fields({ status: "ready" }),
          sections: { 概要: "x", 要件: "y", 受け入れ条件: "z" },
        }),
        "missing-sp",
      ],
      [
        "stale-memory: Ready 以降に Memory が残存",
        snap({
          fields: fields({ status: "ready" }),
          sections: { 概要: "x", 要件: "y", 受け入れ条件: "z", 見積もり: "SP: 2", Memory: "残骸" },
        }),
        "stale-memory",
      ],
      [
        "child-kind-mismatch: epic の子が feature でない",
        snap({
          fields: fields({ kind: "epic", status: "ready" }),
          children: [child({ kind: "bug", status: "ready", sp: 1 })],
          sections: { 概要: "x", スコープ: "y" },
        }),
        "child-kind-mismatch",
      ],
      [
        "child-kind-mismatch: 非 epic の子の Kind が親と不一致",
        snap({
          fields: fields({ status: "ready" }),
          children: [child({ kind: "bug", status: "ready", sp: 1 })],
          sections: { 概要: "x", 要件: "y", 受け入れ条件: "z", 見積もり: "SP: 1" },
        }),
        "child-kind-mismatch",
      ],
    ])("%s", (_name, snapshot, expectedCode) => {
      expect(codes(snapshot)).toContain(expectedCode);
    });
  });

  describe("[エッジ] 部分的に食い違う状態", () => {
    it("子 issue は Kind 表ではなく 内容 セクションを要求する", () => {
      const missing = snap({
        parent: { number: 99, title: "親" },
        fields: fields({ status: "ready" }),
        sections: { 見積もり: "SP: 1" },
      });
      expect(codes(missing)).toContain("missing-sections");
      const ok = snap({
        parent: { number: 99, title: "親" },
        fields: fields({ status: "ready" }),
        sections: { 内容: "やること", 見積もり: "SP: 1" },
      });
      expect(codes(ok)).not.toContain("missing-sections");
    });

    it("rollup-drift: Status は一致しているのに SP だけ子の合計と不一致", () => {
      const s = snap({
        fields: fields({ status: "ready" }),
        children: [child({ status: "ready", sp: 5 })],
        sections: { 概要: "x", 要件: "y", 受け入れ条件: "z", 見積もり: "SP: 2" },
      });
      expect(codes(s)).toContain("rollup-drift");
    });

    it("rollup-drift: Container の Status が導出と不一致", () => {
      const s = snap({
        fields: fields({ status: "ready" }),
        children: [child({ status: "backlog", sp: null })],
        sections: { 概要: "x", 要件: "y", 受け入れ条件: "z", 見積もり: "SP: 2" },
      });
      expect(codes(s)).toContain("rollup-drift");
    });

    it("epic-without-children: 子は居るが全員 closed の Ready epic は違反", () => {
      const s = snap({
        fields: fields({ kind: "epic", status: "ready" }),
        children: [child({ state: "closed", status: "done", kind: "feature" })],
        sections: { 概要: "x", スコープ: "y" },
      });
      expect(codes(s)).toContain("epic-without-children");
    });
  });

  describe("[リグレッション] 過去に出たバグの再発防止", () => {
    it("#21: Done(closed)の epic に epic-without-children を報告しない", () => {
      const s = snap({
        state: "closed",
        fields: fields({ kind: "epic", status: "in-progress" }),
        children: [child({ state: "closed", status: "done", kind: "feature", sp: 3 })],
        sections: { 概要: "x", スコープ: "y", 見積もり: "SP: 3" },
      });
      expect(codes(s)).not.toContain("epic-without-children");
    });

    it("#21 の裏取り: Ready なのに全子 closed の epic は引き続き違反として検出する", () => {
      const s = snap({
        fields: fields({ kind: "epic", status: "ready" }),
        children: [child({ state: "closed", status: "done", kind: "feature" })],
        sections: { 概要: "x", スコープ: "y" },
      });
      expect(codes(s)).toContain("epic-without-children");
    });
  });

  describe("[否定] 誤検出してはいけないもの", () => {
    it("Backlog の Memory を stale-memory にしてはいけない", () => {
      expect(codes(snap({ sections: { 概要: "x", Memory: "引き継ぎ" } }))).not.toContain(
        "stale-memory",
      );
    });

    it("epic の Ready Container を missing-sp にしてはいけない(SP は子からのロールアップ)", () => {
      const s = snap({
        fields: fields({ kind: "epic", status: "ready" }),
        children: [child({ status: "ready", sp: 3 })],
        sections: { 概要: "x", スコープ: "y", 見積もり: "SP: 3" },
      });
      expect(codes(s)).not.toContain("missing-sp");
    });
  });
});
