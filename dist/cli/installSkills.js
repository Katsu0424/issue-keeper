import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { UsageError } from "../errors.js";
import { out } from "./shared.js";
/**
 * パッケージ同梱の skills/ を利用側の .claude/skills/ にコピーする(冪等・上書き)。
 * プラグイン配布だとスキル名が必ず /plugin:skill 名前空間になるため、
 * 素の /note 等で呼べるようローカルスキルとしてコピー配布する。
 *
 * スキル本文の実行形リテラル `pnpm -s issue-keeper` はテンプレートマーカーで、
 * コピー時に利用側のパッケージマネージャに合わせて書き換える。pnpm 以外の
 * リポジトリで pnpm を実行すると node_modules が .ignored に退避される実害があるため。
 */
const RUN_MARKER = "pnpm -s issue-keeper";
const RUNNERS = {
    pnpm: "pnpm -s issue-keeper",
    npm: "npm run -s issue-keeper --",
    yarn: "yarn issue-keeper",
    bun: "bun run issue-keeper",
};
const LOCKFILES = [
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
];
export function installSkills(destRoot, srcDir = defaultSrcDir()) {
    if (!existsSync(srcDir)) {
        throw new UsageError(`スキルの配布元が見つかりません: ${srcDir}`);
    }
    const runner = detectRunner(destRoot);
    const dest = join(destRoot, ".claude", "skills");
    const names = readdirSync(srcDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    for (const name of names) {
        copySkill(join(srcDir, name), join(dest, name), RUNNERS[runner] ?? RUNNERS.pnpm ?? "");
    }
    return { installed: names, runner };
}
/** packageManager フィールド > lockfile > 既定 pnpm の順で利用側のパッケージマネージャを検出する */
export function detectRunner(destRoot) {
    const declared = declaredPackageManager(destRoot);
    if (declared !== null)
        return declared;
    for (const [file, runner] of LOCKFILES) {
        if (existsSync(join(destRoot, file)))
            return runner;
    }
    return "pnpm";
}
function declaredPackageManager(destRoot) {
    let raw;
    try {
        raw = readFileSync(join(destRoot, "package.json"), "utf8");
    }
    catch {
        return null;
    }
    let name;
    try {
        name = JSON.parse(raw).packageManager?.split("@")[0];
    }
    catch {
        return null;
    }
    return typeof name === "string" && name in RUNNERS ? name : null;
}
function copySkill(srcDir, destDir, runCommand) {
    for (const entry of readdirSync(srcDir, { withFileTypes: true, recursive: true })) {
        const abs = join(entry.parentPath, entry.name);
        const destPath = join(destDir, relative(srcDir, abs));
        if (entry.isDirectory())
            continue;
        mkdirSync(dirname(destPath), { recursive: true });
        const content = readFileSync(abs, "utf8").replaceAll(RUN_MARKER, runCommand);
        writeFileSync(destPath, content);
    }
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
        const result = installSkills(process.cwd());
        out({ ...result, dest: ".claude/skills" });
    });
}
