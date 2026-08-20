import { spOf } from "../domain/types.js";
import { UsageError } from "../errors.js";
import { rollupAncestors } from "./rollupWalker.js";
import { toInspectJson } from "./shared.js";
/** 保存結果を先に分類し、Malformed のままになる保存を拒否する(§2.8) */
function assertRepairable(s, args) {
    const unresolved = [
        ["--kind", args.kind === undefined && s.fields.kind === null],
        ["--priority", args.priority === undefined && s.fields.priority === null],
    ];
    if (s.state === "open") {
        unresolved.push(["--status", args.status === undefined && s.fields.status === null]);
    }
    const stillBroken = unresolved.filter(([, broken]) => broken).map(([flag]) => flag);
    if (stillBroken.length > 0) {
        throw new UsageError(`この保存では Malformed が解消されません。${stillBroken.join(" と ")} も指定してください`);
    }
}
/** §2.8: フィールド・タイトルを直接矯正する復旧コマンド */
export async function setFields(repo, cfg, n, args) {
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
    if (Object.keys(axes).length > 0)
        await repo.setAxisFields(n, axes);
    // 復旧コマンドの一環として SP ミラー(表示用フィールド)も本文の 見積もり に揃える
    await repo.setSp(n, spOf(s));
    if (args.title !== undefined)
        await repo.setTitle(n, args.title);
    await rollupAncestors(repo, cfg.markerPrefix, s.parent?.number ?? null);
    return toInspectJson(await repo.getSnapshot(n));
}
