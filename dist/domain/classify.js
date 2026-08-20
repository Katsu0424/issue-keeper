import { statusOf } from "./types.js";
/**
 * §1.2 の分類。上から順に判定し最初に当てはまった形状で確定する。
 * closed な issue は Status フィールドに関係なく Done とみなすため、
 * Malformed 判定でも Status 軸は open の場合のみ見る。
 */
export function classify(s) {
    const malformed = s.fields.kind === null ||
        s.fields.priority === null ||
        (s.state === "open" && s.fields.status === null);
    if (malformed)
        return "Malformed";
    if (s.children.length > 0)
        return "Container";
    if (statusOf(s) === "backlog")
        return "Note";
    return "Task";
}
