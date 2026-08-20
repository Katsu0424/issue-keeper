# データモデル

GitHub Issues を状態機械として運用する。フィールドは GitHub Projects v2 の単一プロジェクトの単一選択フィールド、構造化データは issue 本文のマーカー区切りセクションで持つ(ラベルは使わない)。

## フィールド(Projects v2 で表現)

管理対象 issue はプロジェクト(既定名はリポジトリ名。`issue-keeper.config.json` の `projectTitle` で変更可)に item として所属し、3 軸の単一選択フィールドを持つ。CLI は初回実行時にプロジェクト・フィールド・オプションを冪等に作成・矯正する。

| 軸 | フィールドとオプション | 意味 |
|---|---|---|
| Kind | `Kind`: `epic` / `feature` / `bug` / `tooling` / `refactor` | 仕事の種類 |
| Status | `Status`: `Backlog` / `Ready` / `In Progress` / `Done` | ライフサイクル位置 |
| Priority | `Priority`: `P0` / `P1` / `P2` / `P3` | 優先度 |

補助フィールドとして `SP`(number)を持つ。これは本文 `見積もり` セクションの表示用ミラーであり、真実は本文側にある。

- **管理対象の判定**: プロジェクトに所属し `Kind` が設定されていること(旧: kind:* ラベル)
- **Done は issue の closed 状態で表す**。closed の issue は Status フィールド値に関係なく Done とみなす。CLI が completed で閉じるときはボード表示のため Status フィールドも `Done` に揃える(PR マージなど CLI 外で閉じた場合はプロジェクトの built-in workflow「Item closed → Status: Done」に任せる。効力は closed 状態が持つので表示だけの問題)
- **closed as not planned は管理対象外**。CLI の delete はプロジェクトから item も外す
- 軸フィールドのいずれかが未設定(プロジェクト未所属を含む)の open issue は **Malformed**(closed の issue の Status 軸は問わない)。open issue の Status フィールドが `Done` の場合も不正値として Malformed 扱い

### Kind の選び方(分類手順)

上から順に判定し、最初に当てはまった行で確定する。

| 問い | Yes なら | 理由 |
|---|---|---|
| 複数の feature 子 issue を 1 つの施策として束ねるか | `epic` | — |
| 既存のコードが約束どおり動いていないか | `bug` | — |
| 製品の機能・体験のための変更か(ユーザーから直接観測できない下準備・内部段階も含む) | `feature` | 製品目標に向けた変更である |
| CI・開発環境・監視など、開発基盤のための変更か | `tooling` | 製品ではなく開発体験のための変更である |
| 挙動を変えないコード内部の変更(再構成・性能・内部モデル)か | `refactor` | 挙動変更がない |

## workUnit(形状。保存せず導出する)

各 issue は snapshot から次の順で 1 つの形状に分類される。フィールドには保存しない。

1. Kind・Status・Priority のフィールドが揃っていない → **Malformed**
2. sub-issue を 1 つ以上持つ → **Container**(子が仕事を運ぶ束)
3. Status が Backlog → **Note**(起票済み・未計画)
4. それ以外(Ready / In Progress / Done で子なし)→ **Task**(実働単位)

Note が計画ステップを経てそのまま Task になる(自己タスク化)パスと、計画ステップが子 issue を起票して Container になるパスの両方を許す。**epic だけは Ready 以降つねに Container**(子を持たない Ready の epic は違反)。

親子は GitHub ネイティブの sub-issue 連結(GraphQL `addSubIssue`)で表す。**epic の子は feature、それ以外の Kind の子は親と同じ Kind** でなければならない。

## 本文セクション(マーカー区切り)

issue 本文は**マーカーで区切られた名前付きセクションだけ**で構成する。自由記述の本文は持たない。

```
<!-- issuecli:section:概要:start -->
## 概要

(内容)
<!-- issuecli:section:概要:end -->
```

- 接頭辞(`issuecli`)は `issue-keeper.config.json` の `markerPrefix` で変更できる
- **パースはマーカーのみを見る**。マーカーに包まれていない `## 概要` という見出しは「セクション不在」。報告者が貼り付けた見出しやコードフェンス内の見出しに誤反応しないため
- 書込は preserve-on-omit。渡さなかったセクションは現状維持、渡したセクションは全置換
- **本文の手編集は禁止**。修復も `issue-keeper update` / `set-fields` で行う

## Kind × Status ごとの必須セクション

| Kind | Backlog(起票時に原子的に書く) | Ready 以降に追加で必須 |
|---|---|---|
| feature | `概要` | `要件`・`受け入れ条件`・`見積もり` |
| bug | `事象`・`再現手順`・`期待される動作と実際の動作` | `原因調査`・`見積もり` |
| tooling / refactor | `背景` | `決定`(任意で `検討した選択肢`)・`見積もり` |
| epic | `概要` | `スコープ`(対象ユーザー・主要な機能候補を含む)。`見積もり` は子からのロールアップ |

**子 issue(parent 持ち)は Kind 表の代わりに `内容` セクションを要求する**(分解時に各子へ書く)。

すべての Kind に共通の任意セクション:

- **`Memory`** — 書き手から次の読み手への一時的な引き継ぎスロット。起票時の会話に元資料があれば verbatim で格納する。**消費ステップ(その Kind の計画コマンド)が内容を吸収し、同じ保存で本文から除去する**。計画済み issue に Memory が残っていたら違反(`stale-memory`)
- **`顧客`** / **`参考URL`**(feature / bug / epic のみ)— 報告者由来の恒久文脈。以後のどのステップでも除去しない

`見積もり` の中身はストーリーポイント 1 整数を `SP: <N>` の形式で書く(職能別内訳は持たない)。

## Container のロールアップ

Container の Status は直下の子から導出する。CLI は子の Status や構造を変えるすべての書込のあとに親チェーンを上へ辿り、各階層を再計算して食い違う階層を保存し直す(一致した階層で停止)。

| 導出 Status | 条件 |
|---|---|
| Done | すべての子が Done(closed) |
| In Progress | いずれかの子が In Progress |
| Ready | すべての子が Ready / In Progress / Done で、In Progress がいない |
| Backlog | いずれかの子が Backlog |

- Container の `見積もり` は子の SP 合計を書く
- 導出が Done になった Container は CLI が close する(reason: completed)
- **計画ゲート**: Backlog → Ready の昇格だけは計画コマンド(`plan-*`)の専権であり、ロールアップは行わない。SP 付きの子を先に起票しても、親はスコープ等が書かれる(`plan-epic` など)まで Backlog に留まる
- GitHub の UI から直接 issue を閉じた場合はロールアップが走らない。次にいずれかの子孫へ CLI を実行した時点で追いつく(`inspect --validate` の `rollup-drift` でも検出できる)

## 補足(実装上の既定)

- `priority` 省略時の既定は `p2`。子行はさらに親の Priority を優先して継承する
- `見積もり` の必須性は `missing-sp` 検証が単独で扱い、`missing-sections` は重複して報告しない
