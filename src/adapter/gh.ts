import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Config } from "../config.ts";
import { FIELD, priorityOptionName, SEC, statusOptionName } from "../domain/schema.ts";
import { parseSections } from "../domain/sections.ts";
import type { AxisFields, ChildRef, Snapshot } from "../domain/types.ts";
import { parseSp } from "../domain/types.ts";
import { GhError } from "../errors.ts";
import type { CreatedIssue, CreateFields, ListedIssue, Repository } from "../ports.ts";
import { axisFieldsFromOptionNames, ensureProjectIds, type ProjectIds } from "./ghProject.ts";

const execFileAsync = promisify(execFile);

/** 単一選択のフィールド値だけを読む(他の型の値は空オブジェクトになり無視される) */
const FIELD_VALUES = `
fieldValues(first: 20) {
  nodes {
    ... on ProjectV2ItemFieldSingleSelectValue {
      name
      field { ... on ProjectV2FieldCommon { name } }
    }
  }
}`;

const PROJECT_ITEMS = `
projectItems(first: 10) {
  nodes { id project { id } ${FIELD_VALUES} }
}`;

const SNAPSHOT_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      number title url body
      state
      ${PROJECT_ITEMS}
      parent { number title }
      subIssues(first: 100) {
        nodes {
          number title state body
          ${PROJECT_ITEMS}
        }
      }
    }
  }
}`;

const ITEMS_QUERY = `
query($id: ID!, $after: String) {
  node(id: $id) {
    ... on ProjectV2 {
      items(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          ${FIELD_VALUES}
          content { ... on Issue { number title url state } }
        }
      }
    }
  }
}`;

const IDS_QUERY = `
query($owner: String!, $name: String!, $parent: Int!, $child: Int!) {
  repository(owner: $owner, name: $name) {
    parent: issue(number: $parent) { id }
    child: issue(number: $child) { id }
  }
}`;

const ISSUE_ID_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $number) { id } }
}`;

interface GqlFieldValue {
  name?: string;
  field?: { name?: string };
}

interface GqlProjectItem {
  id: string;
  project: { id: string };
  fieldValues: { nodes: GqlFieldValue[] };
}

interface GqlSubIssue {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  body: string;
  projectItems: { nodes: GqlProjectItem[] };
}

interface GqlIssue extends GqlSubIssue {
  url: string;
  parent: { number: number; title: string } | null;
  subIssues: { nodes: GqlSubIssue[] };
}

/** fieldValues からフィールド名 → オプション名の対応を作る */
function fieldValueNames(nodes: GqlFieldValue[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const v of nodes) {
    if (v.name !== undefined && v.field?.name !== undefined) names[v.field.name] = v.name;
  }
  return names;
}

/** 対象プロジェクトの item の軸フィールドを読む(未所属なら全軸 null) */
function axisFieldsOf(items: GqlProjectItem[], projectId: string): AxisFields {
  const item = items.find((i) => i.project.id === projectId);
  return axisFieldsFromOptionNames(fieldValueNames(item?.fieldValues.nodes ?? []));
}

interface GqlItemsPage {
  pageInfo: { hasNextPage: boolean; endCursor: string };
  nodes: {
    fieldValues: { nodes: GqlFieldValue[] };
    content: { number?: number; title?: string; url?: string; state?: string } | null;
  }[];
}

/** プロジェクト item のページから管理対象(open かつ Kind 設定済み)の行を取り出す */
function managedRowsOf(nodes: GqlItemsPage["nodes"]): ListedIssue[] {
  const rows: ListedIssue[] = [];
  for (const node of nodes) {
    const c = node.content;
    if (c?.number === undefined || c.state !== "OPEN") continue;
    const fields = axisFieldsFromOptionNames(fieldValueNames(node.fieldValues.nodes));
    if (fields.kind === null) continue;
    rows.push({ number: c.number, title: c.title ?? "", url: c.url ?? "", fields });
  }
  return rows;
}

/** gh CLI をサブプロセス実行する Repository 実装。認証は gh auth に委譲する。 */
export class GhRepository implements Repository {
  private projectIds: ProjectIds | null = null;
  private readonly cfg: Config;
  private readonly owner: string;
  private readonly name: string;

  constructor(cfg: Config) {
    this.cfg = cfg;
    const [owner, name] = cfg.repo.split("/");
    this.owner = owner ?? "";
    this.name = name ?? "";
  }

  private async gh(args: string[], input?: string): Promise<string> {
    try {
      const child = execFileAsync("gh", args, { maxBuffer: 32 * 1024 * 1024 });
      if (input !== undefined && child.child.stdin) {
        child.child.stdin.write(input);
        child.child.stdin.end();
      }
      const { stdout } = await child;
      return stdout;
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      const msg = err.stderr || err.message || "";
      const hint = /requires one of the following scopes/i.test(msg)
        ? "。gh トークンに project スコープがありません。`gh auth refresh -s project --hostname github.com` で付与してください"
        : "";
      throw new GhError(`gh ${args[0]} ${args[1] ?? ""} が失敗: ${msg}${hint}`);
    }
  }

  private async graphql(
    query: string,
    vars: Record<string, string | number> = {},
  ): Promise<unknown> {
    const args = ["api", "graphql", "-f", `query=${query}`];
    for (const [k, v] of Object.entries(vars)) {
      args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
    }
    return JSON.parse(await this.gh(args));
  }

  private async project(): Promise<ProjectIds> {
    if (this.projectIds === null) {
      this.projectIds = await ensureProjectIds((q, v) => this.graphql(q, v), {
        owner: this.owner,
        repoName: this.name,
        title: this.cfg.projectTitle ?? this.name,
      });
    }
    return this.projectIds;
  }

  async ensureProject(): Promise<void> {
    await this.project();
  }

  private toChildRef(c: GqlSubIssue, projectId: string): ChildRef {
    const fields = axisFieldsOf(c.projectItems.nodes, projectId);
    const state = c.state === "CLOSED" ? "closed" : "open";
    const sections = parseSections(c.body ?? "", this.cfg.markerPrefix);
    return {
      number: c.number,
      title: c.title,
      state,
      kind: fields.kind,
      status: state === "closed" ? "done" : fields.status,
      sp: parseSp(sections[SEC.estimate]),
    };
  }

  async getSnapshot(n: number): Promise<Snapshot> {
    const p = await this.project();
    const data = (await this.graphql(SNAPSHOT_QUERY, {
      owner: this.owner,
      name: this.name,
      number: n,
    })) as { data: { repository: { issue: GqlIssue | null } } };
    const issue = data.data.repository.issue;
    if (issue === null) throw new GhError(`issue #${n} が見つかりません(${this.cfg.repo})`);

    return {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      state: issue.state === "CLOSED" ? "closed" : "open",
      fields: axisFieldsOf(issue.projectItems.nodes, p.projectId),
      parent: issue.parent,
      children: issue.subIssues.nodes.map((c) => this.toChildRef(c, p.projectId)),
      sections: parseSections(issue.body ?? "", this.cfg.markerPrefix),
    };
  }

  async listOpenManaged(): Promise<ListedIssue[]> {
    const p = await this.project();
    const rows: ListedIssue[] = [];
    let after: string | null = null;
    for (let page = 0; page < 5; page++) {
      const data = (await this.graphql(ITEMS_QUERY, {
        id: p.projectId,
        ...(after !== null ? { after } : {}),
      })) as { data: { node: { items: GqlItemsPage } } };
      const items = data.data.node.items;
      rows.push(...managedRowsOf(items.nodes));
      if (!items.pageInfo.hasNextPage) break;
      after = items.pageInfo.endCursor;
    }
    return rows;
  }

  async createIssue(input: {
    title: string;
    body: string;
    fields: CreateFields;
    sp?: number;
  }): Promise<CreatedIssue> {
    await this.project();
    const out = (
      await this.gh(
        ["issue", "create", "--repo", this.cfg.repo, "--title", input.title, "--body-file", "-"],
        input.body,
      )
    ).trim();
    const url = out.split("\n").at(-1) ?? "";
    const numStr = url.split("/").at(-1) ?? "";
    const number = Number.parseInt(numStr, 10);
    if (Number.isNaN(number)) throw new GhError(`issue 番号を URL から読めません: ${out}`);
    await this.setAxisFields(number, input.fields);
    if (input.sp !== undefined) await this.setSp(number, input.sp);
    return { number, url };
  }

  async writeBody(n: number, body: string): Promise<void> {
    await this.gh(["issue", "edit", String(n), "--repo", this.cfg.repo, "--body-file", "-"], body);
  }

  private async issueId(n: number): Promise<string> {
    const data = (await this.graphql(ISSUE_ID_QUERY, {
      owner: this.owner,
      name: this.name,
      number: n,
    })) as { data: { repository: { issue: { id: string } | null } } };
    const issue = data.data.repository.issue;
    if (issue === null) throw new GhError(`issue #${n} が見つかりません(${this.cfg.repo})`);
    return issue.id;
  }

  /** item id を得る。未所属なら追加する(addProjectV2ItemById は冪等) */
  private async itemId(n: number): Promise<string> {
    const p = await this.project();
    const contentId = await this.issueId(n);
    const data = (await this.graphql(
      `mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
      }`,
      { projectId: p.projectId, contentId },
    )) as { data: { addProjectV2ItemById: { item: { id: string } } } };
    return data.data.addProjectV2ItemById.item.id;
  }

  private async existingItemId(n: number): Promise<string | null> {
    const p = await this.project();
    const data = (await this.graphql(
      `query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          issue(number: $number) { projectItems(first: 10) { nodes { id project { id } } } }
        }
      }`,
      { owner: this.owner, name: this.name, number: n },
    )) as {
      data: {
        repository: {
          issue: { projectItems: { nodes: { id: string; project: { id: string } }[] } } | null;
        };
      };
    };
    const items = data.data.repository.issue?.projectItems.nodes ?? [];
    return items.find((i) => i.project.id === p.projectId)?.id ?? null;
  }

  private async setSelect(itemId: string, fieldName: string, optionName: string): Promise<void> {
    const p = await this.project();
    const field = p.selects[fieldName];
    const optionId = field?.options[optionName];
    if (field === undefined || optionId === undefined) {
      throw new GhError(`フィールド ${fieldName} にオプション ${optionName} がありません`);
    }
    await this.graphql(
      `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
          value: { singleSelectOptionId: $optionId }
        }) { projectV2Item { id } }
      }`,
      { projectId: p.projectId, itemId, fieldId: field.id, optionId },
    );
  }

  async setAxisFields(n: number, fields: Partial<CreateFields>): Promise<void> {
    const itemId = await this.itemId(n);
    if (fields.kind !== undefined) await this.setSelect(itemId, FIELD.kind, fields.kind);
    if (fields.status !== undefined) {
      await this.setSelect(itemId, FIELD.status, statusOptionName(fields.status));
    }
    if (fields.priority !== undefined) {
      await this.setSelect(itemId, FIELD.priority, priorityOptionName(fields.priority));
    }
  }

  async setSp(n: number, sp: number | null): Promise<void> {
    const p = await this.project();
    const itemId = await this.itemId(n);
    if (sp === null) {
      await this.graphql(
        `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
          clearProjectV2ItemFieldValue(input: {
            projectId: $projectId, itemId: $itemId, fieldId: $fieldId
          }) { projectV2Item { id } }
        }`,
        { projectId: p.projectId, itemId, fieldId: p.spFieldId },
      );
      return;
    }
    await this.graphql(
      `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $num: Float!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { number: $num }
        }) { projectV2Item { id } }
      }`,
      { projectId: p.projectId, itemId, fieldId: p.spFieldId, num: sp },
    );
  }

  async setTitle(n: number, title: string): Promise<void> {
    await this.gh(["issue", "edit", String(n), "--repo", this.cfg.repo, "--title", title]);
  }

  private async issueIds(
    parent: number,
    child: number,
  ): Promise<{ parentId: string; childId: string }> {
    const data = (await this.graphql(IDS_QUERY, {
      owner: this.owner,
      name: this.name,
      parent,
      child,
    })) as { data: { repository: { parent: { id: string }; child: { id: string } } } };
    return {
      parentId: data.data.repository.parent.id,
      childId: data.data.repository.child.id,
    };
  }

  async addSubIssue(parent: number, child: number): Promise<void> {
    const { parentId, childId } = await this.issueIds(parent, child);
    await this.graphql(
      `mutation($p: ID!, $c: ID!) { addSubIssue(input: { issueId: $p, subIssueId: $c }) { issue { number } } }`,
      { p: parentId, c: childId },
    );
  }

  async removeSubIssue(parent: number, child: number): Promise<void> {
    const { parentId, childId } = await this.issueIds(parent, child);
    try {
      await this.graphql(
        `mutation($p: ID!, $c: ID!) { removeSubIssue(input: { issueId: $p, subIssueId: $c }) { issue { number } } }`,
        { p: parentId, c: childId },
      );
    } catch (e) {
      // 冪等: すでに外れている場合のエラーは無視する
      if (!(e instanceof GhError) || !/sub-issue/i.test(e.message)) throw e;
    }
  }

  async closeIssue(n: number, reason: "completed" | "not-planned"): Promise<void> {
    await this.gh([
      "issue",
      "close",
      String(n),
      "--repo",
      this.cfg.repo,
      "--reason",
      reason === "completed" ? "completed" : "not planned",
    ]);
    if (reason === "completed") {
      // ボード表示を Done 列に揃える(効力は state=closed が持つ)
      const itemId = await this.itemId(n);
      await this.setSelect(itemId, FIELD.status, statusOptionName("done"));
      return;
    }
    // not planned は管理対象外: ボードから item を外す
    const itemId = await this.existingItemId(n);
    if (itemId !== null) {
      const p = await this.project();
      await this.graphql(
        `mutation($projectId: ID!, $itemId: ID!) {
          deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) { deletedItemId }
        }`,
        { projectId: p.projectId, itemId },
      );
    }
  }

  async assignSelf(n: number): Promise<void> {
    await this.gh(["issue", "edit", String(n), "--repo", this.cfg.repo, "--add-assignee", "@me"]);
  }
}
