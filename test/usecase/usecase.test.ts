/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { describe, expect, it } from "vitest";
import { dispatch } from "../../src/domain/dispatch.ts";
import { statusOf } from "../../src/domain/types.ts";
import { InvariantError, PostConditionError, UsageError } from "../../src/errors.ts";
import { createIssues } from "../../src/usecase/create.ts";
import { deleteIssue } from "../../src/usecase/deleteIssue.ts";
import { listIssues } from "../../src/usecase/list.ts";
import { planEpic, planFeature } from "../../src/usecase/plan.ts";
import { setFields } from "../../src/usecase/setFields.ts";
import { startTask } from "../../src/usecase/start.ts";
import { updateIssue } from "../../src/usecase/update.ts";
import { axes, FakeRepository, testConfig } from "../fake-repo.ts";

const cfg = testConfig;
const jsonl = (...rows: object[]): string => rows.map((r) => JSON.stringify(r)).join("\n");

describe("create(§2.2)", () => {
  it("feature のトップレベル行を backlog で起票し 概要 を書く", async () => {
    const repo = new FakeRepository();
    const [created] = await createIssues(
      repo,
      cfg,
      jsonl({
        title: "検索を速くする",
        kind: "feature",
        priority: "p1",
        overview: "検索が遅い",
      }),
    );
    const s = await repo.getSnapshot(created!.number);
    expect(s.fields).toEqual(axes("feature", "backlog", "p1"));
    expect(s.sections["概要"]).toBe("検索が遅い");
    expect(repo.projectEnsured).toBe(true);
  });

  it("bug は 3 つの intake が揃わないと拒否", async () => {
    const repo = new FakeRepository();
    await expect(
      createIssues(repo, cfg, jsonl({ title: "落ちる", kind: "bug", symptom: "落ちる" })),
    ).rejects.toThrow(UsageError);
  });

  it("[異常系] 自由記述 body は正しい intake フィールド名を案内して拒否", async () => {
    const repo = new FakeRepository();
    await expect(
      createIssues(repo, cfg, jsonl({ title: "x", kind: "feature", body: "自由本文" })),
    ).rejects.toThrow(/intake フィールド/);
  });

  it("[異常系] 空の JSONL(空文字列・空行のみ)は UsageError", async () => {
    const repo = new FakeRepository();
    await expect(createIssues(repo, cfg, "")).rejects.toThrow(UsageError);
    await expect(createIssues(repo, cfg, "\n\n")).rejects.toThrow(UsageError);
  });

  it("[正常系] 整形済み JSON オブジェクト(複数行)1 件で起票できる(#58 ファイル入力の既定形)", async () => {
    const repo = new FakeRepository();
    const pretty = JSON.stringify(
      { title: "整形入力", kind: "feature", overview: "ファイルから起票" },
      null,
      2,
    );
    const [created] = await createIssues(repo, cfg, pretty);
    const s = await repo.getSnapshot(created!.number);
    expect(s.fields).toEqual(axes("feature", "backlog", "p2"));
    expect(s.sections["概要"]).toBe("ファイルから起票");
  });

  it("[正常系] JSON 配列で複数件を起票できる", async () => {
    const repo = new FakeRepository();
    const arr = JSON.stringify(
      [
        { title: "A", kind: "feature", overview: "a" },
        { title: "B", kind: "tooling", background: "b" },
      ],
      null,
      2,
    );
    const results = await createIssues(repo, cfg, arr);
    expect(results).toHaveLength(2);
  });

  it.each<[string, string]>([
    ["[異常系] 空の JSON 配列", "[]"],
    [
      "[異常系] 配列要素の不正は位置を 件目 で示す",
      '[{"title":"ok","kind":"feature","overview":"x"},{"title":""}]',
    ],
  ])("%s は UsageError", async (_name, raw) => {
    const repo = new FakeRepository();
    await expect(createIssues(repo, cfg, raw)).rejects.toThrow(UsageError);
  });

  it("[異常系] 配列 2 件目の不正はエラーメッセージが「2 件目」を名指す", async () => {
    const repo = new FakeRepository();
    const raw = JSON.stringify([{ title: "ok", kind: "feature", overview: "x" }, { title: "" }]);
    await expect(createIssues(repo, cfg, raw)).rejects.toThrow(/2 件目/);
  });

  it("子行: kind は親から導出、sp があれば ready、priority は親を継承", async () => {
    const repo = new FakeRepository();
    const [epic] = await createIssues(
      repo,
      cfg,
      jsonl({
        title: "施策X",
        kind: "epic",
        priority: "p1",
        overview: "大きい施策",
      }),
    );
    const [c1, c2] = await createIssues(
      repo,
      cfg,
      jsonl(
        { title: "子A", parent: epic!.number, description: "Aをやる", sp: 3 },
        { title: "子B", parent: epic!.number, description: "Bをやる" },
      ),
    );
    const sa = await repo.getSnapshot(c1!.number);
    expect(sa.fields).toEqual(axes("feature", "ready", "p1"));
    expect(sa.sections["内容"]).toBe("Aをやる");
    expect(sa.sections["見積もり"]).toBe("SP: 3");
    const sb = await repo.getSnapshot(c2!.number);
    expect(sb.fields.status).toBe("backlog");
    const parent = await repo.getSnapshot(epic!.number);
    expect(parent.children).toHaveLength(2);
  });

  it("子行の kind が規約と食い違えば拒否(epic の子は feature)", async () => {
    const repo = new FakeRepository();
    const [epic] = await createIssues(
      repo,
      cfg,
      jsonl({
        title: "施策X",
        kind: "epic",
        overview: "o",
      }),
    );
    await expect(
      createIssues(
        repo,
        cfg,
        jsonl({ title: "子", parent: epic!.number, kind: "bug", description: "d" }),
      ),
    ).rejects.toThrow(UsageError);
  });

  it("[エッジ] SP 付き子のバッチ後、親に SP 合計が書かれるが Backlog → Ready 昇格はしない(計画ゲート)", async () => {
    const repo = new FakeRepository();
    const [epic] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "施策X", kind: "epic", overview: "o" }),
    );
    await createIssues(
      repo,
      cfg,
      jsonl(
        { title: "子A", parent: epic!.number, description: "a", sp: 3 },
        { title: "子B", parent: epic!.number, description: "b", sp: 5 },
      ),
    );
    const s = await repo.getSnapshot(epic!.number);
    expect(s.sections["見積もり"]).toBe("SP: 8");
    expect(s.fields.status).toBe("backlog");
  });
});

describe("計画コマンド(§2.5)", () => {
  const seedNote = async (repo: FakeRepository): Promise<number> => {
    const [created] = await createIssues(
      repo,
      cfg,
      jsonl({
        title: "機能Y",
        kind: "feature",
        overview: "概要文",
        memory: "起票時の元資料",
      }),
    );
    return created!.number;
  };

  it("plan-feature: セクションを書き、Memory を同じ保存で除去し、ready に遷移する", async () => {
    const repo = new FakeRepository();
    const n = await seedNote(repo);
    await planFeature(repo, cfg, n, { requirements: "要件文", acceptance: "条件文", sp: 3 });
    const s = await repo.getSnapshot(n);
    expect(s.fields.status).toBe("ready");
    expect(s.sections["要件"]).toBe("要件文");
    expect(s.sections["受け入れ条件"]).toBe("条件文");
    expect(s.sections["見積もり"]).toBe("SP: 3");
    expect(s.sections["Memory"]).toBeUndefined();
    expect(s.sections["概要"]).toBe("概要文"); // preserve-on-omit
    expect(dispatch(s).action).toBe("start-task");
  });

  it("Kind 不一致は拒否", async () => {
    const repo = new FakeRepository();
    const [b] = await createIssues(
      repo,
      cfg,
      jsonl({
        title: "バグ",
        kind: "bug",
        symptom: "s",
        reproduction: "r",
        expected_vs_actual: "e",
      }),
    );
    await expect(
      planFeature(repo, cfg, b!.number, { requirements: "x", acceptance: "y", sp: 1 }),
    ).rejects.toThrow(UsageError);
  });

  it("[否定] 既に Ready の issue を再計画してはいけない", async () => {
    const repo = new FakeRepository();
    const n = await seedNote(repo);
    await planFeature(repo, cfg, n, { requirements: "x", acceptance: "y", sp: 1 });
    await expect(
      planFeature(repo, cfg, n, { requirements: "x2", acceptance: "y2", sp: 2 }),
    ).rejects.toThrow(UsageError);
  });

  it("[エッジ] plan-epic: feature の子が 0 件なら exit 3(1 件との境界)", async () => {
    const repo = new FakeRepository();
    const [epic] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "施策", kind: "epic", overview: "o" }),
    );
    await expect(planEpic(repo, cfg, epic!.number, { scope: "対象" })).rejects.toThrow(
      InvariantError,
    );
  });

  it("plan-epic: 子起票後は Container / Ready になり SP が子の合計になる(§6.3)", async () => {
    const repo = new FakeRepository();
    const [epic] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "施策", kind: "epic", overview: "o" }),
    );
    await createIssues(
      repo,
      cfg,
      jsonl(
        { title: "子A", parent: epic!.number, description: "a", sp: 3 },
        { title: "子B", parent: epic!.number, description: "b", sp: 5 },
      ),
    );
    const result = await planEpic(repo, cfg, epic!.number, { scope: "対象ユーザーと機能候補" });
    expect(result.workUnit).toBe("Container");
    expect(result.status).toBe("Ready");
    expect(result.sp).toBe(8);
  });

  it("[異常系] 書込後の再分類が約束と一致しなければ PostConditionError(exit 4)", async () => {
    class LyingRepo extends FakeRepository {
      override async setAxisFields(): Promise<void> {
        // フィールド書換が黙って失敗する故障モード
      }
    }
    const repo = new LyingRepo();
    const n = await (async () => {
      const [created] = await createIssues(
        repo,
        cfg,
        jsonl({
          title: "機能",
          kind: "feature",
          overview: "o",
        }),
      );
      return created!.number;
    })();
    await expect(
      planFeature(repo, cfg, n, { requirements: "x", acceptance: "y", sp: 1 }),
    ).rejects.toThrow(PostConditionError);
  });
});

describe("start(§2.7)と親ロールアップ", () => {
  it("Ready の Task を In Progress にし、親 epic も In Progress にロールアップする(§6.3)", async () => {
    const repo = new FakeRepository();
    const [epic] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "施策", kind: "epic", overview: "o" }),
    );
    const [c1] = await createIssues(
      repo,
      cfg,
      jsonl(
        { title: "子A", parent: epic!.number, description: "a", sp: 3 },
        { title: "子B", parent: epic!.number, description: "b", sp: 5 },
      ),
    );
    await planEpic(repo, cfg, epic!.number, { scope: "s" });
    const result = await startTask(repo, cfg, c1!.number);
    expect(result.instruction).toContain(`Closes #${c1!.number}`);
    const childSnap = await repo.getSnapshot(c1!.number);
    expect(childSnap.fields.status).toBe("in-progress");
    const epicSnap = await repo.getSnapshot(epic!.number);
    expect(statusOf(epicSnap)).toBe("in-progress");
  });

  it("全子が Done になると親は closed(Done)にロールアップされる", async () => {
    const repo = new FakeRepository();
    const [epic] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "施策", kind: "epic", overview: "o" }),
    );
    const [c1] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "子A", parent: epic!.number, description: "a", sp: 3 }),
    );
    await planEpic(repo, cfg, epic!.number, { scope: "s" });
    await startTask(repo, cfg, c1!.number);
    // PR マージ相当: 子を閉じ、次の CLI 書込(ここでは delete 相当ではなく update)で追いつく
    await repo.closeIssue(c1!.number, "completed");
    await updateIssue(repo, cfg, { kind: "feature", number: c1!.number, sections: {}, sp: 3 });
    const epicSnap = await repo.getSnapshot(epic!.number);
    expect(epicSnap.state).toBe("closed");
  });

  it("Ready 以外・Task 以外は拒否", async () => {
    const repo = new FakeRepository();
    const [note] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "n", kind: "feature", overview: "o" }),
    );
    await expect(startTask(repo, cfg, note!.number)).rejects.toThrow(UsageError);
  });
});

describe("update(§2.6)", () => {
  it("Ready 以降で必須セクションが埋まる書込は Memory を吸収する", async () => {
    const repo = new FakeRepository();
    const [n] = await createIssues(
      repo,
      cfg,
      jsonl({
        title: "機能",
        kind: "feature",
        overview: "o",
        memory: "元資料",
      }),
    );
    await planFeature(repo, cfg, n!.number, { requirements: "r", acceptance: "a", sp: 2 });
    // 手動で Memory を復活させて stale 状態を作る
    await updateIssue(repo, cfg, {
      kind: "feature",
      number: n!.number,
      sections: {},
      memory: "また残った",
    });
    let s = await repo.getSnapshot(n!.number);
    expect(s.sections["Memory"]).toBe("また残った");
    // 必須が全部埋まる書込 → Memory 吸収
    await updateIssue(repo, cfg, { kind: "feature", number: n!.number, sections: { 要件: "r2" } });
    s = await repo.getSnapshot(n!.number);
    expect(s.sections["Memory"]).toBeUndefined();
    expect(s.sections["要件"]).toBe("r2");
  });

  it("同じ呼び出しで --memory が渡されたときは残す", async () => {
    const repo = new FakeRepository();
    const [n] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "機能", kind: "feature", overview: "o" }),
    );
    await planFeature(repo, cfg, n!.number, { requirements: "r", acceptance: "a", sp: 2 });
    await updateIssue(repo, cfg, {
      kind: "feature",
      number: n!.number,
      sections: { 要件: "r2" },
      memory: "意図して残す",
    });
    const s = await repo.getSnapshot(n!.number);
    expect(s.sections["Memory"]).toBe("意図して残す");
  });

  it("Container の intake セクション書換は拒否", async () => {
    const repo = new FakeRepository();
    const [f] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "親", kind: "feature", overview: "o" }),
    );
    await createIssues(
      repo,
      cfg,
      jsonl({ title: "子", parent: f!.number, description: "d", sp: 1 }),
    );
    await expect(
      updateIssue(repo, cfg, {
        kind: "feature",
        number: f!.number,
        sections: { 概要: "書き換え" },
      }),
    ).rejects.toThrow(/Container/);
  });

  it("kind 不一致は正しいコマンドを案内して拒否", async () => {
    const repo = new FakeRepository();
    const [f] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "x", kind: "feature", overview: "o" }),
    );
    await expect(
      updateIssue(repo, cfg, { kind: "bug", number: f!.number, sections: { 原因調査: "r" } }),
    ).rejects.toThrow(/update feature/);
  });
});

describe("set-fields(§2.8)/ delete(§2.9)/ list(§2.4)", () => {
  it("set-fields: Malformed のままになる保存は拒否、正しい保存は矯正する", async () => {
    const repo = new FakeRepository();
    repo.seed({ number: 1, title: "壊れた", fields: axes("feature", null, "p2") });
    await expect(setFields(repo, cfg, 1, { kind: "feature" })).rejects.toThrow(UsageError);
    const result = await setFields(repo, cfg, 1, { kind: "feature", status: "backlog" });
    expect(result.workUnit).toBe("Note");
  });

  it("delete: closed as not planned + detach、冪等、親をロールアップ", async () => {
    const repo = new FakeRepository();
    const [epic] = await createIssues(
      repo,
      cfg,
      jsonl({ title: "施策", kind: "epic", overview: "o" }),
    );
    const [c1, c2] = await createIssues(
      repo,
      cfg,
      jsonl(
        { title: "子A", parent: epic!.number, description: "a", sp: 3 },
        { title: "子B", parent: epic!.number, description: "b", sp: 5 },
      ),
    );
    await deleteIssue(repo, cfg, c2!.number);
    const epicSnap = await repo.getSnapshot(epic!.number);
    expect(epicSnap.children.map((c) => c.number)).toEqual([c1!.number]);
    expect(epicSnap.sections["見積もり"]).toBe("SP: 3");
    // 冪等 [エッジ]
    await expect(deleteIssue(repo, cfg, c2!.number)).resolves.toMatchObject({ deleted: true });
  });

  it("list: プロジェクト所属の open だけを返し、フィルタが効く", async () => {
    const repo = new FakeRepository();
    await createIssues(
      repo,
      cfg,
      jsonl(
        { title: "f1", kind: "feature", overview: "o" },
        { title: "b1", kind: "bug", symptom: "s", reproduction: "r", expected_vs_actual: "e" },
      ),
    );
    repo.seed({ title: "管理外" });
    const all = await listIssues(repo, {});
    expect(all).toHaveLength(2);
    const bugs = await listIssues(repo, { kind: "bug" });
    expect(bugs).toHaveLength(1);
    expect(bugs[0]!.title).toBe("b1");
  });
});

describe("受け入れシナリオ §6.1: feature チェーン", () => {
  it("[正常系] create → plan → start → close → done", async () => {
    const repo = new FakeRepository();
    const [f] = await createIssues(
      repo,
      cfg,
      jsonl({
        title: "機能Z",
        kind: "feature",
        overview: "o",
      }),
    );
    const n = f!.number;

    let step = dispatch(await repo.getSnapshot(n));
    expect(step.instruction).toContain("/plan-feature");

    await planFeature(repo, cfg, n, { requirements: "r", acceptance: "a", sp: 2 });
    step = dispatch(await repo.getSnapshot(n));
    expect(step.action).toBe("start-task");

    await startTask(repo, cfg, n);
    step = dispatch(await repo.getSnapshot(n));
    expect(step.action).toBe("task-in-progress");

    await repo.closeIssue(n, "completed");
    step = dispatch(await repo.getSnapshot(n));
    expect(step.action).toBe("done");
  });
});
