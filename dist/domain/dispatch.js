import { classify } from "./classify.js";
import { deriveStatus } from "./rollup.js";
import { kindOf, statusOf } from "./types.js";
const PLAN_SKILLS = {
    feature: { skill: "/plan-feature", task: "要件定義を書き込んで" },
    bug: { skill: "/plan-bug", task: "原因調査を書き込んで" },
    tooling: { skill: "/plan-adr", task: "ADR(決定)を書き込んで" },
    refactor: { skill: "/plan-adr", task: "ADR(決定)を書き込んで" },
    epic: { skill: "/plan-epic", task: "スコープを整理して" },
};
function dispatchMalformed(s) {
    const defects = [];
    const flags = [];
    if (s.fields.kind === null) {
        defects.push("kind フィールド未設定");
        flags.push("--kind feature");
    }
    if (s.state === "open" && s.fields.status === null) {
        defects.push("status フィールド未設定");
        flags.push("--status backlog");
    }
    if (s.fields.priority === null) {
        defects.push("priority フィールド未設定");
        flags.push("--priority p2");
    }
    return {
        action: "error-state",
        reason: "軸フィールドが未設定",
        instruction: `issue #${s.number} は Malformed です(${defects.join("、")})。\`issue-keeper set-fields ${s.number} ${flags.join(" ")}\` のように正しい値を指定して修復してください。`,
    };
}
function dispatchTask(s, status) {
    if (status === "ready") {
        return {
            action: "start-task",
            reason: "Ready の Task は着手が次の 1 手",
            instruction: `\`issue-keeper start ${s.number}\` を実行して作業を開始してください。`,
        };
    }
    return {
        action: "task-in-progress",
        reason: "作業中の Task に CLI 側の次の 1 手はない",
        instruction: `Skill \`/implement\` を issue #${s.number} に対して実行し、実装を進めてください。完了したら PR の \`Closes #${s.number}\` で issue を閉じてください。`,
    };
}
function dispatchContainerWithoutReadyChild(s) {
    const backlogKids = s.children.filter((c) => c.status === "backlog" || c.status === null);
    const inProgressKids = s.children.filter((c) => c.status === "in-progress");
    const parts = [];
    if (backlogKids.length > 0) {
        parts.push(`Backlog の子(${backlogKids.map((c) => `#${c.number}`).join(", ")})は \`/next-step #子番号\` で計画に進めてください`);
    }
    if (inProgressKids.length > 0) {
        parts.push(`In Progress の子(${inProgressKids.map((c) => `#${c.number}`).join(", ")})の作業を続行してください`);
    }
    if (parts.length === 0 && deriveStatus(s.children) === "done") {
        parts.push("すべての子が完了していますがロールアップが未反映です。任意の子孫への CLI 実行で追いつきます");
    }
    return {
        action: "error-state",
        reason: "着手可能(Ready)な子がいない",
        instruction: `issue #${s.number} に Ready の子がありません。${parts.join("。")}。`,
    };
}
function dispatchContainer(s) {
    const readyKids = s.children.filter((c) => c.status === "ready");
    if (readyKids.length === 1) {
        const c = readyKids[0];
        return {
            action: "next-step-sub-issue",
            reason: "着手可能な子が 1 件ある",
            instruction: `子 issue #${c.number} が次に着手可能です。\`/next-step #${c.number}\` を実行してください。`,
        };
    }
    if (readyKids.length > 1) {
        const list = readyKids.map((c) => `#${c.number}`).join(", ");
        return {
            action: "next-step-sub-issue",
            reason: "着手可能な子が複数ある",
            instruction: `着手可能な子 issue が複数あります(${list})。どれを進めるか人に確認し、選ばれた番号で \`/next-step\` を再実行してください。`,
        };
    }
    return dispatchContainerWithoutReadyChild(s);
}
/** §3。snapshot だけを入力に「次の 1 手」を決める純関数。 */
export function dispatch(s) {
    const wu = classify(s);
    if (wu === "Malformed")
        return dispatchMalformed(s);
    const status = statusOf(s);
    if (status === "done") {
        return {
            action: "done",
            reason: "issue は closed(Done)",
            instruction: "この issue は完了しています。追加の作業は新しい issue として起票してください。",
        };
    }
    if (wu === "Note") {
        const kind = kindOf(s);
        const p = PLAN_SKILLS[kind];
        return {
            action: `plan-${kind}`,
            reason: `Backlog の ${kind} は計画ステップが次の 1 手`,
            instruction: `Skill \`${p.skill}\` を issue #${s.number} に対して実行し、${p.task} Ready に遷移させてください。`,
        };
    }
    if (wu === "Task")
        return dispatchTask(s, status);
    return dispatchContainer(s);
}
