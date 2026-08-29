const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const test = String.raw`
render=()=>{}; updateGamePanel=()=>{}; toast=()=>{}; snapshotTurn=()=>{};
numPlayers=4; resetPlacements();
for(let p=1;p<=4;p++) placements[p].cities=new Set();

// P1は7点・一筆4本。都市化後も木土1組が残り、1本道で道賞＝10点になる。
placements[1].settlements=new Set([0,7,10]);
placements[1].cities=new Set([14,20]);
placements[1].roads=new Set([0,1,2,3]);
const emptyHand=()=>({wood:0,brick:0,sheep:0,wheat:0,ore:0});
const emptyDev=()=>({knight:0,vp:0,roads:0,plenty:0,mono:0});
game={order:[1,2,3,4],idx:0,vpToWin:10,phase:"main",
  hands:{1:{wood:1,brick:1,sheep:0,wheat:2,ore:3},2:emptyHand(),3:emptyHand(),4:emptyHand()},
  dev:{deck:[],hands:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},bought:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},played:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()}},
  army:{1:0,2:0,3:0,4:0},lr:{holder:null,len:0},la:{holder:null,count:0},robber:0,
  dice:6,rolled:true,devPlayed:false,freeRoads:0,resume:null,discardQueue:[],stealCands:[],ask:null,
  ai:new Set([1]),log:[],turns:[],diceCount:0,rollCount:20,_acts:[],_actionFrames:[],_actionLogMark:0};
ROAD_WIN_SEATS=new Set([1]); USE_BACKSOLVE=false; CITY_FOCUS=true; AGGRO_TRADE=false; STEAL_PRIZE=false;
_rwP2VPNextTurn=()=>0; // 7点時点では条件付き9点取りを発動させない

const before={vp:vpOf(1),roads:longestRoadOf(1)};
_botMain(1);
const after={vp:vpOf(1),roads:longestRoadOf(1),holder:game.lr.holder,phase:game.phase,cities:placements[1].cities.size};
if(before.vp!==7 || before.roads!==4 || after.vp!==10 || after.roads!==5 || after.holder!==1 || after.phase!=="over" || after.cities!==3){
  throw new Error("都市化後に道賞即勝ちを取り切れませんでした: "+JSON.stringify({before,after}));
}
console.log("roadwin-midturn ok:", JSON.stringify({before,after,log:game.log.map(x=>x.msg)}));
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
