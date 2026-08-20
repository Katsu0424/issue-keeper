/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { describe, expect, it } from "vitest";
import { dispatch } from "../../src/domain/dispatch.ts";
import type { Kind } from "../../src/domain/schema.ts";
import { child, fields, snap } from "../helpers.ts";

describe("dispatch(§3)", () => {
  describe("[正常系] 状態ごとの次の 1 手", () => {
    it.each<[Kind, string]>([
      ["feature", "/plan-feature"],
      ["bug", "/plan-bug"],
      ["tooling", "/plan-adr"],
      ["refactor", "/plan-adr"],
      ["epic", "/plan-epic"],
    ])("Note(%s)→ %s を名指す", (kind, skill) => {
      const step = dispatch(snap({ fields: fields({ kind }) }));
      expect(step.action).toBe(`plan-${kind}`);
      expect(step.instruction).toContain(skill);
      expect(step.instruction).toContain("#1");
    });

    it("Task(Ready)→ start-task", () => {
      const step = dispatch(snap({ fields: fields({ status: "ready" }) }));
      expect(step.action).toBe("start-task");
      expect(step.instruction).toContain("issue-keeper start 1");
    });

    it("Task(In Progress)→ task-in-progress(/implement を名指す終端)", () => {
      const step = dispatch(snap({ fields: fields({ status: "in-progress" }) }));
      expect(step.action).toBe("task-in-progress");
      expect(step.instruction).toContain("/implement");
      expect(step.instruction).toContain("Closes #1");
    });

    it("Container・Ready の子がちょうど 1 件 → その子の /next-step を名指す", () => {
      const step = dispatch(
        snap({
          fields: fields({ status: "ready" }),
          children: [child({ number: 5, status: "ready" }), child({ number: 6, status: "done" })],
        }),
      );
      expect(step.action).toBe("next-step-sub-issue");
      expect(step.instruction).toContain("/next-step #5");
    });
  });

  describe("[エッジ] 子の状態が割れている Container", () => {
    it("Ready の子が複数 → 人への確認を指示する", () => {
      const step = dispatch(
        snap({
          fields: fields({ status: "ready" }),
          children: [child({ number: 5, status: "ready" }), child({ number: 6, status: "ready" })],
        }),
      );
      expect(step.action).toBe("next-step-sub-issue");
      expect(step.instruction).toContain("#5");
      expect(step.instruction).toContain("#6");
      expect(step.instruction).toContain("人に確認");
    });

    it("Ready の子 0 件(Backlog / In Progress 混在)→ error-state", () => {
      const step = dispatch(
        snap({
          fields: fields({ status: "backlog" }),
          children: [
            child({ number: 5, status: "backlog" }),
            child({ number: 6, status: "in-progress" }),
          ],
        }),
      );
      expect(step.action).toBe("error-state");
      expect(step.instruction).toContain("/next-step #子番号");
      expect(step.instruction).toContain("#6");
    });

    it("全子 Done なのに open → ロールアップ未反映の error-state", () => {
      const step = dispatch(
        snap({
          fields: fields({ status: "ready" }),
          children: [child({ number: 5, status: "done" })],
        }),
      );
      expect(step.action).toBe("error-state");
      expect(step.instruction).toContain("ロールアップ");
    });
  });

  describe("[異常系] 壊れた issue", () => {
    it("Malformed → set-fields の具体例を返す error-state", () => {
      const step = dispatch(snap({ fields: fields({ kind: null, status: null }) }));
      expect(step.action).toBe("error-state");
      expect(step.instruction).toContain("issue-keeper set-fields 1");
      expect(step.instruction).toContain("--kind");
    });
  });

  describe("[否定] 終端からは前進させない", () => {
    it("closed → done(追加の作業は新しい issue へ)", () => {
      const step = dispatch(snap({ state: "closed" }));
      expect(step.action).toBe("done");
      expect(step.instruction).toContain("新しい issue");
    });
  });
});
