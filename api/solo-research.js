const crypto = require("crypto");
const {
  createSoloSession, getSoloSession, commitSoloResearchState, persistent
} = require("./store");

const MAX_BODY_BYTES = 2_700_000;
const MAX_RESEARCH_BYTES = 900_000;
const MAX_DECISIONS = 5000;
const PHASES = new Set(["setup", "roll", "discard", "robber", "steal", "main", "over"]);
const PRIVATE_KEYS = new Set([
  "name", "displayname", "nickname", "token", "tokenhash", "auth", "authorization",
  "password", "email", "ip", "members", "member", "researchcapture"
]);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}
function randomToken() {
  return crypto.randomBytes(24).toString("base64url");
}
function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || "")), bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}
function cleanId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}
function cleanSource(value) {
  return String(value || "action").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "action";
}
function sanitize(value, depth = 0) {
  if (depth > 18 || value == null) return value == null ? null : undefined;
  if (typeof value === "string") return value.slice(0, 4000);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20000).map(v => sanitize(v, depth + 1)).filter(v => v !== undefined);
  if (typeof value !== "object") return undefined;
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 500)) {
    const normalized = String(key).replace(/^_+/, "").toLowerCase();
    if (PRIVATE_KEYS.has(normalized)) continue;
    const cleaned = sanitize(item, depth + 1);
    if (cleaned !== undefined) out[String(key).slice(0, 80)] = cleaned;
  }
  return out;
}
function normalizeSeatAI(value) {
  const out = {};
  for (let seat = 1; seat <= 4; seat++) {
    const kind = String(value && (value[seat] || value[String(seat)]) || "strong");
    out[seat] = kind === "human" ? "human" : kind === "invincible" ? "invincible" : "strong";
  }
  return out;
}
function cleanState(input) {
  const state = sanitize(input);
  if (!state || Number(state.schema) !== 1 || !state.board || !state.placements || !state.game) return null;
  if (!PHASES.has(String(state.game.phase || ""))) return null;
  state.schema = 1;
  state.policyVersion = String(state.policyVersion || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 60);
  state.seatAI = normalizeSeatAI(state.seatAI);
  delete state.savedAt;
  if (!Object.values(state.seatAI).includes("human")) return null;
  return state;
}
function winnerOf(state) {
  const game = state && state.game;
  if (!game || game.phase !== "over") return null;
  const turns = Array.isArray(game.turns) ? game.turns : [];
  const actions = turns.flatMap(turn => Array.isArray(turn && turn.actions) ? turn.actions : []);
  const win = actions.find(action => action && action.a === "win");
  if (win && Number(win.p) >= 1 && Number(win.p) <= 4) return Number(win.p);
  return null;
}
function cleanDecisions(rows, session, now) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows.slice(0, 32)) {
    const actor = Number(row && row.actor);
    if (!(actor >= 1 && actor <= 4) || !row.before || typeof row.before !== "object") continue;
    const before = cleanState(row.before);
    if (!before) continue;
    const actions = (Array.isArray(row.actions) ? row.actions.slice(0, 8) : []).map(action => {
      const cleaned = sanitize(action) || {};
      // 初期配置など_recActを通らない操作はinvoke名が唯一の意味情報。表示名とは別物なので
      // 許可文字だけに絞って保持する。
      if (action && action.a === "invoke" && action.name) cleaned.name = cleanSource(action.name);
      return cleaned;
    });
    out.push({
      schema: 1,
      gameId: session.id,
      ordinal: Number(session.decisionCount || 0) + out.length,
      capturedAt: now,
      actor,
      source: cleanSource(row.source),
      actions,
      before
    });
  }
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_RESEARCH_BYTES) return [];
  return out;
}
function researchRecord(session, state, now, decisionCount) {
  const seatAI = normalizeSeatAI(state.seatAI);
  const humans = Object.entries(seatAI).filter(([, kind]) => kind === "human").map(([seat]) => Number(seat));
  const aiSeats = Object.entries(seatAI).filter(([, kind]) => kind !== "human").map(([seat]) => Number(seat));
  return {
    schema: 1,
    id: session.id,
    source: session.source,
    policyVersion: state.policyVersion,
    createdAt: session.createdAt,
    updatedAt: now,
    status: state.game.phase === "over" ? "finished" : "playing",
    winner: winnerOf(state),
    humanCount: humans.length,
    humanSeats: humans,
    aiSeats,
    decisions: decisionCount,
    state
  };
}
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new Error("payload_too_large");
  }
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  try {
    const body = await readJson(req);
    if (body.op === "start") {
      for (let tries = 0; tries < 4; tries++) {
        const id = crypto.randomUUID(), token = randomToken(), now = Date.now();
        const session = {
          id, tokenHash: tokenHash(token), version: 0, decisionCount: 0,
          source: body.backfill ? "public-solo-backfill" : "public-solo-match",
          createdAt: now, updatedAt: now
        };
        if (await createSoloSession(id, session)) {
          return send(res, 201, { id, token, version: 0, persistent });
        }
      }
      return send(res, 503, { error: "session_generation_failed" });
    }
    if (body.op !== "state") return send(res, 400, { error: "unknown_operation" });
    const id = cleanId(body.id), session = await getSoloSession(id);
    if (!session) return send(res, 404, { error: "session_not_found" });
    if (!safeEqual(tokenHash(body.token), session.tokenHash)) return send(res, 401, { error: "invalid_session" });
    if (Number(body.version) !== Number(session.version)) {
      return send(res, 409, { error: "version_conflict", version: Number(session.version) });
    }
    if (Number(session.decisionCount || 0) >= MAX_DECISIONS) return send(res, 413, { error: "decision_limit" });
    const state = cleanState(body.state);
    if (!state) return send(res, 400, { error: "invalid_state" });
    const bytes = Buffer.byteLength(JSON.stringify(state));
    if (bytes > MAX_BODY_BYTES) return send(res, 413, { error: "state_too_large" });
    const now = Date.now(), decisions = cleanDecisions(body.decisions, session, now);
    const next = { ...session, version: Number(session.version) + 1,
      decisionCount: Number(session.decisionCount || 0) + decisions.length, updatedAt: now };
    const saved = await commitSoloResearchState(id, session.version, next,
      researchRecord(next, state, now, next.decisionCount), decisions);
    if (!saved.ok) return send(res, 409, { error: "version_conflict", version: Number(saved.session && saved.session.version || 0) });
    return send(res, 200, { id, version: next.version, saved: true,
      status: state.game.phase === "over" ? "finished" : "playing", decisions: next.decisionCount });
  } catch (error) {
    console.error(error);
    const tooLarge = error && error.message === "payload_too_large";
    return send(res, tooLarge ? 413 : 500, { error: tooLarge ? "payload_too_large" : "server_error" });
  }
};
