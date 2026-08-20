---
name: plan-bug
description: Backlog の bug の根本原因を調査し、原因調査レポートを書き込んで Ready に遷移させる計画ステップ。/next-step のディスパッチ、または「issue #N の原因調査をして」で発動。
---

# /plan-bug — bug: Backlog → Ready

1. `pnpm -s issue-keeper inspect <n>` で `事象` / `再現手順` / `期待される動作と実際の動作` / `Memory` を読む。
2. コードベースを調査して根本原因を特定する。再現可能なら再現してから断定する。原因・機構・修正方針を `原因調査` レポートとしてまとめる(棄却した仮説と棄却根拠も書く)。
3. 修正規模から SP(1 SP = 半日目安、1/2/3/5/8)を見積もり、実行する:

   ```bash
   pnpm -s issue-keeper plan-bug <n> --report <file> --sp <N>
   ```

4. 報告し、「`/next-step #<n>` で着手できます」と締める。
