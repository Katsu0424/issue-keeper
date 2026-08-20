import { readFileSync } from "node:fs";
import { GhRepository } from "../adapter/gh.js";
import { loadConfig } from "../config.js";
import { SEC } from "../domain/schema.js";
import { UsageError } from "../errors.js";
let stdinConsumed = false;
export async function readStdin() {
    if (stdinConsumed)
        throw new UsageError("stdin(-)は 1 回の呼び出しにつき 1 つまでです");
    stdinConsumed = true;
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
}
/** セクション値: ファイルパスまたは -(stdin) */
export async function readValue(v) {
    if (v === "-")
        return (await readStdin()).trim();
    try {
        return readFileSync(v, "utf8").trim();
    }
    catch {
        throw new UsageError(`ファイルを読めません: ${v}`);
    }
}
export function parseIssueNumber(v) {
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n) || n <= 0)
        throw new UsageError(`issue 番号が不正です: ${v}`);
    return n;
}
export function parseSpArg(v) {
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n) || n <= 0)
        throw new UsageError(`--sp は正の整数で指定してください: ${v}`);
    return n;
}
/** 列挙フラグの検証。妥当なら値をそのまま返す */
export function ensureOneOf(value, allowed, flag) {
    if (value === undefined)
        return undefined;
    if (!allowed.includes(value)) {
        throw new UsageError(`${flag} は ${allowed.join(" / ")} のいずれかです`);
    }
    return value;
}
export const out = (obj) => {
    process.stdout.write(`${JSON.stringify(obj)}\n`);
};
/** 設定と Repository は最初に必要になったコマンドで遅延生成する */
export function contextFactory() {
    let cached = null;
    return () => {
        if (cached === null) {
            const cfg = loadConfig();
            cached = { cfg, repo: new GhRepository(cfg) };
        }
        return cached;
    };
}
/** update コマンドで Kind ごとに許可されるセクションフラグ(オプション名 → セクション名) */
export const UPDATE_FLAGS = {
    feature: { overview: SEC.overview, requirements: SEC.requirements, acceptance: SEC.acceptance },
    bug: {
        symptom: SEC.symptom,
        reproduction: SEC.reproduction,
        expectedVsActual: SEC.expectedVsActual,
        report: SEC.report,
    },
    tooling: { background: SEC.background, decision: SEC.decision, alternatives: SEC.alternatives },
    refactor: { background: SEC.background, decision: SEC.decision, alternatives: SEC.alternatives },
    epic: { overview: SEC.overview, scope: SEC.scope },
};
export const ALL_SECTION_FLAGS = {
    overview: "--overview",
    requirements: "--requirements",
    acceptance: "--acceptance",
    symptom: "--symptom",
    reproduction: "--reproduction",
    expectedVsActual: "--expected-vs-actual",
    report: "--report",
    background: "--background",
    decision: "--decision",
    alternatives: "--alternatives",
    scope: "--scope",
};
