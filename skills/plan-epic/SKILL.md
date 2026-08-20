---
name: plan-epic
description: Backlog の epic のスコープを整理し、feature の子 issue を起票して Ready に遷移させる計画ステップ。/next-step のディスパッチ、または「epic #N のスコープ整理をして」で発動。
---

# /plan-epic — epic: Backlog → Ready

1. `pnpm -s issue-keeper inspect <n>` で `概要` / `Memory` を読み、AskUserQuestion でスコープを確認する(対象ユーザー・主要な機能候補・やらないこと)。
2. feature の子 issue を **JSON 配列のファイル**で起票する(Write ツールで一時ファイルに書き、インライン JSON をシェルに書かない)。`parent` = epic 番号、`kind` は省略(feature に導出される)、`description` を書き、必要なら親 Memory の該当断片を各子の `memory` に切り分けて渡す:

   ```json
   // <scratchpad>/epic-<n>-children.json
   [
     { "title": "子A", "parent": <n>, "description": "...", "sp": 3 },
     { "title": "子B", "parent": <n>, "description": "...", "sp": 5 }
   ]
   ```

   ```bash
   pnpm -s issue-keeper create <scratchpad>/epic-<n>-children.json
   ```

3. スコープを書き込んで Ready に遷移させる(子がいないと exit 3 で拒否される):

   ```bash
   pnpm -s issue-keeper plan-epic <n> --scope <file>
   ```

4. 子の一覧を報告し、「各子は `/next-step #<子番号>` で要件定義に進めます」と締める。
