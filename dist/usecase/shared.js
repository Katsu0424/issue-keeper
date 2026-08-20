import { classify } from "../domain/classify.js";
import { dispatch } from "../domain/dispatch.js";
import { formatStatus, SEC } from "../domain/schema.js";
import { kindOf, priorityOf, spOf, statusOf } from "../domain/types.js";
import { validate } from "../domain/validate.js";
import { PostConditionError } from "../errors.js";
/** inspect 出力(§2.3)。他コマンドの出力の基礎にも使う。 */
export function toInspectJson(s, opts = {}) {
    const out = {
        number: s.number,
        title: s.title,
        url: s.url,
        state: s.state,
        kind: kindOf(s),
        status: formatStatus(statusOf(s)),
        priority: priorityOf(s),
        workUnit: classify(s),
        parent: s.parent,
        children: s.children.map((c) => ({
            number: c.number,
            title: c.title,
            kind: c.kind,
            status: formatStatus(c.status),
        })),
        sections: s.sections,
        sectionsPresent: Object.keys(s.sections),
        sp: spOf(s),
    };
    if (opts.dispatch)
        out.nextStep = dispatch(s);
    if (opts.validate) {
        const violations = validate(s);
        out.validation = { ok: violations.length === 0, violations };
    }
    return out;
}
/**
 * 遷移コマンドの事後条件照合(§2.1)。
 * 書込後に snapshot を取り直して再分類し、約束と一致しなければ exit 4。
 */
export async function assertPostCondition(repo, n, expected) {
    const s = await repo.getSnapshot(n);
    const actualStatus = statusOf(s);
    const actualWu = classify(s);
    if (actualStatus !== expected.status || !expected.workUnits.includes(actualWu)) {
        throw new PostConditionError({ status: expected.status, workUnit: expected.workUnits.join("|") }, { status: actualStatus, workUnit: actualWu });
    }
    return s;
}
export const spSection = (sp) => `SP: ${sp}`;
/** Ready 遷移時の Memory 吸収規約: Memory を除去する更新セット */
export const MEMORY_REMOVAL = { [SEC.memory]: null };
