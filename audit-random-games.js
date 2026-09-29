const fs = require("fs");
const vm = require("vm");

const engine = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const setupModel = fs.readFileSync(require.resolve("./js/setup-learning-model.js"), "utf8");
const setupRuntime = fs.readFileSync(require.resolve("./js/setup-learning.js"), "utf8");
const app = fs.readFileSync(require.resolve("./js/app.js"), "utf8");
const config = app.slice(app.indexOf("function _applyVariant(seat){"), app.indexOf("\nfunction aiStep(){"));
const games = Math.max(1, Number(process.argv[2] || 100));
const seed = (Number(process.env.SEED || 202609081) >>> 0) || 1;

const audit = String.raw`
render=()=>{}; updateGamePanel=()=>{}; toast=()=>{}; snapshotTurn=()=>{}; glog=()=>{};
const emptyHand=()=>({wood:0,brick:0,sheep:0,wheat:0,ore:0});
const emptyDev=()=>({knight:0,vp:0,roads:0,plenty:0,mono:0});
function auditState(tag){
  const fail=m=>{throw new Error(tag+": "+m);};
  if(!["setup","roll","discard","robber","steal","main","over"].includes(game.phase))fail("unknown phase "+game.phase);
  for(const r of RES5){const b=bankOf(r);if(!Number.isInteger(b)||b<0||b>19)fail("bank "+r+"="+b);}
  const occupied=new Map(),roadOwner=new Map();
  for(let p=1;p<=4;p++){
    if(placements[p].settlements.size>5||placements[p].cities.size>4||placements[p].roads.size>15)fail("piece cap P"+p);
    for(const r of RES5){const n=game.hands[p][r];if(!Number.isInteger(n)||n<0)fail("hand P"+p+" "+r+"="+n);}
    for(const v of placements[p].settlements){if(occupied.has(v))fail("duplicate building "+v);occupied.set(v,p);}
    for(const v of placements[p].cities){if(occupied.has(v))fail("duplicate building "+v);occupied.set(v,p);}
    for(const e of placements[p].roads){if(!GEO.edges[e])fail("bad edge "+e);if(roadOwner.has(e))fail("duplicate road "+e);roadOwner.set(e,p);}
  }
  for(const [v] of occupied)for(const n of GEO.vertex_neighbors[v])if(occupied.has(n))fail("adjacent buildings "+v+"/"+n);
  const lens={};for(let p=1;p<=4;p++)lens[p]=longestRoadOf(p);
  if(game.lr.holder){const h=game.lr.holder;if(lens[h]<5||game.lr.len!==lens[h])fail("bad longest-road holder");for(let p=1;p<=4;p++)if(p!==h&&lens[p]>lens[h])fail("longer opponent without award");}
  const armies=game.army;if(game.la.holder){const h=game.la.holder;if(armies[h]<3||game.la.count!==armies[h])fail("bad largest-army holder");for(let p=1;p<=4;p++)if(p!==h&&armies[p]>armies[h])fail("larger army without award");}
  let devN=game.dev.deck.length;for(let p=1;p<=4;p++)for(const k of ["knight","vp","roads","plenty","mono"])devN+=game.dev.hands[p][k]+game.dev.played[p][k];
  if(devN!==25)fail("development deck conservation="+devN);
}
function initGame(){
  randomBoard();randomPorts();numPlayers=4;resetPlacements();for(let p=1;p<=4;p++)placements[p].cities=new Set();
  const hands={},dev={deck:newDevDeck(),hands:{},bought:{},played:{}},army={};
  for(let p=1;p<=4;p++){hands[p]=emptyHand();dev.hands[p]=emptyDev();dev.bought[p]=emptyDev();dev.played[p]=emptyDev();army[p]=0;}
  const desert=GEO.hexes.find(h=>board[h.id].resource==="desert");
  game={order:[1,2,3,4],idx:0,vpToWin:10,hands,dev,army,lr:{holder:null,len:0},la:{holder:null,count:0},robber:desert.id,
    dice:null,rolled:false,devPlayed:false,freeRoads:0,resume:null,discardQueue:[],stealCands:[],ask:null,ai:new Set([1,2,3,4]),
    log:[],turns:[],diceCount:0,rollCount:0,_acts:[],_actionFrames:[],_actionLogMark:0,
    setup:{queue:[1,2,3,4,4,3,2,1],step:0,phase:"settle",lastSettle:null},phase:"setup"};
}
function playOne(g){
  initGame();let guard=0;
  while(game.phase==="setup"&&guard++<40){const p=game.setup.queue[game.setup.step];_applyVariant(p);active=p;
    if(game.setup.phase==="settle"){const B=computeBest(),v=setupLearnedPick(p,B,B.ranked[0]);if(v==null||occupantOf(v))throw new Error("game "+g+": no setup vertex");gameClickVertex(v);}
    else{const rr=bestRoadFrom(game.setup.lastSettle,true,p);const e=rr.length?rr[0].eid:GEO.edges.find(e=>!ownerOf("roads",e.id)&&(e.a===game.setup.lastSettle||e.b===game.setup.lastSettle)).id;gameClickEdge(e);}
    auditState("game "+g+" setup");
  }
  if(game.phase!=="roll")throw new Error("game "+g+": setup stalled");
  for(let step=0;step<5000&&game.phase!=="over";step++){
    const p=cur();_applyVariant(p);
    if(game.phase==="roll"){if(_shouldPlayKnight(p))playDev("knight");if(game.phase==="roll")doRoll(null);}
    if(game.phase==="discard"){while(game.discardQueue.length)_botDiscard();}
    if(game.phase==="robber"){const ra=robberAdvice();gameClickHex(ra?ra.hid:GEO.hexes.find(h=>h.id!==game.robber).id);}
    if(game.phase==="steal")stealFrom(bestStealTarget(game.stealCands));
    if(game.phase==="main"){_botMain(p);_cleanupTurn(p);if(game.phase==="main")endTurnGame();}
    auditState("game "+g+" step "+step);
  }
  if(game.phase!=="over")throw new Error("game "+g+": did not finish after "+(game.rollCount||0)+" rolls");
  return {winner:cur(),rolls:game.rollCount||0};
}
const out={games:__GAMES,wins:[0,0,0,0,0],maxRolls:0,totalRolls:0};
for(let g=0;g<__GAMES;g++){const z=playOne(g);out.wins[z.winner]++;out.maxRolls=Math.max(out.maxRolls,z.rolls);out.totalRolls+=z.rolls;}
out.meanRolls=out.totalRolls/out.games;console.log("random-game audit ok:",JSON.stringify(out));
`;

let state = seed;
const deterministicMath = Object.create(Math);
deterministicMath.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
const context = {
  console, setTimeout, clearTimeout, Math: deterministicMath,
  performance: { now: () => Date.now() }, __GAMES: games,
  document: { getElementById: () => null, querySelector: () => null, createElement: () => ({}) },
  window: { addEventListener: () => {} }, Option: function Option() {},
  seatAI: {1:"strong",2:"strong",3:"strong",4:"strong"}
};
// 強いAI同士は1局あたり約8〜12秒かかる。試合数を増やした監査が
// VMの固定上限で偽陰性にならないよう、余裕を持って線形に伸ばす。
vm.runInNewContext(engine + "\n" + setupModel + "\n" + setupRuntime + "\n" + config + "\n" + audit, context, { timeout: Math.max(60000, games * 15000) });
