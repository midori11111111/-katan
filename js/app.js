/* ============================================================
   app.js — 新レイアウトのUI・機能。engine.js の後に読み込む。
   ここで updateGamePanel / updateStats / updateTilePicker / aiStep /
   aiMaybeGo / aiDelay を「後勝ち」で再定義してエンジンの版を上書きする。
   ゲームロジック(render/建設/ルール/リプレイ)はエンジンのものをそのまま使う。
   ============================================================ */
(function(){ "use strict"; })();

// ---- 表示ラベル ----
const RJP_SHORT = { wood:"木", brick:"レンガ", sheep:"羊", wheat:"麦", ore:"鉄" };
const RES_COL   = { wood:"var(--wood)", brick:"var(--brick)", sheep:"var(--sheep)", wheat:"var(--wheat)", ore:"var(--ore)" };
const AI_LABEL  = { challenger:"挑戦者AI", puremodel:"現行AI", human:"あなた" };

// ---- 新規のUI状態（engine のグローバルとは名前が衝突しないもの） ----
let humanSeat = 1;
let seatAI = {1:"human",2:"challenger",3:"challenger",4:"challenger"};
let oppChoice = {1:"challenger",2:"challenger",3:"challenger",4:"challenger"};
let paused = false;
let evalOn = false;
let aiSpeedSec = 1.0;
let aiTimer = null;
let _rerendering = false;
let rvPlayTimer = null;

const $ = (id)=>document.getElementById(id);

/* ============================================================
   エンジン関数の上書き（後勝ち）
   ============================================================ */

// 盤面パネル(#stats)・タイルピッカーはエディタ専用なので無効化（render から呼ばれる）
function updateStats(){ /* 新レイアウトでは右パネルで独自に描画するため何もしない */ }
function updateTilePicker(){ /* エディタ機能は使わない */ }

// AIの待ち時間: スライダーの秒数をそのまま返す（0=最速）。一時停止中は次手を積まない側で制御。
function aiDelay(base){ return Math.max(0, Math.round(aiSpeedSec*1000)); }

function scheduleAI(base){
  if(paused) return;
  clearTimeout(aiTimer);
  aiTimer = setTimeout(aiStep, aiDelay(base));
}

// 席ごとのAIに対応した1手進行ループ（engine の aiStep を席別AI・一時停止対応で書き直したもの）
function aiStep(){
  if(!game || !game.ai){ aiBusy=false; return; }
  if(paused){ aiBusy=false; return; }
  if(game.phase==="over"){ aiBusy=false; refresh(); return; }

  // --- 初期配置 ---
  if(game.phase==="setup"){
    const sp = game.setup.queue[game.setup.step];
    if(!isAI(sp)){ aiBusy=false; refresh(); return; }              // 人間の番 → 停止
    if(game.setup.phase==="settle"){
      let v = null;
      if(seatAI[sp]==="challenger" && typeof distillPickHTML==="function"){
        v = distillPickHTML(sp);                                   // 挑戦者AI: 蒸留評価器で選ぶ
      }
      if(v==null || occupantOf(v)){                                // 現行AI or フォールバック
        const B = computeBest();
        v = B.ranked[0];
      }
      gameClickVertex(v);
    } else {
      const oc = occupantOf(game.setup.lastSettle);
      const wantPort = oc && placements[oc.p] && placements[oc.p].settlements.size===2;
      const rr = bestRoadFrom(game.setup.lastSettle, wantPort, oc && oc.p);
      if(rr.length) gameClickEdge(rr[0].eid);
      else { const vv=game.setup.lastSettle; const e=GEO.edges.find(e=>(e.a===vv||e.b===vv)&&!ownerOf("roads",e.id)); if(e) gameClickEdge(e.id); }
    }
    refresh(); scheduleAI(550); return;
  }

  // --- バースト(7)の捨て札: AIは自動、人間なら停止 ---
  if(game.phase==="discard"){
    const d = game.discardQueue[0];
    if(d && isAI(d.p)){ _botDiscard(); refresh(); scheduleAI(400); return; }
    aiBusy=false; refresh(); return;
  }

  const p = cur();
  if(!isAI(p)){ aiBusy=false; refresh(); return; }                 // 人間の手番 → 停止

  if(game.phase==="roll"){
    if(_shouldPlayKnight(p)) playDev("knight");
    if(game.phase==="roll") doRoll(null);
    refresh(); scheduleAI(650); return;
  }
  if(game.phase==="robber"){
    const ra = robberAdvice();
    const hid = ra ? ra.hid : GEO.hexes.find(h=>h.id!==game.robber).id;
    gameClickHex(hid);
    refresh(); scheduleAI(550); return;
  }
  if(game.phase==="steal"){
    stealFrom(game.stealCands[0]);
    refresh(); scheduleAI(450); return;
  }
  if(game.phase==="main"){
    _botMain(p); _cleanupTurn(p);
    if(game.phase==="main") endTurnGame();
    refresh(); scheduleAI(650); return;
  }
  aiBusy=false;
}

// 人間の操作後・盤面クリック後に呼ばれる: 次がAIなら自動進行を起動
function aiMaybeGo(){
  if(!game || !game.ai || aiBusy || paused) return;
  const needAI =
    (game.phase==="setup" && isAI(game.setup.queue[game.setup.step])) ||
    (game.phase==="discard" && game.discardQueue[0] && isAI(game.discardQueue[0].p)) ||
    (["roll","robber","steal","main"].includes(game.phase) && isAI(cur()));
  if(needAI){ aiBusy=true; scheduleAI(500); }
}

/* ============================================================
   画面更新
   ============================================================ */
function refresh(){ if(game){ render(); updateGamePanel(); } }

function seatTag(p){ return `<b style="color:${PCOLORS[p-1]}">P${p}</b>`; }
function seatAiName(p){ return AI_LABEL[seatAI[p]] || (p===humanSeat?"あなた":"AI"); }

// メインの上書き: 右パネル・手札・操作・評価値をまとめて再描画
function updateGamePanel(){
  if(!game) return;
  const p = cur();
  const activeSeat = (game.phase==="setup" && game.setup) ? game.setup.queue[game.setup.step] : p;

  updateStatus(activeSeat);
  updatePrompt(activeSeat);
  renderHand();
  renderMyDev();
  updateActions();
  renderBank();
  renderOpponents(activeSeat);
  renderMe();
  updateEval();

  if(game.phase==="over") onGameOver();
}

function updateStatus(activeSeat){
  let phase = "";
  if(game.phase==="setup"){
    const su=game.setup;
    phase = `初期配置 ${su.step+1}/${su.queue.length}：${seatTag(activeSeat)} が${su.phase==="settle"?"開拓地":"道"}を置く`;
  } else if(game.phase==="roll"){
    phase = `${seatTag(p_())} の番：サイコロを振る`;
  } else if(game.phase==="discard"){
    const d=game.discardQueue[0]; phase = `出目7！ ${seatTag(d.p)} が ${d.need}枚 捨てる`;
  } else if(game.phase==="robber"){
    phase = `${seatTag(p_())}：盗賊を動かすタイルをクリック（★=おすすめ）`;
  } else if(game.phase==="steal"){
    phase = `${seatTag(p_())}：奪う相手を選ぶ`;
  } else if(game.phase==="main"){
    phase = `${seatTag(p_())} の番（出目 ${game.dice}）：建設・交易・カード → ターン終了`;
  } else if(game.phase==="over"){
    const w = winnerSeat();
    phase = `🏆 対局終了 <span class="wintag">P${w} ${seatAiName(w)} の勝利</span>`;
  }
  let badges = `<span class="badge">手番: P${activeSeat} ${seatAiName(activeSeat)}</span>`;
  if(game.lr.holder) badges += `<span class="badge">最長交易路 P${game.lr.holder}（${game.lr.len}）</span>`;
  if(game.la.holder) badges += `<span class="badge">最大騎士力 P${game.la.holder}（${game.la.count}）</span>`;
  $("statusBar").innerHTML = `<div>${phase}</div><div class="badges">${badges}</div>`;
}
function p_(){ return cur(); }

function resButtons(){
  return " " + RES5.map(r=>`<button class="btn sm" data-res="${r}" style="border-color:${RES_COL[r]}">${RJP_SHORT[r]}</button>`).join(" ");
}
function updatePrompt(activeSeat){
  const pr = $("prompt");
  let html = "", hot=false;
  if(game.ask && cur()===humanSeat){
    hot=true;
    html = game.ask.type==="plenty"
      ? `<b>収穫</b>：もらう資源を選ぶ（あと ${game.ask.picks}）` + resButtons()
      : `<b>独占</b>：全員から奪う資源を選ぶ` + resButtons();
  } else if(game.phase==="steal" && cur()===humanSeat){
    hot=true;
    html = `<b>奪う相手</b>：` + game.stealCands.map(c=>`<button class="btn sm" data-steal="${c}">P${c}（${handTotal(c)}枚）</button>`).join(" ");
  } else if(game.phase==="discard" && game.discardQueue[0] && game.discardQueue[0].p===humanSeat){
    hot=true;
    html = `⚠️ 手札が多すぎます。<b>あと ${game.discardQueue[0].need}枚</b> 上の手札カードをクリックして捨ててください。`;
  } else if(game.phase==="robber" && cur()===humanSeat){
    html = `🦹 盤面のタイルをクリックして盗賊を移動（★=おすすめ）。`;
  } else if(game.phase==="setup" && activeSeat===humanSeat){
    html = game.setup.phase==="settle"
      ? `📍 あなたの番：<b>開拓地</b>を置く頂点をクリック（評価値ONで候補を盤面に表示）。`
      : `🛤 続けて、置いた開拓地に接する<b>道</b>をクリック（金色の候補）。`;
  } else if(game.phase==="main" && cur()===humanSeat){
    html = `🏗 あなたの番：頂点=開拓地/都市、辺=道。交易・発展カードも可能。終わったら「ターン終了」。`;
  }
  if(html){ pr.style.display=""; pr.className = "prompt"+(hot?" hot":""); pr.innerHTML=html; }
  else { pr.style.display="none"; pr.innerHTML=""; return; }

  pr.querySelectorAll("[data-steal]").forEach(b=>{
    b.onclick=()=>{ stealFrom(Number(b.dataset.steal)); refresh(); aiMaybeGo(); };
  });
  if(game.ask && cur()===humanSeat){
    const fn = game.ask.type==="plenty" ? resolvePlenty : resolveMono;
    pr.querySelectorAll("[data-res]").forEach(b=>{
      b.onclick=()=>{ fn(b.dataset.res); refresh(); aiMaybeGo(); };
    });
  }
}

function renderHand(){
  const me = humanSeat;
  const box = $("myCards"); box.innerHTML="";
  const discarding = game.phase==="discard" && game.discardQueue[0] && game.discardQueue[0].p===me;
  for(const r of RES5){
    const c=document.createElement("div");
    c.className="rescard"+(discarding?" click":"");
    c.innerHTML=`<div class="top" style="background:${RES_COL[r]}">${RJP_SHORT[r]}</div><div class="cnt">${game.hands[me][r]}</div>`;
    if(discarding) c.onclick=()=>humanDiscard(r);
    box.appendChild(c);
  }
}
function humanDiscard(r){
  const d=game.discardQueue[0];
  if(!d || d.p!==humanSeat) return;
  if(game.hands[humanSeat][r]<=0) return;
  game.hands[humanSeat][r]--; d.need--;
  if(d.need<=0){
    game.discardQueue.shift();
    if(!game.discardQueue.length){ game.phase="robber"; toast("盗賊を動かすタイルをクリック"); }
  }
  refresh(); aiMaybeGo();
}

function renderMyDev(){
  const me=humanSeat, box=$("myDev"); box.innerHTML="";
  const h=game.dev.hands[me];
  const chips=[];
  for(const c of ["knight","roads","plenty","mono","vp"]){
    if(h[c]>0) chips.push(`<span class="devchip">${DEV_JP[c]} <b>×${h[c]}</b></span>`);
  }
  chips.push(`<span class="devchip">発展カード山札 <b>${game.dev.deck.length}</b>枚</span>`);
  box.innerHTML = chips.join("");
}

function updateActions(){
  const me=humanSeat, isMe = (cur()===me);
  const main = isMe && game.phase==="main";
  $("rollBtnU").disabled  = !(isMe && game.phase==="roll");
  $("buyDevU").disabled   = !(main && game.dev.deck.length>0);
  $("knightU").disabled   = !(isMe && (game.phase==="main"||game.phase==="roll") && safeCanPlay("knight"));
  $("roadsU").disabled    = !(main && safeCanPlay("roads"));
  $("plentyU").disabled   = !(main && safeCanPlay("plenty"));
  $("monoU").disabled     = !(main && safeCanPlay("mono"));
  $("tradeBtnU").disabled = !main;
  $("endTurnU").disabled  = !main;
}
function safeCanPlay(card){ try{ return cur()===humanSeat && canPlay(card); }catch(e){ return false; } }

function renderBank(){
  const g=$("bankGrid"); g.innerHTML="";
  for(const r of RES5){
    g.innerHTML += `<div class="bankcell"><div class="lb">${RJP_SHORT[r]}</div><div class="nv" style="color:${RES_COL[r]}">${bankOf(r)}</div></div>`;
  }
  $("bankMeta").innerHTML = `<div class="m">発展カード山札 <b>${game.dev.deck.length}</b>枚</div>`;

  // 全員が使用済みの発展カード（VPカードは対局終了まで伏せる）
  let kn=0, rd=0, pl=0, mo=0;
  for(let q=1;q<=numPlayers;q++){
    kn += game.army[q];
    const pd=game.dev.played[q]||{};
    rd += pd.roads||0; pl += pd.plenty||0; mo += pd.mono||0;
  }
  const parts=[["騎士",kn],["街道建設",rd],["収穫",pl],["独占",mo]]
    .map(([n,v])=>`<div class="d">${n} <b>${v}</b></div>`).join("");
  $("devPlayed").innerHTML = `<div style="width:100%;color:var(--faint);font-size:11px;margin-bottom:2px">使用された発展カード（全員合計）</div>${parts}`;
}

function renderOpponents(activeSeat){
  const box=$("oppPanel"); box.innerHTML="";
  const over = game.phase==="over";
  for(let q=1;q<=numPlayers;q++){
    if(q===humanSeat) continue;
    const devN = Object.values(game.dev.hands[q]).reduce((a,b)=>a+b,0);
    const turn = (q===activeSeat) && game.phase!=="over";
    const vpTxt = over ? `${vpOf(q)}` : `${vpOf(q)}`;
    const vpCard = over && game.dev.hands[q].vp>0 ? ` <span class="badge">勝利点カード×${game.dev.hands[q].vp}</span>` : "";
    box.innerHTML += `
      <div class="opp${turn?" turn":""}">
        <div class="head">
          <span class="dot" style="background:${PCOLORS[q-1]}"></span>
          <span class="nm">P${q}</span>
          <span class="ai">${seatAiName(q)}</span>
          <span class="vp">${vpTxt}<span style="font-size:11px;color:var(--muted)"> VP</span></span>
        </div>
        <div class="stats">
          <span>手札 <b>${handTotal(q)}</b>枚</span>
          <span>発展 <b>${devN}</b>枚</span>
          <span>騎士 <b>${game.army[q]}</b></span>
          <span>最長路 <b>${longestRoadOf(q)}</b></span>
          ${vpCard}
        </div>
      </div>`;
  }
}

function renderMe(){
  const me=humanSeat, box=$("mePanel");
  const over = game.phase==="over";
  const devN = Object.values(game.dev.hands[me]).reduce((a,b)=>a+b,0);
  const resTxt = RES5.map(r=>`<span style="color:${RES_COL[r]}">${RJP_SHORT[r]}${game.hands[me][r]}</span>`).join("　");
  const vpCard = game.dev.hands[me].vp>0 ? ` <span class="badge">勝利点カード×${game.dev.hands[me].vp}</span>` : "";
  box.innerHTML = `
    <div class="opp me-panel${cur()===me&&!over?" turn":""}">
      <div class="head">
        <span class="dot" style="background:${PCOLORS[me-1]}"></span>
        <span class="nm">P${me}</span><span class="ai">あなた</span>
        <span class="vp">${vpOf(me)}<span style="font-size:11px;color:var(--muted)"> VP</span></span>
      </div>
      <div class="stats" style="margin-bottom:6px">${resTxt}</div>
      <div class="stats">
        <span>手札計 <b>${handTotal(me)}</b></span>
        <span>発展 <b>${devN}</b>枚</span>
        <span>騎士 <b>${game.army[me]}</b></span>
        <span>最長路 <b>${longestRoadOf(me)}</b></span>
        ${vpCard}
      </div>
    </div>`;
}

/* ============================================================
   AI評価値（目玉機能）
   ============================================================ */
function updateEval(){
  const panel=$("evalPanel");
  const humanMain = game.phase==="main" && cur()===humanSeat;
  const humanPlace = game.phase==="setup" && game.setup && game.setup.phase==="settle" && game.setup.queue[game.setup.step]===humanSeat;

  // 初期配置中: 盤面ハイライト(showBest)を評価値ONのときだけ出す
  const wantBest = evalOn && humanPlace;
  if(wantBest!==showBest){
    showBest = wantBest;
    if(!_rerendering){ _rerendering=true; render(); _rerendering=false; }
  }

  if(!evalOn || (!humanMain && !humanPlace)){ panel.classList.remove("show"); return; }
  panel.classList.add("show");

  if(humanMain){
    let adv;
    try{ adv = computeAdvice(); }catch(e){ adv=[]; }
    const plan = adv._plan;
    $("evalPlan").innerHTML = plan
      ? `🎯 目標プラン: <b>${plan.label}</b>${plan.oreShort?'（鉄不足→木・土寄せ）':''}　<span class="hint">基準=「ターン終了」を ±0 とした相対点</span>`
      : `候補手を評価値順に表示（+ が良い手／基準=「ターン終了」= ±0）`;
    const base = 0.5; // computeAdvice の「ターン終了（温存）」= 0.5 を基準に
    const rows = adv.map(a=>({label:a.label, can:a.can, cost:a.cost, pts:Math.round((a.score-base)*10)/10}))
                    .sort((x,y)=>y.pts-x.pts).slice(0,8);
    const maxAbs = Math.max(1, ...rows.map(r=>Math.abs(r.pts)));
    $("evalList").innerHTML = rows.map(r=>{
      const cls = r.pts>0?"pos":(r.pts<0?"neg":"zero");
      const sign = (r.pts>0?"+":"")+r.pts.toFixed(1);
      const na = r.can?"":` <small>（資源不足${r.cost?": "+r.cost:""}）</small>`;
      const w = Math.max(0, Math.round(r.pts/maxAbs*100));
      return `<div class="evrow${r.can?"":" na"}">
        <div class="pts ${cls}">${sign}</div>
        <div><div class="lab">${r.label}${na}</div>${r.pts>0?`<div class="evbar"><i style="width:${w}%"></i></div>`:""}</div>
      </div>`;
    }).join("") || `<div class="hint">候補がありません。</div>`;
  } else {
    // 初期配置: computeBest の頂点スコアを相対「+点」で提示（盤面の①②③と対応）
    let B; try{ B=computeBest(); }catch(e){ B={ranked:[],scores:{},mn:0,mx:0}; }
    $("evalPlan").innerHTML = `📍 初期配置の候補地（盤面の <b>①②③</b> と対応）。数値は最弱候補を基準にした相対点。`;
    const top = B.ranked.slice(0,6);
    $("evalList").innerHTML = top.map((vid,i)=>{
      const sc=B.scores[vid];
      const pts=Math.round((sc.score-B.mn)*10)/10;
      const w=Math.max(4, Math.round((sc.score-B.mn)/Math.max(0.001,B.mx-B.mn)*100));
      return `<div class="evrow">
        <div class="pts pos">+${pts.toFixed(1)}</div>
        <div><div class="lab">候補${i<3?["①","②","③"][i]:"・"} pip ${sc.pip}／資源${sc.div}種${sc.port?"／港あり":""}</div>
        <div class="evbar"><i style="width:${w}%"></i></div></div>
      </div>`;
    }).join("") || `<div class="hint">置ける頂点がありません。</div>`;
  }
}

/* ============================================================
   対局終了
   ============================================================ */
function winnerSeat(){
  let w=1,bv=-1; for(let q=1;q<=numPlayers;q++){ const v=vpOf(q); if(v>bv){bv=v;w=q;} } return w;
}
let _overHandled=false;
function onGameOver(){
  $("replayBtn").disabled=false;
  $("exportBtn").disabled=false;
  if(!_overHandled){
    _overHandled=true;
    clearTimeout(aiTimer);
    const w=winnerSeat();
    winner = w;                       // エクスポート用に勝者を記録
    glog(`🏆 P${w}（${seatAiName(w)}）が ${vpOf(w)}点で勝利！`);
    toast(`🏆 P${w} の勝利！「棋譜確認」で振り返り、「棋譜書き出し」で保存できます。`);
  }
}

/* ============================================================
   開始画面
   ============================================================ */
function buildStartScreen(){
  // あなたの席
  const sp=$("seatPick"); sp.innerHTML="";
  for(let s=1;s<=4;s++){
    const b=document.createElement("button");
    b.textContent="P"+s;
    b.className = (s===humanSeat)?"on":"";
    b.style.color = (s===humanSeat)?PCOLORS[s-1]:"";
    b.style.borderColor = (s===humanSeat)?PCOLORS[s-1]:"";
    b.onclick=()=>{ humanSeat=s; seatAI[s]="human"; buildStartScreen(); };
    sp.appendChild(b);
  }
  // 席ごとの設定
  const grid=$("seatGrid"); grid.innerHTML="";
  for(let s=1;s<=4;s++){
    const row=document.createElement("div");
    row.className="seatrow"+(s===humanSeat?" me":"");
    if(s===humanSeat){
      row.innerHTML=`<div class="who"><span class="dot" style="background:${PCOLORS[s-1]}"></span>P${s}</div>
        <div class="youtag">あなた（このAIサイトを操作）</div>`;
    }else{
      row.innerHTML=`<div class="who"><span class="dot" style="background:${PCOLORS[s-1]}"></span>P${s}</div>
        <div><select data-seat="${s}">
          <option value="challenger"${oppChoice[s]==="challenger"?" selected":""}>挑戦者AI（高速先読み・最強）</option>
          <option value="puremodel"${oppChoice[s]==="puremodel"?" selected":""}>現行AI（学習モデル・標準）</option>
        </select></div>`;
    }
    grid.appendChild(row);
  }
  grid.querySelectorAll("select[data-seat]").forEach(sel=>{
    sel.onchange=()=>{ oppChoice[Number(sel.dataset.seat)]=sel.value; };
  });
}

function startMatch(){
  seatAI={};
  for(let s=1;s<=4;s++) seatAI[s] = (s===humanSeat) ? "human" : oppChoice[s];
  $("gamePlayers").value="4";
  showBest=false; _overHandled=false;
  startGame(null);                                  // エンジンが game を構築（phase=setup）
  game.ai = new Set([1,2,3,4].filter(p=>p!==humanSeat));
  paused=false; updatePauseBtn();
  $("startScreen").classList.add("hidden");
  $("exportBtn").disabled=false;
  $("replayBtn").disabled=true;
  if(replay) replay.active=false;
  $("replayBar").style.display="none";
  toast(`対局開始！ あなたは P${humanSeat} です`);
  refresh();
  aiMaybeGo();
}

/* ============================================================
   リプレイ・エクスポート
   ============================================================ */
function startReplay(){
  if(!game || !game.turns || !game.turns.length){ toast("棋譜がまだありません"); return; }
  paused=true; updatePauseBtn(); clearTimeout(aiTimer);
  replay={turns:game.turns, idx:0, active:true};
  $("replayBar").style.display="block";
  showReplayTurn();
}
function stopRvPlay(){ if(rvPlayTimer){ clearInterval(rvPlayTimer); rvPlayTimer=null; $("rvPlay").classList.remove("on"); $("rvPlay").textContent="▶ 自動"; } }
function toggleRvPlay(){
  if(!replay){ return; }
  if(rvPlayTimer){ stopRvPlay(); return; }
  $("rvPlay").classList.add("on"); $("rvPlay").textContent="⏸ 停止";
  rvPlayTimer=setInterval(()=>{
    if(!replay){ stopRvPlay(); return; }
    if(replay.idx>=replay.turns.length-1){ stopRvPlay(); return; }
    replay.idx++; showReplayTurn();
  }, 900);
}
function exitReplayU(){ stopRvPlay(); exitReplay(); if(game) render(); }

function exportRecord(){
  if(!game){ toast("対局データがありません"); return; }
  const rec=toJSON();
  const blob=new Blob([JSON.stringify(rec,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="game_record.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast("棋譜を game_record.json に書き出しました");
}

/* ============================================================
   その他コントロール
   ============================================================ */
function updatePauseBtn(){ $("pauseBtn").textContent = paused ? "▶" : "⏸"; $("pauseBtn").title = paused?"再生":"一時停止"; }
function togglePause(){
  paused=!paused; updatePauseBtn();
  if(paused){ clearTimeout(aiTimer); aiBusy=false; toast("AIを一時停止しました"); }
  else { toast("再生"); aiMaybeGo(); }
}
function toggleEval(){
  evalOn=!evalOn;
  $("evalBtn").textContent = "AI評価値: "+(evalOn?"ON":"OFF");
  $("evalBtn").classList.toggle("on", evalOn);
  if(game) refresh();
}
function setSpeed(v){
  aiSpeedSec=v;
  $("speedLabel").textContent = v===0 ? "最速" : v.toFixed(1)+"秒";
}
function newMatch(){
  clearTimeout(aiTimer); aiBusy=false; stopRvPlay();
  if(replay) replay.active=false;
  $("replayBar").style.display="none";
  if(game) endGameMode();
  $("startScreen").classList.remove("hidden");
  $("exportBtn").disabled=true; $("replayBtn").disabled=true;
  _overHandled=false;
  render();
}

/* ============================================================
   人間の操作ボタン配線
   ============================================================ */
function afterHuman(){ aiMaybeGo(); }
function guardTurn(){ return game && cur()===humanSeat; }

function wireControls(){
  $("rollBtnU").onclick  = ()=>{ if(guardTurn()){ doRoll(null); afterHuman(); } };
  $("buyDevU").onclick   = ()=>{ if(guardTurn()){ buyDev(); afterHuman(); } };
  $("knightU").onclick   = ()=>{ if(cur()===humanSeat){ playDev("knight"); afterHuman(); } };
  $("roadsU").onclick    = ()=>{ if(cur()===humanSeat){ playDev("roads"); afterHuman(); } };
  $("plentyU").onclick   = ()=>{ if(cur()===humanSeat){ playDev("plenty"); afterHuman(); } };
  $("monoU").onclick     = ()=>{ if(cur()===humanSeat){ playDev("mono"); afterHuman(); } };
  $("tradeBtnU").onclick = ()=>{ if(guardTurn()){ doTrade(); afterHuman(); } };
  $("endTurnU").onclick  = ()=>{ if(guardTurn()){ endTurnGame(); afterHuman(); } };

  $("pauseBtn").onclick = togglePause;
  $("evalBtn").onclick  = toggleEval;
  $("newBtn").onclick   = newMatch;
  $("replayBtn").onclick= startReplay;
  $("exportBtn").onclick= exportRecord;

  $("speedRange").oninput = (e)=>setSpeed(parseFloat(e.target.value));

  $("shuffleBtn").onclick = ()=>{ randomBoard(); randomPorts(); render(); toast("盤面をシャッフルしました（公式ルール準拠）"); };
  $("startBtn").onclick   = startMatch;

  $("rvPrev").onclick = ()=>{ if(replay){ stopRvPlay(); replay.idx=Math.max(0,replay.idx-1); showReplayTurn(); } };
  $("rvNext").onclick = ()=>{ if(replay){ stopRvPlay(); replay.idx=Math.min(replay.turns.length-1,replay.idx+1); showReplayTurn(); } };
  $("rvPlay").onclick = toggleRvPlay;
  $("rvExit").onclick = exitReplayU;
}

/* ============================================================
   初期化
   ============================================================ */
window.addEventListener("DOMContentLoaded", ()=>{
  buildTradeSelects && buildTradeSelects();   // 交易セレクトを初期化
  buildStartScreen();
  wireControls();
  setSpeed(1.0);
  updatePauseBtn();
  render();   // 開始画面の裏に盤面プレビューを描画
});
