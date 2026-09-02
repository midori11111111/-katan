const assert = require("assert");

process.env.RESEARCH_EXPORT_TOKEN = "solo-test-export";
const solo = require("./api/solo-research");
const research = require("./api/research");

async function call(handler, method, url, body, headers = {}) {
  let raw = "";
  const req = { method, url, body, headers };
  const res = {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(value) { raw = String(value || ""); }
  };
  await handler(req, res);
  return { status: res.statusCode, body: raw ? JSON.parse(raw) : null };
}

function state(phase = "main") {
  return {
    schema: 1, policyVersion: "solo-policy", board: [], ports: [], placements: {},
    seatAI: { 1: "strong", 2: "strong", 3: "human", 4: "invincible" },
    savedAt: Date.now(), name: "保存してはいけない名前", token: "top-secret",
    game: {
      phase, order: [1, 2, 3, 4], idx: 2, hands: { 3: { wood: 1 } },
      turns: [{ actions: [{ a: "roll", total: 8 }], note: "人間コメント" }],
      log: [], _actionFrames: [], nested: { authorization: "Bearer secret", ip: "127.0.0.1" }
    }
  };
}

(async () => {
  const started = await call(solo, "POST", "/api/solo-research", { op: "start" });
  assert.equal(started.status, 201);
  const { id, token } = started.body;

  const invalid = state(); invalid.seatAI = { 1: "strong", 2: "strong", 3: "strong", 4: "strong" };
  assert.equal((await call(solo, "POST", "/api/solo-research", {
    op: "state", id, token, version: 0, state: invalid, decisions: []
  })).status, 400);

  const before = state("roll");
  const first = await call(solo, "POST", "/api/solo-research", {
    op: "state", id, token, version: 0, state: state(),
    decisions: [{ actor: 3, source: "doRoll", actions: [{ a: "invoke", name: "gameClickVertex", args: [42] }], before }]
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.version, 1);
  assert.equal(first.body.decisions, 1);

  // 同じversionの再送は受理せず、判断を二重追記しない。
  const duplicate = await call(solo, "POST", "/api/solo-research", {
    op: "state", id, token, version: 0, state: state(),
    decisions: [{ actor: 3, source: "doRoll", actions: [{ a: "invoke", name: "gameClickVertex", args: [42] }], before }]
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.version, 1);
  assert.equal((await call(solo, "POST", "/api/solo-research", {
    op: "state", id, token: "wrong", version: 1, state: state(), decisions: []
  })).status, 401);

  const finishedState = state("over");
  finishedState.game.turns[0].actions.push({ a: "win", p: 3 });
  const finished = await call(solo, "POST", "/api/solo-research", {
    op: "state", id, token, version: 1, state: finishedState, decisions: []
  });
  assert.equal(finished.status, 200);
  assert.equal(finished.body.status, "finished");

  const auth = { authorization: "Bearer solo-test-export" };
  const exported = await call(research, "GET", `/api/research?id=${id}&decisions=1`, null, auth);
  assert.equal(exported.status, 200);
  assert.equal(exported.body.record.source, "public-solo-match");
  assert.equal(exported.body.record.status, "finished");
  assert.equal(exported.body.record.winner, 3);
  assert.deepEqual(exported.body.record.humanSeats, [3]);
  assert.deepEqual(exported.body.record.aiSeats, [1, 2, 4]);
  assert.equal(exported.body.decisions.length, 1);
  assert.equal(exported.body.decisions[0].before.game.phase, "roll");
  assert.equal(exported.body.decisions[0].actions[0].name, "gameClickVertex");
  assert.equal(exported.body.record.state.game.turns[0].note, "人間コメント");
  const serialized = JSON.stringify(exported.body);
  assert(!serialized.includes("保存してはいけない名前"));
  assert(!serialized.includes("top-secret"));
  assert(!serialized.includes("Bearer secret"));
  assert(!serialized.includes("127.0.0.1"));
  console.log("✓ ソロ対局の匿名逐次保存・重複防止・完了棋譜・コメント保持");
})().catch(error => { console.error(error); process.exit(1); });
