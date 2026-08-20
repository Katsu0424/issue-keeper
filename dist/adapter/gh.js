import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FIELD, priorityOptionName, SEC, statusOptionName } from "../domain/schema.js";
import { parseSections } from "../domain/sections.js";
import { parseSp } from "../domain/types.js";
import { GhError } from "../errors.js";
import { axisFieldsFromOptionNames, ensureProjectIds } from "./ghProject.js";
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
/** fieldValues からフィールド名 → オプション名の対応を作る */
function fieldValueNames(nodes) {
    const names = {};
    for (const v of nodes) {
        if (v.name !== undefined && v.field?.name !== undefined)
            names[v.field.name] = v.name;
    }
    return names;
}
/** 対象プロジェクトの item の軸フィールドを読む(未所属なら全軸 null) */
function axisFieldsOf(items, projectId) {
    const item = items.find((i) => i.project.id === projectId);
    return axisFieldsFromOptionNames(fieldValueNames(item?.fieldValues.nodes ?? []));
}
/** プロジェクト item のページから管理対象(open かつ Kind 設定済み)の行を取り出す */
function managedRowsOf(nodes) {
    const rows = [];
    for (const node of nodes) {
        const c = node.content;
        if (c?.number === undefined || c.state !== "OPEN")
            continue;
        const fields = axisFieldsFromOptionNames(fieldValueNames(node.fieldValues.nodes));
        if (fields.kind === null)
            continue;
        rows.push({ number: c.number, title: c.title ?? "", url: c.url ?? "", fields });
    }
    return rows;
}
/** gh CLI をサブプロセス実行する Repository 実装。認証は gh auth に委譲する。 */
export class GhRepository {
    projectIds = null;
    cfg;
    owner;
    name;
    constructor(cfg) {
        this.cfg = cfg;
        const [owner, name] = cfg.repo.split("/");
        this.owner = owner ?? "";
        this.name = name ?? "";
    }
    async gh(args, input) {
        try {
            const child = execFileAsync("gh", args, { maxBuffer: 32 * 1024 * 1024 });
            if (input !== undefined && child.child.stdin) {
                child.child.stdin.write(input);
                child.child.stdin.end();
            }
            const { stdout } = await child;
            return stdout;
        }
        catch (e) {
            const err = e;
            const msg = err.stderr || err.message || "";
            const hint = /requires one of the following scopes/i.test(msg)
                ? "。gh トークンに project スコープがありません。`gh auth refresh -s project --hostname github.com` で付与してください"
                : "";
            throw new GhError(`gh ${args[0]} ${args[1] ?? ""} が失敗: ${msg}${hint}`);
        }
    }
    async graphql(query, vars = {}) {
        const args = ["api", "graphql", "-f", `query=${query}`];
        for (const [k, v] of Object.entries(vars)) {
            args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
        }
        return JSON.parse(await this.gh(args));
    }
    async project() {
        if (this.projectIds === null) {
            this.projectIds = await ensureProjectIds((q, v) => this.graphql(q, v), {
                owner: this.owner,
                repoName: this.name,
                title: this.cfg.projectTitle ?? this.name,
            });
        }
        return this.projectIds;
    }
    async ensureProject() {
        await this.project();
    }
    toChildRef(c, projectId) {
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
    async getSnapshot(n) {
        const p = await this.project();
        const data = (await this.graphql(SNAPSHOT_QUERY, {
            owner: this.owner,
            name: this.name,
            number: n,
        }));
        const issue = data.data.repository.issue;
        if (issue === null)
            throw new GhError(`issue #${n} が見つかりません(${this.cfg.repo})`);
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
    async listOpenManaged() {
        const p = await this.project();
        const rows = [];
        let after = null;
        for (let page = 0; page < 5; page++) {
            const data = (await this.graphql(ITEMS_QUERY, {
                id: p.projectId,
                ...(after !== null ? { after } : {}),
            }));
            const items = data.data.node.items;
            rows.push(...managedRowsOf(items.nodes));
            if (!items.pageInfo.hasNextPage)
                break;
            after = items.pageInfo.endCursor;
        }
        return rows;
    }
    async createIssue(input) {
        await this.project();
        const out = (await this.gh(["issue", "create", "--repo", this.cfg.repo, "--title", input.title, "--body-file", "-"], input.body)).trim();
        const url = out.split("\n").at(-1) ?? "";
        const numStr = url.split("/").at(-1) ?? "";
        const number = Number.parseInt(numStr, 10);
        if (Number.isNaN(number))
            throw new GhError(`issue 番号を URL から読めません: ${out}`);
        await this.setAxisFields(number, input.fields);
        if (input.sp !== undefined)
            await this.setSp(number, input.sp);
        return { number, url };
    }
    async writeBody(n, body) {
        await this.gh(["issue", "edit", String(n), "--repo", this.cfg.repo, "--body-file", "-"], body);
    }
    async issueId(n) {
        const data = (await this.graphql(ISSUE_ID_QUERY, {
            owner: this.owner,
            name: this.name,
            number: n,
        }));
        const issue = data.data.repository.issue;
        if (issue === null)
            throw new GhError(`issue #${n} が見つかりません(${this.cfg.repo})`);
        return issue.id;
    }
    /** item id を得る。未所属なら追加する(addProjectV2ItemById は冪等) */
    async itemId(n) {
        const p = await this.project();
        const contentId = await this.issueId(n);
        const data = (await this.graphql(`mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
      }`, { projectId: p.projectId, contentId }));
        return data.data.addProjectV2ItemById.item.id;
    }
    async existingItemId(n) {
        const p = await this.project();
        const data = (await this.graphql(`query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          issue(number: $number) { projectItems(first: 10) { nodes { id project { id } } } }
        }
      }`, { owner: this.owner, name: this.name, number: n }));
        const items = data.data.repository.issue?.projectItems.nodes ?? [];
        return items.find((i) => i.project.id === p.projectId)?.id ?? null;
    }
    async setSelect(itemId, fieldName, optionName) {
        const p = await this.project();
        const field = p.selects[fieldName];
        const optionId = field?.options[optionName];
        if (field === undefined || optionId === undefined) {
            throw new GhError(`フィールド ${fieldName} にオプション ${optionName} がありません`);
        }
        await this.graphql(`mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
          value: { singleSelectOptionId: $optionId }
        }) { projectV2Item { id } }
      }`, { projectId: p.projectId, itemId, fieldId: field.id, optionId });
    }
    async setAxisFields(n, fields) {
        const itemId = await this.itemId(n);
        if (fields.kind !== undefined)
            await this.setSelect(itemId, FIELD.kind, fields.kind);
        if (fields.status !== undefined) {
            await this.setSelect(itemId, FIELD.status, statusOptionName(fields.status));
        }
        if (fields.priority !== undefined) {
            await this.setSelect(itemId, FIELD.priority, priorityOptionName(fields.priority));
        }
    }
    async setSp(n, sp) {
        const p = await this.project();
        const itemId = await this.itemId(n);
        if (sp === null) {
            await this.graphql(`mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
          clearProjectV2ItemFieldValue(input: {
            projectId: $projectId, itemId: $itemId, fieldId: $fieldId
          }) { projectV2Item { id } }
        }`, { projectId: p.projectId, itemId, fieldId: p.spFieldId });
            return;
        }
        await this.graphql(`mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $num: Float!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { number: $num }
        }) { projectV2Item { id } }
      }`, { projectId: p.projectId, itemId, fieldId: p.spFieldId, num: sp });
    }
    async setTitle(n, title) {
        await this.gh(["issue", "edit", String(n), "--repo", this.cfg.repo, "--title", title]);
    }
    async issueIds(parent, child) {
        const data = (await this.graphql(IDS_QUERY, {
            owner: this.owner,
            name: this.name,
            parent,
            child,
        }));
        return {
            parentId: data.data.repository.parent.id,
            childId: data.data.repository.child.id,
        };
    }
    async addSubIssue(parent, child) {
        const { parentId, childId } = await this.issueIds(parent, child);
        await this.graphql(`mutation($p: ID!, $c: ID!) { addSubIssue(input: { issueId: $p, subIssueId: $c }) { issue { number } } }`, { p: parentId, c: childId });
    }
    async removeSubIssue(parent, child) {
        const { parentId, childId } = await this.issueIds(parent, child);
        try {
            await this.graphql(`mutation($p: ID!, $c: ID!) { removeSubIssue(input: { issueId: $p, subIssueId: $c }) { issue { number } } }`, { p: parentId, c: childId });
        }
        catch (e) {
            // 冪等: すでに外れている場合のエラーは無視する
            if (!(e instanceof GhError) || !/sub-issue/i.test(e.message))
                throw e;
        }
    }
    async closeIssue(n, reason) {
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
            await this.graphql(`mutation($projectId: ID!, $itemId: ID!) {
          deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) { deletedItemId }
        }`, { projectId: p.projectId, itemId });
        }
    }
    async assignSelf(n) {
        await this.gh(["issue", "edit", String(n), "--repo", this.cfg.repo, "--add-assignee", "@me"]);
    }
}
