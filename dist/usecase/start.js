import { classify } from "../domain/classify.js";
import { statusOf } from "../domain/types.js";
import { UsageError } from "../errors.js";
import { rollupAncestors } from "./rollupWalker.js";
import { assertPostCondition, toInspectJson } from "./shared.js";
/** §2.7: Ready の Task を In Progress に遷移し @me をアサインする */
export async function startTask(repo, cfg, n) {
    const s = await repo.getSnapshot(n);
    const wu = classify(s);
    const status = statusOf(s);
    if (wu !== "Task" || status !== "ready") {
        throw new UsageError(`issue #${n} は ${wu}(${status ?? "status 不明"})です。start は Ready の Task にのみ実行できます。` +
            `\`issue-keeper inspect ${n} --dispatch\` で次の 1 手を確認してください`);
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
