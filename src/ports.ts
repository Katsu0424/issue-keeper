import type { Kind, OpenStatus, Priority } from "./domain/schema.ts";
import type { AxisFields, Snapshot } from "./domain/types.ts";

export interface CreatedIssue {
  number: number;
  url: string;
}

export interface ListedIssue {
  number: number;
  title: string;
  url: string;
  fields: AxisFields;
}

/** 起票時に必ず全軸を設定する(Malformed で生まれる issue を作らない) */
export interface CreateFields {
  kind: Kind;
  status: OpenStatus;
  priority: Priority;
}

/**
 * Repository ポート。usecase はこのインタフェース越しにだけ外界に触れる。
 * 実装は adapter/gh.ts(実物)と test/fake-repo.ts(in-memory)。
 * 状態 3 軸は GitHub Projects v2 のフィールドに保存する(ラベルは使わない)。
 */
export interface Repository {
  /** プロジェクトと軸フィールド(Kind / Status / Priority / SP)を冪等に作成・矯正する */
  ensureProject(): Promise<void>;
  getSnapshot(n: number): Promise<Snapshot>;
  /** open かつプロジェクト所属で Kind が設定済みの管理対象 issue を列挙する */
  listOpenManaged(): Promise<ListedIssue[]>;
  /** 起票し、プロジェクトに追加して軸フィールド(と任意で SP)を設定する */
  createIssue(input: {
    title: string;
    body: string;
    fields: CreateFields;
    sp?: number;
  }): Promise<CreatedIssue>;
  writeBody(n: number, body: string): Promise<void>;
  /** 渡した軸だけを単一選択で上書きする(プロジェクト未所属なら追加してから設定) */
  setAxisFields(n: number, p: Partial<CreateFields>): Promise<void>;
  /** SP フィールド(表示用ミラー。真実は本文の 見積もり)を設定する。null でクリア */
  setSp(n: number, sp: number | null): Promise<void>;
  setTitle(n: number, title: string): Promise<void>;
  addSubIssue(parent: number, child: number): Promise<void>;
  /** 冪等(すでに外れていても成功扱い) */
  removeSubIssue(parent: number, child: number): Promise<void>;
  /**
   * completed はボード表示用に Status フィールドも Done にする。
   * not-planned は管理対象外になるためプロジェクトから item を外す。
   */
  closeIssue(n: number, reason: "completed" | "not-planned"): Promise<void>;
  assignSelf(n: number): Promise<void>;
}
