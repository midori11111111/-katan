const memory = globalThis.__CATAN_ROOM_MEMORY__ || new Map();
globalThis.__CATAN_ROOM_MEMORY__ = memory;

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

module.exports = { getRoom, createRoom, compareAndSet, persistent: useRedis };
