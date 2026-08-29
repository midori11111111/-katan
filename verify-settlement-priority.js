const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const test = String.raw`
render=()=>{}; updateGamePanel=()=>{}; toast=()=>{}; snapshotTurn=()=>{};
numPlayers=4; resetPlacements();
for(let p=1;p<=4;p++) placements[p].cities=new Set();

// P2は既に目標の家2軒を持つが、道0の先（頂点0）にも合法な家を建てられる。
// 手札は家ちょうど1組。旧ロジックは高得点の道1を先に選んで木土を使い切り、家を逃した。
placements[2].settlements=new Set([20,30]);
placements[2].roads=new Set([0]);
const emptyHand=()=>({wood:0,brick:0,sheep:0,wheat:0,ore:0});
const emptyDev=()=>({knight:0,vp:0,roads:0,plenty:0,mono:0});
game={order:[1,2,3,4],idx:1,vpToWin:10,phase:"main",
  hands:{1:emptyHand(),2:{wood:1,brick:1,sheep:1,wheat:1,ore:0},3:emptyHand(),4:emptyHand()},
  dev:{deck:[],hands:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},bought:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},played:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()}},
  army:{1:0,2:0,3:0,4:0},lr:{holder:null,len:0},la:{holder:null,count:0},robber:0,
  dice:6,rolled:true,devPlayed:false,freeRoads:0,resume:null,discardQueue:[],stealCands:[],ask:null,
  ai:new Set([2]),log:[],turns:[],diceCount:0,rollCount:20,_acts:[],_actionFrames:[],_actionLogMark:0};
ROAD_WIN_SEATS=null; AGGRO_TRADE=true; STEAL_PRIZE=false; USE_BACKSOLVE=false;

// 実際に起きていた競合を固定再現: 道の評価が家より高い。
computeAdvice=()=>[
  {score:100,can:canPay(2,COST.road),target:{type:"edge",id:1},label:"道を伸ばす（すぐ建設地が開く）",cost:"木+レンガ"},
  {score:10,can:canPay(2,COST.settlement),target:{type:"vertex",id:0},label:"開拓地を建てる（産出の母体を増やす）",cost:"木+レンガ+羊+小麦"},
  {score:0.5,can:true,target:null,label:"ターン終了（次の大きな一手へ資源を温存）",cost:""}
];

_botMain(2);
if(!placements[2].settlements.has(0) || placements[2].roads.has(1)){
  throw new Error("完成済みの開拓地より道を先に建てました: "+JSON.stringify({sett:[...placements[2].settlements],roads:[...placements[2].roads],hand:game.hands[2]}));
}
console.log("settlement-priority ok:", JSON.stringify({sett:[...placements[2].settlements],roads:[...placements[2].roads],hand:game.hands[2]}));
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
