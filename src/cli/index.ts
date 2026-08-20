import { Command, CommanderError } from "commander";
import { GhError, InvariantError, PostConditionError, UsageError } from "../errors.ts";
import { registerPlanCommands } from "./plan.ts";
import { registerReadCommands } from "./read.ts";
import { contextFactory, out } from "./shared.ts";
import { registerWriteCommands } from "./write.ts";

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("issue-keeper")
    .description("GitHub Issues を状態機械として運用するための唯一の書込経路")
    .exitOverride();

  const ctx = contextFactory();
  registerReadCommands(program, ctx);
  registerPlanCommands(program, ctx);
  registerWriteCommands(program, ctx);

  await program.parseAsync(process.argv);
}

function handleError(e: unknown): void {
  if (e instanceof PostConditionError) {
    out({ error: "post-condition-failed", expected: e.expected, actual: e.actual });
    process.exitCode = 4;
    return;
  }
  if (e instanceof UsageError || e instanceof GhError || e instanceof InvariantError) {
    out({ error: e.message });
    process.exitCode = e.exitCode;
    return;
  }
  if (e instanceof CommanderError) {
    if (e.code === "commander.helpDisplayed" || e.code === "commander.version") {
      process.exitCode = 0;
    } else {
      out({ error: e.message });
      process.exitCode = 2;
    }
    return;
  }
  out({ error: String(e) });
  process.exitCode = 1;
}

try {
  await main();
} catch (e) {
  handleError(e);
}
