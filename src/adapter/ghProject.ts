import {
  FIELD,
  kindFromOptionName,
  priorityFromOptionName,
  SELECT_FIELD_DEFS,
  statusFromOptionName,
} from "../domain/schema.ts";
import type { AxisFields } from "../domain/types.ts";
import { GhError } from "../errors.ts";

/** GraphQL 実行関数(gh api graphql のラッパを注入する) */
export type Gql = (query: string, vars?: Record<string, string | number>) => Promise<unknown>;

/** 単一選択フィールドの実体(オプション名 → オプション id) */
export interface SelectField {
  id: string;
  options: Record<string, string>;
}

/** ensure 済みプロジェクトの id 一式。以後の全フィールド書込が参照する */
export interface ProjectIds {
  projectId: string;
  /** フィールド名(FIELD.*)→ 実体 */
  selects: Record<string, SelectField>;
  spFieldId: string;
}

interface OptionNode {
  id: string;
  name: string;
  color: string;
  description: string;
}

interface FieldNode {
  id?: string;
  name?: string;
  dataType?: string;
  options?: OptionNode[];
}

const OWNER_QUERY = `
query($owner: String!, $q: String!) {
  repositoryOwner(login: $owner) {
    id
    ... on User { projectsV2(query: $q, first: 20) { nodes { id title } } }
    ... on Organization { projectsV2(query: $q, first: 20) { nodes { id title } } }
  }
}`;

const FIELDS_QUERY = `
query($id: ID!) {
  node(id: $id) {
    ... on ProjectV2 {
      fields(first: 50) {
        nodes {
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField { options { id name color description } }
        }
      }
    }
  }
}`;

interface OwnerData {
  data: {
    repositoryOwner: {
      id: string;
      projectsV2?: { nodes: { id: string; title: string }[] };
    } | null;
  };
}

async function findProject(
  gql: Gql,
  owner: string,
  title: string,
): Promise<{ ownerId: string; projectId: string | null }> {
  const data = (await gql(OWNER_QUERY, { owner, q: title })) as OwnerData;
  const node = data.data.repositoryOwner;
  if (node === null) throw new GhError(`オーナー ${owner} が見つかりません`);
  const hit = (node.projectsV2?.nodes ?? []).find((p) => p.title === title) ?? null;
  return { ownerId: node.id, projectId: hit?.id ?? null };
}

async function createProject(
  gql: Gql,
  args: { ownerId: string; title: string; owner: string; repoName: string },
): Promise<string> {
  const created = (await gql(
    `mutation($ownerId: ID!, $title: String!) {
      createProjectV2(input: { ownerId: $ownerId, title: $title }) { projectV2 { id } }
    }`,
    { ownerId: args.ownerId, title: args.title },
  )) as { data: { createProjectV2: { projectV2: { id: string } } } };
  const projectId = created.data.createProjectV2.projectV2.id;

  const repoData = (await gql(
    `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id } }`,
    { owner: args.owner, name: args.repoName },
  )) as { data: { repository: { id: string } } };
  await gql(
    `mutation($p: ID!, $r: ID!) {
      linkProjectV2ToRepository(input: { projectId: $p, repositoryId: $r }) { repository { id } }
    }`,
    { p: projectId, r: repoData.data.repository.id },
  );
  return projectId;
}

async function fetchFields(gql: Gql, projectId: string): Promise<FieldNode[]> {
  const data = (await gql(FIELDS_QUERY, { id: projectId })) as {
    data: { node: { fields: { nodes: FieldNode[] } } };
  };
  return data.data.node.fields.nodes.filter((f) => f.id !== undefined);
}

function optionLiteral(o: {
  id?: string;
  name: string;
  color: string;
  description: string;
}): string {
  const idPart = o.id !== undefined ? `id: ${JSON.stringify(o.id)}, ` : "";
  const nameAndColor = `name: ${JSON.stringify(o.name)}, color: ${o.color}`;
  return `{${idPart}${nameAndColor}, description: ${JSON.stringify(o.description)}}`;
}

/**
 * 望む構成のオプション列を作る: 定義を正とし、同名の既存オプションは id を
 * 引き継いで色・説明を定義に揃える。定義外の既存オプション(built-in の
 * Todo 等)は削除する — 残すと built-in workflow がそこへ書き込み、CLI の
 * 語彙にない値(= Malformed)を生むため。
 */
function mergedOptionLiterals(
  desired: readonly { name: string; color: string; description: string }[],
  existing: OptionNode[],
): string {
  const byName = new Map(existing.map((o) => [o.name, o]));
  return desired
    .map((d) => {
      const cur = byName.get(d.name);
      return optionLiteral(cur !== undefined ? { ...d, id: cur.id } : d);
    })
    .join(", ");
}

/** 定義とオプション名の集合が(順序を除き)一致しないとき update が必要 */
function needsOptionUpdate(
  desired: readonly { name: string }[],
  existing: OptionNode[] | undefined,
): boolean {
  const names = new Set((existing ?? []).map((o) => o.name));
  return desired.some((d) => !names.has(d.name)) || names.size !== desired.length;
}

/** 単一選択フィールドを定義どおりに作成・矯正する。変更があれば true */
async function ensureSelectField(
  gql: Gql,
  projectId: string,
  def: (typeof SELECT_FIELD_DEFS)[number],
  existing: FieldNode | undefined,
): Promise<boolean> {
  if (existing === undefined) {
    const literals = def.options.map((o) => optionLiteral(o)).join(", ");
    await gql(
      `mutation($projectId: ID!, $name: String!) {
        createProjectV2Field(input: {
          projectId: $projectId, dataType: SINGLE_SELECT, name: $name,
          singleSelectOptions: [${literals}]
        }) { projectV2Field { ... on ProjectV2FieldCommon { id } } }
      }`,
      { projectId, name: def.name },
    );
    return true;
  }
  if (!needsOptionUpdate(def.options, existing.options)) return false;
  const literals = mergedOptionLiterals(def.options, existing.options ?? []);
  await gql(
    `mutation($fieldId: ID!) {
      updateProjectV2Field(input: { fieldId: $fieldId, singleSelectOptions: [${literals}] }) {
        projectV2Field { ... on ProjectV2FieldCommon { id } }
      }
    }`,
    { fieldId: existing.id ?? "" },
  );
  return true;
}

async function ensureSpField(
  gql: Gql,
  projectId: string,
  existing: FieldNode | undefined,
): Promise<boolean> {
  if (existing !== undefined) return false;
  await gql(
    `mutation($projectId: ID!, $name: String!) {
      createProjectV2Field(input: { projectId: $projectId, dataType: NUMBER, name: $name }) {
        projectV2Field { ... on ProjectV2FieldCommon { id } }
      }
    }`,
    { projectId, name: FIELD.sp },
  );
  return true;
}

function buildProjectIds(projectId: string, fields: FieldNode[]): ProjectIds {
  const selects: Record<string, SelectField> = {};
  for (const def of SELECT_FIELD_DEFS) {
    const f = fields.find((n) => n.name === def.name);
    if (f?.id === undefined) throw new GhError(`フィールド ${def.name} の作成に失敗しました`);
    const options: Record<string, string> = {};
    for (const o of f.options ?? []) options[o.name] = o.id;
    selects[def.name] = { id: f.id, options };
  }
  const sp = fields.find((n) => n.name === FIELD.sp && n.dataType === "NUMBER");
  if (sp?.id === undefined) throw new GhError(`フィールド ${FIELD.sp} の作成に失敗しました`);
  return { projectId, selects, spFieldId: sp.id };
}

/**
 * プロジェクトと軸フィールドを冪等に ensure し、書込に必要な id 一式を返す。
 * プロジェクトは owner のユーザー/組織プロジェクトとして title で同定する。
 */
export async function ensureProjectIds(
  gql: Gql,
  args: { owner: string; repoName: string; title: string },
): Promise<ProjectIds> {
  const { ownerId, projectId: found } = await findProject(gql, args.owner, args.title);
  const projectId =
    found ??
    (await createProject(gql, {
      ownerId,
      title: args.title,
      owner: args.owner,
      repoName: args.repoName,
    }));

  let fields = await fetchFields(gql, projectId);
  const byName = (name: string): FieldNode | undefined => fields.find((f) => f.name === name);
  let changed = false;
  for (const def of SELECT_FIELD_DEFS) {
    changed = (await ensureSelectField(gql, projectId, def, byName(def.name))) || changed;
  }
  changed = (await ensureSpField(gql, projectId, byName(FIELD.sp))) || changed;
  if (changed) fields = await fetchFields(gql, projectId);
  return buildProjectIds(projectId, fields);
}

/** projectItems の fieldValues(フィールド名 → オプション名)から軸フィールドを読む */
export function axisFieldsFromOptionNames(names: Record<string, string>): AxisFields {
  return {
    kind: kindFromOptionName(names[FIELD.kind] ?? null),
    status: statusFromOptionName(names[FIELD.status] ?? null),
    priority: priorityFromOptionName(names[FIELD.priority] ?? null),
  };
}
