import type { Command } from "commander";
import { KINDS, OPEN_STATUSES } from "../domain/schema.ts";
import { validate } from "../domain/validate.ts";
import { listIssues } from "../usecase/list.ts";
import { toInspectJson } from "../usecase/shared.ts";
import { type CliContext, ensureOneOf, out, parseIssueNumber } from "./shared.ts";

export function registerReadCommands(program: Command, ctx: () => CliContext): void {
  program
    .command("inspect")
    .description("issue に関するすべてを 1 コマンドで読む")
    .argument("<number>", "issue 番号", parseIssueNumber)
    .option("--dispatch", "nextStep(次の 1 手)を含める")
    .option("--validate", "不変条件検証を含める(違反があれば exit 3)")
    .action(async (n: number, opts: { dispatch?: boolean; validate?: boolean }) => {
      const { repo } = ctx();
      const s = await repo.getSnapshot(n);
      out(toInspectJson(s, { dispatch: opts.dispatch ?? false, validate: opts.validate ?? false }));
      if (opts.validate && validate(s).length > 0) process.exitCode = 3;
    });

  program
    .command("list")
    .description("open な管理対象 issue を JSONL で列挙する")
    .option("--kind <kind>", `${KINDS.join(" / ")}`)
    .option("--status <status>", `${OPEN_STATUSES.join(" / ")}`)
    .action(async (opts: { kind?: string; status?: string }) => {
      const kind = ensureOneOf(opts.kind, KINDS, "--kind");
      const status = ensureOneOf(opts.status, OPEN_STATUSES, "--status");
      const { repo } = ctx();
      const rows = await listIssues(repo, {
        ...(kind !== undefined ? { kind } : {}),
        ...(status !== undefined ? { status } : {}),
      });
      for (const r of rows) out(r);
    });
}
