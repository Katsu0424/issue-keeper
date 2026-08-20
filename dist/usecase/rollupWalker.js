import { deriveSp, deriveStatus, gatePlanPromotion } from "../domain/rollup.js";
import { SEC } from "../domain/schema.js";
import { mergeSections, renderBody } from "../domain/sections.js";
import { spOf, statusOf } from "../domain/types.js";
async function writeDerivedSp(repo, markerPrefix, s, dSp) {
    const body = renderBody(mergeSections(s.sections, { [SEC.estimate]: `SP: ${dSp}` }), markerPrefix);
    await repo.writeBody(s.number, body);
    await repo.setSp(s.number, dSp);
}
async function writeDerivedStatus(repo, s, dStatus) {
    if (dStatus === "done") {
        if (s.state === "open")
            await repo.closeIssue(s.number, "completed");
        return;
    }
    // closed なのに導出が done でないケースは書き換えない(UI 直接クローズの drift。
    // inspect --validate の rollup-drift が知らせる)
    if (s.state !== "open")
        return;
    await repo.setAxisFields(s.number, { status: dStatus });
}
/** 1 階層ぶんの再導出と保存。一致していれば true(そこで停止してよい) */
async function reconcileLevel(repo, markerPrefix, s) {
    const dStatus = gatePlanPromotion(statusOf(s), deriveStatus(s.children));
    const dSp = deriveSp(s.children);
    const statusMatch = statusOf(s) === dStatus;
    const spMatch = spOf(s) === dSp;
    if (statusMatch && spMatch)
        return true;
    if (!spMatch && dSp !== null)
        await writeDerivedSp(repo, markerPrefix, s, dSp);
    if (!statusMatch)
        await writeDerivedStatus(repo, s, dStatus);
    return false;
}
/**
 * §1.5: 親チェーンを上へ辿り、各階層の Container を子から再導出して食い違う階層を
 * 保存し直す。一致した階層で停止する。
 * from には「書き換えた issue の親」を渡す(削除時は detach 前に捕まえた親)。
 */
export async function rollupAncestors(repo, markerPrefix, from) {
    let cur = from ?? null;
    while (cur !== null) {
        const s = await repo.getSnapshot(cur);
        if (s.children.length === 0)
            return; // Container でなくなっている
        if (await reconcileLevel(repo, markerPrefix, s))
            return; // 一致した階層で停止
        cur = s.parent?.number ?? null;
    }
}
