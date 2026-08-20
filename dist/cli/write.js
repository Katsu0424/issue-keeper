import { KINDS, OPEN_STATUSES, PRIORITIES } from "../domain/schema.js";
import { UsageError } from "../errors.js";
import { createIssues } from "../usecase/create.js";
import { deleteIssue } from "../usecase/deleteIssue.js";
import { setFields } from "../usecase/setFields.js";
import { startTask } from "../usecase/start.js";
import { updateIssue } from "../usecase/update.js";
import { ALL_SECTION_FLAGS, ensureOneOf, out, parseIssueNumber, parseSpArg, readValue, UPDATE_FLAGS, } from "./shared.js";
async function collectSectionFlags(kind, opts) {
    const allowed = UPDATE_FLAGS[kind];
    const sections = {};
    for (const [optName, flag] of Object.entries(ALL_SECTION_FLAGS)) {
        const v = opts[optName];
        if (v === undefined)
            continue;
        const sectionName = allowed[optName];
        if (sectionName === undefined) {
            const usable = Object.keys(allowed)
                .map((k) => ALL_SECTION_FLAGS[k])
                .join(" ");
            throw new UsageError(`${flag} は kind=${kind} では使えません(使用可能: ${usable})`);
        }
        sections[sectionName] = await readValue(v);
    }
    return sections;
}
async function buildUpdateRequest(kind, n, opts) {
    const req = { kind, number: n, sections: await collectSectionFlags(kind, opts) };
    if (opts.sp !== undefined)
        req.sp = opts.sp;
    if (opts.memory !== undefined) {
        req.memory = opts.memory === true ? "" : await readValue(opts.memory);
    }
    if (opts.customer !== undefined)
        req.customer = await readValue(opts.customer);
    if (opts.referenceUrl !== undefined)
        req.referenceUrl = await readValue(opts.referenceUrl);
    return req;
}
function registerCreateAndUpdate(program, ctx) {
    program
        .command("create")
        .description("ファイルから issue を起票する(JSON オブジェクト = 1 件 / 配列・JSONL = 複数件。- で stdin)")
        .argument("<file...>", "入力ファイル(- で stdin)")
        .action(async (files) => {
        const { cfg, repo } = ctx();
        for (const file of files) {
            const results = await createIssues(repo, cfg, await readValue(file));
            for (const r of results)
                out(r);
        }
    });
    const update = program
        .command("update")
        .description("既存 issue の管理セクションを書き換える正規の修正手段")
        .argument("<kind>", `${KINDS.join(" / ")}`)
        .argument("<number>", "issue 番号", parseIssueNumber);
    for (const flag of Object.values(ALL_SECTION_FLAGS))
        update.option(`${flag} <f|->`);
    update
        .option("--sp <N>", "見積もり(SP)", parseSpArg)
        .option("--memory [f|-]", "Memory(値なしで除去)")
        .option("--customer <f|->", "顧客")
        .option("--reference-url <f|->", "参考URL")
        .action(async (kindArg, n, opts) => {
        const kind = ensureOneOf(kindArg, KINDS, "kind");
        const { cfg, repo } = ctx();
        out(await updateIssue(repo, cfg, await buildUpdateRequest(kind, n, opts)));
    });
}
function registerLifecycle(program, ctx) {
    program
        .command("start")
        .description("Ready の Task を In Progress に遷移させ @me をアサインする")
        .argument("<number>", "issue 番号", parseIssueNumber)
        .action(async (n) => {
        const { cfg, repo } = ctx();
        out(await startTask(repo, cfg, n));
    });
    program
        .command("set-fields")
        .description("フィールド・タイトルを直接矯正する復旧コマンド")
        .argument("<number>", "issue 番号", parseIssueNumber)
        .option("--kind <kind>", `${KINDS.join(" / ")}`)
        .option("--status <status>", `${OPEN_STATUSES.join(" / ")}`)
        .option("--priority <priority>", `${PRIORITIES.join(" / ")}`)
        .option("--title <title>", "タイトル")
        .action(async (n, opts) => {
        const kind = ensureOneOf(opts.kind, KINDS, "--kind");
        const status = ensureOneOf(opts.status, OPEN_STATUSES, "--status");
        const priority = ensureOneOf(opts.priority, PRIORITIES, "--priority");
        const { cfg, repo } = ctx();
        out(await setFields(repo, cfg, n, {
            ...(kind !== undefined ? { kind } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(priority !== undefined ? { priority } : {}),
            ...(opts.title !== undefined ? { title: opts.title } : {}),
        }));
    });
    program
        .command("delete")
        .description("closed as not planned + 親からの detach(冪等)")
        .argument("<number>", "issue 番号", parseIssueNumber)
        .action(async (n) => {
        const { cfg, repo } = ctx();
        out(await deleteIssue(repo, cfg, n));
    });
}
export function registerWriteCommands(program, ctx) {
    registerCreateAndUpdate(program, ctx);
    registerLifecycle(program, ctx);
}
