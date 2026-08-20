import type { Config } from "../config.ts";
import type { Kind, OpenStatus, Priority } from "../domain/schema.ts";
import { type Snapshot, spOf } from "../domain/types.ts";
import { UsageError } from "../errors.ts";
import type { Repository } from "../ports.ts";
import { rollupAncestors } from "./rollupWalker.ts";
import { toInspectJson } from "./shared.ts";

export interface SetFieldsArgs {
  kind?: Kind;
  status?: OpenStatus;
  priority?: Priority;
  title?: string;
}

/** 保存結果を先に分類し、Malformed のままになる保存を拒否する(§2.8) */
function assertRepairable(s: Snapshot, args: SetFieldsArgs): void {
  const unresolved: Array<[string, boolean]> = [
    ["--kind", args.kind === undefined && s.fields.kind === null],
    ["--priority", args.priority === undefined && s.fields.priority === null],
  ];
  if (s.state === "open") {
    unresolved.push(["--status", args.status === undefined && s.fields.status === null]);
  }
  const stillBroken = unresolved.filter(([, broken]) => broken).map(([flag]) => flag);
  if (stillBroken.length > 0) {
    throw new UsageError(
      `この保存では Malformed が解消されません。${stillBroken.join(" と ")} も指定してください`,
    );
  }
}

/** §2.8: フィールド・タイトルを直接矯正する復旧コマンド */
export async function setFields(
  repo: Repository,
  cfg: Config,
  n: number,
  args: SetFieldsArgs,
): Promise<Record<string, unknown>> {
  if (Object.keys(args).length === 0) {
    throw new UsageError("--kind / --status / --priority / --title のいずれかを指定してください");
  }
  const s = await repo.getSnapshot(n);
  assertRepairable(s, args);

  const axes = {
    ...(args.kind !== undefined ? { kind: args.kind } : {}),
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.priority !== undefined ? { priority: args.priority } : {}),
  };
  if (Object.keys(axes).length > 0) await repo.setAxisFields(n, axes);
  // 復旧コマンドの一環として SP ミラー(表示用フィールド)も本文の 見積もり に揃える
  await repo.setSp(n, spOf(s));
  if (args.title !== undefined) await repo.setTitle(n, args.title);

  await rollupAncestors(repo, cfg.markerPrefix, s.parent?.number ?? null);
  return toInspectJson(await repo.getSnapshot(n));
}
