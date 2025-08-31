# Leaderboard GAS (Google Apps Script)

Hanabee のオンライン・リーダーボード用 GAS（Google Apps Script）です。  
`leaderboard.gs` をスプレッドシートに紐づけた Web アプリとしてデプロイすると、
クライアント（GitHub Pages 側）からスコアの **追加（POST）** と **取得（GET）** ができます。

---

## 構成
- `leaderboard.gs` … 本体コード（フォームPOST推奨）
- 期待するスプレッドシート構成：
  - シート名（タブ名）: `Leaderboard`（任意に変更可。コードの `SHEET_NAME` と一致させる）
  - 1行目ヘッダ: `t, name, score, maxCombo`（自動整備されます）

---

## 事前準備
1. スプレッドシートを作成（または既存を使用）
2. スプレッドシートの **ID** を控える  
   → URLの `/d/` と `/edit` の間の文字列（例: `1AbCdEFg...`）

---

## セットアップ手順（GAS 側）
1. Apps Script エディタを開く（スプレッドシートから `拡張機能 → Apps Script`）
2. `leaderboard.gs` の内容を貼り付け
3. 冒頭の設定値を編集：
   ```js
   const SHEET_ID   = '<<YOUR_SPREADSHEET_ID>>'; // スプレッドシートID
   const SHEET_NAME = 'Leaderboard';             // シート名（タブ名）
   ```
4. 保存
5. **デプロイ → 新しいデプロイ → 種類: ウェブアプリ**
   - 実行ユーザー: **自分（Me）**
   - アクセスできるユーザー: **全員（Anyone）**
   - デプロイして表示される **Web app URL (/exec)** をコピー

> コードを変更したら、その都度 **再デプロイ** が必要です（URL も更新される場合あり）。

---

## 動作確認（サーバ単体）
### 1) GET（一覧の取得）
ブラウザで：
```
<WEB_APP_URL>/exec?limit=10
```
→ `{"ok":true,"items":[...]}` が返れば OK。

### 2) POST（スコア追加）
`curl` で：
```
curl -L --post302 \
  -d "t=$(date +%s000)&name=TEST&score=12345&maxCombo=16" \
  "<WEB_APP_URL>/exec"
```
→ `{"ok":true}` が返り、シートに行が追加されれば OK。

> `-L --post302` は Apps Script の 302 リダイレクトを追跡しつつ POST を維持するためのオプションです。

---

## クライアント（Hanabee）からの呼び出し
`main.js` 側では `LB_URL` に Web App の `/exec` を設定し、
フォーム形式（`URLSearchParams`）で POST します。プリフライト回避のため JSON ではなく **フォームPOST** を推奨。

> 補足: コード上は POST を実装していますが、このプロジェクトでは権限の都合により実際には **GET** リクエストを利用してスコアを登録・取得しています。

```js
// 送信（POST）
const form = new URLSearchParams({
  t: String(Date.now()),
  name,
  score: String(score),
  maxCombo: String(maxCombo),
});
await fetch(LB_URL, { method: 'POST', body: form });

// 取得（GET）
const res = await fetch(LB_URL + '?limit=10');
const data = await res.json(); // { ok:true, items:[ {t,name,score,maxCombo}, ... ] }
```

---

## レスポンスとデータ形式
- **POST**: `{ ok: true }`（エラー時 `{ ok:false, error:"..." }`）
- **GET**: `{ ok: true, items: Array< { t:number, name:string, score:number, maxCombo:number } > }`
- 並び順（サーバ側）：**score 降順 → 古い順**（授業用の簡易実装）

---

## よくあるトラブルと対処
- **"Unexpected error ... openById"**: `SHEET_ID` が間違い or 実行ユーザーの権限不足 → `Me` でデプロイ＆ID再確認
- **書き込めない**: デプロイ設定が `Me / Anyone` になっていない、再デプロイ忘れ
- **/exec で 302 → ドライブのエラーHTML**: 古い/無効なデプロイURL → 新規デプロイして URL を差し替え
- **CORS**: フォームPOSTならプリフライト不要。GET をブラウザから直接叩く用途があるなら CORS ヘッダを追加しても可

---

## 開発Tips（任意）
- **clasp** を使うとローカルと GAS の同期ができる：
  ```bash
  npm install -g @google/clasp
  clasp login
  clasp create --type sheets --title "LeaderboardAPI"
  clasp push
  ```
- 複数ゲームで流用するなら、この GAS を **ライブラリ化** して他プロジェクトから呼び出すことも可能。

---

## ライセンス / 注意
- 授業用途の簡易実装です。高トラフィックや改ざん対策は考慮していません。
- 必要に応じてトークン検証や書き込み制限を追加してください。