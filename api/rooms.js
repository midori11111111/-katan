const crypto = require("crypto");
const { getRoom, createRoom, compareAndSet, persistent } = require("./store");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_STATE_BYTES = 2_500_000;

function randomCode() {
  let out = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return out;
}
function randomToken() {
  return crypto.randomBytes(24).toString("base64url");
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
  return {
    code: room.code,
    version: room.version,
    status: room.status,
    aiSeat: room.aiSeat,
    hostSeat: room.hostSeat,
    members: Object.fromEntries(Object.entries(room.members).map(([seat, m]) => [seat, { seat: Number(seat), name: m.name }])),
    // 防御的にサーバーでも購入カード種別・内部評価タグを共有ログから除去する。
    state: publicState(room.state),
    updatedAt: room.updatedAt,
    persistent
  };
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
        const room = {
          code, version: 1, status: "lobby", aiSeat: 4, hostSeat: 1,
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
      const seat = [1, 2, 3].find(s => !used.has(s));
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

    if (body.op === "state") {
      if (!body.state || typeof body.state !== "object") return send(res, 400, { error: "invalid_state" });
      const stateBytes = Buffer.byteLength(JSON.stringify(body.state));
      if (stateBytes > MAX_STATE_BYTES) return send(res, 413, { error: "state_too_large" });
      const expected = Number(body.version);
      if (expected !== room.version) return send(res, 409, { error: "version_conflict", room: publicRoom(room) });
      const actor = Number(body.actorSeat);
      const isHost = member.seat === room.hostSeat;
      if (room.status === "lobby") {
        if (!isHost || Object.keys(room.members).length !== 3) return send(res, 403, { error: "cannot_start" });
      } else {
        const expectedActor = activeSeat(room.state);
        const allowed = actor === member.seat || (isHost && actor === room.aiSeat);
        if (!allowed || actor !== expectedActor) return send(res, 403, { error: "not_your_turn", expectedActor });
      }
      const now = Date.now(), next = structuredClone(room);
      next.state = body.state;
      next.status = body.state.game && body.state.game.phase === "over" ? "finished" : "playing";
      next.version++; next.updatedAt = now;
      const saved = await compareAndSet(code, room.version, next);
      if (!saved.ok) return send(res, 409, { error: "version_conflict", room: saved.room ? publicRoom(saved.room) : null });
      return send(res, 200, { room: publicRoom(saved.room) });
    }

    return send(res, 400, { error: "unknown_operation" });
  } catch (error) {
    console.error(error);
    const status = error && error.message === "payload_too_large" ? 413 : 500;
    return send(res, status, { error: status === 413 ? "state_too_large" : "server_error" });
  }
};
