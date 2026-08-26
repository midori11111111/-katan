/* Online lobby: 3 remote humans (P1-P3) vs strongest AI (P4).
   Turn-based snapshots are synchronized through /api/rooms. */
const MP = {
  code: "", token: "", seat: 0, host: false, version: 0, room: null,
  active: false, applying: false, publishing: false, pendingActor: 0,
  pollTimer: null, errorCount: 0
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
  const response = await fetch("/api/rooms" + suffix, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body || {}) : undefined,
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status; error.data = data;
    throw error;
  }
  return data;
}
function mpSaveSession() {
  sessionStorage.setItem("catan_mp_session", JSON.stringify({
    code: MP.code, token: MP.token, seat: MP.seat, host: MP.host
  }));
}
function mpClearSession() {
  sessionStorage.removeItem("catan_mp_session");
  Object.assign(MP, { code: "", token: "", seat: 0, host: false, version: 0, room: null, active: false });
  clearTimeout(MP.pollTimer);
}
function mpStorageReady() {
  return Boolean(MP.room && (MP.room.persistent || location.hostname === "127.0.0.1" || location.hostname === "localhost"));
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
  mpSaveSession(); mpRenderRoom(); mpSchedulePoll(100);
}
async function mpCreate() {
  const name = document.getElementById("mpName").value.trim();
  try {
    document.getElementById("mpCreate").disabled = true;
    mpSessionFrom(await mpApi("POST", { op: "create", name }));
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
  document.getElementById("mpSeats").innerHTML = [1, 2, 3, 4].map(seat => {
    const member = members[seat], mine = seat === MP.seat;
    const name = seat === 4 ? "最強AI" : (member ? member.name : "参加待ち");
    return `<div class="mpseat ${member || seat === 4 ? "ready" : ""} ${mine ? "mine" : ""}">
      <b>P${seat}</b><span>${mpEsc(name)}</span><small>${seat === 4 ? "AI" : (mine ? "あなた" : member ? "接続済み" : "空席")}</small>
    </div>`;
  }).join("");
  const count = Object.keys(members).length;
  const start = document.getElementById("mpStart");
  start.hidden = !MP.host || MP.room.status !== "lobby";
  start.disabled = count !== 3 || !mpStorageReady();
  start.textContent = count === 3 ? "3人＋最強AIで対局開始" : `参加待ち（${count}/3人）`;
  document.getElementById("mpWait").textContent =
    !mpStorageReady() ? "オンライン同期ストレージの接続待ちです。現在は対局を開始できません" :
    MP.room.status === "playing" ? "対局へ接続しています…" :
    MP.room.status === "finished" ? "対局は終了しました" :
    MP.host ? (count === 3 ? "3人揃いました。対局を開始できます" : `あと${3-count}人に招待URLを送ってください`) : "ホストが開始するまで待っています";
}
function mpActiveSeat() {
  if (!game) return null;
  if (game.phase === "setup" && game.setup) return Number(game.setup.queue[game.setup.step]);
  if (game.phase === "discard" && game.discardQueue && game.discardQueue[0]) return Number(game.discardQueue[0].p);
  return Number(cur());
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
    seatAI: { 1: "human", 2: "human", 3: "human", 4: "strong" },
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
    game.ai = new Set([4]);
    seatKind = { 1: "human", 2: "human", 3: "human", 4: "strong" };
    seatAI = { 1: "human", 2: "human", 3: "human", 4: "strong" };
    humanSeat = MP.seat;
    paused = false;
    document.getElementById("startScreen").classList.add("hidden");
    document.getElementById("mpOverlay").classList.remove("show");
    document.body.classList.add("multiplayer");
    MP.active = true;
    if (replay) replay.active = false;
    render(); updateGamePanel();
  } finally { MP.applying = false; }
  if (MP.host) aiMaybeGo();
}
async function mpStart() {
  if (!MP.host || !MP.room || !mpStorageReady() || Object.keys(MP.room.members || {}).length !== 3) return;
  seatKind = { 1: "human", 2: "human", 3: "human", 4: "strong" };
  seatAI = { 1: "human", 2: "human", 3: "human", 4: "strong" };
  humanSeat = MP.seat;
  startMatch();
  game.ai = new Set([4]);
  MP.active = true;
  document.getElementById("mpOverlay").classList.remove("show");
  document.body.classList.add("multiplayer");
  render();
  updateGamePanel();
  await mpPublish(0);
}
async function mpPublish(actorSeat) {
  if (!MP.active || MP.applying || !game) return;
  if (MP.publishing) { MP.pendingActor = actorSeat || MP.pendingActor; return; }
  MP.publishing = true;
  try {
    const result = await mpApi("POST", {
      op: "state", code: MP.code, token: MP.token, version: MP.version,
      actorSeat, state: mpSerialize()
    });
    MP.room = result.room; MP.version = result.room.version; MP.errorCount = 0;
  } catch (error) {
    if (error.status === 409 && error.data && error.data.room) {
      MP.room = error.data.room; MP.version = error.data.room.version;
      if (error.data.room.state) mpApply(error.data.room.state);
    } else {
      MP.errorCount++; mpToast("同期に失敗しました。再接続中…");
    }
  } finally {
    MP.publishing = false;
    const pending = MP.pendingActor; MP.pendingActor = 0;
    if (pending) setTimeout(() => mpPublish(pending), 30);
  }
}
function mpQueuePublish(actorSeat) {
  if (!MP.active || MP.applying) return;
  clearTimeout(mpQueuePublish.timer);
  mpQueuePublish.timer = setTimeout(() => mpPublish(actorSeat), 80);
}
async function mpPoll() {
  if (!MP.code || !MP.token) return;
  try {
    const data = await mpApi("GET", null, { code: MP.code, token: MP.token });
    MP.host = data.host; MP.seat = Number(data.seat); MP.room = data.room; MP.errorCount = 0;
    if (data.room.version > MP.version) {
      MP.version = data.room.version;
      if (data.room.state && (data.room.status === "playing" || data.room.status === "finished")) mpApply(data.room.state);
    }
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
    const actor = mpActiveSeat();
    if (MP.active) {
      const allowed = actor === MP.seat || (MP.host && actor === 4);
      if (!allowed) { mpToast(`現在はP${actor}の操作待ちです`); return; }
    }
    const before = MP.active ? JSON.stringify(mpSerialize()) : "";
    const result = original.apply(this, args);
    if (MP.active && !MP.applying && JSON.stringify(mpSerialize()) !== before) mpQueuePublish(actor);
    return result;
  };
  try { eval(name + " = wrapped"); } catch (_) {}
}
function mpInstallHooks() {
  const originalSeatAiName = seatAiName;
  seatAiName = function(p) {
    if (!MP.active || !MP.room) return originalSeatAiName(p);
    const seat = Number(p);
    if (seat === Number(MP.room.aiSeat || 4)) return "最強AI";
    const member = (MP.room.members || {})[seat];
    return member && member.name ? member.name : `P${seat}`;
  };
  const originalIsHuman = isHuman;
  isHuman = p => MP.active ? Number(p) === MP.seat : originalIsHuman(p);
  const originalAiMaybeGo = aiMaybeGo;
  aiMaybeGo = function() {
    if (MP.active && !MP.host) { aiBusy = false; return; }
    return originalAiMaybeGo();
  };
  const originalAiStep = aiStep;
  aiStep = function() {
    if (MP.active && !MP.host) { aiBusy = false; return; }
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
      <p class="mplead">人間3人で協力せずに対戦し、P4には最強AIが入ります。</p>
      <div id="mpJoinPane">
        <label>表示名<input id="mpName" maxlength="20" autocomplete="nickname" placeholder="あなたの名前"></label>
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
