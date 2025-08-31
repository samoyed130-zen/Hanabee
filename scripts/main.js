// scripts/main.js
(() => {
  // ---------- Helpers ----------
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const now = () => performance.now();
  const lerp = (a, b, t) => a + (b - a) * t;
  // Zero-pad helper (non-negative integers)
  const zpad = (n, width) => String(Math.max(0, Math.floor(n))).padStart(width, '0');

  // ---------- Game Constants ----------
  const PLAYER_NAME_KEY   = 'fireworks_name';
  const LEADERBOARD_KEY   = 'fireworks_lb';
  const LEADERBOARD_SIZE  = 10;
  const CHAIN_DELAY_MS    = 100; // 0.1s delay for chained explosions
  const IS_RELEASE_BUILD = true; // Hide debug UI & disable debug toggles in release

  // ---------- Main canvas (UI/targets) ----------
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  // ---------- Offscreen canvas for particles/trails ----------
  const fx = document.createElement('canvas');
  const fxctx = fx.getContext('2d');

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.floor(rect.width  * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    fx.width  = canvas.width;
    fx.height = canvas.height;
    fxctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize, { passive: true });
  resize();

  // ---------- Game Name ----------
  const GAME_NAME = 'Hanabee';
  document.title = GAME_NAME;
  ['#siteTitle', '#brandTitle', '[data-game-name]'].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => { el.textContent = GAME_NAME; });
  });

  // ---------- UI refs ----------
  const fpsEl = document.getElementById('fps');
  const ui = {
    particles: document.getElementById('particles'),
    power: document.getElementById('power'),
    gravity: document.getElementById('gravity'),
    glow: document.getElementById('glow'),
    trail: document.getElementById('trail'),
    auto: document.getElementById('auto'),
    clearBtn: document.getElementById('clearBtn'),
  };
  const particlesVal = document.getElementById('particlesVal');
  const powerVal     = document.getElementById('powerVal');
  const gravityVal   = document.getElementById('gravityVal');
  const comboGaugeFill = document.getElementById('comboGaugeFill');

  // Feature flags
  const flagZpad        = document.getElementById('flagZpad');
  const flagComboRed    = document.getElementById('flagComboRed');
  const flagChainDelay  = document.getElementById('flagChainDelay');
  const flagSlowTargets = document.getElementById('flagSlowTargets');
  const flags = () => ({
    zpad:        flagZpad ? flagZpad.checked : true,
    comboRed:    flagComboRed ? flagComboRed.checked : true,
    chainDelay:  flagChainDelay ? flagChainDelay.checked : true,
    slowTargets: flagSlowTargets ? flagSlowTargets.checked : true,
  });

  // ----- Hide Debug UI in release -----
  if (IS_RELEASE_BUILD) {
    // Hide known debug panel containers if present
    ['debugPanel','panelDebug','debug'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Hide individual debug checkboxes if they exist
    [flagZpad, flagComboRed, flagChainDelay, flagSlowTargets].forEach(el => {
      if (!el) return;
      const wrap = el.closest('.debug-item') || el.closest('label') || el.parentElement || el;
      if (wrap && wrap.style) wrap.style.display = 'none';
    });
  }

  // Solo HUD
  const soloUI = {
    time:  document.getElementById('uiTime'),
    score: document.getElementById('uiScore'),
    combo: document.getElementById('uiCombo'),
    btnStart: document.getElementById('btnStart'),
    overlay:  document.getElementById('overlay'),
    ovTitle:  document.getElementById('ovTitle'),
    ovMsg:    document.getElementById('ovMsg'),
    ovStats:  document.getElementById('ovStats'),
    ovStart:  document.getElementById('ovStart'),
    playerName: document.getElementById('playerName'),
    saveNameBtn: document.getElementById('saveNameBtn'),
  };

  const syncLabel = () => {
    if (particlesVal) particlesVal.textContent = ui.particles?.value ?? "—";
    if (powerVal)     powerVal.textContent     = ui.power?.value ?? "—";
    if (gravityVal)   gravityVal.textContent   = ui.gravity?.value ?? "—";
  };
  if (ui.particles) ['input','change'].forEach(e=>ui.particles.addEventListener(e,syncLabel));
  if (ui.power)     ['input','change'].forEach(e=>ui.power.addEventListener(e,syncLabel));
  if (ui.gravity)   ['input','change'].forEach(e=>ui.gravity.addEventListener(e,syncLabel));
  if (ui.clearBtn)  ui.clearBtn.addEventListener('click', ()=>{
    particles.length=0;
    fxctx.clearRect(0,0,fx.width/dpr,fx.height/dpr);
  });
  syncLabel();

  // ---------- Player name UI ----------
  function loadPlayerName(){ return localStorage.getItem(PLAYER_NAME_KEY) || 'ZEN太郎'; }
  function savePlayerName(name){
    const n = String(name || '').trim().slice(0,16);
    if (!n) { localStorage.removeItem(PLAYER_NAME_KEY); return ''; }
    localStorage.setItem(PLAYER_NAME_KEY, n);
    return n;
  }
  function initNameUI(){
    if (!soloUI.playerName) return;
    // 初期値：保存がなければデフォルト名
    soloUI.playerName.value = loadPlayerName();
    // Enter で保存
    soloUI.playerName.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') {
        const n = savePlayerName(soloUI.playerName.value);
        soloUI.playerName.value = n;
      }
    });
  }
  initNameUI();

  // ---------- Fireworks Particles (drawn on FX canvas only) ----------
  const particles = [];
  const sparksMax = 2500;

  function addFirework(x,y, hueOverride = null){
    const count = parseInt(ui.particles?.value ?? 120,10);
    const basePower = parseFloat(ui.power?.value ?? 9);
    const g     = parseFloat(ui.gravity?.value ?? 0.12);
    const baseHue = hueOverride ?? Math.random()*360;
    const fScale = fireScaleByCombo(); // コンボに応じて花火の大きさをスケール
    const power  = basePower * fScale;

    for(let i=0;i<count;i++){
      const angle = Math.random()*Math.PI*2;
      const speed = rand(power*0.6,power);
      particles.push({
        x,y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, ax:0, ay:g,
        life: rand(0.8,1.6), age:0, size: rand(1.5,3.5) * fScale,
        hue:(baseHue+rand(-20,20)+360)%360, sat:rand(70,100), light:rand(50,70), alpha:1,
      });
      if(particles.length>sparksMax)particles.splice(0,particles.length-sparksMax);
    }
  }
  function stepParticles(dt){
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.age+=dt; if(p.age>=p.life){particles.splice(i,1);continue;}
      p.vx+=p.ax*dt*60; p.vy+=p.ay*dt*60;
      p.x+=p.vx*dt*60;  p.y+=p.vy*dt*60;
      p.alpha = 1 - p.age/p.life;
      p.size *= 0.995;
    }
  }
  function fxFade(trailAlpha=0.14){
    // 透明キャンバス上の既存ピクセルのアルファを減らす（残像フェード）
    fxctx.save();
    fxctx.globalCompositeOperation = 'destination-out';
    fxctx.fillStyle = `rgba(0,0,0,${trailAlpha})`;
    fxctx.fillRect(0,0,fx.width/dpr,fx.height/dpr);
    fxctx.restore();
  }
  function drawParticlesOnFx(){
    fxctx.save();
    fxctx.globalCompositeOperation = (ui.glow?.checked ?? true) ? 'lighter':'source-over';
    for(const p of particles){
      fxctx.beginPath();
      fxctx.arc(p.x,p.y,p.size,0,Math.PI*2);
      fxctx.fillStyle=`hsla(${p.hue} ${p.sat}% ${p.light}% / ${p.alpha})`;
      fxctx.fill();
    }
    fxctx.restore();
  }

  // ---------- Targets & Game Logic ----------
  let targets = [];
  const TARGET_BASE_R = 16;
  let spawnT = 0;
  let spawnEvery = 1.1;
  const GAME_TIME_TOTAL = 60.0;
  let gameTime = GAME_TIME_TOTAL;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let playing = false;
  let hasStarted = false; // タイトル表示用フラグ
  let overlayAction = null; // オーバーレイ右下ボタンの挙動（Title→HowTo→Start）
  let overlaySession = 0;           // オーバーレイ更新の再入防止用トークン
  const pendingTimers = new Set();  // キャンセル可能なタイマー一覧
  let startLocked = false;          // 通信完了まで Start/Restart をロック

let hiScore = Number(localStorage.getItem('fireworks_hi')||0);

// ---------- Remote Leaderboard (optional) ----------
// Google Apps Script Web App URL (deploy GAS and paste the URL below). Leave empty to use local-only.
const LB_URL = 'https://script.google.com/macros/s/AKfycbx-IYAVoOjFsVVLRPfPMW6Prl7FmcnOnUlnaHp1owEjs4pnyauPlShO2NNuh5hSo6wl/exec';
async function postJSON(url, data){
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
  if(!res.ok) throw new Error('HTTP '+res.status);
  return await res.json();
}
async function getJSON(url){
  const res = await fetch(url, { method:'GET' });
  if(!res.ok) throw new Error('HTTP '+res.status);
  return await res.json();
}

  // ---------- Start-token (lightweight anti-tamper) ----------
  let startToken = null; // issued by GAS on start; must be echoed on submit
  async function fetchStartToken(){
    if(!LB_URL) return null;
    try{
      const sep = LB_URL.includes('?') ? '&' : '?';
      const url = `${LB_URL}${sep}start=1&ua=${encodeURIComponent(navigator.userAgent)}&t=${Date.now()}`;
      const data = await getJSON(url);
      if (data && data.token) { startToken = String(data.token); return startToken; }
    }catch(_e){}
    startToken = null; return null;
  }

  // ---------- Leaderboard (localStorage) ----------
  function loadLeaderboard(){
    try { return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]'); }
    catch(e){ return []; }
  }
  function saveLeaderboard(list){
    try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list)); } catch(e){}
  }
  function addToLeaderboard(name, score, maxCombo){
    const list = loadLeaderboard();
    const entry = { name: (name||'YOU').slice(0,16), score, maxCombo, t: Date.now() };
    list.push(entry);
    // 高スコア優先、同点は maxCombo 高い方、さらに古い方を先に
    list.sort((a,b)=> (b.score-a.score) || (b.maxCombo-a.maxCombo) || (a.t-b.t));
    if (list.length > LEADERBOARD_SIZE) list.length = LEADERBOARD_SIZE;
    saveLeaderboard(list);
    return list;
  }
  function escHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  function fmtScore(n){ return zpad(n, 8); }
  function safeTimeout(fn, ms){
    const id = setTimeout(()=>{ pendingTimers.delete(id); fn(); }, ms);
    pendingTimers.add(id);
    return id;
  }
  function clearAllPendingTimers(){
    for(const id of pendingTimers) clearTimeout(id);
    pendingTimers.clear();
  }
  function setRestartEnabled(enabled){
    startLocked = !enabled; // ロック状態を同期
    const btns = [soloUI.btnStart, soloUI.ovStart];
    for(const b of btns){
      if(!b) continue;
      b.disabled = !enabled;
      b.classList.toggle('opacity-50', !enabled);
      b.classList.toggle('pointer-events-none', !enabled);
    }
  }

  // Remote wrappers with local fallback
  async function submitScoreRemote(name, score, maxCombo){
    if(!LB_URL){ 
      addToLeaderboard(name, score, maxCombo); 
      return { ok:true, remote:false }; 
    }
    try{
      // best-effort: require a start token if available
      if (startToken == null) await fetchStartToken();
      const form = new URLSearchParams();
      form.append("t", Date.now());
      form.append("name", name);
      form.append("score", score);
      form.append("maxCombo", maxCombo);
      if (startToken) form.append("token", startToken);

      await fetch(LB_URL, { method: "POST", body: form });

      return { ok:true, remote:true };
    }catch(e){
      addToLeaderboard(name, score, maxCombo);
      return { ok:false, remote:false, error:String(e) };
    }
  }
  async function fetchLeaderboardRemote(){
    if(!LB_URL){ return loadLeaderboard(); }
    try{
      const sep = LB_URL.includes('?') ? '&' : '?';
      const url = `${LB_URL}${sep}limit=10&t=${Date.now()}`; // Top10 + cache-buster
      const data = await getJSON(url);
      if (Array.isArray(data?.items)) return data.items;
      return loadLeaderboard();
    }catch(e){
      return loadLeaderboard();
    }
  }

  // Combo settings
  const COMBO_WINDOW = 2.0; // seconds（受付時間を2秒に）
  const SCORE_PER_HIT = 100;
  const MAX_COMBO = 16;     // コンボ上限
  // ----- Fever Time (no visual flash) -----
  const FEVER_REQUIRE_DURATION = 10.0; // MAXコンボが続いた秒数で発動
  const FEVER_DURATION = 10.0;         // フィーバー持続（最大）
  let feverActive = false;             // 発動中
  let feverTriggered = false;          // 1ゲーム1回のみ
  let feverStartAt = 0;                // 発動時刻（秒）
  let comboMaxStartAt = null;          // MAX継続の開始時刻（秒）
  let lastHitAt = -Infinity; // seconds (performance.now()/1000)

  // 連鎖の巻き込み半径倍率（ターゲット半径×倍率）
  const CHAIN_RADIUS_MULT = 3; // 連鎖の基本半径を抑制（広がり過ぎ防止）
  // スコア倍率：コンボ1→1.0倍、MAX(16)→2.5倍（間は補間）
  const scoreMultByCombo = (c) => {
    const cc = clamp(c, 1, MAX_COMBO);
    const t = (cc - 1) / (MAX_COMBO - 1);
    return lerp(1.0, 2.5, t);
  };
  // ----- Combo-based scaling helpers -----
  const comboT = () => {
    if (!playing) return null;
    const c = Math.max(1, Math.min(combo, MAX_COMBO));
    return (c - 1) / (MAX_COMBO - 1);
  };
  const fireScaleByCombo = () => {
    const t = comboT();
    return t == null ? 1 : lerp(0.5, 2.0, t); // 花火サイズ: 1→0.5倍, 16→2倍
  };
  const chainScaleByCombo = () => {
    const t = comboT();
    return t == null ? 1 : lerp(1.0, 1.4, t); // 判定半径: 1→1倍, 16→1.4倍（控えめ）
  };
  function resetGame(){
    targets.length = 0;
    spawnT = 0;
    spawnEvery = 1.1;
    gameTime = GAME_TIME_TOTAL;
    score = 0;
    combo = 0; maxCombo = 0;
    lastHitAt = -Infinity;
    // Fever reset
    feverActive = false;
    feverTriggered = false;
    feverStartAt = 0;
    comboMaxStartAt = null;
    updateHUD();
    // 画面クリア
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,canvas.width/dpr,canvas.height/dpr);
    fxctx.clearRect(0,0,fx.width/dpr,fx.height/dpr);
    // 初期に少なくとも4つは画面に出しておく
    for (let i = 0; i < 4; i++) spawnTarget();
  }
  function startGame(){
    if (startLocked) return; // 通信中の二重開始防止
    overlaySession++;        // 以降の古いUI更新を無効化
    clearAllPendingTimers(); // 遅延コールバック全キャンセル
    hasStarted = true;
    resetGame();
    playing = true;
    toggleOverlay(false);
    setRestartEnabled(true); // 念のため有効化
  }
  function endGame(){
    playing = false;
    maxCombo = Math.max(maxCombo, combo);
    if (score > hiScore){ hiScore = score; localStorage.setItem('fireworks_hi', String(hiScore)); }
    showResult();
  }
  function toggleOverlay(show){
    if (!soloUI.overlay) return;
    if (show){
      soloUI.overlay.style.display = 'grid';
    } else {
      overlaySession++;        // これ以降の古いUI更新を無効化
      clearAllPendingTimers();
      soloUI.overlay.style.display = 'none';
    }
  }
  function showTitle(){
    if (!soloUI.overlay) return;
    const pnameSaved = localStorage.getItem(PLAYER_NAME_KEY);
    const defaultName = 'ZEN太郎';

    // UI text
    soloUI.ovTitle.textContent = GAME_NAME; // タイトル
    soloUI.ovMsg.innerHTML = '<div class="mt-2 opacity-80">花火をクリックして連鎖を起こし、スコアを稼ごう！</div>';

    // Show name row only on Title
    const row = document.getElementById('nameRow');
    if (row) row.style.display = '';
    if (soloUI.playerName) {
      soloUI.playerName.value = pnameSaved ? pnameSaved : defaultName; // 保存が無ければ初期値はZEN太郎
      soloUI.playerName.setAttribute('placeholder', '名前を入力してください。'); // 空欄時の表示
    }

    // Button text & validation
    soloUI.ovStart.textContent = 'Next';

    const validate = () => {
      const v = (soloUI.playerName?.value || '').trim();
      const ok = v.length > 0;
      soloUI.ovStart.disabled = !ok;
      soloUI.ovStart.classList.toggle('opacity-50', !ok);
      soloUI.ovStart.classList.toggle('pointer-events-none', !ok);
      return ok;
    };
    validate();
    if (soloUI.playerName) soloUI.playerName.addEventListener('input', validate, { once:false });

    // Proceed action: save then go to HowTo (ignore click if empty)
    overlayAction = () => {
      if (!validate()) return;
      if (soloUI.playerName) savePlayerName(soloUI.playerName.value);
      showHowTo();
    };

    soloUI.ovStats.classList.add('hidden');
    soloUI.ovStats.innerHTML = '';
    toggleOverlay(true);
  }
  function showHowTo(){
    if (!soloUI.overlay) return;
    soloUI.ovTitle.textContent = '遊び方 / 操作';
    soloUI.ovMsg.innerHTML = `
      <div class="text-left space-y-2">
        <p>・画面の花火ターゲットをクリックで爆発。近くのターゲットを巻き込んで<strong>連鎖</strong>させるとスコアUP。</p>
        <p>・コンボ受付時間は約 ${COMBO_WINDOW} 秒。連続ヒットで倍率が上がります。</p>
        <p>・持ち時間は ${GAME_TIME_TOTAL} 秒。ハイスコアを目指そう！</p>
        <hr class="my-2 opacity-20">
        <p><strong>操作</strong></p>
        <p>・マウス / タップ：狙って爆発</p>
      </div>`;

    const row = document.getElementById('nameRow');
    if (row) row.style.display = 'none';

    soloUI.ovStats.classList.add('hidden');
    soloUI.ovStats.innerHTML = '';
    soloUI.ovStart.textContent = 'START';
    soloUI.ovStart.disabled = false;
    soloUI.ovStart.classList.remove('opacity-50','pointer-events-none');
    fetchStartToken(); // prefetch without blocking UI
    overlayAction = () => { startGame(); };
    toggleOverlay(true);
  }
  async function showResult(){
    if (!soloUI.overlay) return;
    const row = document.getElementById('nameRow');
    if (row) row.style.display = 'none';

    const mySession = ++overlaySession; // この呼び出し専用のトークン

    // プレースホルダを先に表示（通信中はRestartを無効化）
    soloUI.ovTitle.textContent = 'Result';
    soloUI.ovMsg.textContent   = 'ランキングを更新中…';
    soloUI.ovStats.classList.remove('hidden');
    soloUI.ovStats.innerHTML = `
      <div>Score: <b>${fmtScore(score)}</b></div>
    `;
    soloUI.ovStart.textContent = 'Restart';
    overlayAction = () => { startGame(); };
    setRestartEnabled(false);
    toggleOverlay(true);

    // スコア送信
    try{
      const playerName = localStorage.getItem(PLAYER_NAME_KEY) || 'YOU';
      await submitScoreRemote(playerName, score, maxCombo);
    }catch(_e){ /* 送信失敗は無視（ローカルにフォールバック済み） */ }

    // ランキング取得
    let list = [];
    try{
      list = await fetchLeaderboardRemote();
    }catch(_e){ list = loadLeaderboard(); }

    // 古いセッションなら反映しない
    if (mySession !== overlaySession) return;

    // ---- Ensure current run is visible even if remote hasn't reflected it yet ----
    const nowT = Date.now();
    const currentEntry = { name: (localStorage.getItem(PLAYER_NAME_KEY)||'YOU').slice(0,16), score, maxCombo, t: nowT };
    if (!Array.isArray(list)) list = [];
    let hasCurrent = list.some(e => e && e.name===currentEntry.name && e.score===currentEntry.score && e.maxCombo===currentEntry.maxCombo && Math.abs((e.t||0) - nowT) < 3000);
    if (!hasCurrent) {
      list.push(currentEntry);
    }
    // 最新の並び規則：スコア降順 → maxCombo降順 → 古い順
    list.sort((a,b)=> (b.score-a.score) || (b.maxCombo-a.maxCombo) || (a.t-b.t));
    if (typeof LEADERBOARD_SIZE==='number' && list.length>LEADERBOARD_SIZE) list.length = LEADERBOARD_SIZE;

    let lbHtml = '';
    if (list.length){
      lbHtml = '<div class="mt-3 text-left">'+
        '<div class="text-xs opacity-80 mb-1">Top '+list.length+' Leaderboard</div>'+
        list.map((e,i)=>{
          const rank = String(i+1).padStart(2,'0');
          const name = escHtml(e.name||'YOU');
          const sc   = fmtScore(e.score||0);
          const dt   = escHtml(new Date(e.t || Date.now()).toLocaleString('ja-JP'));
          const isCurrent = e && e.name===currentEntry.name && e.score===currentEntry.score && e.maxCombo===currentEntry.maxCombo && Math.abs((e.t||0) - currentEntry.t) < 3000;
          const rowCls = isCurrent ? 'bg-yellow-200/30 rounded px-1' : '';
          return `<div class="flex items-baseline justify-between gap-3 ${rowCls}">
            <span class="tabular-nums">${rank}.</span>
            <span class="flex-1 truncate">${name}</span>
            <span class="tabular-nums">${sc}</span>
            <span class="text-xs opacity-60 tabular-nums">${dt}</span>
          </div>`;
        }).join('')+
      '</div>';
    }

    const pname = loadPlayerName();
    soloUI.ovMsg.textContent = `${pname}さん、お疲れ様でした！`;
    soloUI.ovStats.innerHTML = `
      <div>Score: <b>${fmtScore(score)}</b></div>
      ${lbHtml}
    `;
    setRestartEnabled(true); // 通信完了 → 有効化
  }
  function updateHUD(){
    const f = flags();
    // Time
    if (soloUI.time)  soloUI.time.textContent  = f.zpad ? zpad(Math.ceil(gameTime), 3) : gameTime.toFixed(1);
    // Score
    if (soloUI.score) soloUI.score.textContent = f.zpad ? zpad(score, 8) : String(score);
    // Combo
    if (soloUI.combo) {
      const displayCombo = Math.min(combo, MAX_COMBO);
      soloUI.combo.textContent = f.zpad ? zpad(displayCombo, 2) : String(displayCombo);
      const comboWrapEl  = document.getElementById('comboWrap');
      const comboValEl   = document.getElementById('uiCombo');
      const comboXEl     = document.getElementById('comboX');
      const comboLabelEl = document.getElementById('comboLabel');
      const els = [comboWrapEl, comboValEl, comboXEl, comboLabelEl].filter(Boolean);
      if (els.length >= 3) { // require at least wrap+val+x
        const makeRed = f.comboRed && displayCombo >= MAX_COMBO;
        for (const el of els) el.classList.toggle('text-red-500', makeRed);

      // COMBOラベルをフィーバー中だけFEVERに変更、色は黄色
      if (comboLabelEl) {
        if (feverActive) {
          comboLabelEl.textContent = 'FEVER';
          comboLabelEl.classList.add('text-yellow-400');
        } else {
          comboLabelEl.textContent = 'COMBO';
          comboLabelEl.classList.remove('text-yellow-400');
        }
      }

      // x00部分もフィーバー中は黄色、終了時は元の白/赤に戻す
      if (comboWrapEl) comboWrapEl.classList.toggle('text-yellow-400', feverActive);
      if (comboValEl)  comboValEl.classList.toggle('text-yellow-400', feverActive);
      if (comboXEl)    comboXEl.classList.toggle('text-yellow-400', feverActive);
        // フィーバー判定用：MAX継続の開始/解除
        const nowSecHUD = performance.now() / 1000;
        if (displayCombo >= MAX_COMBO) {
          if (comboMaxStartAt == null) comboMaxStartAt = nowSecHUD;
        } else {
          comboMaxStartAt = null;
        }
      }
    }

    // コンボ受付残り時間ゲージ
    if (comboGaugeFill) {
      const nowSec = performance.now() / 1000;
      const remain = Math.max(0, COMBO_WINDOW - (nowSec - lastHitAt));
      const pct = Math.max(0, Math.min(1, remain / COMBO_WINDOW));
      comboGaugeFill.style.width = (pct * 100).toFixed(1) + '%';
      comboGaugeFill.style.opacity = pct > 0 ? 1 : 0.25;
    }
  }

  // 花火らしいターゲット（初速↑→減速→上部でフェードアウト）
  function spawnTarget(){
    const rect = canvas.getBoundingClientRect();
    // ターゲットの大きさを固定（1.5倍）
    const r = TARGET_BASE_R * 1.5;
    const y = rect.height - r;  // 下端から完全表示でスタート（見切れ防止）
    const x = rand(r + 12, Math.max(r + 12, rect.width - r - 12));
    const hue = Math.random()*360;

    // 進行度に応じて「狙う頂点の高さ」を決める（0=開始,1=終了）
    const progress = clamp(1 - gameTime / GAME_TIME_TOTAL, 0, 1);
    // 開始は画面の中央ちょい下まで（高さの60%地点）→ 終了は最上部付近（8%地点）
    const apexY = rect.height * lerp(0.60, 0.08, progress);

    // 減速（重力相当）。開始は強め→終了は弱め
    const ay = lerp(220, 100, progress);

    // 目的の頂点まで到達するための必要初速を物理式で算出
    // 距離 s = y_start - apexY, 0 = vy0^2 - 2*a*s  => vy0 = -sqrt(2*a*s)
    const s = Math.max(0, (rect.height - r) - apexY);
    const vy0 = -Math.sqrt(Math.max(0.0001, 2 * ay * s));

    targets.push({ x, y, r, hue, vy:vy0, ay, alpha:1 });
  }
  function stepTargets(dt){
    const rect = canvas.getBoundingClientRect();
    const fadeBand = rect.height * 0.05; // 画面最上部5%に入ってからフェード開始

    const progress = clamp(1 - gameTime / GAME_TIME_TOTAL, 0, 1);
    // 終盤ほど移動が速く見える（1.0 → 1.8倍）
    const timeVelMult = lerp(1.0, 1.8, progress);

    // 既存の slowTargets フラグを尊重しつつ、終盤ブースト + フィーバー4x
    const baseSdt = flags().slowTargets ? dt / 3 : dt;
    const sdt = baseSdt * timeVelMult * (feverActive ? 4.0 : 1.0); // フィーバー中は4倍速（さらに2倍）

    for (let i=targets.length-1; i>=0; i--){
      const t = targets[i];
      // 等加速度運動（★dt → sdt）
      t.vy += t.ay * sdt;
      t.y  += t.vy * sdt;

      // 以下はそのまま（フェードや判定の時間スケールは既存通り）
      if (t.vy >= 0 || t.y < fadeBand) {
        t.alpha -= dt * 0.9;
        if (t.alpha <= 0) { targets.splice(i,1); onMiss(); continue; }
      }
      if (t.y + t.r < -20) { targets.splice(i,1); onMiss(); }
    }
    // 難易度：経過時間に比例してスポーン間隔を短く（終了時は約6倍頻度）
    const BASE_SPAWN = 1.1;              // 基準
    const START_SPAWN = BASE_SPAWN * 4;  // 開始はゆっくり
    // 終盤はさらに多く湧く（以前: /6 → いま: /8）
    const targetEvery = lerp(START_SPAWN, BASE_SPAWN / 8, progress) / (feverActive ? 4.0 : 1.0); // フィーバー中は4倍頻度（さらに2倍）

    // 同時数の下限/上限（以前: 4〜8 → 12〜22）を強化
    const TARGETS_START_MIN = 5;
    const TARGETS_END_MIN   = 18;
    const TARGETS_START_MAX = 10;
    const TARGETS_END_MAX   = 28;

    const currentMinTargets = Math.round(lerp(TARGETS_START_MIN, TARGETS_END_MIN, progress));
    const currentMaxTargets = Math.round(lerp(TARGETS_START_MAX, TARGETS_END_MAX, progress));

    // 出現管理（下限を維持しつつ上限は超えない）
    spawnT -= dt;
    if (targets.length < currentMinTargets) {
      // 下限未満なら即時スポーン（1フレーム1体まで）
      if (spawnT <= 0) {
        spawnTarget();
        spawnT = Math.min(0.2, targetEvery); // 連続湧きを防ぐ小休止
      } else {
        // すぐ湧かせるためにクールダウン短縮
        spawnT = Math.min(spawnT, 0.1);
      }
    } else if (spawnT <= 0) {
      if (targets.length < currentMaxTargets) {
        spawnTarget();
        spawnT = targetEvery;
      } else {
        // 上限のときは短いチェック間隔
        spawnT = 0.05;
      }
    }
  }
  function drawTargets(){
    for(const t of targets){
      ctx.save();
      ctx.globalAlpha = clamp(t.alpha, 0, 1);
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI*2);
      ctx.fillStyle = `hsla(${t.hue} 80% 60% / 0.25)`;
      ctx.fill();
      ctx.lineWidth = 2; // 固定線幅（サイズに影響しない）
      ctx.strokeStyle = `hsla(${t.hue} 90% 70% / 0.9)`;
      ctx.stroke();
      ctx.restore();
    }
  }
function onHit(ix){
  const nowSec = performance.now() / 1000;
  if (nowSec - lastHitAt > COMBO_WINDOW) combo = 0;

  const t0 = targets[ix];
  if (!t0) return;

  const useDelay = flags().chainDelay;

  if (!useDelay) {
    // 旧: 即時に連鎖起点として処理（元のターゲットも含め全て即時）
    chainExplode(ix);
    maxCombo = Math.max(maxCombo, combo);
    lastHitAt = nowSec;
    updateHUD();
    return;
  }

  // 新: 自身は即時、巻き込みは遅延
  const nextCombo = Math.min(MAX_COMBO, combo + 1);
  score += Math.round(SCORE_PER_HIT * scoreMultByCombo(nextCombo));
  combo = nextCombo;
  lastHitAt = nowSec;
  addFirework(t0.x, t0.y, t0.hue);
  const x0 = t0.x, y0 = t0.y, r0 = t0.r;
  targets.splice(ix, 1);
  maxCombo = Math.max(maxCombo, combo);
  updateHUD();

  setTimeout(() => {
    let startIdx = -1, bestD = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const o = targets[i];
      const dx = o.x - x0, dy = o.y - y0;
      const dist = Math.hypot(dx, dy);
      const progress = clamp(1 - gameTime / GAME_TIME_TOTAL, 0, 1);
      const timeChainScale = lerp(1.0, 1.2, progress);
      const chainScale = chainScaleByCombo();
      if (dist <= (CHAIN_RADIUS_MULT * chainScale * timeChainScale) * r0 && dist < bestD) {
        bestD = dist; startIdx = i;
      }
    }
    if (startIdx !== -1) {
      chainExplode(startIdx);
      maxCombo = Math.max(maxCombo, combo);
      updateHUD();
    }
  }, CHAIN_DELAY_MS);
}
  // 半径8倍以内のターゲットを連鎖爆発（チェイン）
  function chainExplode(startIndex){
    if (startIndex < 0 || startIndex >= targets.length) return;
    const queue = [];
    // キューにはターゲットの"オブジェクト参照"を入れる（index変動対策）
    queue.push(targets[startIndex]);

    while (queue.length) {
      const current = queue.shift();
      const idx = targets.indexOf(current);
      if (idx === -1) continue; // 既に消えている

      // スコア & コンボ更新（倍率は次コンボ値に基づく）
      const nextCombo = Math.min(MAX_COMBO, combo + 1);
      score += Math.round(SCORE_PER_HIT * scoreMultByCombo(nextCombo));
      combo = nextCombo;
      lastHitAt = performance.now() / 1000; // 連鎖中も受付時間を更新

      // 爆発演出
      addFirework(current.x, current.y, current.hue);

      // 近傍の連鎖対象を収集（距離 <= CHAIN_RADIUS_MULT * current.r）
      for (const other of targets) {
        if (other === current) continue;
        const dx = other.x - current.x;
        const dy = other.y - current.y;
        const dist = Math.hypot(dx, dy);
        const progress = clamp(1 - gameTime / GAME_TIME_TOTAL, 0, 1);
        const timeChainScale = lerp(1.0, 1.2, progress); // 終盤で+20%に抑制
        const chainScale = chainScaleByCombo();
        if (dist <= (CHAIN_RADIUS_MULT * chainScale * timeChainScale) * current.r) {
          queue.push(other);
        }
      }

      // 現在のターゲットを消去
      targets.splice(idx, 1);
    }
  }
  function onMiss(){
    // ミス判定は無効化（クリック外しや自然消滅でのペナルティ無し）
  }
  
  // ---------- Input ----------
  function canvasPos(e){
    const rect = canvas.getBoundingClientRect();
    let x,y;
    if(e.touches && e.touches[0]){ x=e.touches[0].clientX-rect.left; y=e.touches[0].clientY-rect.top; }
    else { x=e.clientX-rect.left; y=e.clientY-rect.top; }
    return {x,y};
  }
  function tryHitAt(x,y){
    let idx = -1, bestD = 1e9;
    for (let i=0;i<targets.length;i++){
      const t = targets[i];
      const dx = x - t.x, dy = y - t.y;
      const d = Math.hypot(dx, dy);
      if (d < t.r && d < bestD){ bestD = d; idx = i; }
    }
    if (idx >= 0) onHit(idx); else onMiss();
  }
  canvas.addEventListener('pointerdown', (e)=>{
    const {x,y} = canvasPos(e);
    if (playing) tryHitAt(x,y);
    else addFirework(x,y); // タイトル中も遊べる
  });
  addEventListener('keydown',(e)=>{
    if(e.key===' '){
      const r=canvas.getBoundingClientRect();
      if (playing) tryHitAt(r.width/2, r.height/2);
      else addFirework(r.width/2, r.height/2);
    }
    // Fで Solo/Debug 切替（リリースでは無効）
    if(!IS_RELEASE_BUILD && e.key.toLowerCase()==='f'){
      if(document.body.classList.contains('solo')) enterDebug();
      else enterSolo();
    }
  });

  if (soloUI.btnStart) soloUI.btnStart.addEventListener('click', ()=>{ if (!startLocked) startGame(); });
  if (soloUI.ovStart)  soloUI.ovStart.addEventListener('click', ()=>{
    if (startLocked) return; // 通信中は受付しない
    if (typeof overlayAction === 'function') overlayAction();
  });
  // 初期表示はタイトル画面
  showTitle();

  // ---------- Solo / Debug ----------
  function enterSolo(){ document.body.classList.add('solo');  dispatchEvent(new Event('resize')); }
  function enterDebug(){ document.body.classList.remove('solo'); dispatchEvent(new Event('resize')); }
  if (IS_RELEASE_BUILD) enterSolo();
  else if (/\bdebug=1\b/.test(location.search)) enterDebug(); else enterSolo();

  // ---------- Main Loop ----------
  let lastTime = now(), frames=0, fpsTime=0;
  function loop(){
    const t = now();
    const dt = clamp((t - lastTime)/1000, 0, 0.05);
    lastTime = t;

    // FPS
    frames++; fpsTime += dt;
    if (fpsTime >= 0.5){ if (fpsEl) fpsEl.textContent = String(Math.round(frames/fpsTime)); frames=0; fpsTime=0; }

    // コンボ受付時間の自然失効（ヒットがなくても時間で切れる）
    const nowSecForCombo = performance.now() / 1000;
    if (combo > 0 && (nowSecForCombo - lastHitAt) > COMBO_WINDOW) {
      combo = 0;
      lastHitAt = -Infinity; // ゲージも即座に空表示に
    }

        // ---- Fever trigger & termination (no visuals) ----
    const nowSec = performance.now() / 1000;
    if (!feverTriggered && comboMaxStartAt && (nowSec - comboMaxStartAt >= FEVER_REQUIRE_DURATION)) {
      feverActive = true;
      feverTriggered = true;
      feverStartAt = nowSec;
    }
    if (feverActive) {
      if (combo === 0 || (nowSec - feverStartAt >= FEVER_DURATION) || gameTime <= 0) {
        feverActive = false;
      }
    }

    // 1) メイン画面は不透明クリア（ターゲットに残像が掛からない）
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0,0,canvas.width/dpr,canvas.height/dpr);

    // 2) ゲーム進行
    if (playing){
      gameTime = Math.max(0, gameTime - dt);
      if (gameTime <= 0) { endGame(); }
      stepTargets(dt);
    }

    // HUD（コンボゲージ含む）は毎フレーム更新
    updateHUD();

    // 3) ターゲットをメインに描画
    drawTargets();

    // 4) パーティクル（FXキャンバス上）
    if ((ui.trail?.checked ?? true) && particles.length>0) fxFade(0.14);
    else if (particles.length===0) fxctx.clearRect(0,0,fx.width/dpr,fx.height/dpr);
    stepParticles(dt);
    drawParticlesOnFx();

    // 5) FXキャンバスをメインに合成
    ctx.drawImage(fx, 0, 0, fx.width/dpr, fx.height/dpr);

    // Debug: 自動花火
    if ((ui.auto?.checked ?? false) && Math.random() < 0.05){
      const rect = canvas.getBoundingClientRect();
      addFirework(rand(0, rect.width), rand(rect.height*0.2, rect.height*0.8));
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 初回ヒントOFF
  safeTimeout(()=>{ const hint=document.getElementById('hint'); if(hint) hint.style.display='none'; }, 4000);
})();