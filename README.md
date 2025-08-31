# 動くWebページコンテスト 雛形（Tailwind CDN / Vanilla JS）

外部ライブラリ禁止（Bootstrap以外禁止、Tailwind可）の前提で、**Tailwind（CDN）＋バニラJS**だけで動くサンプルです。
Canvasの**クリック花火**デモと、設定パネル（粒子数/威力/重力/加算合成/残像/自動発火）を実装しています。

## 使い方

1. このリポジトリをGitHubにアップロード
2. **GitHub Pages** を有効化（`Settings > Pages > Source: Deploy from a branch` / `Branch: main (root)`）
3. 数十秒待つと `https://<ユーザー名>.github.io/<リポジトリ名>/` でアクセス可能

> ビルドは不要。TailwindはCDNで読み込んでいます。

## 開発

- `index.html`：ページ本体（Tailwind CDN、Canvas、UI）
- `scripts/main.js`：花火の実装（外部ライブラリなし）
- `styles/style.css`：必要があれば微調整をここに

### ローカルで開く
ファイル直開きでも動きますが、相対パスや将来の拡張を考えて**静的サーバ**を使うのが推奨です。  
Python の簡易サーバ例：

```bash
python3 -m http.server 5173
# -> http://localhost:5173
```

## ライセンス
MIT
