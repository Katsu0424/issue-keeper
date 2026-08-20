import { classify } from "./classify.js";
import { deriveSp, deriveStatus, gatePlanPromotion } from "./rollup.js";
import { requiredSections, SEC } from "./schema.js";
import { isPlanned, kindOf, spOf, statusOf } from "./types.js";
function checkMalformed(s) {
    if (classify(s) !== "Malformed")
        return null;
    const axes = [];
    if (s.fields.kind === null)
        axes.push("kind");
    if (s.state === "open" && s.fields.status === null)
        axes.push("status");
    if (s.fields.priority === null)
        axes.push("priority");
    return {
        code: "malformed-fields",
        message: `軸フィールドが未設定: ${axes.join("、")}`,
        recovery: `issue-keeper set-fields ${s.number} --kind <k> --status <s> --priority <p> で全軸を設定する`,
    };
}
function checkMissingSections(s, kind, status) {
    const required = requiredSections(kind, status, s.parent !== null);
    const missing = required.filter((name) => !(name in s.sections));
    if (missing.length === 0)
        return null;
    const planCmd = kind === "tooling" || kind === "refactor" ? "adr" : kind;
    return {
        code: "missing-sections",
        message: `必須セクション欠落: ${missing.join("、")}`,
        recovery: `issue-keeper update ${kind} ${s.number} または計画コマンド(plan-${planCmd})で書き込む`,
    };
}
function checkMissingSp(s, kind, status, wu) {
    const needsSp = isPlanned(status) && (wu === "Task" || (wu === "Container" && kind !== "epic"));
    if (!needsSp || spOf(s) !== null)
        return null;
    return {
        code: "missing-sp",
        message: "Ready 以降なのに 見積もり(SP: <N>)がない",
        recovery: `issue-keeper update ${kind} ${s.number} --sp <N> で書き込む`,
    };
}
function checkStaleMemory(s, kind, status) {
    if (!isPlanned(status) || !(SEC.memory in s.sections))
        return null;
    return {
        code: "stale-memory",
        message: "計画済み issue に Memory が残存している",
        recovery: `issue-keeper update ${kind} ${s.number} --memory で空にする(吸収し忘れた内容は本文セクションへ反映してから消す)`,
    };
}
function checkRollupDrift(s, status, wu) {
    if (wu !== "Container")
        return null;
    const dStatus = gatePlanPromotion(status, deriveStatus(s.children));
    const dSp = deriveSp(s.children);
    const drift = [];
    if (dStatus !== status)
        drift.push(`Status(実際: ${status} / 導出: ${dStatus})`);
    if (dSp !== spOf(s))
        drift.push(`SP(実際: ${spOf(s)} / 導出: ${dSp})`);
    if (drift.length === 0)
        return null;
    return {
        code: "rollup-drift",
        message: `子からの導出と不一致: ${drift.join("、")}`,
        recovery: "任意の子孫への CLI 実行でロールアップが追いつく",
    };
}
function checkEpicChildren(s, kind, status) {
    // 「進行中の epic には着手できる子がいるはず」という不変条件。
    // 完了した epic(done)は全子が closed なのが正常なので検査しない
    if (kind !== "epic" || (status !== "ready" && status !== "in-progress"))
        return null;
    const openFeatureKids = s.children.filter((c) => c.state === "open" && c.kind === "feature");
    if (openFeatureKids.length > 0)
        return null;
    return {
        code: "epic-without-children",
        message: "Ready 以降の epic に open な feature の子がいない",
        recovery: `issue-keeper create の parent 行(parent: ${s.number})で feature の子を起票する`,
    };
}
function checkChildKinds(s, kind) {
    const mismatched = s.children.filter((c) => kind === "epic" ? c.kind !== "feature" : c.kind !== kind);
    if (mismatched.length === 0)
        return null;
    return {
        code: "child-kind-mismatch",
        message: `子の Kind が規約違反(epic の子は feature、他は親と同一): ${mismatched
            .map((c) => `#${c.number}(${c.kind ?? "不明"})`)
            .join(", ")}`,
        recovery: "issue-keeper set-fields <子番号> --kind <正しい kind> で矯正する",
    };
}
/** §2.10 の不変条件検証。snapshot だけを入力にとる純関数。 */
export function validate(s) {
    const malformed = checkMalformed(s);
    const kind = kindOf(s);
    const status = statusOf(s);
    // Kind が確定しないと以降の検証は意味を持たない
    if (kind === null || status === null)
        return malformed ? [malformed] : [];
    const wu = classify(s);
    const checks = [
        malformed,
        checkMissingSections(s, kind, status),
        checkMissingSp(s, kind, status, wu),
        checkStaleMemory(s, kind, status),
        checkRollupDrift(s, status, wu),
        checkEpicChildren(s, kind, status),
        checkChildKinds(s, kind),
    ];
    return checks.filter((v) => v !== null);
}
