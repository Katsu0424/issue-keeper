import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { UsageError } from "./errors.js";
const configSchema = z.object({
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "owner/name 形式で指定する"),
    markerPrefix: z.string().min(1).default("issuecli"),
    /** Projects v2 のプロジェクト名。省略時はリポジトリ名 */
    projectTitle: z.string().min(1).optional(),
});
/** cwd から上に辿って issue-keeper.config.json を探す */
export function loadConfig(startDir = process.cwd()) {
    let dir = startDir;
    for (;;) {
        const path = join(dir, "issue-keeper.config.json");
        let raw = null;
        try {
            raw = readFileSync(path, "utf8");
        }
        catch {
            // 見つからなければ親へ
        }
        if (raw !== null) {
            const parsed = configSchema.safeParse(JSON.parse(raw));
            if (!parsed.success) {
                throw new UsageError(`${path} が不正です: ${parsed.error.message}`);
            }
            return parsed.data;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            throw new UsageError("issue-keeper.config.json が見つかりません。リポジトリルートに配置してください。");
        }
        dir = parent;
    }
}
