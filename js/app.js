/* ============================================================
   app.js — 新レイアウトのUI・機能。engine.js の後に読み込む。
   updateGamePanel / updateStats / updateTilePicker / aiStep / aiMaybeGo /
   aiDelay / glog / toast / showReplayTurn / buildTradeSelects を「後勝ち」で
   再定義してエンジンの版を上書きする。ゲームロジックは無改変。
   追加: 1画面レイアウト / PC・スマホ切替 / 日本語・英語 i18n。
   ============================================================ */
(function(){ "use strict"; })();

const RES_COL = { wood:"var(--wood)", brick:"var(--brick)", sheep:"var(--sheep)", wheat:"var(--wheat)", ore:"var(--ore)" };
const $ = (id)=>document.getElementById(id);

/* ============================================================
   i18n
   ============================================================ */
let LANG = "ja";
const I18N = {
  ja:{
    brand_title:"カタン 挑戦者AI 対局", brand_sub:"あなた 対 AI3人",
    speed_label:"AI速度", eval_word:"AI評価値",
    replay_btn:"棋譜確認", export_btn:"棋譜書き出し", new_btn:"新規対局",
    pause_title:"一時停止", play_title:"再生",
    mode_pc:"PC表示", mode_mobile:"スマホ表示",
    setup_title:"対局の設定",
    setup_lead:"あなたの席と、相手AI3人のタイプを選んで対局を始めます。<br><b>挑戦者AI</b>=高速先読みで初期配置を選ぶ最強型／<b>現行AI</b>=学習モデルの標準型。",
    your_seat:"あなたの席", you_operate:"あなた（この席を操作）",
    challenger_full:"挑戦者AI（高速先読み・最強）", standard_full:"現行AI（学習モデル・標準）",
    shuffle_btn:"盤面シャッフル", start_btn:"対局開始",
    start_lang:"言語", start_mode:"画面", lang_ja:"日本語", lang_en:"English",
    ai_challenger:"挑戦者AI", ai_standard:"現行AI", ai_you:"あなた",
    tab_status:"状況", tab_eval:"AI評価値", tab_log:"ログ", tab_bank:"銀行", tab_opp:"相手",
    log_title:"ログ", bank_title:"銀行", bank_left:"残りカード", bank_deck:"発展カード山札",
    devplayed_title:"使用済み", tally_knight:"騎士", tally_road:"街道", tally_plenty:"収穫", tally_mono:"独占",
    opp_title:"相手プレイヤー", opp_sub:"手札は枚数のみ公開",
    hand_title:"あなたの手札",
    act_roll:"🎲 サイコロを振る", act_buydev:"発展カードを買う", act_knight:"騎士", act_roads:"街道建設",
    act_plenty:"収穫", act_mono:"独占", act_trade:"交易", act_endturn:"ターン終了",
    res_wood:"木", res_brick:"レンガ", res_sheep:"羊", res_wheat:"麦", res_ore:"鉄",
    lbl_hand:"手札", lbl_dev:"発展", lbl_knights:"騎士", lbl_road:"最長路", lbl_vp:"VP",
    dev_knight:"騎士", dev_roads:"街道建設", dev_plenty:"収穫", dev_mono:"独占", dev_vp:"勝利点",
    kind_settlement:"開拓地", kind_road:"道",
    dev_deck_chip:a=>`発展カード山札 ${a.n}枚`, vpcards:a=>`勝利点カード×${a.n}`,
    st_setup:a=>`初期配置 ${a.step}/${a.total}：${a.seat} が${a.kind}を置く`,
    st_roll:a=>`${a.seat} の番：サイコロを振る`,
    st_discard:a=>`出目7！ ${a.seat} が ${a.n}枚 捨てる`,
    st_robber:a=>`${a.seat}：盗賊を動かすタイルをクリック（★=おすすめ）`,
    st_steal:a=>`${a.seat}：奪う相手を選ぶ`,
    st_main:a=>`${a.seat} の番（出目 ${a.dice}）：建設・交易・カード → ターン終了`,
    st_over:"🏆 対局終了",
    win_tag:a=>`P${a.p} ${a.name} の勝利`,
    badge_turn:a=>`手番: P${a.p} ${a.name}`,
    badge_lr:a=>`最長交易路 P${a.p}（${a.len}）`,
    badge_la:a=>`最大騎士力 P${a.p}（${a.n}）`,
    pr_plenty:a=>`<b>収穫</b>：もらう資源を選ぶ（あと ${a.n}）`,
    pr_mono:`<b>独占</b>：全員から奪う資源を選ぶ`,
    pr_steal:`<b>奪う相手</b>：`, pr_steal_btn:a=>`P${a.p}（${a.n}枚）`,
    pr_discard:a=>`⚠️ 手札が多すぎます。<b>あと ${a.n}枚</b> 上の手札カードをクリックして捨ててください。`,
    pr_robber:`🦹 盤面のタイルをクリックして盗賊を移動（★=おすすめ）。`,
    pr_setup_settle:`📍 あなたの番：<b>開拓地</b>を置く頂点をクリック（評価値ONで候補を盤面に表示）。`,
    pr_setup_road:`🛤 続けて、置いた開拓地に接する<b>道</b>をクリック（金色の候補）。`,
    pr_main:`🏗 あなたの番：頂点=開拓地/都市、辺=道。交易・発展カードも可能。終わったら「ターン終了」。`,
    eval_title:"AI評価値",
    eval_off_hint:`AI評価値はOFFです（上のボタンでONにできます）。`,
    eval_wait_hint:`あなたの手番で、打てる手を点数付きで表示します。`,
    eval_plan:a=>`🎯 目標プラン: <b>${a.label}</b>${a.ore?'（鉄不足→木・土寄せ）':''}　<span class="hint">基準=「ターン終了」を ±0 とした相対点</span>`,
    eval_noplan:`候補手を評価値順に表示（+ が良い手／基準=「ターン終了」= ±0）`,
    eval_place_note:`📍 初期配置の候補地（盤面の <b>①②③</b> と対応）。数値は最弱候補を基準にした相対点。`,
    eval_shortage:a=>`（資源不足${a.cost?': '+a.cost:''}）`,
    eval_cand:a=>`候補${a.mark} pip ${a.pip}／資源${a.div}種${a.port?'／港あり':''}`,
    eval_nocand:`候補がありません。`, eval_novtx:`置ける頂点がありません。`,
    ev_city:"都市化", ev_trade_city:"交換して今すぐ都市化", ev_settle:"開拓地を建てる",
    ev_trade_settle:"交換して今すぐ開拓地", ev_road:"道を伸ばす", ev_dev:"発展カードを買う",
    ev_trade_surplus:"余り資源を交換して終了", ev_endturn:"ターン終了（資源を温存）",
    rv_title:"リプレイ", rv_prev:"◀ 前", rv_auto:"▶ 自動", rv_stop:"⏸ 停止", rv_next:"次 ▶", rv_close:"閉じる",
    rv_count:a=>`${a.i} / ${a.n} コマ`, rv_h_seat:"席", rv_h_total:"計", rv_h_cards:"カード", rv_h_vp:"VP",
    rv_no_hands:"（この棋譜には手札の記録がありません）", rv_no_events:"（イベントなし）",
    toast_start:a=>`対局開始！ あなたは P${a.p} です`,
    toast_shuffle:"盤面をシャッフルしました（公式ルール準拠）",
    toast_pause:"AIを一時停止しました", toast_play:"再生します",
    toast_win:a=>`🏆 P${a.p} の勝利！「棋譜確認」で振り返り、「棋譜書き出し」で保存できます。`,
    toast_no_record:"棋譜がまだありません", toast_exported:"棋譜を game_record.json に書き出しました",
    toast_robber:"盗賊を動かすタイルをクリック"
  },
  en:{
    brand_title:"Catan Challenger AI", brand_sub:"You vs 3 AIs",
    speed_label:"AI speed", eval_word:"AI eval",
    replay_btn:"Replay", export_btn:"Export record", new_btn:"New game",
    pause_title:"Pause", play_title:"Play",
    mode_pc:"PC view", mode_mobile:"Mobile view",
    setup_title:"Game setup",
    setup_lead:"Pick your seat and the type of each of the 3 opponent AIs, then start.<br><b>Challenger AI</b> = fast-lookahead placement (strongest). <b>Standard AI</b> = learning-model default.",
    your_seat:"Your seat", you_operate:"You (you play this seat)",
    challenger_full:"Challenger AI (fast lookahead, strongest)", standard_full:"Standard AI (learning model)",
    shuffle_btn:"Shuffle board", start_btn:"Start game",
    start_lang:"Language", start_mode:"Display", lang_ja:"日本語", lang_en:"English",
    ai_challenger:"Challenger AI", ai_standard:"Standard AI", ai_you:"You",
    tab_status:"Status", tab_eval:"AI eval", tab_log:"Log", tab_bank:"Bank", tab_opp:"Opponents",
    log_title:"Log", bank_title:"Bank", bank_left:"Cards left", bank_deck:"Dev deck",
    devplayed_title:"Played", tally_knight:"Knights", tally_road:"Roads", tally_plenty:"Plenty", tally_mono:"Mono",
    opp_title:"Opponents", opp_sub:"Hand size only",
    hand_title:"Your hand",
    act_roll:"🎲 Roll dice", act_buydev:"Buy dev card", act_knight:"Knight", act_roads:"Road building",
    act_plenty:"Year of plenty", act_mono:"Monopoly", act_trade:"Trade", act_endturn:"End turn",
    res_wood:"Wood", res_brick:"Brick", res_sheep:"Sheep", res_wheat:"Wheat", res_ore:"Ore",
    lbl_hand:"Hand", lbl_dev:"Dev", lbl_knights:"Knights", lbl_road:"Longest", lbl_vp:"VP",
    dev_knight:"Knight", dev_roads:"Road building", dev_plenty:"Year of plenty", dev_mono:"Monopoly", dev_vp:"VP card",
    kind_settlement:"settlement", kind_road:"road",
    dev_deck_chip:a=>`Dev deck: ${a.n}`, vpcards:a=>`VP cards ×${a.n}`,
    st_setup:a=>`Setup ${a.step}/${a.total}: ${a.seat} places a ${a.kind}`,
    st_roll:a=>`${a.seat}'s turn: roll the dice`,
    st_discard:a=>`Rolled 7! ${a.seat} discards ${a.n}`,
    st_robber:a=>`${a.seat}: click a tile to move the robber (★=suggested)`,
    st_steal:a=>`${a.seat}: choose whom to rob`,
    st_main:a=>`${a.seat}'s turn (roll ${a.dice}): build / trade / cards → end turn`,
    st_over:"🏆 Game over",
    win_tag:a=>`P${a.p} ${a.name} wins`,
    badge_turn:a=>`Turn: P${a.p} ${a.name}`,
    badge_lr:a=>`Longest road P${a.p} (${a.len})`,
    badge_la:a=>`Largest army P${a.p} (${a.n})`,
    pr_plenty:a=>`<b>Year of plenty</b>: choose a resource (${a.n} left)`,
    pr_mono:`<b>Monopoly</b>: choose the resource to take from everyone`,
    pr_steal:`<b>Rob whom</b>: `, pr_steal_btn:a=>`P${a.p} (${a.n})`,
    pr_discard:a=>`⚠️ Too many cards. <b>Discard ${a.n}</b> by clicking your hand cards above.`,
    pr_robber:`🦹 Click a board tile to move the robber (★=suggested).`,
    pr_setup_settle:`📍 Your turn: click a vertex to place a <b>settlement</b> (turn AI eval on to see suggestions).`,
    pr_setup_road:`🛤 Now click a <b>road</b> next to it (gold candidates).`,
    pr_main:`🏗 Your turn: vertex = settlement/city, edge = road. Trade & dev cards too. Then "End turn".`,
    eval_title:"AI eval",
    eval_off_hint:`AI eval is OFF (turn it on with the button above).`,
    eval_wait_hint:`On your turn, shows your possible moves with scores.`,
    eval_plan:a=>`🎯 Target plan: <b>${a.label}</b>${a.ore?' (low ore → wood/brick)':''}　<span class="hint">relative to "End turn" = ±0</span>`,
    eval_noplan:`Moves ranked by score (+ = better / baseline "End turn" = ±0)`,
    eval_place_note:`📍 Setup spots (match <b>①②③</b> on the board). Values are relative to the weakest spot.`,
    eval_shortage:a=>`(need${a.cost?': '+a.cost:''})`,
    eval_cand:a=>`Spot ${a.mark} · pip ${a.pip} · ${a.div} res${a.port?' · port':''}`,
    eval_nocand:`No candidates.`, eval_novtx:`No available vertices.`,
    ev_city:"Upgrade to city", ev_trade_city:"Trade surplus → upgrade to city", ev_settle:"Build settlement",
    ev_trade_settle:"Trade surplus → build settlement", ev_road:"Extend road", ev_dev:"Buy dev card",
    ev_trade_surplus:"Trade surplus & end", ev_endturn:"End turn (keep resources)",
    rv_title:"Replay", rv_prev:"◀ Prev", rv_auto:"▶ Auto", rv_stop:"⏸ Stop", rv_next:"Next ▶", rv_close:"Close",
    rv_count:a=>`${a.i} / ${a.n}`, rv_h_seat:"Seat", rv_h_total:"Total", rv_h_cards:"Cards", rv_h_vp:"VP",
    rv_no_hands:"(no hand data in this record)", rv_no_events:"(no events)",
    toast_start:a=>`Game started! You are P${a.p}`,
    toast_shuffle:"Board shuffled (official rules)",
    toast_pause:"AI paused", toast_play:"Playing",
    toast_win:a=>`🏆 P${a.p} wins! Use "Replay" to review and "Export record" to save.`,
    toast_no_record:"No record yet", toast_exported:"Exported to game_record.json",
    toast_robber:"Click a tile to move the robber"
  }
};
function t(k, a){
  const d = I18N[LANG] || I18N.ja;
  let v = d[k]; if(v==null) v = I18N.ja[k]; if(v==null) return k;
  return (typeof v==="function") ? v(a||{}) : v;
}
function resName(r){ return t("res_"+r); }
function seatAiName(p){ const x=seatAI[p]; return x==="challenger"?t("ai_challenger"):x==="puremodel"?t("ai_standard"):t("ai_you"); }

// 日本語ログ/トースト文字列を英語に（エンジンが生成する文言用のベストエフォート変換）
function _devEn(c){ return String(c).replace(/騎士/g,"Knight").replace(/勝利点/g,"VP").replace(/街道建設/g,"Road building").replace(/収穫/g,"Year of plenty").replace(/独占/g,"Monopoly"); }
function _resEn(s){ return String(s).replace(/小麦/g,"wheat").replace(/鉱石/g,"ore").replace(/レンガ/g,"brick").replace(/羊/g,"sheep").replace(/木/g,"wood").replace(/麦/g,"wheat").replace(/鉄/g,"ore"); }
function jaToEn(s){
  if(s==null) return s;
  let x=String(s);
  const pairs=[
    ["（盗賊！）"," (robber!)"],
    ["盗賊を動かすタイルをクリック","Click a tile to move the robber"],
    ["盗賊を移動","moved the robber"],
    ["発展カードを購入","bought a dev card"],
    ["発展カードは売り切れ","No dev cards left"],
    ["資源が足りません","Not enough resources"],
    ["資源なし","no resources"],
    ["資源: ","Gains: "], ["資源:","Gains:"],
    ["(銀行切れ)"," (bank empty)"],
    ["🏛 都市化","🏛 upgraded to city"], ["都市化！","Upgraded to city!"], ["都市化","upgraded to city"],
    ["🏠 開拓地を建設","🏠 built a settlement"], ["開拓地を建設！","Built a settlement!"], ["開拓地を建設","built a settlement"],
    ["🛤 道を建設（無料）","🛤 built a road (free)"], ["🛤 道を建設","🛤 built a road"],
    ["道を建設！","Built a road!"], ["道を建設","built a road"],
    ["が開拓地を置いた"," placed a settlement"], ["が道を置いた"," placed a road"],
    ["が開拓地"," · settlement"], ["が道"," · road"],
    ["初期配置","Setup"], ["ターン ","Turn "], ["／","/"],
    ["対局開始！","Game started! "], ["あなたは P","You are P"], ["です",""],
    ["盤面をシャッフルしました（公式ルール準拠）","Board shuffled (official rules)"],
    ["AIを一時停止しました","AI paused"], ["再生します","Playing"], ["再生","Play"],
    ["出目","Roll "], ["（このターンの動きなし）","(no action this turn)"], ["（イベントなし）","(no events)"],
  ];
  for(const [a,b] of pairs) x=x.split(a).join(b);
  x=x.replace(/P(\d+) から1枚奪った/g,"stole 1 from P$1");
  x=x.split(" が ").join(" ");
  x=x.replace(/発展カード「(.+?)」を使用/g,(m,c)=>`played dev card ${_devEn(c)}`);
  x=x.replace(/独占で (.+?) を(\d+)枚回収/g,(m,r,n)=>`monopoly: took ${n} ${_resEn(r)}`);
  x=x.replace(/独占: (.+?)を(\d+)枚集めた/g,(m,r,n)=>`Monopoly: collected ${n} ${_resEn(r)}`);
  x=x.replace(/P(\d+) が (\d+)点で勝利/g,"P$1 won with $2 points");
  x=x.replace(/(\d+)枚/g,"$1");
  x=_resEn(x); x=_devEn(x);
  return x;
}

/* ============================================================
   UI 状態
   ============================================================ */
let humanSeat = 1;
let seatAI = {1:"human",2:"challenger",3:"challenger",4:"challenger"};
let oppChoice = {1:"challenger",2:"challenger",3:"challenger",4:"challenger"};
let paused = false;
let evalOn = false;
let aiSpeedSec = 1.0;
let aiTimer = null;
let _rerendering = false;
let rvPlayTimer = null;
let uiMode = "pc";
let mobileTab = "status";
let _overHandled = false;

/* ============================================================
   エンジン関数の上書き（後勝ち）
   ============================================================ */
function updateStats(){}
function updateTilePicker(){}
function aiDelay(base){ return Math.max(0, Math.round(aiSpeedSec*1000)); }

// トースト（i18n）: 英語モードでは日本語をベストエフォート変換
function toast(msg){
  const el=$("toast"); if(!el) return;
  el.textContent = (LANG==="en") ? jaToEn(msg) : msg;
  el.classList.add("show");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),1900);
}
// ログ（i18n）: game.log には生の日本語を保持し、表示だけ言語に合わせる
function glog(msg){
  if(!game) return;
  const p=cur();
  game.log.push({t:game.log.length, p, dice:game.dice, msg});
  appendLogLine(p, msg);
}
function appendLogLine(p, msg){
  const box=$("gameLog"); if(!box) return;
  const color=PCOLORS[(p||1)-1]||"#ccc";
  const div=document.createElement("div");
  div.innerHTML=`<span style="color:${color};font-weight:700">P${p}</span> ${LANG==="en"?jaToEn(msg):msg}`;
  box.appendChild(div); box.scrollTop=box.scrollHeight;
}
function rerenderLog(){
  const box=$("gameLog"); if(!box||!game||!game.log) return;
  box.innerHTML="";
  for(const l of game.log) appendLogLine(l.p, l.msg);
}
// 交易セレクト（i18n）
function buildTradeSelects(){
  for(const id of ["tradeGive","tradeGet"]){
    const s=$(id); if(!s) continue; const keep=s.value;
    s.innerHTML="";
    for(const r of RES5){ const o=document.createElement("option"); o.value=r; o.textContent=resName(r); s.appendChild(o); }
    if(keep) s.value=keep;
  }
}

function scheduleAI(base){ if(paused) return; clearTimeout(aiTimer); aiTimer=setTimeout(aiStep, aiDelay(base)); }

// 席別AI・一時停止対応の進行ループ
function aiStep(){
  if(!game || !game.ai){ aiBusy=false; return; }
  if(paused){ aiBusy=false; return; }
  if(game.phase==="over"){ aiBusy=false; refresh(); return; }

  if(game.phase==="setup"){
    const sp = game.setup.queue[game.setup.step];
    if(!isAI(sp)){ aiBusy=false; refresh(); return; }
    if(game.setup.phase==="settle"){
      let v=null;
      if(seatAI[sp]==="challenger" && typeof distillPickHTML==="function") v=distillPickHTML(sp);
      if(v==null || occupantOf(v)) v=computeBest().ranked[0];
      gameClickVertex(v);
    } else {
      const oc=occupantOf(game.setup.lastSettle);
      const wantPort = oc && placements[oc.p] && placements[oc.p].settlements.size===2;
      const rr=bestRoadFrom(game.setup.lastSettle, wantPort, oc && oc.p);
      if(rr.length) gameClickEdge(rr[0].eid);
      else { const vv=game.setup.lastSettle; const e=GEO.edges.find(e=>(e.a===vv||e.b===vv)&&!ownerOf("roads",e.id)); if(e) gameClickEdge(e.id); }
    }
    refresh(); scheduleAI(550); return;
  }
  if(game.phase==="discard"){
    const d=game.discardQueue[0];
    if(d && isAI(d.p)){ _botDiscard(); refresh(); scheduleAI(400); return; }
    aiBusy=false; refresh(); return;
  }
  const p=cur();
  if(!isAI(p)){ aiBusy=false; refresh(); return; }
  if(game.phase==="roll"){ if(_shouldPlayKnight(p)) playDev("knight"); if(game.phase==="roll") doRoll(null); refresh(); scheduleAI(650); return; }
  if(game.phase==="robber"){ const ra=robberAdvice(); gameClickHex(ra?ra.hid:GEO.hexes.find(h=>h.id!==game.robber).id); refresh(); scheduleAI(550); return; }
  if(game.phase==="steal"){ stealFrom(game.stealCands[0]); refresh(); scheduleAI(450); return; }
  if(game.phase==="main"){ _botMain(p); _cleanupTurn(p); if(game.phase==="main") endTurnGame(); refresh(); scheduleAI(650); return; }
  aiBusy=false;
}
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

function updateGamePanel(){
  if(!game) return;
  const p=cur();
  const activeSeat = (game.phase==="setup" && game.setup) ? game.setup.queue[game.setup.step] : p;
  updateStatus(activeSeat);
  updatePrompt(activeSeat);
  renderHand();
  renderMyDev();
  renderMeStat();
  updateActions();
  renderBank();
  renderOpponents(activeSeat);
  updateEval();
  if(game.phase==="over") onGameOver();
}

function updateStatus(activeSeat){
  let phase="";
  const seat = seatTag(activeSeat), pc = seatTag(cur());
  if(game.phase==="setup"){
    phase = t("st_setup",{step:game.setup.step+1, total:game.setup.queue.length, seat, kind:(game.setup.phase==="settle"?t("kind_settlement"):t("kind_road"))});
  } else if(game.phase==="roll"){ phase=t("st_roll",{seat:pc}); }
  else if(game.phase==="discard"){ const d=game.discardQueue[0]; phase=t("st_discard",{seat:seatTag(d.p), n:d.need}); }
  else if(game.phase==="robber"){ phase=t("st_robber",{seat:pc}); }
  else if(game.phase==="steal"){ phase=t("st_steal",{seat:pc}); }
  else if(game.phase==="main"){ phase=t("st_main",{seat:pc, dice:game.dice}); }
  else if(game.phase==="over"){ const w=winnerSeat(); phase=`${t("st_over")} <span class="wintag">${t("win_tag",{p:w,name:seatAiName(w)})}</span>`; }
  let badges = `<span class="badge">${t("badge_turn",{p:activeSeat, name:seatAiName(activeSeat)})}</span>`;
  if(game.lr.holder) badges += `<span class="badge">${t("badge_lr",{p:game.lr.holder, len:game.lr.len})}</span>`;
  if(game.la.holder) badges += `<span class="badge">${t("badge_la",{p:game.la.holder, n:game.la.count})}</span>`;
  $("statusBar").innerHTML = `<div class="stline">${phase}</div><div class="badges">${badges}</div>`;
}

function resButtons(){ return " " + RES5.map(r=>`<button class="btn sm" data-res="${r}" style="border-color:${RES_COL[r]}">${resName(r)}</button>`).join(" "); }
function updatePrompt(activeSeat){
  const pr=$("prompt"); let html="", hot=false;
  if(game.ask && cur()===humanSeat){
    hot=true;
    html = (game.ask.type==="plenty") ? t("pr_plenty",{n:game.ask.picks})+resButtons() : t("pr_mono")+resButtons();
  } else if(game.phase==="steal" && cur()===humanSeat){
    hot=true;
    html = t("pr_steal") + game.stealCands.map(c=>`<button class="btn sm" data-steal="${c}">${t("pr_steal_btn",{p:c,n:handTotal(c)})}</button>`).join(" ");
  } else if(game.phase==="discard" && game.discardQueue[0] && game.discardQueue[0].p===humanSeat){
    hot=true; html=t("pr_discard",{n:game.discardQueue[0].need});
  } else if(game.phase==="robber" && cur()===humanSeat){ html=t("pr_robber"); }
  else if(game.phase==="setup" && activeSeat===humanSeat){ html = game.setup.phase==="settle"?t("pr_setup_settle"):t("pr_setup_road"); }
  else if(game.phase==="main" && cur()===humanSeat){ html=t("pr_main"); }
  if(html){ pr.style.display=""; pr.className="prompt"+(hot?" hot":""); pr.innerHTML=html; }
  else { pr.style.display="none"; pr.innerHTML=""; return; }
  pr.querySelectorAll("[data-steal]").forEach(b=>{ b.onclick=()=>{ stealFrom(Number(b.dataset.steal)); refresh(); aiMaybeGo(); }; });
  if(game.ask && cur()===humanSeat){
    const fn = game.ask.type==="plenty" ? resolvePlenty : resolveMono;
    pr.querySelectorAll("[data-res]").forEach(b=>{ b.onclick=()=>{ fn(b.dataset.res); refresh(); aiMaybeGo(); }; });
  }
}

function renderHand(){
  const me=humanSeat, box=$("myCards"); box.innerHTML="";
  const discarding = game.phase==="discard" && game.discardQueue[0] && game.discardQueue[0].p===me;
  for(const r of RES5){
    const c=document.createElement("div");
    c.className="rescard"+(discarding?" click":"");
    c.innerHTML=`<div class="top" style="background:${RES_COL[r]}">${resName(r)}</div><div class="cnt">${game.hands[me][r]}</div>`;
    if(discarding) c.onclick=()=>humanDiscard(r);
    box.appendChild(c);
  }
}
function humanDiscard(r){
  const d=game.discardQueue[0];
  if(!d || d.p!==humanSeat || game.hands[humanSeat][r]<=0) return;
  game.hands[humanSeat][r]--; d.need--;
  if(d.need<=0){ game.discardQueue.shift(); if(!game.discardQueue.length){ game.phase="robber"; toast(t("toast_robber")); } }
  refresh(); aiMaybeGo();
}
function renderMyDev(){
  const me=humanSeat, box=$("myDev"); box.innerHTML="";
  const h=game.dev.hands[me]; const chips=[];
  const devKey={knight:"dev_knight",roads:"dev_roads",plenty:"dev_plenty",mono:"dev_mono",vp:"dev_vp"};
  for(const c of ["knight","roads","plenty","mono","vp"]) if(h[c]>0) chips.push(`<span class="devchip">${t(devKey[c])} <b>×${h[c]}</b></span>`);
  chips.push(`<span class="devchip">${t("dev_deck_chip",{n:game.dev.deck.length})}</span>`);
  box.innerHTML=chips.join("");
}
function renderMeStat(){
  const me=humanSeat, over=game.phase==="over";
  const devN=Object.values(game.dev.hands[me]).reduce((a,b)=>a+b,0);
  const vpCard=game.dev.hands[me].vp>0 ? ` <span class="badge">${t("vpcards",{n:game.dev.hands[me].vp})}</span>` : "";
  $("meStat").innerHTML =
    `<span class="dot" style="background:${PCOLORS[me-1]}"></span>P${me}`
    + `<b class="vpn">${vpOf(me)}</b><small>${t("lbl_vp")}</small>`
    + `<span class="sep">${t("lbl_dev")} <b>${devN}</b></span>`
    + `<span class="sep">${t("lbl_knights")} <b>${game.army[me]}</b></span>`
    + `<span class="sep">${t("lbl_road")} <b>${longestRoadOf(me)}</b></span>${vpCard}`;
}
function updateActions(){
  const me=humanSeat, isMe=(cur()===me), main=isMe&&game.phase==="main";
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
  for(const r of RES5) g.innerHTML += `<div class="bankcell"><div class="lb">${resName(r)}</div><div class="nv" style="color:${RES_COL[r]}">${bankOf(r)}</div></div>`;
  $("bankMeta").innerHTML = `<div class="m">${t("bank_deck")} <b>${game.dev.deck.length}</b></div>`;
  let kn=0,rd=0,pl=0,mo=0;
  for(let q=1;q<=numPlayers;q++){ kn+=game.army[q]; const pd=game.dev.played[q]||{}; rd+=pd.roads||0; pl+=pd.plenty||0; mo+=pd.mono||0; }
  const parts=[[t("tally_knight"),kn],[t("tally_road"),rd],[t("tally_plenty"),pl],[t("tally_mono"),mo]].map(([n,v])=>`<div class="d">${n} <b>${v}</b></div>`).join("");
  $("devPlayed").innerHTML = `<span class="dp-title">${t("devplayed_title")}</span>${parts}`;
}

function renderOpponents(activeSeat){
  const box=$("oppPanel"); box.innerHTML="";
  const over=game.phase==="over";
  for(let q=1;q<=numPlayers;q++){
    if(q===humanSeat) continue;
    const devN=Object.values(game.dev.hands[q]).reduce((a,b)=>a+b,0);
    const turn=(q===activeSeat)&&!over;
    const vpCard = over && game.dev.hands[q].vp>0 ? ` <span class="badge sm">${t("vpcards",{n:game.dev.hands[q].vp})}</span>` : "";
    box.innerHTML += `<div class="opp${turn?" turn":""}">
      <span class="dot" style="background:${PCOLORS[q-1]}"></span>
      <span class="nm">P${q}</span><span class="ai">${seatAiName(q)}</span>
      <span class="vp">${vpOf(q)}<small>${t("lbl_vp")}</small></span>
      <span class="ministat">${t("lbl_hand")}<b>${handTotal(q)}</b>·${t("lbl_dev")}<b>${devN}</b>·${t("lbl_knights")}<b>${game.army[q]}</b>·${t("lbl_road")}<b>${longestRoadOf(q)}</b>${vpCard}</span>
    </div>`;
  }
}

/* ============================================================
   AI評価値
   ============================================================ */
function evLabel(label){
  if(LANG!=="en") return label;
  const s=String(label);
  if(s.startsWith("余り資源を交換して今すぐ都市化")) return t("ev_trade_city");
  if(s.startsWith("余り資源を交換して今すぐ開拓地")) return t("ev_trade_settle");
  if(s.startsWith("余りの")) return t("ev_trade_surplus");
  if(s.startsWith("都市化")) return t("ev_city");
  if(s.startsWith("開拓地")) return t("ev_settle");
  if(s.startsWith("道を伸ばす")) return t("ev_road");
  if(s.startsWith("発展カードを買う")) return t("ev_dev");
  if(s.startsWith("ターン終了")) return t("ev_endturn");
  return jaToEn(s);
}
function updateEval(){
  const humanMain = game.phase==="main" && cur()===humanSeat;
  const humanPlace = game.phase==="setup" && game.setup && game.setup.phase==="settle" && game.setup.queue[game.setup.step]===humanSeat;

  const wantBest = evalOn && humanPlace;
  if(wantBest!==showBest){ showBest=wantBest; if(!_rerendering){ _rerendering=true; render(); _rerendering=false; } }

  const plan=$("evalPlan"), list=$("evalList");
  if(!evalOn){ plan.innerHTML=""; list.innerHTML=`<div class="hint">${t("eval_off_hint")}</div>`; return; }
  if(!humanMain && !humanPlace){ plan.innerHTML=""; list.innerHTML=`<div class="hint">${t("eval_wait_hint")}</div>`; return; }

  if(humanMain){
    let adv; try{ adv=computeAdvice(); }catch(e){ adv=[]; }
    const pl=adv._plan;
    plan.innerHTML = pl ? t("eval_plan",{label:pl.label, ore:pl.oreShort}) : t("eval_noplan");
    const base=0.5;
    const rows=adv.map(a=>({label:a.label,can:a.can,cost:a.cost,pts:Math.round((a.score-base)*10)/10})).sort((x,y)=>y.pts-x.pts).slice(0,8);
    const maxAbs=Math.max(1,...rows.map(r=>Math.abs(r.pts)));
    list.innerHTML = rows.map(r=>{
      const cls=r.pts>0?"pos":(r.pts<0?"neg":"zero");
      const sign=(r.pts>0?"+":"")+r.pts.toFixed(1);
      const na=r.can?"":` <small>${t("eval_shortage",{cost:r.cost})}</small>`;
      const w=Math.max(0,Math.round(r.pts/maxAbs*100));
      return `<div class="evrow${r.can?"":" na"}"><div class="pts ${cls}">${sign}</div>
        <div><div class="lab">${evLabel(r.label)}${na}</div>${r.pts>0?`<div class="evbar"><i style="width:${w}%"></i></div>`:""}</div></div>`;
    }).join("") || `<div class="hint">${t("eval_nocand")}</div>`;
  } else {
    let B; try{ B=computeBest(); }catch(e){ B={ranked:[],scores:{},mn:0,mx:0}; }
    plan.innerHTML = t("eval_place_note");
    const top=B.ranked.slice(0,6);
    list.innerHTML = top.map((vid,i)=>{
      const sc=B.scores[vid]; const pts=Math.round((sc.score-B.mn)*10)/10;
      const w=Math.max(4,Math.round((sc.score-B.mn)/Math.max(0.001,B.mx-B.mn)*100));
      const mark=i<3?["①","②","③"][i]:"・";
      return `<div class="evrow"><div class="pts pos">+${pts.toFixed(1)}</div>
        <div><div class="lab">${t("eval_cand",{mark, pip:sc.pip, div:sc.div, port:sc.port})}</div>
        <div class="evbar"><i style="width:${w}%"></i></div></div></div>`;
    }).join("") || `<div class="hint">${t("eval_novtx")}</div>`;
  }
}

/* ============================================================
   対局終了
   ============================================================ */
function winnerSeat(){ let w=1,bv=-1; for(let q=1;q<=numPlayers;q++){ const v=vpOf(q); if(v>bv){bv=v;w=q;} } return w; }
function onGameOver(){
  $("replayBtn").disabled=false; $("exportBtn").disabled=false;
  if(!_overHandled){
    _overHandled=true; clearTimeout(aiTimer);
    const w=winnerSeat(); winner=w;
    glog(`🏆 P${w} が ${vpOf(w)}点で勝利！`);
    toast(t("toast_win",{p:w}));
  }
}

/* ============================================================
   リプレイ（showReplayTurn を i18n 版で上書き）
   ============================================================ */
function showReplayTurn(){
  if(!replay) return;
  const turn=replay.turns[replay.idx];
  $("rvTitle").textContent = (LANG==="en") ? jaToEn(turn.title) : turn.title;
  $("rvCount").textContent = t("rv_count",{i:replay.idx+1, n:replay.turns.length});
  const hb=$("rvHands");
  if(hb){
    if(turn.hands && Object.keys(turn.hands).length){
      let s='<table class="rvtable"><tr><th>'+t("rv_h_seat")+'</th>'
        + RES5.map(r=>`<th>${resName(r)}</th>`).join("")
        + `<th>${t("rv_h_total")}</th><th>${t("rv_h_cards")}</th><th>${t("rv_h_vp")}</th></tr>`;
      for(const p of Object.keys(turn.hands)){
        const hh=turn.hands[p]; const res=hh.res||{};
        const tot=RES5.reduce((a,r)=>a+(res[r]||0),0);
        const isT=String(turn.player)===String(p);
        s+=`<tr class="${isT?'rvt':''}"><td><span style="color:${PCOLORS[p-1]};font-weight:700">P${p}</span></td>`
          + RES5.map(r=>`<td>${res[r]||0}</td>`).join("")
          + `<td><b>${tot}</b></td><td>${hh.dev||0}</td><td>${hh.vp!=null?hh.vp:"-"}</td></tr>`;
      }
      hb.innerHTML=s+"</table>";
    } else hb.innerHTML=`<div class="hint">${t("rv_no_hands")}</div>`;
  }
  const evs=(turn.events&&turn.events.length)?turn.events:[t("rv_no_events")];
  $("rvEvents").innerHTML = evs.map(x=>`<div>${LANG==="en"?jaToEn(x):x}</div>`).join("");
  render();
}
function startReplay(){
  if(!game || !game.turns || !game.turns.length){ toast(t("toast_no_record")); return; }
  paused=true; updatePauseBtn(); clearTimeout(aiTimer);
  replay={turns:game.turns, idx:0, active:true};
  $("replayBar").style.display="block";
  showReplayTurn();
}
function stopRvPlay(){ if(rvPlayTimer){ clearInterval(rvPlayTimer); rvPlayTimer=null; } updateRvButtons(); }
function toggleRvPlay(){
  if(!replay) return;
  if(rvPlayTimer){ stopRvPlay(); return; }
  rvPlayTimer=setInterval(()=>{
    if(!replay){ stopRvPlay(); return; }
    if(replay.idx>=replay.turns.length-1){ stopRvPlay(); return; }
    replay.idx++; showReplayTurn();
  },900);
  updateRvButtons();
}
function exitReplayU(){ stopRvPlay(); exitReplay(); if(game) render(); }
function updateRvButtons(){
  $("rvPrev").textContent=t("rv_prev"); $("rvNext").textContent=t("rv_next"); $("rvExit").textContent=t("rv_close");
  $("rvPlay").textContent = rvPlayTimer ? t("rv_stop") : t("rv_auto");
  $("rvPlay").classList.toggle("on", !!rvPlayTimer);
  if(!(replay && replay.active)) $("rvTitle").textContent=t("rv_title");
}

function exportRecord(){
  if(!game){ toast(t("toast_no_record")); return; }
  const rec=toJSON();
  const blob=new Blob([JSON.stringify(rec,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="game_record.json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast(t("toast_exported"));
}

/* ============================================================
   コントロール
   ============================================================ */
function updatePauseBtn(){ $("pauseBtn").textContent = paused?"▶":"⏸"; $("pauseBtn").title = paused?t("play_title"):t("pause_title"); }
function togglePause(){ paused=!paused; updatePauseBtn(); if(paused){ clearTimeout(aiTimer); aiBusy=false; toast(t("toast_pause")); } else { toast(t("toast_play")); aiMaybeGo(); } }
function updateEvalBtn(){ $("evalBtn").textContent = t("eval_word")+": "+(evalOn?"ON":"OFF"); $("evalBtn").classList.toggle("on", evalOn); }
function toggleEval(){ evalOn=!evalOn; updateEvalBtn(); if(game) refresh(); }
function setSpeed(v){ aiSpeedSec=v; $("speedLabel").textContent = v===0 ? (LANG==="en"?"Fastest":"最速") : v.toFixed(1)+(LANG==="en"?"s":"秒"); }
function newMatch(){
  clearTimeout(aiTimer); aiBusy=false; stopRvPlay();
  if(replay) replay.active=false; $("replayBar").style.display="none";
  if(game) endGameMode();
  $("startScreen").classList.remove("hidden");
  $("exportBtn").disabled=true; $("replayBtn").disabled=true; _overHandled=false;
  render();
}

/* ---- モード（PC / スマホ） ---- */
function updateModeBtn(){ $("modeBtn").textContent = (uiMode==="pc")?t("mode_pc"):t("mode_mobile"); }
function applyMode(){
  document.body.setAttribute("data-mode", uiMode);
  updateModeBtn();
  if(uiMode==="mobile") setMobileTab(mobileTab||"status");
  if(game) refresh(); else render();
}
function toggleMode(){ uiMode = (uiMode==="pc")?"mobile":"pc"; applyMode(); }
function setMobileTab(name){
  mobileTab=name;
  document.querySelectorAll(".tabpanel").forEach(tp=>tp.classList.toggle("active", tp.dataset.tab===name));
  document.querySelectorAll("#tabBar .tabbtn").forEach(b=>b.classList.toggle("on", b.dataset.tab===name));
}

/* ---- 言語 ---- */
function updateLangBtn(){ $("langBtn").textContent = (LANG==="ja")?"English":"日本語"; }
function setLang(l){ if(l!==LANG){ LANG=l; applyLang(); } }
function toggleLang(){ setLang(LANG==="ja"?"en":"ja"); }
function applyLang(){
  document.body.setAttribute("data-lang", LANG);
  document.documentElement.lang = LANG;
  document.title = t("brand_title");
  document.querySelectorAll("[data-i18n]").forEach(el=>{ el.textContent=t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach(el=>{ el.innerHTML=t(el.dataset.i18nHtml); });
  updatePauseBtn(); updateEvalBtn(); updateLangBtn(); updateModeBtn(); setSpeed(aiSpeedSec); updateRvButtons();
  buildTradeSelects(); buildStartScreen();
  if(game){ rerenderLog(); refresh(); if(replay && replay.active) showReplayTurn(); }
}

/* ============================================================
   開始画面
   ============================================================ */
function segBtn(label, on, fn){
  const b=document.createElement("button"); b.className="segb"+(on?" on":""); b.textContent=label; b.onclick=fn; return b;
}
function buildStartScreen(){
  // 言語 / 画面 切替
  const top=$("startTop"); top.innerHTML="";
  const langRow=document.createElement("div"); langRow.className="startseg";
  langRow.innerHTML=`<span class="sl">${t("start_lang")}</span>`;
  langRow.appendChild(segBtn(t("lang_ja"), LANG==="ja", ()=>setLang("ja")));
  langRow.appendChild(segBtn(t("lang_en"), LANG==="en", ()=>setLang("en")));
  const modeRow=document.createElement("div"); modeRow.className="startseg";
  modeRow.innerHTML=`<span class="sl">${t("start_mode")}</span>`;
  modeRow.appendChild(segBtn("PC", uiMode==="pc", ()=>{ uiMode="pc"; applyMode(); buildStartScreen(); }));
  modeRow.appendChild(segBtn(LANG==="en"?"Mobile":"スマホ", uiMode==="mobile", ()=>{ uiMode="mobile"; applyMode(); buildStartScreen(); }));
  top.appendChild(langRow); top.appendChild(modeRow);

  // あなたの席
  const sp=$("seatPick"); sp.innerHTML="";
  for(let s=1;s<=4;s++){
    const b=document.createElement("button");
    b.textContent="P"+s; b.className=(s===humanSeat)?"on":"";
    b.style.color=(s===humanSeat)?PCOLORS[s-1]:""; b.style.borderColor=(s===humanSeat)?PCOLORS[s-1]:"";
    b.onclick=()=>{ humanSeat=s; buildStartScreen(); };
    sp.appendChild(b);
  }
  // 席ごとのAI
  const grid=$("seatGrid"); grid.innerHTML="";
  for(let s=1;s<=4;s++){
    const row=document.createElement("div"); row.className="seatrow"+(s===humanSeat?" me":"");
    if(s===humanSeat){
      row.innerHTML=`<div class="who"><span class="dot" style="background:${PCOLORS[s-1]}"></span>P${s}</div><div class="youtag">${t("you_operate")}</div>`;
    }else{
      row.innerHTML=`<div class="who"><span class="dot" style="background:${PCOLORS[s-1]}"></span>P${s}</div>
        <div><select data-seat="${s}">
          <option value="challenger"${oppChoice[s]==="challenger"?" selected":""}>${t("challenger_full")}</option>
          <option value="puremodel"${oppChoice[s]==="puremodel"?" selected":""}>${t("standard_full")}</option>
        </select></div>`;
    }
    grid.appendChild(row);
  }
  grid.querySelectorAll("select[data-seat]").forEach(sel=>{ sel.onchange=()=>{ oppChoice[Number(sel.dataset.seat)]=sel.value; }; });
}

function startMatch(){
  seatAI={}; for(let s=1;s<=4;s++) seatAI[s]=(s===humanSeat)?"human":oppChoice[s];
  $("gamePlayers").value="4"; showBest=false; _overHandled=false;
  startGame(null);
  game.ai=new Set([1,2,3,4].filter(p=>p!==humanSeat));
  paused=false; updatePauseBtn();
  $("startScreen").classList.add("hidden");
  $("exportBtn").disabled=false; $("replayBtn").disabled=true;
  if(replay) replay.active=false; $("replayBar").style.display="none";
  if(uiMode==="mobile") setMobileTab("status");
  toast(t("toast_start",{p:humanSeat}));
  refresh(); aiMaybeGo();
}

/* ============================================================
   配線
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

  $("pauseBtn").onclick=togglePause; $("evalBtn").onclick=toggleEval;
  $("newBtn").onclick=newMatch; $("replayBtn").onclick=startReplay; $("exportBtn").onclick=exportRecord;
  $("modeBtn").onclick=toggleMode; $("langBtn").onclick=toggleLang;
  $("speedRange").oninput=(e)=>setSpeed(parseFloat(e.target.value));
  $("shuffleBtn").onclick=()=>{ randomBoard(); randomPorts(); render(); toast(t("toast_shuffle")); };
  $("startBtn").onclick=startMatch;

  $("rvPrev").onclick=()=>{ if(replay){ stopRvPlay(); replay.idx=Math.max(0,replay.idx-1); showReplayTurn(); } };
  $("rvNext").onclick=()=>{ if(replay){ stopRvPlay(); replay.idx=Math.min(replay.turns.length-1,replay.idx+1); showReplayTurn(); } };
  $("rvPlay").onclick=toggleRvPlay; $("rvExit").onclick=exitReplayU;

  document.querySelectorAll("#tabBar .tabbtn").forEach(b=>{ b.onclick=()=>setMobileTab(b.dataset.tab); });
}

/* ============================================================
   初期化
   ============================================================ */
window.addEventListener("DOMContentLoaded", ()=>{
  uiMode = (window.innerWidth < 760) ? "mobile" : "pc";
  buildTradeSelects();
  wireControls();
  applyMode();
  setSpeed(1.0);
  applyLang();       // 全テキスト適用 + 開始画面構築
  updatePauseBtn();
  render();          // 開始画面の裏に盤面プレビュー
});
