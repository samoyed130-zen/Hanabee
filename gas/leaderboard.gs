/*** 設定 ***/
const SHEET_ID   = '1ROPdtzZh20W0GqZ3MXHHo715EEGgxSgtFzjywdid2pQ'; // URLの /d/ と /edit の間
const SHEET_NAME = 'シート1';                       // シート名（タブ名）
const HEADERS    = ['t','name','score','maxCombo'];

/*** 共通：シート取得（ヘッダ自動整備） ***/
function getSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  const rng = sh.getRange(1,1,1,HEADERS.length);
  const values = rng.getValues()[0];
  let changed = false;
  for (let i=0;i<HEADERS.length;i++){
    if (values[i] !== HEADERS[i]) { values[i] = HEADERS[i]; changed = true; }
  }
  if (changed) rng.setValues([values]);
  return sh;
}

/*** 追加：フォームPOST（URLSearchParams）に対応 ***/
function doPost(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const t        = Number(p.t || Date.now());
    const name     = String(p.name || 'YOU').slice(0,16);
    const score    = Number(p.score || 0) | 0;
    const maxCombo = Number(p.maxCombo || 0) | 0;

    const sh = getSheet_();
    // 同時書き込み対策（授業用の最低限）
    const lock = LockService.getScriptLock();
    lock.tryLock(3000);
    sh.appendRow([t, name, score, maxCombo]);
    lock.releaseLock();

    return ContentService
      .createTextOutput(JSON.stringify({ ok:true }))
      .setMimeType(ContentService.MimeType.JSON); // ← CORSプリフライト不要（フォームPOSTなのでOK）
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok:false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/*** 取得：クライアントは ?limit=10 で呼ぶ想定 ***/
function doGet(e) {
  const limit = Math.max(1, Math.min(50, Number(e && e.parameter && e.parameter.limit || 10)));
  const sh = getSheet_();
  const last = sh.getLastRow();
  let items = [];
  if (last >= 2) {
    const values = sh.getRange(2,1,last-1,HEADERS.length).getValues();
    items = values.map(r => ({ t:Number(r[0]), name:String(r[1]), score:Number(r[2])|0, maxCombo:Number(r[3])|0 }));
    // 並び替え：スコア降順 → maxCombo降順 → 古い順
    items.sort((a,b)=> (b.score-a.score) || (b.maxCombo-a.maxCombo) || (a.t-b.t));
    items = items.slice(0, limit);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok:true, items }))
    .setMimeType(ContentService.MimeType.JSON); // GETはそのままでOK
}