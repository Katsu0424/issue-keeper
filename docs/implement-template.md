# /implement スキルのテンプレート

issue-keeper のディスパッチは Task(Ready / In Progress)に対して `/implement` スキルを名指しする。
このスキルはリポジトリ固有(ブランチ規約・品質ゲート・PR 手順)のため、利用側リポジトリの
`.claude/skills/implement/SKILL.md` に置く。以下をコピーして `<プレースホルダ>` を埋めること。

```markdown
---
name: implement
description: Ready / In Progress の Task を実装して PR まで運ぶ実装ステップ。/issue-keeper:next-step のディスパッチ、または「issue #N を実装して」「着手して」で発動。
---

# /implement — Task: 実装 → PR

issue に書かれた受け入れ条件が唯一の完了定義。issue にないことはやらず、issue と食い違う実装をしない。

## Step 1: 前提確認

\`\`\`bash
pnpm -s issue-keeper inspect <n>
\`\`\`

- `要件` / `受け入れ条件` / `内容` / `原因調査` / `決定` を読み、何を作るかを把握する
- workUnit が **Task 以外**(Note / Container)なら実装対象ではない。`/issue-keeper:next-step #<n>` に戻る
- Status が **Ready** なら `pnpm -s issue-keeper start <n>` を実行して In Progress にする
- Status が **Done** なら何もしない(追加作業は `/issue-keeper:note` で新規起票)

## Step 2: 曖昧さの解消

受け入れ条件が曖昧、または実装中に矛盾・考慮漏れを見つけたら、勝手に解釈して進めず確認し、
確定した内容を `pnpm -s issue-keeper update <kind> <n> --...` で **issue に反映してから**続ける(issue が唯一の真実)。

## Step 3: ブランチ

\`\`\`bash
git checkout <デフォルトブランチ> && git pull
git checkout -b <ブランチ命名規約。例: feature/issue-<n>-<短い英語slug>>
\`\`\`

## Step 4: 実装

<アーキテクチャ原則・コーディング規約(レイヤ構成、コミット規約など)>

- 受け入れ条件を 1 つずつ満たす。**テストファースト推奨**
- **スコープ規律**: 受け入れ条件にない変更を混ぜない。途中で見つけた改善・バグは `/issue-keeper:note` で新規起票して切り離す

## Step 5: 品質ゲート

\`\`\`bash
<品質ゲートのコマンド。例: pnpm lint && pnpm typecheck && pnpm test>
\`\`\`

すべて通るまで PR を作らない。

## Step 6: PR

\`\`\`bash
git push -u origin HEAD
gh pr create --base <デフォルトブランチ> --fill
\`\`\`

- PR 本文に **`Closes #<n>` を必ず書く**(マージで issue が閉じ Done になる)
- 受け入れ条件チェックリストに、各条件の充足根拠(テスト名・確認手順)を書く

## Step 7: 報告

CI がグリーンになったことを確認してから、PR の URL と受け入れ条件ごとの充足状況を報告する。
マージ判断は人に委ねる。
```
