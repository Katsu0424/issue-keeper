import type { Config } from "../config.ts";
import { classify } from "../domain/classify.ts";
import {
  CONTEXT_KINDS,
  INTAKE_SECTIONS,
  type Kind,
  requiredSections,
  SEC,
} from "../domain/schema.ts";
import { mergeSections, renderBody } from "../domain/sections.ts";
import { isPlanned, kindOf, type Snapshot, statusOf } from "../domain/types.ts";
import { UsageError } from "../errors.ts";
import type { Repository } from "../ports.ts";
import { rollupAncestors } from "./rollupWalker.ts";
import { spSection, toInspectJson } from "./shared.ts";

export interface UpdateRequest {
  kind: Kind;
  number: number;
  /** セクション名(日本語)→ 内容 */
  sections: Record<string, string>;
  sp?: number;
  /** 空文字列は Memory の除去を意味する */
  memory?: string;
  customer?: string;
  referenceUrl?: string;
}

function hasNoPayload(req: UpdateRequest): boolean {
  return (
    Object.keys(req.sections).length === 0 &&
    req.sp === undefined &&
    req.memory === undefined &&
    req.customer === undefined &&
    req.referenceUrl === undefined
  );
}

function guardUpdate(s: Snapshot, req: UpdateRequest): void {
  const actualKind = kindOf(s);
  if (actualKind !== req.kind) {
    throw new UsageError(
      `issue #${req.number} の kind は ${actualKind ?? "不明(Malformed)"} です。\`issue-keeper update ${actualKind ?? "<kind>"} ${req.number}\` を使ってください`,
    );
  }
  if (hasNoPayload(req)) throw new UsageError("書き換えるセクションが指定されていません");

  const intake = INTAKE_SECTIONS[req.kind];
  const touchedIntake = Object.keys(req.sections).filter((name) => intake.includes(name));
  if (classify(s) === "Container" && touchedIntake.length > 0) {
    throw new UsageError(
      `#${req.number} は Container です。intake セクション(${touchedIntake.join("、")})は子の起票根拠のため書き換えられません`,
    );
  }
  if (
    (req.customer !== undefined || req.referenceUrl !== undefined) &&
    !CONTEXT_KINDS.includes(req.kind)
  ) {
    throw new UsageError("--customer / --reference-url は feature / bug / epic のみ指定できます");
  }
}

function resolveUpdates(s: Snapshot, req: UpdateRequest): Record<string, string | null> {
  const updates: Record<string, string | null> = { ...req.sections };
  if (req.sp !== undefined) updates[SEC.estimate] = spSection(req.sp);
  if (req.customer !== undefined) updates[SEC.customer] = req.customer;
  if (req.referenceUrl !== undefined) updates[SEC.referenceUrl] = req.referenceUrl;
  if (req.memory !== undefined) updates[SEC.memory] = req.memory === "" ? null : req.memory;

  // 計画コマンドと同じ規約: Ready 以降で必須セクションがすべて埋まる書込は Memory を吸収する。
  // 同じ呼び出しで --memory が渡されたときはそれを残す。
  const status = statusOf(s);
  if (status !== null && isPlanned(status) && req.memory === undefined) {
    const after = mergeSections(s.sections, updates);
    const required = requiredSections(req.kind, status, s.parent !== null);
    if (required.every((name) => name in after)) updates[SEC.memory] = null;
  }
  return updates;
}

/** §2.6: 既存 issue の管理セクションを書き換える正規の修正手段 */
export async function updateIssue(
  repo: Repository,
  cfg: Config,
  req: UpdateRequest,
): Promise<Record<string, unknown>> {
  const s = await repo.getSnapshot(req.number);
  guardUpdate(s, req);
  const updates = resolveUpdates(s, req);
  await repo.writeBody(
    req.number,
    renderBody(mergeSections(s.sections, updates), cfg.markerPrefix),
  );
  if (req.sp !== undefined) await repo.setSp(req.number, req.sp);
  // SP の変更は親の 見積もり ロールアップに影響する
  await rollupAncestors(repo, cfg.markerPrefix, s.parent?.number ?? null);
  return toInspectJson(await repo.getSnapshot(req.number));
}
