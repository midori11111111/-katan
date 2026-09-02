const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const test = String.raw`
render=()=>{}; updateGamePanel=()=>{}; toast=()=>{}; snapshotTurn=()=>{};
numPlayers=4;
const emptyHand=()=>({wood:0,brick:0,sheep:0,wheat:0,ore:0});
const emptyDev=()=>({knight:0,vp:0,roads:0,plenty:0,mono:0});

function trailOf(n){
  const byV={};
  for(const e of GEO.edges){ (byV[e.a]=byV[e.a]||[]).push(e); (byV[e.b]=byV[e.b]||[]).push(e); }
  let answer=null;
  const dfs=(v,used,path)=>{
    if(path.length===n){ answer=path.slice(); return true; }
    for(const e of byV[v]||[]){
      if(used.has(e.id)) continue;
      used.add(e.id); path.push(e.id);
      if(dfs(e.a===v?e.b:e.a,used,path)) return true;
      path.pop(); used.delete(e.id);
    }
    return false;
  };
  for(const vS of Object.keys(byV)) if(dfs(Number(vS),new Set(),[])) break;
  if(!answer) throw new Error("5本道を作れる経路がありません");
  return answer;
}
const trail=trailOf(5);

function setup(kind){
  resetPlacements(); for(let p=1;p<=4;p++) placements[p].cities=new Set();
  placements[1].settlements=kind==="settle"?new Set([20]):new Set();
  placements[1].cities=kind==="settle"?new Set([0,7,14]):new Set([0,7,14,20]);
  placements[1].roads=new Set(kind==="multi"?[trail[0]]:trail.slice(0,4));
  const hands={1:emptyHand(),2:emptyHand(),3:emptyHand(),4:emptyHand()};
  const devHands={1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()};
  if(kind==="multi"){ hands[1].wood=2; hands[1].brick=2; devHands[1].roads=1; }
  if(kind==="trade") hands[1].sheep=8;
  if(kind==="plenty") devHands[1].plenty=1;
  if(kind==="mono"){ hands[1].wood=1; hands[2].brick=1; devHands[1].mono=1; }
  if(kind==="settle"){ hands[1].wood=2; hands[1].brick=2; hands[1].sheep=1; hands[1].wheat=1; }
  if(kind==="knight"){ hands[1].wood=1; hands[1].brick=1; devHands[1].knight=1; }
  if(kind==="knightsettle"){ hands[1].wood=2; hands[1].brick=2; hands[1].sheep=1; hands[1].wheat=1; devHands[1].knight=1; }
  if(kind==="knightcity"){ hands[1].wood=1; hands[1].brick=1; hands[1].wheat=2; hands[1].ore=3; devHands[1].knight=1; }
  game={order:[1,2,3,4],idx:0,vpToWin:10,phase:"main",hands,
    dev:{deck:[],hands:devHands,bought:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},played:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()}},
    army:{1:kind.startsWith("knight")?2:0,2:0,3:0,4:0},lr:{holder:null,len:0},la:{holder:null,count:0},robber:0,
    dice:6,rolled:true,devPlayed:false,freeRoads:0,resume:null,discardQueue:[],stealCands:[],ask:null,
    ai:new Set([1]),log:[],turns:[],diceCount:0,rollCount:20,_acts:[],_actionFrames:[],_actionLogMark:0};
  ROAD_WIN_SEATS=new Set([1]); USE_BACKSOLVE=false; CITY_FOCUS=false; AGGRO_TRADE=false; STEAL_PRIZE=false;
}

for(const kind of ["multi","trade","plenty","mono","settle","knight","knightsettle","knightcity"]){
  setup(kind);
  if(kind==="knight"){
    placements[1].cities=new Set([0,7,14]);             // 6点。騎士賞+2、道賞+2で10点
    placements[1].roads=new Set(trail.slice(0,4));
  }
  if(kind==="knightsettle"){
    placements[1].cities=new Set([0,7]);
    placements[1].settlements=new Set([20]);            // 5点。騎士賞+2、開拓地+1、道賞+2で10点
    placements[1].roads=new Set(trail.slice(0,4));
  }
  if(kind==="knightcity"){
    placements[1].cities=new Set([0,7]);
    placements[1].settlements=new Set([20]);            // 5点。騎士賞+2、都市化+1、道賞+2で10点
    placements[1].roads=new Set(trail.slice(0,4));
  }
  const before={vp:vpOf(1),roads:longestRoadOf(1)};
  const forced=_roadWinRule(1);
  if(!forced){
    const aff=_rwAffordableRoads(1), target=game.lr.holder?game.lr.len+1:5;
    const rp=_rwBestExtension(1,aff.n,target); let bp=[];
    if(rp){ for(const eid of rp.edges) placements[1].roads.add(eid); bp=_rwWinningBuildPlans(1); for(const eid of rp.edges) placements[1].roads.delete(eid); }
    throw new Error(kind+" の確定勝ち手順を直接検出できませんでした: "+JSON.stringify({aff,rp,bp,funds:bp.map(x=>_rwFundingPlan(1,rp.edges.length,x.cost)),hand:game.hands[1]}));
  }
  if(kind.startsWith("knight")&&game.phase==="robber") gameClickHex(GEO.hexes.find(h=>h.id!==game.robber).id);
  if(kind.startsWith("knight")&&game.phase==="main"&&!_roadWinRule(1)) throw new Error(kind+" の騎士賞後に道賞を完遂できませんでした");
  if(game.phase==="main") _botMain(1);
  const after={vp:vpOf(1),roads:longestRoadOf(1),holder:game.lr.holder,phase:game.phase};
  const expectedBefore=kind==="settle"?7:(kind==="knight"?6:(kind.startsWith("knight")?5:8));
  if(before.vp!==expectedBefore || after.vp!==10 || after.roads<5 || after.holder!==1 || after.phase!=="over")
    throw new Error(kind+" で道賞即勝ちを取り切れませんでした: "+JSON.stringify({before,after,log:game.log}));
  console.log("roadwin "+kind+" ok:",JSON.stringify({before,after,log:game.log.map(x=>x.msg)}));
}
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
