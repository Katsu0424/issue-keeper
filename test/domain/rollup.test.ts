/* test-perspectives:
正常系: yes
エッジ: yes
異常系: n/a 入力は型付き ChildRef 配列(契約外は型が排除。例外を投げない純関数)
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { describe, expect, it } from "vitest";
import { deriveSp, deriveStatus, gatePlanPromotion } from "../../src/domain/rollup.ts";
import type { Status } from "../../src/domain/schema.ts";
import { child } from "../helpers.ts";

describe("rollup(§1.5)", () => {
  describe("[正常系] Status は子から表の行順で導出される", () => {
    it.each<[string, (Status | null)[], Status]>([
      ["すべての子が Done → Done", ["done", "done"], "done"],
      [
        "In Progress がいれば In Progress(Backlog より優先)",
        ["in-progress", "backlog"],
        "in-progress",
      ],
      ["全子 Ready / Done で In Progress なし → Ready", ["ready", "done"], "ready"],
      ["Backlog がいれば Backlog", ["ready", "backlog"], "backlog"],
    ])("%s", (_name, statuses, expected) => {
      expect(deriveStatus(statuses.map((status) => child({ status })))).toBe(expected);
    });
  });

  describe("[エッジ] 判定不能・SP なしの子", () => {
    it("status 不明(null)の子は Backlog 相当として完了を妨げる", () => {
      expect(deriveStatus([child({ status: null })])).toBe("backlog");
    });

    it("SP は非 null の子だけの合計(null の子は無視)", () => {
      expect(deriveSp([child({ sp: 3 }), child({ sp: 5 }), child({ sp: null })])).toBe(8);
    });

    it("SP を持つ子がいなければ null(見積もり を書かない)", () => {
      expect(deriveSp([child({ sp: null })])).toBeNull();
    });
  });

  describe("[否定] 計画ゲート", () => {
    it("Backlog → Ready の昇格をロールアップしてはいけない(plan-* の専権)", () => {
      expect(gatePlanPromotion("backlog", "ready")).toBe("backlog");
    });

    it.each<[string, Status | null, Status, Status]>([
      ["In Progress の伝播はゲートしない", "backlog", "in-progress", "in-progress"],
      ["Done の伝播はゲートしない", "backlog", "done", "done"],
      ["Ready 同士は変化なし", "ready", "ready", "ready"],
      ["In Progress → Ready の降格は通す", "in-progress", "ready", "ready"],
    ])("%s", (_name, current, derived, expected) => {
      expect(gatePlanPromotion(current, derived)).toBe(expected);
    });
  });
});
