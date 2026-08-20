import type { Config } from "../src/config.ts";
import type { Kind, OpenStatus, Priority } from "../src/domain/schema.ts";
import { SEC } from "../src/domain/schema.ts";
import { parseSections } from "../src/domain/sections.ts";
import type { AxisFields, ChildRef, Snapshot } from "../src/domain/types.ts";
import { parseSp } from "../src/domain/types.ts";
import { GhError } from "../src/errors.ts";
import type { CreatedIssue, CreateFields, ListedIssue, Repository } from "../src/ports.ts";

export interface FakeIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  /** Projects v2 の軸フィールド値(null = 未設定) */
  fields: AxisFields;
  /** SP フィールド(表示用ミラー) */
  spField: number | null;
  /** プロジェクトに item として所属しているか */
  inProject: boolean;
  body: string;
  parent: number | null;
  assignees: string[];
}

export const testConfig: Config = { repo: "owner/name", markerPrefix: "issuecli" };

/** seed 用の省略記法: 軸フィールドをまとめて作る */
export function axes(
  kind: Kind | null,
  status: OpenStatus | null,
  priority: Priority | null,
): AxisFields {
  return { kind, status, priority };
}

/** in-memory Repository。usecase を無ネットワークで検証する。 */
export class FakeRepository implements Repository {
  issues = new Map<number, FakeIssue>();
  private nextNumber = 1;
  projectEnsured = false;

  seed(issue: Partial<FakeIssue> & { title: string }): FakeIssue {
    const n = issue.number ?? this.nextNumber;
    this.nextNumber = Math.max(this.nextNumber, n + 1);
    const full: FakeIssue = {
      number: n,
      title: issue.title,
      state: issue.state ?? "open",
      fields: issue.fields ?? { kind: null, status: null, priority: null },
      spField: issue.spField ?? null,
      inProject: issue.inProject ?? issue.fields !== undefined,
      body: issue.body ?? "",
      parent: issue.parent ?? null,
      assignees: issue.assignees ?? [],
    };
    this.issues.set(n, full);
    return full;
  }

  private get(n: number): FakeIssue {
    const issue = this.issues.get(n);
    if (issue === undefined) throw new GhError(`issue #${n} が見つかりません`);
    return issue;
  }

  private childrenOf(n: number): FakeIssue[] {
    return [...this.issues.values()]
      .filter((i) => i.parent === n)
      .sort((a, b) => a.number - b.number);
  }

  async ensureProject(): Promise<void> {
    this.projectEnsured = true;
  }

  async getSnapshot(n: number): Promise<Snapshot> {
    const issue = this.get(n);
    const children: ChildRef[] = this.childrenOf(n).map((c) => {
      const sections = parseSections(c.body, testConfig.markerPrefix);
      return {
        number: c.number,
        title: c.title,
        state: c.state,
        kind: c.fields.kind,
        status: c.state === "closed" ? "done" : c.fields.status,
        sp: parseSp(sections[SEC.estimate]),
      };
    });
    const parentIssue = issue.parent !== null ? this.get(issue.parent) : null;
    return {
      number: issue.number,
      title: issue.title,
      url: `https://example.test/${issue.number}`,
      state: issue.state,
      fields: { ...issue.fields },
      parent:
        parentIssue !== null ? { number: parentIssue.number, title: parentIssue.title } : null,
      children,
      sections: parseSections(issue.body, testConfig.markerPrefix),
    };
  }

  async listOpenManaged(): Promise<ListedIssue[]> {
    return [...this.issues.values()]
      .filter((i) => i.state === "open" && i.inProject && i.fields.kind !== null)
      .map((i) => ({
        number: i.number,
        title: i.title,
        url: `https://example.test/${i.number}`,
        fields: { ...i.fields },
      }));
  }

  async createIssue(input: {
    title: string;
    body: string;
    fields: CreateFields;
    sp?: number;
  }): Promise<CreatedIssue> {
    const issue = this.seed({
      title: input.title,
      body: input.body,
      fields: { ...input.fields },
      spField: input.sp ?? null,
      inProject: true,
    });
    return { number: issue.number, url: `https://example.test/${issue.number}` };
  }

  async writeBody(n: number, body: string): Promise<void> {
    this.get(n).body = body;
  }

  async setAxisFields(n: number, p: Partial<CreateFields>): Promise<void> {
    const issue = this.get(n);
    issue.inProject = true;
    issue.fields = { ...issue.fields, ...p };
  }

  async setSp(n: number, sp: number | null): Promise<void> {
    const issue = this.get(n);
    issue.inProject = true;
    issue.spField = sp;
  }

  async setTitle(n: number, title: string): Promise<void> {
    this.get(n).title = title;
  }

  async addSubIssue(parent: number, child: number): Promise<void> {
    this.get(parent);
    this.get(child).parent = parent;
  }

  async removeSubIssue(parent: number, child: number): Promise<void> {
    const c = this.get(child);
    if (c.parent === parent) c.parent = null;
  }

  async closeIssue(n: number, reason: "completed" | "not-planned"): Promise<void> {
    const issue = this.get(n);
    issue.state = "closed";
    if (reason === "not-planned") issue.inProject = false;
  }

  async assignSelf(n: number): Promise<void> {
    const issue = this.get(n);
    if (!issue.assignees.includes("@me")) issue.assignees.push("@me");
  }
}
