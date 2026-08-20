import type { Config } from "../config.ts";
import type { Repository } from "../ports.ts";
import { rollupAncestors } from "./rollupWalker.ts";

/** §2.9: closed as not planned + 親からの detach を 1 コマンドで。冪等。 */
export async function deleteIssue(
  repo: Repository,
  cfg: Config,
  n: number,
): Promise<Record<string, unknown>> {
  const s = await repo.getSnapshot(n);
  const parentNumber = s.parent?.number ?? null; // detach 前に捕まえる
  if (s.state === "open") await repo.closeIssue(n, "not-planned");
  if (parentNumber !== null) await repo.removeSubIssue(parentNumber, n);
  await rollupAncestors(repo, cfg.markerPrefix, parentNumber);
  return { number: n, url: s.url, deleted: true };
}
