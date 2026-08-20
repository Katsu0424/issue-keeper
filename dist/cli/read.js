import { KINDS, OPEN_STATUSES } from "../domain/schema.js";
import { validate } from "../domain/validate.js";
import { listIssues } from "../usecase/list.js";
import { toInspectJson } from "../usecase/shared.js";
import { ensureOneOf, out, parseIssueNumber } from "./shared.js";
export function registerReadCommands(program, ctx) {
    program
        .command("inspect")
        .description("issue に関するすべてを 1 コマンドで読む")
        .argument("<number>", "issue 番号", parseIssueNumber)
        .option("--dispatch", "nextStep(次の 1 手)を含める")
        .option("--validate", "不変条件検証を含める(違反があれば exit 3)")
        .action(async (n, opts) => {
        const { repo } = ctx();
        const s = await repo.getSnapshot(n);
        out(toInspectJson(s, { dispatch: opts.dispatch ?? false, validate: opts.validate ?? false }));
        if (opts.validate && validate(s).length > 0)
            process.exitCode = 3;
    });
    program
        .command("list")
        .description("open な管理対象 issue を JSONL で列挙する")
        .option("--kind <kind>", `${KINDS.join(" / ")}`)
        .option("--status <status>", `${OPEN_STATUSES.join(" / ")}`)
        .action(async (opts) => {
        const kind = ensureOneOf(opts.kind, KINDS, "--kind");
        const status = ensureOneOf(opts.status, OPEN_STATUSES, "--status");
        const { repo } = ctx();
        const rows = await listIssues(repo, {
            ...(kind !== undefined ? { kind } : {}),
            ...(status !== undefined ? { status } : {}),
        });
        for (const r of rows)
            out(r);
    });
}
