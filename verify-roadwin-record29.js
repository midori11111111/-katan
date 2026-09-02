const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const test = String.raw`
render=()=>{}; updateGamePanel=()=>{}; toast=()=>{}; snapshotTurn=()=>{};
numPlayers=4; resetPlacements();
for(let p=1;p<=4;p++) placements[p].cities=new Set();

// game_record (28)/(29) の同一対局、ターン77のダイス8直後を完全再現する。
// P1は8点。木6/土0/羊2/麦4/鉄6から港・銀行交換を重ね、
// 道を3本つないで道賞を取り10点へ到達できる。
board={
  0:{resource:"wood",number:6}, 1:{resource:"ore",number:3}, 2:{resource:"ore",number:8},
  3:{resource:"sheep",number:2}, 4:{resource:"desert",number:null}, 5:{resource:"sheep",number:4},
  6:{resource:"sheep",number:10}, 7:{resource:"wheat",number:5}, 8:{resource:"sheep",number:9},
  9:{resource:"ore",number:11}, 10:{resource:"brick",number:5}, 11:{resource:"wheat",number:9},
  12:{resource:"wheat",number:10}, 13:{resource:"brick",number:3}, 14:{resource:"wood",number:6},
  15:{resource:"brick",number:12}, 16:{resource:"wood",number:8}, 17:{resource:"wheat",number:4},
  18:{resource:"wood",number:11}
};
ports={4:"3:1",9:"ore",12:"3:1",33:"brick",47:"sheep",52:"wheat",60:"3:1",62:"3:1",71:"wood"};

const put=(kind,map)=>{ for(const [id,p] of Object.entries(map)) placements[p][kind].add(Number(id)); };
put("settlements",{17:2,30:2,32:2,35:3,37:3,39:3,40:3,51:1});
put("cities",{7:1,11:4,13:4,22:3,26:2,42:4,48:1});
put("roads",{7:1,8:4,12:4,13:4,14:4,20:2,27:3,31:2,32:2,36:3,39:2,41:2,43:3,47:3,48:3,49:3,50:3,52:3,53:4,66:1,68:1});

const emptyDev=()=>({knight:0,vp:0,roads:0,plenty:0,mono:0});
game={order:[1,2,3,4],idx:0,vpToWin:10,phase:"main",
  hands:{
    1:{wood:6,brick:0,sheep:2,wheat:4,ore:6},
    2:{wood:0,brick:0,sheep:1,wheat:2,ore:0},
    3:{wood:1,brick:0,sheep:0,wheat:1,ore:0},
    4:{wood:1,brick:1,sheep:0,wheat:3,ore:6}
  },
  dev:{deck:[],hands:{1:{knight:0,vp:3,roads:0,plenty:0,mono:0},2:emptyDev(),3:emptyDev(),4:emptyDev()},
    bought:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},played:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()}},
  army:{1:0,2:0,3:0,4:0},lr:{holder:null,len:0},la:{holder:null,count:0},robber:10,
  dice:8,rolled:true,devPlayed:false,freeRoads:0,resume:null,discardQueue:[],stealCands:[],ask:null,
  ai:new Set([1]),log:[],turns:[],diceCount:0,rollCount:77,_acts:[],_actionFrames:[],_actionLogMark:0};
updateLongestRoad();
ROAD_WIN_SEATS=new Set([1]); USE_BACKSOLVE=false; CITY_FOCUS=false; AGGRO_TRADE=false; STEAL_PRIZE=false;

const before={vp:vpOf(1),roads:longestRoadOf(1),holder:game.lr.holder,hand:Object.assign({},game.hands[1]),roadCount:placements[1].roads.size};
const forced=_roadWinRule(1);
const after={vp:vpOf(1),roads:longestRoadOf(1),holder:game.lr.holder,phase:game.phase,
  hand:Object.assign({},game.hands[1]),roadCount:placements[1].roads.size};
const actions=game._acts||[];
const trades=actions.filter(a=>a.a==="trade");
const roads=actions.filter(a=>a.a==="build"&&a.kind==="road");
if(!forced || before.vp!==8 || before.roads!==2 || before.holder!==null || after.vp!==10 ||
   after.roads<5 || after.holder!==1 || after.phase!=="over" || after.roadCount-before.roadCount!==3 ||
   trades.length<3 || roads.length!==3){
  throw new Error("実戦棋譜29の交換→道賞10点を完遂できませんでした: "+JSON.stringify({forced,before,after,actions,log:game.log}));
}
console.log("roadwin-record29 ok:",JSON.stringify({before,after,trades,roads,log:game.log.map(x=>x.msg)}));
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
