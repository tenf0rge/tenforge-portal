# デプロイ手順

## 前提条件

- VPS: tenforge.dev（SSH アクセス可能）
- Supabase プロジェクト作成済み
- Docker / Docker Compose インストール済み

---

## ステップ 1: Supabase プロジェクト作成

1. [supabase.com](https://supabase.com) にアクセス
2. 新規プロジェクト作成
3. プロジェクト設定から以下を確認・記録:
   - **Project URL** (`SUPABASE_URL`)
   - **Anon Key** (`SUPABASE_ANON_KEY`)

---

## ステップ 2: VPS に auth app をデプロイ

### 2-1. ローカルから VPS へコピー

```bash
cd /home/yuki/projects/tenforge-portal
scp -r apps/auth tenforge.dev:~/tenforge-portal/
scp infra/nginx-auth.tenforge.dev.conf tenforge.dev:~/nginx-auth.conf
```

### 2-2. VPS で `.env` ファイルを作成

```bash
ssh tenforge.dev
cd ~/tenforge-portal/auth
cat > .env <<EOF
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=xxxx
EOF
```

### 2-3. VPS で nginx 設定を追加・リロード

```bash
# ホストマシンの nginx 設定に vhost を追加
sudo cp ~/nginx-auth.conf /etc/nginx/sites-available/auth.tenforge.dev
sudo ln -s /etc/nginx/sites-available/auth.tenforge.dev /etc/nginx/sites-enabled/

# 構文チェック + リロード
sudo nginx -t && sudo systemctl reload nginx
```

### 2-4. Docker Compose で auth サービス起動

```bash
cd ~/tenforge-portal/auth
docker-compose up -d --build

# ログ確認
docker-compose logs -f
```

確認: `http://auth.tenforge.dev` にアクセスできるか

---

## ステップ 3: SSL 証明書取得

```bash
sudo certbot --nginx -d auth.tenforge.dev
```

確認: `https://auth.tenforge.dev` で HTTPS アクセス可能か

---

## トラブルシューティング

### nginx リバースプロキシが 502 を返す

```bash
# Docker コンテナが起動しているか確認
docker ps | grep auth-web

# ログ確認
docker logs auth-web
```

### Cookie が `.tenforge.dev` で共有されない

ブラウザの開発者ツール → Application → Cookies を確認:
- `tenforge-auth-token` の Domain が `.tenforge.dev` か？
- Secure フラグがついているか？（HTTPS で必須）

---

## 確認事項

- [ ] Supabase プロジェクト作成済み
- [ ] `.env` に SUPABASE_URL / SUPABASE_ANON_KEY 設定済み
- [ ] VPS nginx に vhost 追加済み
- [ ] docker-compose up で auth-web 起動確認
- [ ] `https://auth.tenforge.dev/index.html` にアクセス可能
- [ ] ログインフォーム表示される
