import { SEC } from "./schema.js";
export function kindOf(s) {
    return s.fields.kind;
}
export function priorityOf(s) {
    return s.fields.priority;
}
/** effective status。closed は Status フィールドに関係なく done */
export function statusOf(s) {
    if (s.state === "closed")
        return "done";
    return s.fields.status;
}
/** Ready 以降(ready / in-progress / done)か */
export function isPlanned(status) {
    return status === "ready" || status === "in-progress" || status === "done";
}
/** 見積もり セクションの `SP: <N>` を読む */
export function parseSp(content) {
    if (content === undefined)
        return null;
    const m = content.match(/^SP:\s*(\d+)\s*$/m);
    return m?.[1] !== undefined ? Number.parseInt(m[1], 10) : null;
}
export function spOf(s) {
    return parseSp(s.sections[SEC.estimate]);
}
