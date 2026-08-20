import { rollupAncestors } from "./rollupWalker.js";
/** §2.9: closed as not planned + 親からの detach を 1 コマンドで。冪等。 */
export async function deleteIssue(repo, cfg, n) {
    const s = await repo.getSnapshot(n);
    const parentNumber = s.parent?.number ?? null; // detach 前に捕まえる
    if (s.state === "open")
        await repo.closeIssue(n, "not-planned");
    if (parentNumber !== null)
        await repo.removeSubIssue(parentNumber, n);
    await rollupAncestors(repo, cfg.markerPrefix, parentNumber);
    return { number: n, url: s.url, deleted: true };
}
