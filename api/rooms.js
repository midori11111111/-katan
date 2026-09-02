const crypto = require("crypto");
const { getRoom, createRoom, compareAndSet, saveResearchSnapshot, persistent } = require("./store");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_STATE_BYTES = 2_500_000;
const MAX_RESEARCH_BYTES = 800_000;

function randomCode() {
  let out = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return out;
}
function randomToken() {
  return crypto.randomBytes(24).toString("base64url");
}
function humanCountOf(room) {
  return Number(room && room.humanCount) === 2 ? 2 : 3;
}
function aiSeatsOf(room) {
  if (room && Array.isArray(room.aiSeats) && room.aiSeats.length) {
    return room.aiSeats.map(Number).filter(seat => seat >= 1 && seat <= 4);
  }
  return [Number(room && room.aiSeat || 4)];
}
function shuffledMembers(room) {
  const original = Object.values(room.members).sort((a, b) => a.joinedAt - b.joinedAt);
  const shuffled = [...original];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // 1/6で参加順のままになると「シャッフルされていない」ように見えるため、必ず1席以上動かす。
  if (shuffled.every((m, i) => m.tokenHash === original[i].tokenHash)) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return Object.fromEntries(shuffled.map((m, i) => [i + 1, { ...m, seat: i + 1 }]));
}
function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}
function cleanName(name) {
  return String(name || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 20) || "プレイヤー";
}
function cleanCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}
function publicState(state) {
  if (!state || typeof state !== "object") return state || null;
  const copy = structuredClone(state);
  const logs = copy.game && Array.isArray(copy.game.log) ? copy.game.log : [];
  for (const entry of logs) {
    if (entry && typeof entry.msg === "string" && entry.msg.startsWith("発展カードを購入")) {
      entry.msg = "発展カードを購入";
    }
  }
  return copy;
}
function publicRoom(room) {
  const humanCount = humanCountOf(room), aiSeats = aiSeatsOf(room);
  return {
    code: room.code,
    version: room.version,
    status: room.status,
    aiSeat: aiSeats[0],
    aiSeats,
    humanCount,
    hostSeat: room.hostSeat,
    debug: Boolean(room.debug),
    members: Object.fromEntries(Object.entries(room.members).map(([seat, m]) => [seat, { seat: Number(seat), name: m.name }])),
    // 防御的にサーバーでも購入カード種別・内部評価タグを共有ログから除去する。
    state: publicState(room.state),
    updatedAt: room.updatedAt,
    persistent
  };
}
function decisionCount(state) {
  const g = state && state.game;
  if (!g) return 0;
  let n = Array.isArray(g._actionFrames) ? g._actionFrames.length : 0;
  for (const turn of Array.isArray(g.turns) ? g.turns : []) {
    if (Array.isArray(turn.steps)) n += turn.steps.length;
    else if (Array.isArray(turn.actions)) n += turn.actions.length;
  }
  return n;
}
function winnerOf(state) {
  const g = state && state.game;
  if (!g || g.phase !== "over") return null;
  const win = [...(Array.isArray(g.turns) ? g.turns : []), { actions: g._acts || [] }]
    .flatMap(t => t && Array.isArray(t.actions) ? t.actions : [])
    .find(a => a && a.a === "win");
  return win ? Number(win.p) : null;
}
function researchRecord(room, state, now) {
  const id = room.researchId || `${room.code}-${room.createdAt}`;
  return {
    schema: 1,
    id,
    source: "public-online-match",
    policyVersion: state && state.policyVersion || "20260903b",
    createdAt: room.createdAt,
    updatedAt: now,
    status: state && state.game && state.game.phase === "over" ? "finished" : "playing",
    winner: winnerOf(state),
    humanCount: humanCountOf(room),
    aiSeats: aiSeatsOf(room),
    decisions: Number(room.researchDecisionCount || 0),
    // 氏名・認証token・IPは研究データへ入れない。対局状態と席種だけを保存する。
    state
  };
}
function cleanResearchDecisions(rows, room, now) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows.slice(0, 24)) {
    if (!row || typeof row !== "object" || !row.before || typeof row.before !== "object") continue;
    const actor = Number(row.actor);
    if (!(actor >= 1 && actor <= 4)) continue;
    out.push({
      schema: 1,
      gameId: room.researchId,
      ordinal: Number(room.researchDecisionCount || 0) + out.length,
      capturedAt: now,
      actor,
      source: String(row.source || "action").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40),
      actions: Array.isArray(row.actions) ? row.actions.slice(0, 8) : [],
      before: row.before
    });
  }
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_RESEARCH_BYTES) return [];
  return out;
}
function memberFor(room, token) {
  const h = tokenHash(token);
  return Object.values(room.members).find(m => m.tokenHash === h) || null;
}
function activeSeat(state) {
  const g = state && state.game;
  if (!g) return null;
  if (g.phase === "setup" && g.setup) return Number(g.setup.queue[g.setup.step]);
  if (g.phase === "discard" && g.discardQueue && g.discardQueue[0]) return Number(g.discardQueue[0].p);
  return Number(g.order[g.idx]);
}
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_STATE_BYTES + 100_000) throw new Error("payload_too_large");
  }
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const code = cleanCode(url.searchParams.get("code"));
      const token = url.searchParams.get("token") || "";
      const room = await getRoom(code);
      if (!room) return send(res, 404, { error: "room_not_found" });
      const member = memberFor(room, token);
      if (!member) return send(res, 401, { error: "invalid_session" });
      return send(res, 200, { room: publicRoom(room), seat: member.seat, host: member.seat === room.hostSeat });
    }
    if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });

    const body = await readJson(req);
    if (body.op === "create") {
      for (let tries = 0; tries < 8; tries++) {
        const code = randomCode(), token = randomToken(), now = Date.now();
        const humanCount = Number(body.humanCount) === 2 ? 2 : 3;
        const aiSeats = [1, 2, 3, 4].filter(seat => seat > humanCount);
        const room = {
          code, version: 1, status: "lobby", aiSeat: aiSeats[0], aiSeats, humanCount, hostSeat: 1,
          debug: Boolean(body.debug),
          researchId: crypto.randomUUID(),
          researchDecisionCount: 0,
          members: { 1: { seat: 1, name: cleanName(body.name), tokenHash: tokenHash(token), joinedAt: now } },
          state: null, createdAt: now, updatedAt: now
        };
        if (await createRoom(code, room)) return send(res, 201, { code, token, seat: 1, host: true, room: publicRoom(room) });
      }
      return send(res, 503, { error: "code_generation_failed" });
    }

    const code = cleanCode(body.code);
    let room = await getRoom(code);
    if (!room) return send(res, 404, { error: "room_not_found" });

    if (body.op === "join") {
      if (room.status !== "lobby") return send(res, 409, { error: "game_already_started" });
      const used = new Set(Object.keys(room.members).map(Number));
      const seat = Array.from({ length: humanCountOf(room) }, (_, i) => i + 1).find(s => !used.has(s));
      if (!seat) return send(res, 409, { error: "room_full" });
      const token = randomToken(), now = Date.now();
      const next = structuredClone(room);
      next.members[seat] = { seat, name: cleanName(body.name), tokenHash: tokenHash(token), joinedAt: now };
      next.version++; next.updatedAt = now;
      const saved = await compareAndSet(code, room.version, next);
      if (!saved.ok) return send(res, 409, { error: "room_changed", room: saved.room ? publicRoom(saved.room) : null });
      return send(res, 200, { code, token, seat, host: false, room: publicRoom(saved.room) });
    }

    const member = memberFor(room, body.token);
    if (!member) return send(res, 401, { error: "invalid_session" });

    if (body.op === "start") {
      if (room.status !== "lobby") return send(res, 409, { error: "game_already_started" });
      if (member.seat !== room.hostSeat || Object.keys(room.members).length !== humanCountOf(room)) {
        return send(res, 403, { error: "cannot_start" });
      }
      const hostHash = member.tokenHash, now = Date.now(), next = structuredClone(room);
      next.members = shuffledMembers(room);
      next.hostSeat = Number(Object.keys(next.members).find(seat => next.members[seat].tokenHash === hostHash));
      next.version++; next.updatedAt = now;
      const saved = await compareAndSet(code, room.version, next);
      if (!saved.ok) return send(res, 409, { error: "version_conflict", room: saved.room ? publicRoom(saved.room) : null });
      const moved = memberFor(saved.room, body.token);
      return send(res, 200, { seat: moved.seat, host: true, room: publicRoom(saved.room) });
    }

    if (body.op === "state") {
      if (!body.state || typeof body.state !== "object") return send(res, 400, { error: "invalid_state" });
      const stateBytes = Buffer.byteLength(JSON.stringify(body.state));
      if (stateBytes > MAX_STATE_BYTES) return send(res, 413, { error: "state_too_large" });
      const expected = Number(body.version);
      if (expected !== room.version) return send(res, 409, { error: "version_conflict", room: publicRoom(room) });
      const actor = Number(body.actorSeat);
      const isHost = member.seat === room.hostSeat;
      if (room.status === "lobby") {
        if (!isHost || Object.keys(room.members).length !== humanCountOf(room)) return send(res, 403, { error: "cannot_start" });
      } else {
        const expectedActor = activeSeat(room.state);
        const allowed = actor === member.seat || (isHost && (aiSeatsOf(room).includes(actor) || room.debug));
        if (!allowed || actor !== expectedActor) return send(res, 403, { error: "not_your_turn", expectedActor });
      }
      const now = Date.now(), next = structuredClone(room);
      next.researchId = next.researchId || crypto.randomUUID();
      const researchDecisions = cleanResearchDecisions(body.researchDecisions, next, now);
      next.researchDecisionCount = Number(next.researchDecisionCount || 0) + researchDecisions.length;
      next.state = body.state;
      next.status = body.state.game && body.state.game.phase === "over" ? "finished" : "playing";
      next.version++; next.updatedAt = now;
      const saved = await compareAndSet(code, room.version, next);
      if (!saved.ok) return send(res, 409, { error: "version_conflict", room: saved.room ? publicRoom(saved.room) : null });
      // 研究保存の障害で対局自体を止めない。CAS後の正規状態だけを保存する。
      try {
        await saveResearchSnapshot(saved.room.researchId, researchRecord(saved.room, saved.room.state, now), researchDecisions);
      } catch (researchError) {
        console.error("research_snapshot_failed", researchError);
      }
      return send(res, 200, { room: publicRoom(saved.room) });
    }

    return send(res, 400, { error: "unknown_operation" });
  } catch (error) {
    console.error(error);
    const status = error && error.message === "payload_too_large" ? 413 : 500;
    return send(res, status, { error: status === 413 ? "state_too_large" : "server_error" });
  }
};
