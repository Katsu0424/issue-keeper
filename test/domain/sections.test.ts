/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { describe, expect, it } from "vitest";
import { mergeSections, parseSections, renderBody } from "../../src/domain/sections.ts";

const P = "issuecli";

describe("sections(§1.3)", () => {
  describe("[正常系] render / parse / merge", () => {
    it("render → parse のラウンドトリップ", () => {
      const sections = { 概要: "これは概要です。\n複数行もある。", 見積もり: "SP: 3" };
      expect(parseSections(renderBody(sections, P), P)).toEqual(sections);
    });

    it("render は正規セクション順に並べる(見積もり は 概要 より後)", () => {
      const body = renderBody({ 見積もり: "SP: 3", 概要: "x" }, P);
      expect(body.indexOf("概要")).toBeLessThan(body.indexOf("見積もり"));
    });

    it("mergeSections は preserve-on-omit(渡さないセクションは現状維持、null は除去)", () => {
      const existing = { 概要: "古い", Memory: "引き継ぎ", 顧客: "A社" };
      const merged = mergeSections(existing, { 概要: "新しい", Memory: null });
      expect(merged).toEqual({ 概要: "新しい", 顧客: "A社" });
    });
  });

  describe("[エッジ] 契約内だが典型から外れる本文", () => {
    it("CRLF の本文もパースできる", () => {
      const body = renderBody({ 概要: "内容" }, P).replace(/\n/g, "\r\n");
      expect(parseSections(body, P)).toEqual({ 概要: "内容" });
    });

    it("空文字列の本文はセクションなし、空内容のセクションは保持", () => {
      expect(parseSections("", P)).toEqual({});
      expect(parseSections(renderBody({ 概要: "" }, P), P)).toEqual({ 概要: "" });
    });

    it("end マーカーのないセクションは EOF まで内容と扱う", () => {
      const body = [`<!-- ${P}:section:概要:start -->`, "## 概要", "", "途中で切れた"].join("\n");
      expect(parseSections(body, P)).toEqual({ 概要: "途中で切れた" });
    });

    it("マーカー接頭辞は設定で変わる(別接頭辞のマーカーは無視)", () => {
      const body = renderBody({ 概要: "内容" }, "other");
      expect(parseSections(body, P)).toEqual({});
      expect(parseSections(body, "other")).toEqual({ 概要: "内容" });
    });
  });

  describe("[異常系] 壊れた・契約外の本文への耐性", () => {
    it("同名セクションの重複マーカーは後勝ち", () => {
      const body = [
        `<!-- ${P}:section:概要:start -->`,
        "先",
        `<!-- ${P}:section:概要:end -->`,
        `<!-- ${P}:section:概要:start -->`,
        "後",
        `<!-- ${P}:section:概要:end -->`,
      ].join("\n");
      expect(parseSections(body, P)).toEqual({ 概要: "後" });
    });
  });

  describe("[否定] 誤反応してはいけないもの", () => {
    it("マーカーに包まれていない ## 見出しはセクション不在と扱う(手編集への誤反応禁止)", () => {
      const body = "## 概要\n\n手書きの本文です。\n";
      expect(parseSections(body, P)).toEqual({});
    });

    it("コードフェンス内の疑似マーカーに誤反応しない", () => {
      const content = [
        "以下は例:",
        "```",
        `<!-- ${P}:section:概要:end -->`,
        `<!-- ${P}:section:罠:start -->`,
        "```",
        "続きの本文",
      ].join("\n");
      const parsed = parseSections(renderBody({ 概要: content }, P), P);
      expect(parsed.概要).toBe(content);
      expect(Object.keys(parsed)).toEqual(["概要"]);
    });
  });
});
