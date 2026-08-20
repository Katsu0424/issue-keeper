/** §2.4: open な管理対象 issue(プロジェクト所属)を列挙する */
export async function listIssues(repo, filter) {
    const issues = await repo.listOpenManaged();
    const rows = issues.map((i) => ({
        number: i.number,
        title: i.title,
        kind: i.fields.kind,
        status: i.fields.status,
        priority: i.fields.priority,
        url: i.url,
    }));
    return rows.filter((r) => (filter.kind === undefined || r.kind === filter.kind) &&
        (filter.status === undefined || r.status === filter.status));
}
