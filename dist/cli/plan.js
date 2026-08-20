import { planAdr, planBug, planEpic, planFeature } from "../usecase/plan.js";
import { out, parseIssueNumber, parseSpArg, readValue } from "./shared.js";
export function registerPlanCommands(program, ctx) {
    program
        .command("plan-feature")
        .description("feature を Backlog → Ready に遷移させる")
        .argument("<number>", "issue 番号", parseIssueNumber)
        .requiredOption("--requirements <f|->", "要件")
        .requiredOption("--acceptance <f|->", "受け入れ条件")
        .requiredOption("--sp <N>", "ストーリーポイント", parseSpArg)
        .action(async (n, opts) => {
        const { cfg, repo } = ctx();
        out(await planFeature(repo, cfg, n, {
            requirements: await readValue(opts.requirements),
            acceptance: await readValue(opts.acceptance),
            sp: opts.sp,
        }));
    });
    program
        .command("plan-bug")
        .description("bug を Backlog → Ready に遷移させる")
        .argument("<number>", "issue 番号", parseIssueNumber)
        .requiredOption("--report <f|->", "原因調査")
        .requiredOption("--sp <N>", "ストーリーポイント", parseSpArg)
        .action(async (n, opts) => {
        const { cfg, repo } = ctx();
        out(await planBug(repo, cfg, n, { report: await readValue(opts.report), sp: opts.sp }));
    });
    program
        .command("plan-adr")
        .description("tooling / refactor を Backlog → Ready に遷移させる")
        .argument("<number>", "issue 番号", parseIssueNumber)
        .requiredOption("--decision <f|->", "決定")
        .option("--alternatives <f|->", "検討した選択肢")
        .requiredOption("--sp <N>", "ストーリーポイント", parseSpArg)
        .action(async (n, opts) => {
        const { cfg, repo } = ctx();
        out(await planAdr(repo, cfg, n, {
            decision: await readValue(opts.decision),
            ...(opts.alternatives !== undefined
                ? { alternatives: await readValue(opts.alternatives) }
                : {}),
            sp: opts.sp,
        }));
    });
    program
        .command("plan-epic")
        .description("epic を Backlog → Ready に遷移させる(feature の子が必要)")
        .argument("<number>", "issue 番号", parseIssueNumber)
        .requiredOption("--scope <f|->", "スコープ")
        .action(async (n, opts) => {
        const { cfg, repo } = ctx();
        out(await planEpic(repo, cfg, n, { scope: await readValue(opts.scope) }));
    });
}
