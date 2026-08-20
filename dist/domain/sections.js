import { SECTION_ORDER } from "./schema.js";
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const startMarkerRe = (prefix) => new RegExp(`^<!--\\s*${escapeRegExp(prefix)}:section:(.+?):start\\s*-->\\s*$`);
const endMarkerRe = (prefix, name) => new RegExp(`^<!--\\s*${escapeRegExp(prefix)}:section:${escapeRegExp(name)}:end\\s*-->\\s*$`);
const FENCE_RE = /^\s*(?:```|~~~)/;
function finalizeSection(st) {
    if (st.current === null)
        return;
    let content = st.buf;
    // render が付ける `## 名前` 見出しを内容から剥がす(先頭の空行を挟んでもよい)
    let i = 0;
    while (i < content.length && content[i]?.trim() === "")
        i++;
    if (content[i]?.trim() === `## ${st.current}`)
        content = content.slice(i + 1);
    st.result[st.current] = content.join("\n").trim();
    st.current = null;
    st.buf = [];
}
/** セクション外の行: start マーカーだけを探し、それ以外は無視する */
function consumeOutside(st, line) {
    const m = line.match(st.startRe);
    if (m?.[1] !== undefined) {
        st.current = m[1];
        return;
    }
    if (FENCE_RE.test(line))
        st.inFence = !st.inFence;
}
function consumeLine(st, line) {
    if (!st.inFence && st.current === null) {
        consumeOutside(st, line);
        return;
    }
    if (!st.inFence && st.current !== null && endMarkerRe(st.prefix, st.current).test(line)) {
        finalizeSection(st);
        return;
    }
    if (FENCE_RE.test(line))
        st.inFence = !st.inFence;
    if (st.current !== null)
        st.buf.push(line);
}
/**
 * マーカー区切り本文をパースする。マーカーのみを見る(素の見出しはセクションではない)。
 * - CRLF は LF に正規化する
 * - コードフェンス内のマーカー風文字列は無視する
 * - 同名セクションが重複した場合は後勝ち
 * - end マーカーのないセクションは EOF までを内容とする
 */
export function parseSections(body, prefix) {
    const st = {
        prefix,
        startRe: startMarkerRe(prefix),
        current: null,
        buf: [],
        inFence: false,
        result: {},
    };
    for (const line of body.replace(/\r\n/g, "\n").split("\n"))
        consumeLine(st, line);
    finalizeSection(st);
    return st.result;
}
/** 正規順(SECTION_ORDER)→ 未知セクションは挿入順、でマーカー付き本文を組み立てる */
export function renderBody(sections, prefix) {
    const names = Object.keys(sections);
    const known = SECTION_ORDER.filter((n) => names.includes(n));
    const unknown = names.filter((n) => !SECTION_ORDER.includes(n));
    const blocks = [...known, ...unknown].map((name) => {
        const content = sections[name] ?? "";
        return [
            `<!-- ${prefix}:section:${name}:start -->`,
            `## ${name}`,
            "",
            content,
            `<!-- ${prefix}:section:${name}:end -->`,
        ].join("\n");
    });
    return `${blocks.join("\n\n")}\n`;
}
/**
 * preserve-on-omit のセクション統合。
 * updates に無いセクションは現状維持、文字列は全置換、null はセクション除去。
 */
export function mergeSections(existing, updates) {
    const merged = { ...existing };
    for (const [name, value] of Object.entries(updates)) {
        if (value === null)
            delete merged[name];
        else
            merged[name] = value;
    }
    return merged;
}
