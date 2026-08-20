import type { Config } from "../config.ts";
import { type Kind, SEC } from "../domain/schema.ts";
import { mergeSections, renderBody } from "../domain/sections.ts";
import { kindOf, type Snapshot, statusOf } from "../domain/types.ts";
import { InvariantError, UsageError } from "../errors.ts";
import type { Repository } from "../ports.ts";
import { rollupAncestors } from "./rollupWalker.ts";
import { assertPostCondition, spSection, toInspectJson } from "./shared.ts";

interface PlanRequest {
  kinds: Kind[];
  /** セクション名 → 内容。null は除去 */
  updates: Record<string, string | null>;
  /** 指定時は SP フィールド(表示用ミラー)も同期する */
  sp?: number;
  requiresFeatureChildren?: boolean;
}

/** 計画コマンドの前提ガード(Kind 適合・Backlog・epic の子の存在) */
function guardPlan(s: Snapshot, n: number, req: PlanRequest): void {
  const kind = kindOf(s);
  if (kind === null) {
    throw new UsageError(
      `issue #${n} は Malformed です。先に issue-keeper set-fields で修復してください`,
    );
  }
  if (!req.kinds.includes(kind)) {
    throw new UsageError(
      `issue #${n} の kind は ${kind} です。このコマンドは ${req.kinds.join(" / ")} 専用です`,
    );
  }
  const status = statusOf(s);
  if (status !== "backlog") {
    throw new UsageError(
      `issue #${n} は既に ${status} です。計画コマンドは Backlog の issue にのみ実行できます。修正は issue-keeper update ${kind} ${n} を使ってください`,
    );
  }
  if (req.requiresFeatureChildren) {
    const openFeatureKids = s.children.filter((c) => c.state === "open" && c.kind === "feature");
    if (openFeatureKids.length === 0) {
      throw new InvariantError(
        `epic #${n} に open な feature の子がいません。先に issue-keeper create の parent 行(parent: ${n})で子を起票してください`,
      );
    }
  }
}

/** §2.5 共通: (a) 必須セクションを書き (b) Memory を同じ保存で除去し (c) ready へ遷移 */
async function runPlan(
  repo: Repository,
  cfg: Config,
  n: number,
  req: PlanRequest,
): Promise<Record<string, unknown>> {
  const s = await repo.getSnapshot(n);
  guardPlan(s, n, req);

  // 本文 → フィールドの順に書く(§2.1)。Memory は同じ保存で除去する。
  const merged = mergeSections(s.sections, { ...req.updates, [SEC.memory]: null });
  await repo.writeBody(n, renderBody(merged, cfg.markerPrefix));
  if (req.sp !== undefined) await repo.setSp(n, req.sp);
  await repo.setAxisFields(n, { status: "ready" });

  const after = await assertPostCondition(repo, n, {
    status: "ready",
    workUnits:
      s.children.length > 0 || req.requiresFeatureChildren ? ["Container"] : ["Task", "Container"],
  });
  await rollupAncestors(repo, cfg.markerPrefix, s.parent?.number ?? null);
  return toInspectJson(after);
}

export async function planFeature(
  repo: Repository,
  cfg: Config,
  n: number,
  args: { requirements: string; acceptance: string; sp: number },
): Promise<Record<string, unknown>> {
  return runPlan(repo, cfg, n, {
    kinds: ["feature"],
    updates: {
      [SEC.requirements]: args.requirements,
      [SEC.acceptance]: args.acceptance,
      [SEC.estimate]: spSection(args.sp),
    },
    sp: args.sp,
  });
}

export async function planBug(
  repo: Repository,
  cfg: Config,
  n: number,
  args: { report: string; sp: number },
): Promise<Record<string, unknown>> {
  return runPlan(repo, cfg, n, {
    kinds: ["bug"],
    updates: {
      [SEC.report]: args.report,
      [SEC.estimate]: spSection(args.sp),
    },
    sp: args.sp,
  });
}

export async function planAdr(
  repo: Repository,
  cfg: Config,
  n: number,
  args: { decision: string; alternatives?: string; sp: number },
): Promise<Record<string, unknown>> {
  const updates: Record<string, string | null> = {
    [SEC.decision]: args.decision,
    [SEC.estimate]: spSection(args.sp),
  };
  if (args.alternatives !== undefined) {
    updates[SEC.alternatives] =
      `<details>\n<summary>検討した選択肢</summary>\n\n${args.alternatives}\n\n</details>`;
  }
  return runPlan(repo, cfg, n, { kinds: ["tooling", "refactor"], updates, sp: args.sp });
}

export async function planEpic(
  repo: Repository,
  cfg: Config,
  n: number,
  args: { scope: string },
): Promise<Record<string, unknown>> {
  return runPlan(repo, cfg, n, {
    kinds: ["epic"],
    updates: { [SEC.scope]: args.scope },
    requiresFeatureChildren: true,
  });
}
