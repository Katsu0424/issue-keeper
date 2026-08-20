/* test-perspectives:
正常系: yes
エッジ: yes
異常系: n/a 入力は型付き Snapshot(契約外は型と単一選択フィールドの構造が入口で排除)
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { describe, expect, it } from "vitest";
import { classify, type WorkUnit } from "../../src/domain/classify.ts";
import type { Snapshot } from "../../src/domain/types.ts";
import { child, fields, snap } from "../helpers.ts";

describe("classify(§1.2)", () => {
  describe("[正常系] 形状は snapshot から順序判定で導出される", () => {
    it.each<[string, Snapshot, WorkUnit]>([
      ["Backlog で子なし → Note", snap(), "Note"],
      ["Ready で子なし → Task", snap({ fields: fields({ status: "ready" }) }), "Task"],
      ["In Progress で子なし → Task", snap({ fields: fields({ status: "in-progress" }) }), "Task"],
      ["sub-issue を持つ → Container", snap({ children: [child()] }), "Container"],
      [
        "Backlog でも子があれば Container",
        snap({ children: [child({ status: "backlog" })] }),
        "Container",
      ],
    ])("%s", (_name, snapshot, expected) => {
      expect(classify(snapshot)).toBe(expected);
    });
  });

  describe("[エッジ] フィールドの未設定・closed の扱い", () => {
    it.each<[string, Snapshot, WorkUnit]>([
      ["kind 未設定 → Malformed", snap({ fields: fields({ kind: null }) }), "Malformed"],
      ["status 未設定 → Malformed", snap({ fields: fields({ status: null }) }), "Malformed"],
      ["priority 未設定 → Malformed", snap({ fields: fields({ priority: null }) }), "Malformed"],
      [
        "Malformed 判定は Container 判定より優先",
        snap({ fields: fields({ kind: null }), children: [child()] }),
        "Malformed",
      ],
      [
        "closed は Status 未設定でも Done の Task",
        snap({ state: "closed", fields: fields({ status: null }) }),
        "Task",
      ],
    ])("%s", (_name, snapshot, expected) => {
      expect(classify(snapshot)).toBe(expected);
    });
  });

  it("[否定] closed でも kind 未設定なら Malformed(Done と扱ってはいけない)", () => {
    expect(classify(snap({ state: "closed", fields: fields({ kind: null }) }))).toBe("Malformed");
  });
});
