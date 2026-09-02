const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const test = String.raw`
render=()=>{}; updateGamePanel=()=>{}; toast=()=>{}; snapshotTurn=()=>{};
numPlayers=4;
const emptyHand=()=>({wood:0,brick:0,sheep:0,wheat:0,ore:0});
const emptyDev=()=>({knight:0,vp:0,roads:0,plenty:0,mono:0});

function fresh(){
  resetPlacements(); for(let p=1;p<=4;p++) placements[p].cities=new Set();
  const hands={1:emptyHand(),2:emptyHand(),3:emptyHand(),4:emptyHand()};
  const devHands={1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()};
  game={order:[1,2,3,4],idx:0,vpToWin:10,phase:"main",hands,
    dev:{deck:[],hands:devHands,bought:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},played:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()}},
    army:{1:0,2:0,3:0,4:0},lr:{holder:null,len:0},la:{holder:null,count:0},robber:0,
    dice:6,rolled:true,devPlayed:false,freeRoads:0,resume:null,discardQueue:[],stealCands:[],ask:null,
    ai:new Set([1]),log:[],turns:[],diceCount:0,rollCount:20,_acts:[],_actionFrames:[],_actionLogMark:0};
  ROAD_WIN_SEATS=new Set([1]); FORCED_WIN_SEATS=new Set([1]); USE_BACKSOLVE=false; CITY_FOCUS=false; AGGRO_TRADE=false; STEAL_PRIZE=false;
}
function assertWin(kind,before){
  const after={vp:vpOf(1),phase:game.phase,roads:placements[1].roads.size,settles:placements[1].settlements.size,cities:placements[1].cities.size};
  if(before!==undefined&&before.vp!==before.expected) throw new Error(kind+" の開始点が不正: "+JSON.stringify(before));
  if(after.vp!==10||after.phase!=="over") throw new Error(kind+" の確定10点を完遂できませんでした: "+JSON.stringify({before,after,log:game.log}));
  console.log("forcedwin "+kind+" ok:",JSON.stringify({before,after,log:game.log.map(x=>x.msg)}));
}

// 通常評価を一切介さず、同一ターンに都市を2軒連続で建てて8→10点。
fresh();
placements[1].cities=new Set([0,7]); placements[1].settlements=new Set([14,20]);
game.dev.hands[1].vp=2; game.hands[1]={wood:0,brick:0,sheep:0,wheat:4,ore:6};
let before={vp:vpOf(1),expected:8};
if(!_forcedWinRule(1)) throw new Error("two-cities を検出できませんでした");
assertWin("two-cities",before);

// 収穫の資源選択まで含め、都市化して9→10点。
fresh();
placements[1].cities=new Set([0,7]); placements[1].settlements=new Set([14,20]);
game.dev.hands[1].vp=3; game.dev.hands[1].plenty=1; game.hands[1]={wood:0,brick:0,sheep:0,wheat:1,ore:2};
before={vp:vpOf(1),expected:9};
if(!_forcedWinRule(1)) throw new Error("plenty-city を検出できませんでした");
assertWin("plenty-city",before);

// 騎士賞だけでは9点。盗賊後に都市化する確定列を保持して10点。
fresh();
placements[1].cities=new Set([0,7]); placements[1].settlements=new Set([14]);
game.dev.hands[1].vp=2; game.dev.hands[1].knight=1; game.army[1]=2;
game.hands[1]={wood:0,brick:0,sheep:0,wheat:2,ore:3};
before={vp:vpOf(1),expected:7};
if(!_forcedWinRule(1)||game.phase!=="robber") throw new Error("knight-city の騎士を検出できませんでした");
gameClickHex(GEO.hexes.find(h=>h.id!==game.robber).id);
if(game.phase==="main"&&!_forcedWinRule(1)) throw new Error("knight-city の都市化を完遂できませんでした");
assertWin("knight-city",before);

// 道賞とは無関係でも、道を1本先に伸ばして開いた頂点へ家を建てれば9→10点になる。
fresh();
let path=null;
for(const e1 of GEO.edges){
  for(const e2 of GEO.edges){
    if(e1.id===e2.id) continue;
    const shared=[e1.a,e1.b].find(v=>v===e2.a||v===e2.b); if(shared==null) continue;
    const start=e1.a===shared?e1.b:e1.a, end=e2.a===shared?e2.b:e2.a;
    if(start!==end && !(GEO.vertex_neighbors[start]||[]).includes(end)){ path={start,end,e1:e1.id,e2:e2.id}; break; }
  }
  if(path) break;
}
if(!path) throw new Error("2辺経路を作れませんでした");
placements[1].settlements=new Set([path.start]); placements[1].cities=new Set([10,20,30,40]);
placements[1].roads=new Set([path.e1]); game.hands[1]={wood:2,brick:2,sheep:1,wheat:1,ore:0};
before={vp:vpOf(1),expected:9};
if(!_forcedWinRule(1)) throw new Error("road-settlement を検出できませんでした");
assertWin("road-settlement",before);

// 収穫で銀行の麦2枚を取り切った後、同じ銀行在庫から交換で3枚目の麦を
// 得ることはできない。銀行在庫を二重計上した実行不能プランを拒否する。
fresh();
game.dev.hands[1].plenty=1;
game.hands[1].sheep=4;
game.hands[2].wheat=17; // 銀行の麦は残り2枚
const impossibleFunding=_rwFundingPlan(1,0,{wheat:3});
if(impossibleFunding) throw new Error("収穫後の銀行在庫を二重計上しています: "+JSON.stringify(impossibleFunding));
console.log("forcedwin bank-reservation ok");
`;

const deterministicMath = Object.create(Math);
deterministicMath.random = () => 0.42;
const context = {
  console, setTimeout, clearTimeout, Math: deterministicMath,
  performance: { now: () => Date.now() },
  document: { getElementById: () => null, querySelector: () => null, createElement: () => ({}) },
  window: { addEventListener: () => {} }, Option: function Option() {}
};
vm.runInNewContext(source + "\n" + test, context, { timeout: 30000 });
