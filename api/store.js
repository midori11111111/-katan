const memory = globalThis.__CATAN_ROOM_MEMORY__ || new Map();
globalThis.__CATAN_ROOM_MEMORY__ = memory;
const researchMemory = globalThis.__CATAN_RESEARCH_MEMORY__ || new Map();
globalThis.__CATAN_RESEARCH_MEMORY__ = researchMemory;
const researchDecisionMemory = globalThis.__CATAN_RESEARCH_DECISION_MEMORY__ || new Map();
globalThis.__CATAN_RESEARCH_DECISION_MEMORY__ = researchDecisionMemory;

const redisUrl = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const useRedis = Boolean(redisUrl && redisToken);

async function command(args) {
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000)
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error || `Redis HTTP ${response.status}`);
  return body.result;
}

function key(code) {
  return `catan:room:${code}`;
}
function researchKey(id) {
  return `catan:research:game:${id}`;
}
function researchDecisionKey(id) {
  return `catan:research:decisions:${id}`;
}
const RESEARCH_INDEX_KEY = "catan:research:index";
const RESEARCH_TTL_SECONDS = 60 * 60 * 24 * 180;

async function getRoom(code) {
  if (!useRedis) return memory.get(code) || null;
  const raw = await command(["GET", key(code)]);
  return raw ? JSON.parse(raw) : null;
}

async function createRoom(code, room) {
  if (!useRedis) {
    if (memory.has(code)) return false;
    memory.set(code, room);
    return true;
  }
  const result = await command(["SET", key(code), JSON.stringify(room), "EX", 86400, "NX"]);
  return result === "OK";
}

async function compareAndSet(code, expectedVersion, room) {
  if (!useRedis) {
    const current = memory.get(code);
    if (!current) return { ok: false, reason: "not_found" };
    if (current.version !== expectedVersion) return { ok: false, reason: "conflict", room: current };
    memory.set(code, room);
    return { ok: true, room };
  }
  const script = [
    "local raw=redis.call('GET',KEYS[1])",
    "if not raw then return 'NOT_FOUND' end",
    "local cur=cjson.decode(raw)",
    "if tonumber(cur.version)~=tonumber(ARGV[1]) then return 'CONFLICT|'..raw end",
    "redis.call('SET',KEYS[1],ARGV[2],'EX',86400)",
    "return 'OK|'..ARGV[2]"
  ].join("\n");
  const result = await command(["EVAL", script, 1, key(code), expectedVersion, JSON.stringify(room)]);
  if (result === "NOT_FOUND") return { ok: false, reason: "not_found" };
  if (typeof result === "string" && result.startsWith("CONFLICT|")) {
    return { ok: false, reason: "conflict", room: JSON.parse(result.slice(9)) };
  }
  if (typeof result === "string" && result.startsWith("OK|")) {
    return { ok: true, room: JSON.parse(result.slice(3)) };
  }
  throw new Error("Unexpected Redis response");
}

// 公開対局の最新完全棋譜を匿名IDで保存する。毎手を追記する代わりに最新状態を
// 上書きすることで、同期APIのpayloadを増やさず、中断対局も最後に受理した手まで残す。
async function saveResearchSnapshot(id, record, decisions = []) {
  if (!id || !record) return false;
  if (!useRedis) {
    researchMemory.set(String(id), structuredClone(record));
    if (decisions.length) {
      const rows = researchDecisionMemory.get(String(id)) || [];
      rows.push(...structuredClone(decisions));
      researchDecisionMemory.set(String(id), rows);
    }
    return true;
  }
  const script = [
    "redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3])",
    "redis.call('ZADD',KEYS[2],ARGV[2],ARGV[4])",
    "redis.call('EXPIRE',KEYS[2],ARGV[3])",
    "for i=5,#ARGV do redis.call('RPUSH',KEYS[3],ARGV[i]) end",
    "if #ARGV>=5 then redis.call('EXPIRE',KEYS[3],ARGV[3]) end",
    "return 'OK'"
  ].join("\n");
  const result = await command([
    "EVAL", script, 3, researchKey(id), RESEARCH_INDEX_KEY, researchDecisionKey(id),
    JSON.stringify(record), Number(record.updatedAt || Date.now()), RESEARCH_TTL_SECONDS, String(id),
    ...decisions.map(row => JSON.stringify(row))
  ]);
  return result === "OK";
}

async function getResearchSnapshot(id) {
  if (!id) return null;
  if (!useRedis) return researchMemory.get(String(id)) || null;
  const raw = await command(["GET", researchKey(id)]);
  return raw ? JSON.parse(raw) : null;
}

async function listResearchSnapshots(limit = 100) {
  const n = Math.max(1, Math.min(1000, Number(limit) || 100));
  if (!useRedis) {
    return [...researchMemory.values()]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, n)
      .map(r => ({ id: r.id, updatedAt: r.updatedAt, status: r.status, winner: r.winner || null,
        humanCount: r.humanCount, decisions: r.decisions || 0 }));
  }
  // indexは新しい対局が来るたびTTLが延びる一方、各対局本体は180日で消える。
  // 本体のない古いIDをそのまま返すとexportが404で全停止するため、ここで除去する。
  const scanN = Math.min(1000, Math.max(n, n * 2));
  const ranked = await command(["ZREVRANGE", RESEARCH_INDEX_KEY, 0, scanN - 1, "WITHSCORES"]);
  const ids = [];
  for (let i = 0; i < (ranked || []).length; i += 2) ids.push({ id: ranked[i], updatedAt: Number(ranked[i + 1]) || 0 });
  if (!ids.length) return [];
  const docs = await command(["MGET", ...ids.map(x => researchKey(x.id))]);
  const out = [], stale = [];
  for (let i = 0; i < ids.length; i++) {
    const raw = docs && docs[i];
    if (!raw) { stale.push(ids[i].id); continue; }
    try {
      const r = JSON.parse(raw);
      out.push({ id: r.id || ids[i].id, updatedAt: r.updatedAt || ids[i].updatedAt,
        status: r.status, winner: r.winner || null, humanCount: r.humanCount, decisions: r.decisions || 0 });
      if (out.length >= n) break;
    } catch (_) { stale.push(ids[i].id); }
  }
  if (stale.length) await command(["ZREM", RESEARCH_INDEX_KEY, ...stale]);
  return out;
}

async function getResearchDecisions(id, start = 0, limit = 500) {
  if (!id) return [];
  const a = Math.max(0, Number(start) || 0), n = Math.max(1, Math.min(5000, Number(limit) || 500));
  if (!useRedis) return (researchDecisionMemory.get(String(id)) || []).slice(a, a + n);
  const raw = await command(["LRANGE", researchDecisionKey(id), a, a + n - 1]);
  return (raw || []).map(s => JSON.parse(s));
}

module.exports = {
  getRoom, createRoom, compareAndSet,
  saveResearchSnapshot, getResearchSnapshot, listResearchSnapshots, getResearchDecisions,
  persistent: useRedis
};
