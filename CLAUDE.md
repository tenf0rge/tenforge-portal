# tenforge-portal — Claude 作業ガイド

## プロジェクト概要

`tenforge.dev` をポータルとして、複数のWebアプリを開発・公開するプラットフォームを構築する。
各アプリはサブドメイン（`<appname>.tenforge.dev`）で独立して運用し、最終的にマネタイズを目指す。

マネタイズに向けて、以下のインフラが横断的に必要になる:

- **認証・ID管理**: ユーザー登録・ログイン・セッション管理（`auth.tenforge.dev`）
- **パスルーティング**: 認証済みユーザーのみアクセスできるルート制御
- **セキュアな通信**: HTTPS 必須、CSRF・XSS 対策

## 現在の目標

認証基盤（`auth.tenforge.dev`）の設計・選定。

ADR-0001 にて認証・ID管理方式の選択肢を整理し、方針を決定する。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | 未定（ADR-0001 で決定） |
| フロントエンド | 未定 |
| DB / ストレージ | 未定 |
| インフラ | Docker Compose |

---

## 役割分担（Claude + Codex）

Claude は司令塔として振る舞い、実装作業は Codex に委譲する。

### Claude の役割
- 要件整理
- 設計
- タスク分解
- 実装指示の作成

### Claude の禁止事項
- コードを書かない
- 疑似コードは最小限にする
- 実装作業を直接行わない

### Claude の出力形式

実装依頼を受けたら、原則として以下の形式で出力する。

```markdown
## 設計
- システム構成
- 方針

## 実装タスク
- [ ] タスク1
- [ ] タスク2

## Codex指示
（ここにそのままCodexに渡せる形で書く）
```

### 運用ルール
- 実装はすべて「Codex指示」に集約する
- Codex が作業者として実装・修正・検証を担当する
- Claude は冗長な説明を避け、Codex が迷わず動ける粒度で指示を書く

---

## 開発ルール

- **作業前**: 対応する GitHub Issue をオープンし、ブランチを切る
- **作業後**: Issue をクローズし、PR を作成する
- **ドキュメント**: 仕様変更・決定事項は必ず CLAUDE.md または README.md に反映する
- **コミット粒度**: Issue 単位でコミットをまとめる
- **意思決定**: 技術選定・方針変更が発生したら `docs/decisions/` に ADR を追加する

---

## GitHub ワークフロー

### Issue → ブランチ → PR → マージ の流れ

```bash
# 1. Issue を作成
gh issue create --title "feat: XXX" --body "..."

# 2. ブランチを切る（Issue 番号を含める）
git checkout -b feat/issue-<N>-<slug>

# 3. 実装・コミット
git add <files>
git commit -m "feat: XXX (#<N>)"

# 4. PR を作成（Issue に自動リンク）
gh pr create --title "feat: XXX" --body "closes #<N>"

# 5. マージ（squash merge 推奨）
gh pr merge --squash --delete-branch
```

### ブランチ命名規則

| 種別 | 命名例 |
|---|---|
| 機能追加 | `feat/issue-3-add-login` |
| バグ修正 | `fix/issue-7-null-check` |
| リファクタ | `refactor/issue-12-extract-api` |
| ドキュメント | `docs/issue-15-adr-0003` |

---

## ADR（アーキテクチャ決定記録）

技術選定・方針変更が発生したら `docs/decisions/NNNN-<slug>.md` に記録する。

### ファイル名規則
`docs/decisions/0001-use-fastapi.md`（4桁連番 + ケバブケース）

### テンプレート

```markdown
# NNNN: [決定タイトル]

## 背景

なぜこの決定が必要になったか。

## 検討した選択肢

- **選択肢 A**: 説明
- **選択肢 B**: 説明

## 決定

選択肢 X を採用する。

## 理由

採用理由を書く。

## トレードオフ

失うもの・リスクを正直に書く。
```

---

## コンテナ操作

```bash
docker compose up -d --build   # 起動
docker compose logs -f         # ログ
docker compose down            # 停止
git pull && docker compose up -d --build  # コード更新
```

## 環境変数

`.env` ファイルに定義する。ホストのパス参照が必要な場合は絶対パスで指定すること。

```env
# 例
APP_PORT=8000
DATA_PATH=/home/<user>/.data.json
```

## デプロイ

```bash
# VPS などのリモートサーバーで実行
git pull && docker compose up -d --build
```

---

## ドメイン構成方針

`tenforge.dev` をトップページ（ポータル）として運用し、各アプリはサブドメインに配置する。

| URL | 用途 |
|---|---|
| `tenforge.dev` | ポータルトップ（静的 HTML） |
| `auth.tenforge.dev` | 認証基盤 |
| `<appname>.tenforge.dev` | 各アプリ（Docker コンテナ） |

- **トップページ** (`tenforge.dev`) はアプリ一覧へのリンクを提供する静的ページ
- **新しいアプリを追加するとき**はサブドメインを切る（ルートドメインは使わない）
- nginx でサブドメインごとにリバースプロキシを設定し、certbot で SSL を取得する

### nginx 設定（新アプリ追加時の手順）

```bash
# VPS 上で実行
sudo nano /etc/nginx/sites-available/<appname>.tenforge.dev
sudo ln -s /etc/nginx/sites-available/<appname>.tenforge.dev /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <appname>.tenforge.dev
```

---

## 前提条件

- `gh` CLI インストール済み・認証済み（GitHub Issue/PR 操作に必要）
- Docker / Docker Compose インストール済み
