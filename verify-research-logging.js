const assert = require("assert");

process.env.RESEARCH_EXPORT_TOKEN = "local-test-token";
const rooms = require("./api/rooms");
const research = require("./api/research");

async function call(handler, method, url, body, headers = {}) {
  let raw = "";
  const req = { method, url, body, headers };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(value) { raw = String(value || ""); }
  };
  await handler(req, res);
  return { status: res.statusCode, body: raw ? JSON.parse(raw) : null };
}

(async () => {
  const created = await call(rooms, "POST", "/api/rooms", { op: "create", name: "秘密の名前", humanCount: 2 });
  assert.equal(created.status, 201);
  const code = created.body.code, hostToken = created.body.token;

  const joined = await call(rooms, "POST", "/api/rooms", { op: "join", code, name: "相手の名前" });
  assert.equal(joined.status, 200);
  const started = await call(rooms, "POST", "/api/rooms", {
    op: "start", code, token: hostToken, version: joined.body.room.version
  });
  assert.equal(started.status, 200);
  const hostSeat = Number(started.body.seat);

  const state = {
    schema: 1,
    policyVersion: "test-policy",
    board: [], ports: [], placements: {},
    game: {
      phase: "main", order: [hostSeat], idx: 0,
      turns: [{ actions: [{ a: "roll", total: 8 }], steps: [{ actions: [{ a: "roll", total: 8 }] }, { actions: [{ a: "build", kind: "road", id: 3 }] }] }],
      _actionFrames: []
    }
  };
  const saved = await call(rooms, "POST", "/api/rooms", {
    op: "state", code, token: hostToken, version: started.body.room.version,
    actorSeat: hostSeat, state,
    researchDecisions: [{ actor: hostSeat, source: "gameClickEdge", actions: [{ a: "build", kind: "road", id: 3 }],
      before: { schema: 1, policyVersion: "test-policy", game: { phase: "main", hands: { [hostSeat]: { wood: 1, brick: 1 } } } } }]
  });
  assert.equal(saved.status, 200);

  // 公開学習は「AIが人間に負けた完了対局」を既定で抽出するため、勝者まで保存できることを確認する。
  const finishedState = structuredClone(state);
  finishedState.game.phase = "over";
  finishedState.game.turns[0].actions.push({ a: "win", p: hostSeat });
  const finished = await call(rooms, "POST", "/api/rooms", {
    op: "state", code, token: hostToken, version: saved.body.room.version,
    actorSeat: hostSeat, state: finishedState, researchDecisions: []
  });
  assert.equal(finished.status, 200);

  const auth = { authorization: "Bearer local-test-token" };
  const listed = await call(research, "GET", "/api/research?limit=10", null, auth);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.records.length, 1);
  const id = listed.body.records[0].id;
  const exported = await call(research, "GET", `/api/research?id=${id}`, null, auth);
  assert.equal(exported.status, 200);
  assert.equal(exported.body.record.decisions, 1);
  assert.equal(exported.body.record.policyVersion, "test-policy");
  assert.equal(exported.body.record.status, "finished");
  assert.equal(exported.body.record.winner, hostSeat);
  assert.equal(exported.body.record.state.game.turns[0].steps.length, 2);
  const serialized = JSON.stringify(exported.body.record);
  assert(!serialized.includes("秘密の名前"));
  assert(!serialized.includes("相手の名前"));
  assert(!serialized.includes(hostToken));

  const withDecisions = await call(research, "GET", `/api/research?id=${id}&decisions=1`, null, auth);
  assert.equal(withDecisions.status, 200);
  assert.equal(withDecisions.body.decisions.length, 1);
  assert.equal(withDecisions.body.decisions[0].source, "gameClickEdge");
  assert.equal(withDecisions.body.decisions[0].actions[0].kind, "road");
  assert.equal(withDecisions.body.decisions[0].before.game.hands[hostSeat].wood, 1);

  const denied = await call(research, "GET", `/api/research?id=${id}`, null, { authorization: "Bearer wrong" });
  assert.equal(denied.status, 401);
  console.log("✓ 公開対局の匿名保存・保護付き書き出し・逐次行動保持");
})().catch(error => { console.error(error); process.exit(1); });
