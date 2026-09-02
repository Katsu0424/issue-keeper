/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: n/a 設定読込は読むだけで、禁止すべき副作用の分岐がない
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_FILE, loadConfig } from "../src/config.ts";
import { UsageError } from "../src/errors.ts";

const roots: string[] = [];

/** 一時ディレクトリを作り、content があれば設定ファイルとして置く */
function makeRoot(content?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "issue-keeper-config-"));
  roots.push(dir);
  if (content !== undefined) writeFileSync(join(dir, CONFIG_FILE), content);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("[正常系] repo だけの設定を読み、markerPrefix は既定値 issuecli で補う", () => {
    const root = makeRoot(JSON.stringify({ repo: "owner/name" }));
    expect(loadConfig(root)).toEqual({ repo: "owner/name", markerPrefix: "issuecli" });
  });

  it("[正常系] markerPrefix / projectTitle を上書きできる", () => {
    const root = makeRoot(
      JSON.stringify({ repo: "owner/name", markerPrefix: "ik", projectTitle: "Roadmap" }),
    );
    expect(loadConfig(root)).toEqual({
      repo: "owner/name",
      markerPrefix: "ik",
      projectTitle: "Roadmap",
    });
  });

  it("[エッジ] 子ディレクトリから開始しても親の設定ファイルを見つける", () => {
    const root = makeRoot(JSON.stringify({ repo: "owner/name" }));
    const nested = join(root, "packages", "app");
    mkdirSync(nested, { recursive: true });
    expect(loadConfig(nested).repo).toBe("owner/name");
  });

  it("[異常系] JSON として壊れていれば UsageError でファイルパスを示す", () => {
    const root = makeRoot("{broken");
    expect(() => loadConfig(root)).toThrow(UsageError);
    expect(() => loadConfig(root)).toThrow(join(root, CONFIG_FILE));
  });

  it("[異常系] repo が owner/name 形式でなければ UsageError で理由を示す", () => {
    const root = makeRoot(JSON.stringify({ repo: "not-a-repo" }));
    expect(() => loadConfig(root)).toThrow(UsageError);
    expect(() => loadConfig(root)).toThrow(/owner\/name 形式/);
  });

  it("[異常系] どの階層にも設定ファイルがなければ UsageError", () => {
    expect(() => loadConfig(makeRoot())).toThrow(/見つかりません/);
  });
});
