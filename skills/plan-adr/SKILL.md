---
name: plan-adr
description: Backlog の tooling / refactor に決定(ADR)を書き込んで Ready に遷移させる計画ステップ。/next-step のディスパッチ、または「issue #N の設計を決めて」で発動。
---

# /plan-adr — tooling / refactor: Backlog → Ready

1. `pnpm -s issue-keeper inspect <n>` で `背景` / `Memory` を読む。
2. 決定を 1 文で言い切り、理由(防ぐ失敗の名指し)を隣に添えた `決定` を書く。検討して捨てた案があれば `検討した選択肢` に理由付きで残す。
3. SP(1 SP = 半日目安、1/2/3/5/8)を見積もり、実行する:

   ```bash
   pnpm -s issue-keeper plan-adr <n> --decision <file> [--alternatives <file>] --sp <N>
   ```

4. 報告し、「`/next-step #<n>` で着手できます」と締める。
