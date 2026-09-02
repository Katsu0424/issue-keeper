import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { UsageError } from "./errors.js";
export const CONFIG_FILE = "issue-keeper.config.json";
const configSchema = z.object({
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "owner/name 形式で指定する"),
    markerPrefix: z.string().min(1, "1 文字以上で指定する").default("issuecli"),
    /** Projects v2 のプロジェクト名。省略時はリポジトリ名 */
    projectTitle: z.string().min(1, "1 文字以上で指定する").optional(),
});
function readIfExists(path) {
    try {
        return readFileSync(path, "utf8");
    }
    catch {
        return null;
    }
}
/** 設定ファイルを検証する。JSON 構文エラーも設定不備(exit 2)としてパス付きで報告する */
function parseConfig(path, raw) {
    let json;
    try {
        json = JSON.parse(raw);
    }
    catch {
        throw new UsageError(`${path} が JSON として解釈できません`);
    }
    const parsed = configSchema.safeParse(json);
    if (!parsed.success) {
        throw new UsageError(`${path} が不正です:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
}
/** cwd から上に辿って issue-keeper.config.json を探す */
export function loadConfig(startDir = process.cwd()) {
    let dir = startDir;
    for (;;) {
        const path = join(dir, CONFIG_FILE);
        const raw = readIfExists(path);
        if (raw !== null)
            return parseConfig(path, raw);
        const parent = dirname(dir);
        if (parent === dir) {
            throw new UsageError(`${CONFIG_FILE} が見つかりません。リポジトリルートに配置してください。`);
        }
        dir = parent;
    }
}
