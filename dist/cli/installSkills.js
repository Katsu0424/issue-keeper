import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { UsageError } from "../errors.js";
import { out } from "./shared.js";
/**
 * パッケージ同梱の skills/ を利用側の .claude/skills/ にコピーする(冪等・上書き)。
 * プラグイン配布だとスキル名が必ず /plugin:skill 名前空間になるため、
 * 素の /note 等で呼べるようローカルスキルとしてコピー配布する。
 */
export function installSkills(destRoot, srcDir = defaultSrcDir()) {
    if (!existsSync(srcDir)) {
        throw new UsageError(`スキルの配布元が見つかりません: ${srcDir}`);
    }
    const dest = join(destRoot, ".claude", "skills");
    mkdirSync(dest, { recursive: true });
    const names = readdirSync(srcDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    for (const name of names) {
        cpSync(join(srcDir, name), join(dest, name), { recursive: true });
    }
    return names;
}
function defaultSrcDir() {
    // dist/cli/(開発時は src/cli/)からパッケージルート直下の skills/ を解決する
    return fileURLToPath(new URL("../../skills/", import.meta.url));
}
export function registerInstallSkills(program) {
    program
        .command("install-skills")
        .description("同梱スキル(note / next-step / plan-*)を .claude/skills/ にコピーする(冪等)")
        .action(() => {
        const installed = installSkills(process.cwd());
        out({ installed, dest: ".claude/skills" });
    });
}
