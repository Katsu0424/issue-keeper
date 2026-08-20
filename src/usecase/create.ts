import { z } from "zod";
import type { Config } from "../config.ts";
import {
  CONTEXT_KINDS,
  KINDS,
  type Kind,
  PRIORITIES,
  type Priority,
  SEC,
} from "../domain/schema.ts";
import { renderBody } from "../domain/sections.ts";
import { kindOf, priorityOf, type Snapshot } from "../domain/types.ts";
import { UsageError } from "../errors.ts";
import type { CreatedIssue, Repository } from "../ports.ts";
import { rollupAncestors } from "./rollupWalker.ts";
import { spSection } from "./shared.ts";

const lineSchema = z
  .object({
    title: z.string().min(1),
    kind: z.enum(KINDS).optional(),
    priority: z.enum(PRIORITIES).optional(),
    overview: z.string().min(1).optional(),
    background: z.string().min(1).optional(),
    symptom: z.string().min(1).optional(),
    reproduction: z.string().min(1).optional(),
    expected_vs_actual: z.string().min(1).optional(),
    parent: z.number().int().positive().optional(),
    description: z.string().min(1).optional(),
    sp: z.number().int().positive().optional(),
    customer: z.string().min(1).optional(),
    reference_url: z.string().min(1).optional(),
    memory: z.string().min(1).optional(),
  })
  .strict();

export type CreateLine = z.infer<typeof lineSchema>;

type IntakeField = "overview" | "background" | "symptom" | "reproduction" | "expected_vs_actual";

/** Kind ごとの intake フィールド → セクション名 */
const INTAKE_FIELDS: Record<Kind, ReadonlyArray<[IntakeField, string]>> = {
  feature: [["overview", SEC.overview]],
  epic: [["overview", SEC.overview]],
  tooling: [["background", SEC.background]],
  refactor: [["background", SEC.background]],
  bug: [
    ["symptom", SEC.symptom],
    ["reproduction", SEC.reproduction],
    ["expected_vs_actual", SEC.expectedVsActual],
  ],
};

const TOP_LEVEL_ONLY_FIELDS = [
  "overview",
  "background",
  "symptom",
  "reproduction",
  "expected_vs_actual",
  "customer",
  "reference_url",
] as const;

const INTAKE_FIELD_GUIDE =
  "intake フィールドは Kind ごとに: feature/epic → overview、tooling/refactor → background、bug → symptom・reproduction・expected_vs_actual。子行は description を使う。";

function parseEntry(json: unknown, label: string): CreateLine {
  if (typeof json === "object" && json !== null && "body" in json) {
    throw new UsageError(`${label}: 自由記述 body は受け付けません。${INTAKE_FIELD_GUIDE}`);
  }
  const parsed = lineSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new UsageError(
      `${label}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "不正な入力"}。${INTAKE_FIELD_GUIDE}`,
    );
  }
  return parsed.data;
}

interface RawEntry {
  json: unknown;
  label: string;
}

function jsonlEntries(trimmed: string): RawEntry[] {
  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((raw, i) => {
      try {
        return { json: JSON.parse(raw) as unknown, label: `${i + 1} 行目` };
      } catch {
        throw new UsageError(`${i + 1} 行目: JSON として解釈できません`);
      }
    });
}

/**
 * 入力全体をまず JSON として解釈し(オブジェクト = 1 件 / 配列 = N 件)、
 * 解釈できなければ後方互換の JSONL(1 行 = 1 issue)として読む。
 * ファイル入力の既定形は整形済み JSON(#58: シェル quoting を経由させない)。
 */
function toRawEntries(raw: string): RawEntry[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new UsageError("入力が空です(JSON オブジェクト / 配列、または JSONL)");
  }
  let whole: unknown;
  try {
    whole = JSON.parse(trimmed);
  } catch {
    return jsonlEntries(trimmed);
  }
  if (Array.isArray(whole)) {
    if (whole.length === 0) throw new UsageError("配列が空です(1 要素 = 1 issue)");
    return whole.map((json: unknown, i) => ({ json, label: `${i + 1} 件目` }));
  }
  return [{ json: whole, label: "1 件目" }];
}

interface BuiltRow {
  sections: Record<string, string>;
  kind: Kind;
  priority: Priority;
  status: "backlog" | "ready";
}

function buildIntakeSections(line: CreateLine, label: string, kind: Kind): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const [field, sec] of INTAKE_FIELDS[kind]) {
    const v = line[field];
    if (typeof v !== "string") {
      throw new UsageError(`${label}: ${kind} には ${field}(${sec})が必須です`);
    }
    sections[sec] = v;
  }
  return sections;
}

function buildContextSections(line: CreateLine, label: string, kind: Kind): Record<string, string> {
  const sections: Record<string, string> = {};
  if (
    (line.customer !== undefined || line.reference_url !== undefined) &&
    !CONTEXT_KINDS.includes(kind)
  ) {
    throw new UsageError(
      `${label}: customer / reference_url は feature / bug / epic のみ指定できます`,
    );
  }
  if (line.customer !== undefined) sections[SEC.customer] = line.customer;
  if (line.reference_url !== undefined) sections[SEC.referenceUrl] = line.reference_url;
  if (line.memory !== undefined) sections[SEC.memory] = line.memory;
  return sections;
}

function buildTopLevel(line: CreateLine, label: string): BuiltRow {
  const kind = line.kind;
  if (kind === undefined) {
    throw new UsageError(`${label}: トップレベル行には kind が必須です`);
  }
  if (line.description !== undefined || line.sp !== undefined) {
    throw new UsageError(`${label}: description / sp は子行(parent あり)専用です`);
  }
  return {
    sections: {
      ...buildIntakeSections(line, label, kind),
      ...buildContextSections(line, label, kind),
    },
    kind,
    priority: line.priority ?? "p2",
    status: "backlog",
  };
}

function childKindOf(line: CreateLine, label: string, parent: Snapshot): Kind {
  const parentKind = kindOf(parent);
  if (parentKind === null) {
    throw new UsageError(
      `${label}: 親 #${parent.number} の kind が確定できません(Malformed)。先に set-fields で修復してください`,
    );
  }
  const expected: Kind = parentKind === "epic" ? "feature" : parentKind;
  if (line.kind !== undefined && line.kind !== expected) {
    throw new UsageError(
      `${label}: 親 #${parent.number}(${parentKind})の子の kind は ${expected} です`,
    );
  }
  return expected;
}

function buildChild(line: CreateLine, label: string, parent: Snapshot): BuiltRow {
  const forbidden = TOP_LEVEL_ONLY_FIELDS.filter((f) => line[f] !== undefined);
  if (forbidden.length > 0) {
    throw new UsageError(
      `${label}: 子行の本文は description(内容)で渡します。${forbidden.join(" / ")} はトップレベル行専用です`,
    );
  }
  const sections: Record<string, string> = {};
  if (line.description !== undefined) sections[SEC.description] = line.description;
  if (line.sp !== undefined) sections[SEC.estimate] = spSection(line.sp);
  if (line.memory !== undefined) sections[SEC.memory] = line.memory;
  return {
    sections,
    kind: childKindOf(line, label, parent),
    priority: line.priority ?? priorityOf(parent) ?? "p2",
    status: line.sp !== undefined ? "ready" : "backlog",
  };
}

async function getParent(
  repo: Repository,
  cache: Map<number, Snapshot>,
  n: number,
): Promise<Snapshot> {
  const cached = cache.get(n);
  if (cached !== undefined) return cached;
  const snapshot = await repo.getSnapshot(n);
  cache.set(n, snapshot);
  return snapshot;
}

/** §2.2: 入力(JSON オブジェクト / 配列 / JSONL)から管理対象 issue を起票する */
export async function createIssues(
  repo: Repository,
  cfg: Config,
  raw: string,
): Promise<CreatedIssue[]> {
  const entries = toRawEntries(raw);
  await repo.ensureProject();
  const results: CreatedIssue[] = [];
  const parentsToRollup = new Set<number>();
  const parentCache = new Map<number, Snapshot>();

  for (const entry of entries) {
    const line = parseEntry(entry.json, entry.label);
    const row =
      line.parent !== undefined
        ? buildChild(line, entry.label, await getParent(repo, parentCache, line.parent))
        : buildTopLevel(line, entry.label);

    const created = await repo.createIssue({
      title: line.title,
      body: renderBody(row.sections, cfg.markerPrefix),
      fields: { kind: row.kind, status: row.status, priority: row.priority },
      ...(line.sp !== undefined ? { sp: line.sp } : {}),
    });
    if (line.parent !== undefined) {
      await repo.addSubIssue(line.parent, created.number);
      parentsToRollup.add(line.parent);
      parentCache.delete(line.parent); // 子が増えたのでキャッシュ破棄
    }
    results.push(created);
  }

  // バッチ完了後に親ごとに 1 回ロールアップ
  for (const parent of parentsToRollup) {
    await rollupAncestors(repo, cfg.markerPrefix, parent);
  }
  return results;
}
