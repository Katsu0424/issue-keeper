# issue-keeper

GitHub issue 運用の状態機械 CLI + Claude Code スキル一式。

- **状態の真実は GitHub 側に持つ**: Kind / Status / Priority は Projects v2 の単一選択フィールド、本文はマーカー区切りセクション。CLI の状態機械だけが書き込む(手編集禁止)
- **スキルは会話と文章生成だけを担う**: 起票(`/issue-keeper:note`)・前進(`/issue-keeper:next-step`)・計画(`/issue-keeper:plan-*`)のスキルは薄いラッパーで、遷移の判断は `issue-keeper inspect --dispatch` が返す instruction が持つ
- ビルド不要(Node 22.18+ のネイティブ type stripping)。依存は commander + zod + `gh` CLI のみ

データモデルは [docs/model.md](docs/model.md)、状態遷移とディスパッチ表は [docs/workflow.md](docs/workflow.md) を参照。

## 前提

- Node >= 22.18 / pnpm
- `gh` CLI でログイン済み + **project スコープ**(`gh auth refresh -s project --hostname github.com`)
- 対象リポジトリが GitHub にあること(Projects v2 プロジェクトとフィールドは初回実行時に自動作成・矯正される)

## 導入手順(AI エージェント向け: この通りに実行すれば導入完了)

対象リポジトリのルートで以下を順に行う。

**1. 依存を追加する**

```bash
pnpm add -D github:Katsu0424/issue-keeper
```

**2. `package.json` の `scripts` にエイリアスを追加する**(正準の実行形は `pnpm -s issue-keeper <command>`)

```jsonc
{ "scripts": { "issue-keeper": "issue-keeper" } }
```

**3. ルートに `issue-keeper.config.json` を作成する**

```jsonc
{
  "repo": "<owner>/<name>",       // 必須。対象リポジトリ
  "markerPrefix": "issuecli"      // セクションマーカーの接頭辞(既定: issuecli)
  // "projectTitle": "..."        // Projects v2 のプロジェクト名。省略時はリポジトリ名
}
```

**4. `.claude/settings.json` にプラグインを宣言する**(既存の設定にキーをマージする)

```json
{
  "extraKnownMarketplaces": {
    "issue-keeper": { "source": { "source": "github", "repo": "Katsu0424/issue-keeper" } }
  },
  "enabledPlugins": { "issue-keeper@issue-keeper": true }
}
```

インストールの承認プロンプトは次回の Claude Code 起動時に出る(承認は人の操作)。

**5. プロジェクト固有の `/implement` スキルを用意する**

`issue-keeper` のディスパッチは Task の実装段階で `/implement` スキルを名指しする。これはブランチ規約・品質ゲート・PR 手順などリポジトリ固有の内容を含むため、プラグインには同梱していない。[docs/implement-template.md](docs/implement-template.md) を `.claude/skills/implement/SKILL.md` にコピーし、`<プレースホルダ>` を埋める。

**6. 動作確認**

```bash
pnpm -s issue-keeper list
```

初回実行時に Projects v2 プロジェクトとフィールド(Kind/Status/Priority/SP)が自動作成される。エラー `unknown field` 等が出る場合は `gh auth refresh -s project --hostname github.com` を実行する。

**7. 利用側リポジトリの `CLAUDE.md` に運用規約を追記する**(以下をコピペし、必要なら調整)

```markdown
## issue 管理の規約

**issue の書込はすべて `issue-keeper` 経由で行う。`gh issue create` / `gh issue edit` / GitHub UI での手編集で管理 issue(Projects v2 プロジェクト所属)を触らない。**
状態 3 軸(Kind/Status/Priority)は GitHub Projects v2 のフィールド、本文はマーカー区切りセクションとして CLI の状態機械が管理しており、手編集は Malformed や rollup-drift を生む。修復も `issue-keeper set-fields` / `issue-keeper update` で行う。

- 起票 → `/issue-keeper:note` スキル
- 前進 → `/issue-keeper:next-step` スキル(`pnpm -s issue-keeper inspect <n> --dispatch` の instruction に従う)
- 取り下げ・分解のやり直し → `pnpm -s issue-keeper delete <n>`(素の `gh issue close` は使わない)
- データモデルとワークフローの詳細: issue-keeper リポジトリの `docs/model.md` / `docs/workflow.md`
```

## コマンド一覧

`list` / `inspect [--dispatch]` / `create` / `plan-feature` / `plan-bug` / `plan-adr` / `plan-epic` / `start` / `update` / `set-fields` / `delete`。すべて stdout に JSON(複数件は JSONL)を出す。詳細は [docs/workflow.md](docs/workflow.md)。

## 開発(このリポジトリ自体)

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

品質ゲートは [lint-gate](https://github.com/Katsu0424/lint-gate) を dogfood している。
