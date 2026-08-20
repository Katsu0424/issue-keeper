/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: yes
*/
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectRunner, installSkills } from "../src/cli/installSkills.ts";

const roots: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "issue-keeper-"));
  roots.push(dir);
  return dir;
}

function makeSkillSrc(names: string[], body = ""): string {
  const src = makeDir();
  for (const name of names) {
    mkdirSync(join(src, name), { recursive: true });
    writeFileSync(join(src, name, "SKILL.md"), `# ${name}\n${body}`);
  }
  return src;
}

function installedSkill(dest: string, name: string): string {
  return readFileSync(join(dest, ".claude", "skills", name, "SKILL.md"), "utf8");
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("installSkills", () => {
  it("[正常系] 同梱スキルを .claude/skills/ にコピーし、名前一覧と runner を返す", () => {
    const src = makeSkillSrc(["note", "next-step"]);
    const dest = makeDir();
    const result = installSkills(dest, src);
    expect(result.installed).toEqual(["next-step", "note"]);
    expect(result.runner).toBe("pnpm");
    expect(existsSync(join(dest, ".claude", "skills", "note", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, ".claude", "skills", "next-step", "SKILL.md"))).toBe(true);
  });

  it("[正常系] 再実行すると既存のコピーを配布元の内容で上書きする(冪等)", () => {
    const src = makeSkillSrc(["note"]);
    const dest = makeDir();
    installSkills(dest, src);
    writeFileSync(join(dest, ".claude", "skills", "note", "SKILL.md"), "手編集された内容\n");
    installSkills(dest, src);
    expect(installedSkill(dest, "note")).toBe("# note\n");
  });

  it("[エッジ] 配布元にスキルディレクトリが 1 つもなければ何もせず空配列を返す", () => {
    const src = makeDir();
    const dest = makeDir();
    expect(installSkills(dest, src).installed).toEqual([]);
  });

  it("[異常系] 配布元ディレクトリが存在しなければ例外を投げる", () => {
    const dest = makeDir();
    expect(() => installSkills(dest, join(dest, "no-such-dir"))).toThrow(
      "スキルの配布元が見つかりません",
    );
  });

  it("[否定] 配布対象外の既存ローカルスキル(implement 等)を消さない", () => {
    const src = makeSkillSrc(["note"]);
    const dest = makeDir();
    const implementPath = join(dest, ".claude", "skills", "implement");
    mkdirSync(implementPath, { recursive: true });
    writeFileSync(join(implementPath, "SKILL.md"), "# implement(ローカル)\n");
    installSkills(dest, src);
    expect(readFileSync(join(implementPath, "SKILL.md"), "utf8")).toBe("# implement(ローカル)\n");
  });

  it("[リグレッション] npm 運用リポジトリでは実行形を npm run 形式に書き換える(pnpm 直書きの配布は node_modules 破壊を招いた)", () => {
    const src = makeSkillSrc(["note"], "実行: `pnpm -s issue-keeper inspect <n> --dispatch`\n");
    const dest = makeDir();
    writeFileSync(join(dest, "package-lock.json"), "{}");
    const result = installSkills(dest, src);
    expect(result.runner).toBe("npm");
    const content = installedSkill(dest, "note");
    expect(content).toContain("`npm run -s issue-keeper -- inspect <n> --dispatch`");
    expect(content).not.toContain("pnpm");
  });

  it("[否定] pnpm 運用リポジトリではスキル本文を書き換えない", () => {
    const body = "実行: `pnpm -s issue-keeper list`\n";
    const src = makeSkillSrc(["note"], body);
    const dest = makeDir();
    writeFileSync(join(dest, "pnpm-lock.yaml"), "");
    expect(installSkills(dest, src).runner).toBe("pnpm");
    expect(installedSkill(dest, "note")).toBe(`# note\n${body}`);
  });
});

describe("detectRunner", () => {
  it.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ])("[正常系] lockfile %s から %s を検出する", (lockfile, runner) => {
    const dest = makeDir();
    writeFileSync(join(dest, lockfile), "");
    expect(detectRunner(dest)).toBe(runner);
  });

  it("[エッジ] packageManager フィールドが lockfile より優先される", () => {
    const dest = makeDir();
    writeFileSync(join(dest, "pnpm-lock.yaml"), "");
    writeFileSync(join(dest, "package.json"), JSON.stringify({ packageManager: "npm@10.9.0" }));
    expect(detectRunner(dest)).toBe("npm");
  });

  it("[エッジ] 検出材料が何もなければ既定の pnpm を返す", () => {
    expect(detectRunner(makeDir())).toBe("pnpm");
  });

  it.each([
    ["未知の値", JSON.stringify({ packageManager: "deno@2.0.0" })],
    ["壊れた JSON", "{broken"],
  ])("[異常系] package.json が %s なら lockfile 検出へフォールバックする", (_label, content) => {
    const dest = makeDir();
    writeFileSync(join(dest, "package.json"), content);
    writeFileSync(join(dest, "yarn.lock"), "");
    expect(detectRunner(dest)).toBe("yarn");
  });
});
