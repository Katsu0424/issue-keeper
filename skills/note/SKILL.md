---
name: note
description: 課題・アイデア・バグ報告を GitHub issue として起票する唯一の入口。会話文脈からメタデータを推定し、issue-keeper create で管理対象 issue を起票する。「issue にして」「起票して」「メモしておいて」で発動。
---

# /note — 起票の唯一の入口

issue の起票はすべてこのスキルを通す。`gh issue create` や本文の手編集は使わない。
実行コマンドはリポジトリルートで `pnpm -s issue-keeper <command>`(以下 `issue-keeper` と表記)。

## Step 1: メタデータを決める

会話文脈から以下を推定する:

- **タイトルと短い説明**(両方日本語。説明は「なぜ」を捉える)
- **Kind** — `node_modules/issue-keeper/docs/model.md` の分類手順に従う。上から順に判定し最初に当てはまった行で確定する。「その変更が何をするか」で選び、目的では選ばない
- **Memory** — 会話に元資料(貼り付けられた設計メモ、長い報告など)があれば verbatim で格納する。1 行メモならスキップ。**報告者には決して尋ねない**

残りの確認事項は **1 回の AskUserQuestion にまとめる**:

- **Priority** — 常に含める。選択肢: `緊急`(P0: 障害やデータ損失など緊急対応が必要)/ `高`(P1)/ `中`(P2)/ `低`(P3)
- **Kind** — 分類手順でどれにも当てはまらない時だけ含める
- **顧客 / 参考URL** — Kind ∈ {epic, feature, bug} で文脈から導けない時だけ含める。「なし」なら省略
- **次のステップ** — 常に含め、**最後に置く**。Kind ごとの次の作業を具体的に示して聞く:
  - feature「要件定義も今やりますか?」/ bug「原因調査も今やりますか?」/ epic「スコープ整理も今やりますか?」/ tooling・refactor「設計(ADR 作成)も今やりますか?」
  - 選択肢は `今やる` / `後でやる` の 2 つ。回答は Step 5 で使い、二度聞きしない

## Step 2: bug のみ、intake を聞き切る

PdM の声で聞く: どの画面・どの操作・どのアカウント・いつからか。
ログ・スタックトレース・コードパス・原因仮説は**聞かない**。
`事象`(1〜2 文)・`再現手順`(番号付き)・`期待される動作と実際の動作` の 3 節が明確になるまで追問する。
サイジングはここでは行わない(`/plan-bug` に委ねる)。

## Step 3: 重複チェック

`issue-keeper list --kind <kind>` を実行し、同じ主題を扱う既存タイトルがあれば上位候補(最大 4 件)+「新規作成」を AskUserQuestion で提示する。

マージを選ばれたら `issue-keeper inspect <既存番号>` で確認し:
- In Progress / Done なら拒否して番号・URL・Status を報告して終了
- それ以外なら両方の本文を読み、一貫した 1 つの本文に書き直して `issue-keeper update <kind>` で該当セクションを書き換える

## Step 4: 起票

Kind に応じた intake フィールドの JSON を**一時ファイルに書いて** `issue-keeper create` に渡す
(インライン JSON をシェルに書かない — quoting 事故防止。1 件は JSON オブジェクト、複数件は配列):

- feature / epic → `overview`
- tooling / refactor → `background`
- bug → `symptom` / `reproduction` / `expected_vs_actual` の 3 つ

`customer` / `reference_url` / `memory` は得られた場合のみ。

```json
// 1. Write ツールで一時ファイル(例: <scratchpad>/create.json)に書く
{ "title": "...", "kind": "feature", "priority": "p2", "overview": "..." }
```

```bash
# 2. ファイルパスを渡して起票する
pnpm -s issue-keeper create <scratchpad>/create.json
```

## Step 5: 報告して前進

create の出力から番号と URL を報告する。Step 1 の**次のステップ**の回答に従う:

- `今やる` → `/next-step #<番号>` を起動して従う
- `後でやる` → 「`/next-step #<番号>` で続きを進められます」と出力して終了する
