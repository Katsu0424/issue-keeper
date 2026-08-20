import type { Config } from "../config.ts";
import { classify } from "../domain/classify.ts";
import { statusOf } from "../domain/types.ts";
import { UsageError } from "../errors.ts";
import type { Repository } from "../ports.ts";
import { rollupAncestors } from "./rollupWalker.ts";
import { assertPostCondition, toInspectJson } from "./shared.ts";

/** §2.7: Ready の Task を In Progress に遷移し @me をアサインする */
export async function startTask(
  repo: Repository,
  cfg: Config,
  n: number,
): Promise<Record<string, unknown>> {
  const s = await repo.getSnapshot(n);
  const wu = classify(s);
  const status = statusOf(s);
  if (wu !== "Task" || status !== "ready") {
    throw new UsageError(
      `issue #${n} は ${wu}(${status ?? "status 不明"})です。start は Ready の Task にのみ実行できます。` +
        `\`issue-keeper inspect ${n} --dispatch\` で次の 1 手を確認してください`,
    );
  }

  await repo.assignSelf(n);
  await repo.setAxisFields(n, { status: "in-progress" });

  const after = await assertPostCondition(repo, n, {
    status: "in-progress",
    workUnits: ["Task"],
  });
  await rollupAncestors(repo, cfg.markerPrefix, s.parent?.number ?? null);

  return {
    ...toInspectJson(after),
    instruction: `実装を開始してください。完了したら PR の本文に \`Closes #${n}\` を書き、マージで issue を閉じてください。`,
  };
}
