/**
 * §1.5 の導出。表の行順に判定する(In Progress は Backlog より優先)。
 * status が判定不能(null)の子は Backlog 相当として完了を妨げる。
 * 子が 0 件の issue は Container ではないため呼び出し側で除外する。
 */
export function deriveStatus(children) {
    if (children.every((c) => c.status === "done"))
        return "done";
    if (children.some((c) => c.status === "in-progress"))
        return "in-progress";
    if (children.some((c) => c.status === "backlog" || c.status === null))
        return "backlog";
    return "ready";
}
/**
 * 計画ゲート: Backlog → Ready の昇格だけは計画コマンド(plan-*)の専権であり、
 * ロールアップは行わない。これがないと「epic 起票 → SP 付き子を起票 → plan-epic」の
 * 正規手順(§6.3)で、子起票時のロールアップが epic を Ready に昇格させてしまい、
 * plan-epic が「既に Ready」で拒否される。In Progress / Done の伝播は事実の反映なので
 * ゲートしない。
 */
export function gatePlanPromotion(current, derived) {
    return derived === "ready" && current === "backlog" ? "backlog" : derived;
}
/** 子の SP 合計。SP を持つ子が 1 件もなければ null(見積もり を書かない) */
export function deriveSp(children) {
    const sps = children.map((c) => c.sp).filter((sp) => sp !== null);
    if (sps.length === 0)
        return null;
    return sps.reduce((a, b) => a + b, 0);
}
