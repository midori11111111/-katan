/* Online lobby: 2-3 remote humans vs strongest AI in the remaining seats.
   Turn-based snapshots are synchronized through /api/rooms. */
const MP = {
  code: "", token: "", seat: 0, host: false, version: 0, room: null,
  active: false, applying: false, publishing: false, outbox: [], actionDepth: 0,
  deferredRoom: null, pollTimer: null, publishTimer: null, retryTimer: null, statusTimer: null, errorCount: 0,
  forceApply: false, syncTrouble: false, debugEnabled: false, debugSeat: 0
};

function mpEsc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function mpToast(message) {
  if (typeof toast === "function") toast(message);
  const status = document.getElementById("mpStatus");
  if (status) status.textContent = message;
}
async function mpApi(method, body, query) {
  const suffix = query ? "?" + new URLSearchParams(query) : "";
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/rooms" + suffix, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body || {}) : undefined,
      cache: "no-store",
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status; error.data = data;
      throw error;
    }
    return data;
  } catch (error) {
    if (error && error.name === "AbortError") {
      const timeoutError = new Error("request_timeout"); timeoutError.timeout = true; throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
function mpSaveSession() {
  sessionStorage.setItem("catan_mp_session", JSON.stringify({
    code: MP.code, token: MP.token, seat: MP.seat, host: MP.host
  }));
}
function mpClearSession() {
  sessionStorage.removeItem("catan_mp_session");
  Object.assign(MP, { code: "", token: "", seat: 0, host: false, version: 0, room: null, active: false,
    publishing: false, outbox: [], actionDepth: 0, deferredRoom: null, debugEnabled: false, debugSeat: 0 });
  MP.forceApply = false; MP.syncTrouble = false;
  clearTimeout(MP.pollTimer);
  clearTimeout(MP.publishTimer); clearTimeout(MP.retryTimer); clearTimeout(MP.statusTimer);
}

function mpSetSyncStatus(message, clearAfter) {
  const status = document.getElementById("mpStatus"), badge = document.getElementById("mpSyncBadge");
  clearTimeout(MP.statusTimer);
  if (status) status.textContent = message || "";
  if (badge) {
    badge.textContent = message || ""; badge.hidden = !message;
    badge.classList.toggle("ok", /完了|同期しました/.test(message || ""));
  }
  if (clearAfter) MP.statusTimer = setTimeout(() => {
    if (status && status.textContent === message) status.textContent = "";
    if (badge && badge.textContent === message) { badge.textContent = ""; badge.hidden = true; }
  }, clearAfter);
}
function mpStorageReady() {
  return Boolean(MP.room && (MP.room.persistent || location.hostname === "127.0.0.1" || location.hostname === "localhost"));
}
function mpHumanCount(room) {
  return Number((room || MP.room) && (room || MP.room).humanCount) === 2 ? 2 : 3;
}
function mpAiSeats(room) {
  const source = room || MP.room;
  const seats = source && Array.isArray(source.aiSeats) ? source.aiSeats.map(Number) : [Number(source && source.aiSeat || 4)];
  return seats.filter(seat => seat >= 1 && seat <= 4);
}
function mpSeatConfig() {
  const ai = new Set(mpAiSeats()), config = {};
  for (let seat = 1; seat <= 4; seat++) config[seat] = ai.has(seat) ? "strong" : "human";
  return config;
}
function mpApplySeatConfig() {
  seatKind = mpSeatConfig();
  seatAI = { ...seatKind };
  if (game) game.ai = new Set(mpAiSeats());
}
function mpUpdateBrand() {
  if (!MP.active) return;
  const sub = document.querySelector(".brand .sub[data-i18n='brand_sub']");
  if (!sub) return;
  const humans = mpHumanCount(), ais = 4 - humans;
  sub.textContent = typeof LANG !== "undefined" && LANG === "en"
    ? `Online: ${humans} humans + ${ais} AI`
    : `オンライン：人間${humans}人＋AI${ais}体`;
}
function mpOpen() {
  document.getElementById("mpOverlay").classList.add("show");
  const fromUrl = new URLSearchParams(location.search).get("room");
  if (fromUrl) document.getElementById("mpCode").value = fromUrl.toUpperCase();
  mpRenderRoom();
}
function mpClose() {
  if (!MP.active) document.getElementById("mpOverlay").classList.remove("show");
}
function mpSessionFrom(data) {
  MP.code = data.code; MP.token = data.token; MP.seat = Number(data.seat);
  MP.host = Boolean(data.host); MP.room = data.room; MP.version = data.room.version;
  mpSaveSession(); mpRenderRoom(); mpRenderDebug(); mpSchedulePoll(100);
}
async function mpCreate() {
  const name = document.getElementById("mpName").value.trim();
  try {
    document.getElementById("mpCreate").disabled = true;
    mpSessionFrom(await mpApi("POST", { op: "create", name,
      humanCount: Number(document.getElementById("mpHumanCount")?.value || 3),
      debug: Boolean(document.getElementById("mpDebugCreate")?.checked) }));
    history.replaceState(null, "", "?room=" + MP.code);
  } catch (error) { mpToast("部屋を作れませんでした"); }
  finally { document.getElementById("mpCreate").disabled = false; }
}
async function mpJoin() {
  const name = document.getElementById("mpName").value.trim();
  const code = document.getElementById("mpCode").value.trim().toUpperCase();
  try {
    document.getElementById("mpJoin").disabled = true;
    mpSessionFrom(await mpApi("POST", { op: "join", code, name }));
    history.replaceState(null, "", "?room=" + MP.code);
  } catch (error) {
    const msg = { room_not_found: "部屋が見つかりません", room_full: "この部屋は満席です", game_already_started: "対局は開始済みです" };
    mpToast(msg[error.message] || "部屋に参加できませんでした");
  } finally { document.getElementById("mpJoin").disabled = false; }
}
async function mpCopyInvite() {
  const url = location.origin + location.pathname + "?room=" + MP.code;
  try { await navigator.clipboard.writeText(url); mpToast("招待URLをコピーしました"); }
  catch (_) { document.getElementById("mpInviteUrl").value = url; document.getElementById("mpInviteUrl").select(); }
}
function mpRenderRoom() {
  const join = document.getElementById("mpJoinPane"), roomPane = document.getElementById("mpRoomPane");
  if (!MP.room) { join.hidden = false; roomPane.hidden = true; return; }
  join.hidden = true; roomPane.hidden = false;
  document.getElementById("mpRoomCode").textContent = MP.code;
  document.getElementById("mpInviteUrl").value = location.origin + location.pathname + "?room=" + MP.code;
  const members = MP.room.members || {};
  const lottery = MP.room.status === "lobby";
  const aiSeats = new Set(mpAiSeats()), needed = mpHumanCount();
  document.getElementById("mpSeats").innerHTML = [1, 2, 3, 4].map(seat => {
    const member = members[seat], mine = seat === MP.seat, isAISeat = aiSeats.has(seat);
    const name = isAISeat ? "最強AI" : (member ? member.name : "参加待ち");
    return `<div class="mpseat ${member || isAISeat ? "ready" : ""} ${mine ? "mine" : ""}">
      <b>P${seat}</b><span>${mpEsc(name)}</span><small>${isAISeat ? "AI" : (mine ? (lottery?"あなた・開始時に抽選":"あなた") : member ? (lottery?"開始時に抽選":"接続済み") : "空席")}</small>
    </div>`;
  }).join("");
  const count = Object.keys(members).length;
  const start = document.getElementById("mpStart");
  start.hidden = !MP.host || MP.room.status !== "lobby";
  start.disabled = count !== needed || !mpStorageReady();
  start.textContent = count === needed ? `${needed}人＋最強AI${4-needed}体で対局開始` : `参加待ち（${count}/${needed}人）`;
  document.getElementById("mpWait").textContent =
    !mpStorageReady() ? "オンライン同期ストレージの接続待ちです。現在は対局を開始できません" :
    MP.room.status === "playing" ? "対局へ接続しています…" :
    MP.room.status === "finished" ? "対局は終了しました" :
    MP.host ? (count === needed ? `${needed}人揃いました。開始時にP1〜P${needed}をシャッフルします` : `あと${needed-count}人に招待URLを送ってください`) : "ホストが開始するまで待っています";
  mpRenderDebug();
}
function mpActiveSeat() {
  if (!game) return null;
  if (game.phase === "setup" && game.setup) return Number(game.setup.queue[game.setup.step]);
  if (game.phase === "discard" && game.discardQueue && game.discardQueue[0]) return Number(game.discardQueue[0].p);
  return Number(cur());
}
function mpDebugControlSeat() {
  if (!MP.debugEnabled) return 0;
  return Number(MP.debugSeat || mpActiveSeat() || 0);
}
function mpCanOperate(actor) {
  actor = Number(actor);
  if (actor === MP.seat || (MP.host && mpAiSeats().includes(actor))) return true;
  return Boolean(MP.host && MP.room && MP.room.debug && MP.debugEnabled && mpDebugControlSeat() === actor);
}
function mpRenderDebug() {
  const dock = document.getElementById("mpDebugDock");
  if (!dock) return;
  const visible = Boolean(MP.host && MP.room && MP.room.debug);
  dock.hidden = !visible;
  if (!visible) return;
  const enabled = document.getElementById("mpDebugEnabled"), seat = document.getElementById("mpDebugSeat"), status = document.getElementById("mpDebugStatus");
  enabled.checked = MP.debugEnabled; seat.value = String(MP.debugSeat || 0);
  const activeSeat = mpActiveSeat();
  status.textContent = !MP.active ? "開始後に使用できます" : !MP.debugEnabled ? "通常進行" :
    `P${mpDebugControlSeat()}を手動操作${MP.debugSeat && MP.debugSeat !== activeSeat ? `（現在はP${activeSeat}の番）` : ""}`;
}
function mpRefreshDebugControl() {
  if (!game) return mpRenderDebug();
  humanSeat = MP.debugEnabled ? mpDebugControlSeat() : MP.seat;
  if (typeof clearPendingPlacement === "function") clearPendingPlacement(false);
  refresh(); mpRenderDebug();
  if (MP.host && !MP.debugEnabled) aiMaybeGo();
}
function mpSerialize() {
  const pl = {};
  for (let p = 1; p <= 4; p++) pl[p] = {
    settlements: [...placements[p].settlements],
    cities: [...(placements[p].cities || [])],
    roads: [...placements[p].roads]
  };
  const gameCopy = JSON.parse(JSON.stringify(game, (key, value) => value instanceof Set ? [...value] : value));
  delete gameCopy.ai;
  return {
    schema: 1,
    board: JSON.parse(JSON.stringify(board)),
    ports: JSON.parse(JSON.stringify(ports)),
    placements: pl,
    game: gameCopy,
    seatAI: mpSeatConfig(),
    savedAt: Date.now()
  };
}
function mpApply(state) {
  if (!state || !state.game) return;
  MP.applying = true;
  try {
    clearTimeout(typeof aiTimer !== "undefined" ? aiTimer : null);
    aiBusy = false;
    numPlayers = 4;
    board = JSON.parse(JSON.stringify(state.board));
    ports = JSON.parse(JSON.stringify(state.ports));
    placements = {};
    for (let p = 1; p <= 4; p++) {
      const src = state.placements[p] || state.placements[String(p)] || {};
      placements[p] = {
        settlements: new Set(src.settlements || []),
        cities: new Set(src.cities || []),
        roads: new Set(src.roads || [])
      };
    }
    game = JSON.parse(JSON.stringify(state.game));
    mpApplySeatConfig();
    humanSeat = (MP.host && MP.room && MP.room.debug && MP.debugEnabled)
      ? mpDebugControlSeat()
      : MP.seat;
    if (typeof clearPendingPlacement === "function") clearPendingPlacement(false);
    paused = false;
    document.getElementById("startScreen").classList.add("hidden");
    document.getElementById("mpOverlay").classList.remove("show");
    document.body.classList.add("multiplayer");
    MP.active = true;
    if (replay) replay.active = false;
    render();
    if (typeof rerenderLog === "function") rerenderLog();
    updateGamePanel();
    mpUpdateBrand();
  } finally { MP.applying = false; }
  mpRenderDebug();
  if (MP.host && !MP.publishing && !MP.outbox.length) aiMaybeGo();
}
async function mpStart() {
  if (!MP.host || !MP.room || !mpStorageReady() || Object.keys(MP.room.members || {}).length !== mpHumanCount()) return;
  const startButton = document.getElementById("mpStart");
  startButton.disabled = true;
  try {
    // サーバーでtokenごと席を入れ替えてから、シャッフル後のホスト席で初期状態を作る。
    const data = await mpApi("POST", { op: "start", code: MP.code, token: MP.token, version: MP.version });
    MP.seat = Number(data.seat); MP.host = true; MP.room = data.room; MP.version = data.room.version;
    mpSaveSession();
    mpApplySeatConfig();
    humanSeat = MP.seat;
    startMatch();
    game.ai = new Set(mpAiSeats());
    MP.active = true;
    document.getElementById("mpOverlay").classList.remove("show");
    document.body.classList.add("multiplayer");
    render(); updateGamePanel(); mpRenderDebug(); mpUpdateBrand();
    await mpEnqueuePublish(0, "start");
  } catch (error) {
    mpToast(error.message === "version_conflict" ? "部屋情報が更新されました。もう一度開始してください" : "対局を開始できませんでした");
    mpSchedulePoll(100);
  } finally { startButton.disabled = false; }
}
function mpEnqueuePublish(actorSeat, source) {
  if (!MP.active || MP.applying || !game) return Promise.resolve(false);
  const actor = Number(actorSeat), state = mpSerialize();
  let resolvePromise;
  const promise = new Promise(resolve => { resolvePromise = resolve; });
  const tail = MP.outbox[MP.outbox.length - 1];
  // 同一手番内の「交換→建設→終了」などは最終状態だけ送れば情報を失わない。
  // 送信中の先頭は触らず、その後ろだけをまとめてキュー肥大化を防ぐ。
  if (tail && tail.actorSeat === actor && (!MP.publishing || MP.outbox.length > 1)) {
    tail.state = state; tail.source = source || "action"; tail.resolves.push(resolvePromise);
  } else {
    MP.outbox.push({ actorSeat: actor, source: source || "action", state, resolves: [resolvePromise] });
  }
  clearTimeout(MP.publishTimer);
  MP.publishTimer = setTimeout(mpPumpPublish, 35);
  return promise;
}
async function mpPumpPublish() {
  if (MP.publishing || !MP.outbox.length || !MP.active) return;
  clearTimeout(MP.publishTimer); clearTimeout(MP.retryTimer);
  const item = MP.outbox[0];
  MP.publishing = true;
  let retryDelay = 0, recoverFromServer = false;
  try {
    const result = await mpApi("POST", {
      op: "state", code: MP.code, token: MP.token, version: MP.version,
      actorSeat: item.actorSeat, state: item.state
    });
    MP.room = result.room; MP.version = result.room.version; MP.errorCount = 0;
    MP.outbox.shift(); item.resolves.forEach(resolve => resolve(true));
    if (MP.syncTrouble) mpSetSyncStatus("同期完了", 1200);
    MP.syncTrouble = false;
  } catch (error) {
    if (error.status === 409 && error.data && error.data.room) {
      MP.room = error.data.room; MP.version = error.data.room.version;
      MP.outbox.splice(0).forEach(x => x.resolves.forEach(resolve => resolve(false)));
      if (error.data.room.state) mpApply(error.data.room.state);
      mpSetSyncStatus("最新の局面に同期しました", 1800);
      MP.syncTrouble = false;
    } else if (error.status && error.status >= 400 && error.status < 500) {
      // 権限違反や大き過ぎる状態は同じ内容を再送しても成功しない。サーバー局面へ戻す。
      MP.outbox.splice(0).forEach(x => x.resolves.forEach(resolve => resolve(false)));
      mpSetSyncStatus("操作を同期できませんでした。最新局面を再取得します");
      recoverFromServer = true; MP.forceApply = true;
    } else {
      MP.errorCount++;
      // 通信断では状態を捨てず同じ不変スナップショットを再送する。
      MP.syncTrouble = true;
      mpSetSyncStatus("通信が不安定です。操作内容を保持して自動再送中…");
      retryDelay = Math.min(5000, 600 * MP.errorCount) + Math.floor(Math.random() * 250);
    }
  } finally {
    MP.publishing = false;
  }
  if (retryDelay) { MP.retryTimer = setTimeout(mpPumpPublish, retryDelay); return; }
  if (recoverFromServer) { mpSchedulePoll(100); return; }
  if (MP.outbox.length) mpPumpPublish();
  else if (MP.deferredRoom && MP.deferredRoom.version > MP.version) {
    const deferred = MP.deferredRoom; MP.deferredRoom = null; MP.room = deferred; MP.version = deferred.version;
    if (deferred.state) mpApply(deferred.state);
  } else { MP.deferredRoom = null; if (MP.host) aiMaybeGo(); }
}
function mpQueuePublish(actorSeat, source) {
  if (!MP.active || MP.applying) return;
  mpEnqueuePublish(actorSeat, source);
}
async function mpPoll() {
  if (!MP.code || !MP.token) return;
  try {
    const data = await mpApi("GET", null, { code: MP.code, token: MP.token });
    const forced = MP.forceApply;
    MP.host = data.host; MP.seat = Number(data.seat); MP.errorCount = 0;
    if (!MP.room || data.room.version >= MP.version) MP.room = data.room;
    mpSaveSession();
    if (data.room.version > MP.version || MP.forceApply) {
      if (MP.publishing || MP.outbox.length) MP.deferredRoom = data.room;
      else {
        MP.version = data.room.version;
        if (data.room.state && (data.room.status === "playing" || data.room.status === "finished")) mpApply(data.room.state);
      }
    }
    MP.forceApply = false;
    if (forced) { MP.syncTrouble = false; mpSetSyncStatus("最新の局面に同期しました", 1800); }
    mpRenderRoom();
  } catch (error) {
    MP.errorCount++;
    if (error.status === 401 || error.status === 404) { mpClearSession(); mpRenderRoom(); }
  }
  mpSchedulePoll(MP.errorCount ? 1800 : 800);
}
function mpSchedulePoll(ms) {
  clearTimeout(MP.pollTimer);
  MP.pollTimer = setTimeout(mpPoll, ms);
}
function mpLeaveLocal() {
  mpClearSession();
  history.replaceState(null, "", location.pathname);
  location.reload();
}
function mpWrapAction(name) {
  let original;
  try { original = eval(name); } catch (_) { return; }
  if (typeof original !== "function") return;
  const wrapped = function(...args) {
    // 勝率ゲージの仮想対局はローカルの複製状態だけを操作する。
    // 権限判定・publish を通すと、仮想局面が実際のオンライン部屋へ流れてしまう。
    if (typeof _inPlayout !== "undefined" && _inPlayout) return original.apply(this, args);
    const outer = MP.actionDepth === 0, actor = mpActiveSeat();
    if (MP.active && outer) {
      const allowed = mpCanOperate(actor);
      if (!allowed) { mpToast(`現在はP${actor}の操作待ちです`); return; }
    }
    const before = MP.active && outer ? JSON.stringify(mpSerialize()) : "";
    MP.actionDepth++;
    try { return original.apply(this, args); }
    finally {
      MP.actionDepth--;
      if (MP.active && outer && !MP.applying && JSON.stringify(mpSerialize()) !== before) mpQueuePublish(actor, name);
    }
  };
  try { eval(name + " = wrapped"); } catch (_) {}
}
function mpInstallHooks() {
  const originalApplyLang = applyLang;
  applyLang = function() { originalApplyLang(); mpUpdateBrand(); };
  const originalSeatAiName = seatAiName;
  seatAiName = function(p) {
    if (!MP.active || !MP.room) return originalSeatAiName(p);
    const seat = Number(p);
    if (mpAiSeats().includes(seat)) return "最強AI";
    const member = (MP.room.members || {})[seat];
    return member && member.name ? member.name : `P${seat}`;
  };
  const originalIsHuman = isHuman;
  isHuman = p => MP.active
    ? (Number(p) === MP.seat || (MP.host && MP.room && MP.room.debug && MP.debugEnabled && Number(p) === mpDebugControlSeat()))
    : originalIsHuman(p);
  const originalAiMaybeGo = aiMaybeGo;
  aiMaybeGo = function() {
    if (MP.active && !MP.host) { aiBusy = false; return; }
    if (MP.active && MP.host && MP.room && MP.room.debug && MP.debugEnabled && mpDebugControlSeat() === mpActiveSeat()) { aiBusy = false; return; }
    return originalAiMaybeGo();
  };
  const originalAiStep = aiStep;
  aiStep = function() {
    if (MP.active && !MP.host) { aiBusy = false; return; }
    if (MP.active && MP.host && MP.room && MP.room.debug && MP.debugEnabled && mpDebugControlSeat() === mpActiveSeat()) { aiBusy = false; refresh(); return; }
    return originalAiStep();
  };
  [
    "gameClickVertex", "gameClickEdge", "gameClickHex", "doRoll", "buyDev",
    "playDev", "resolvePlenty", "resolveMono", "doTrade", "endTurnGame",
    "stealFrom", "humanDiscard"
  ].forEach(mpWrapAction);
}
function mpBuildUi() {
  const overlay = document.createElement("div");
  overlay.id = "mpOverlay";
  overlay.innerHTML = `
    <div class="mpcard">
      <button id="mpClose" class="mpclose" aria-label="閉じる">×</button>
      <h2>オンライン対戦</h2>
      <p class="mplead">人間2〜3人で対戦し、残りの席には最強AIが入ります。</p>
      <div id="mpJoinPane">
        <label>表示名<input id="mpName" maxlength="20" autocomplete="nickname" placeholder="あなたの名前"></label>
        <label>新しい部屋の構成<select id="mpHumanCount"><option value="3">人間3人＋最強AI1体</option><option value="2">人間2人＋最強AI2体</option></select></label>
        <label class="mpdebug-create"><input id="mpDebugCreate" type="checkbox"> デバッグ部屋にする（ホストが各席を手動操作可能）</label>
        <div class="mpbuttons"><button id="mpCreate" class="btn primary">新しい部屋を作る</button></div>
        <div class="mpor">または</div>
        <label>6桁の部屋コード<input id="mpCode" maxlength="6" autocomplete="off" placeholder="ABC234"></label>
        <div class="mpbuttons"><button id="mpJoin" class="btn">部屋に参加</button></div>
      </div>
      <div id="mpRoomPane" hidden>
        <div class="mpcode">部屋コード <b id="mpRoomCode"></b></div>
        <div id="mpSeats"></div>
        <p id="mpWait"></p>
        <input id="mpInviteUrl" class="mpinvite" readonly>
        <div class="mpbuttons">
          <button id="mpCopy" class="btn">招待URLをコピー</button>
          <button id="mpStart" class="btn primary">対局開始</button>
        </div>
        <button id="mpLeave" class="mplink">この部屋から退出</button>
      </div>
      <div id="mpStatus" class="mpstatus"></div>
    </div>`;
  document.body.appendChild(overlay);
  const debugDock = document.createElement("div");
  debugDock.id = "mpDebugDock"; debugDock.className = "mpdebugdock"; debugDock.hidden = true;
  debugDock.innerHTML = `<b>🛠 同期デバッグ</b><label><input id="mpDebugEnabled" type="checkbox"> 手動操作</label>
    <select id="mpDebugSeat"><option value="0">現在の手番を操作</option><option value="1">P1を操作</option><option value="2">P2を操作</option><option value="3">P3を操作</option><option value="4">P4を操作</option></select>
    <span id="mpDebugStatus"></span>`;
  document.body.appendChild(debugDock);
  const syncBadge = document.createElement("div");
  syncBadge.id = "mpSyncBadge"; syncBadge.className = "mpsyncbadge"; syncBadge.hidden = true;
  document.body.appendChild(syncBadge);
  const entry = document.createElement("button");
  entry.id = "mpEntry"; entry.className = "btn good"; entry.textContent = "🌐 オンライン対戦";
  const startRow = document.querySelector("#startScreen .startrow");
  startRow.insertBefore(entry, startRow.firstChild);
  entry.onclick = mpOpen;
  document.getElementById("mpClose").onclick = mpClose;
  document.getElementById("mpCreate").onclick = mpCreate;
  document.getElementById("mpJoin").onclick = mpJoin;
  document.getElementById("mpCopy").onclick = mpCopyInvite;
  document.getElementById("mpStart").onclick = mpStart;
  document.getElementById("mpLeave").onclick = mpLeaveLocal;
  document.getElementById("mpDebugEnabled").onchange = e => { MP.debugEnabled = e.target.checked; mpRefreshDebugControl(); };
  document.getElementById("mpDebugSeat").onchange = e => { MP.debugSeat = Number(e.target.value); mpRefreshDebugControl(); };
}
async function mpResume() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem("catan_mp_session") || "null"); } catch (_) {}
  if (!saved || !saved.code || !saved.token) {
    if (new URLSearchParams(location.search).get("room")) mpOpen();
    return;
  }
  Object.assign(MP, saved);
  try {
    const data = await mpApi("GET", null, { code: MP.code, token: MP.token });
    MP.host = data.host; MP.seat = Number(data.seat); MP.room = data.room; MP.version = data.room.version;
    if (data.room.state) mpApply(data.room.state); else mpOpen();
    mpRenderRoom(); mpSchedulePoll(800);
  } catch (_) { mpClearSession(); if (new URLSearchParams(location.search).get("room")) mpOpen(); }
}

window.addEventListener("DOMContentLoaded", () => {
  mpBuildUi();
  mpInstallHooks();
  mpResume();
});
