---
name: next-step
description: issue を前進させる唯一の入口。issue-keeper inspect --dispatch が返す「次の 1 手」に従う。「issue #N を進めて」「次何する?」「着手して」で発動。
---

# /next-step — 前進の唯一の入口

状態機械の薄いラッパー。issue の起票は `/note` の仕事であり、このスキルは issue を作らない。

```bash
pnpm -s issue-keeper inspect <n> --dispatch
```

`nextStep.instruction` に**そのまま**従う。instruction は自己完結しており、次のコマンドまたはスキル名と issue 番号を含む。
