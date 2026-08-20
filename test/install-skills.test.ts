/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installSkills } from "../src/cli/installSkills.ts";

const roots: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "issue-keeper-"));
  roots.push(dir);
  return dir;
}

function makeSkillSrc(names: string[]): string {
  const src = makeDir();
  for (const name of names) {
    mkdirSync(join(src, name), { recursive: true });
    writeFileSync(join(src, name, "SKILL.md"), `# ${name}\n`);
  }
  return src;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("installSkills", () => {
  it("[正常系] 同梱スキルを .claude/skills/ にコピーし、名前一覧を返す", () => {
    const src = makeSkillSrc(["note", "next-step"]);
    const dest = makeDir();
    const installed = installSkills(dest, src);
    expect(installed).toEqual(["next-step", "note"]);
    expect(existsSync(join(dest, ".claude", "skills", "note", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, ".claude", "skills", "next-step", "SKILL.md"))).toBe(true);
  });

  it("[正常系] 再実行すると既存のコピーを配布元の内容で上書きする(冪等)", () => {
    const src = makeSkillSrc(["note"]);
    const dest = makeDir();
    installSkills(dest, src);
    writeFileSync(join(dest, ".claude", "skills", "note", "SKILL.md"), "手編集された内容\n");
    installSkills(dest, src);
    const content = readFileSync(join(dest, ".claude", "skills", "note", "SKILL.md"), "utf8");
    expect(content).toBe("# note\n");
  });

  it("[エッジ] 配布元にスキルディレクトリが 1 つもなければ何もせず空配列を返す", () => {
    const src = makeDir();
    const dest = makeDir();
    expect(installSkills(dest, src)).toEqual([]);
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
});
