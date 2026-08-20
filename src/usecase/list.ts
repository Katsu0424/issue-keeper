import type { Kind, OpenStatus } from "../domain/schema.ts";
import type { Repository } from "../ports.ts";

export interface ListRow {
  number: number;
  title: string;
  kind: Kind | null;
  status: OpenStatus | null;
  priority: string | null;
  url: string;
}

/** §2.4: open な管理対象 issue(プロジェクト所属)を列挙する */
export async function listIssues(
  repo: Repository,
  filter: { kind?: Kind; status?: OpenStatus },
): Promise<ListRow[]> {
  const issues = await repo.listOpenManaged();
  const rows: ListRow[] = issues.map((i) => ({
    number: i.number,
    title: i.title,
    kind: i.fields.kind,
    status: i.fields.status,
    priority: i.fields.priority,
    url: i.url,
  }));
  return rows.filter(
    (r) =>
      (filter.kind === undefined || r.kind === filter.kind) &&
      (filter.status === undefined || r.status === filter.status),
  );
}
