---
name: plan-feature
description: Backlog の feature に要件定義を書き込んで Ready に遷移させる計画ステップ。/next-step のディスパッチ、または「issue #N の要件定義をして」で発動。
---

# /plan-feature — feature: Backlog → Ready

1. `pnpm -s issue-keeper inspect <n>` を読み、`概要`・`顧客`・`参考URL`・`Memory` を吸収する。
2. 要件が曖昧なら AskUserQuestion で報告者に確認する(PdM の声。実装方式は聞かない)。確認で確定した内容は必ず `要件`・`受け入れ条件` に反映し、会話の中だけで済ませない。
3. `要件`(ユーザーストーリー形式を推奨)と `受け入れ条件`(観測可能な条件の箇条書き)を下書きし、SP(1 SP = 半日目安、1/2/3/5/8 から選ぶ)を見積もる。
4. 実行する(セクション値は一時ファイルまたは stdin で渡す。stdin は 1 呼び出し 1 つまで):

   ```bash
   pnpm -s issue-keeper plan-feature <n> --requirements <file> --acceptance <file> --sp <N>
   ```

5. 大きい場合は `issue-keeper create` の parent 行で子 Task に分解してよい(各子に `description` と `sp`):

   ```bash
   echo '{"title":"...","parent":<n>,"description":"...","sp":2}' | pnpm -s issue-keeper create
   ```

6. 番号・URL と書いた内容の要約を報告し、「`/next-step #<n>` で着手できます」と締める。
