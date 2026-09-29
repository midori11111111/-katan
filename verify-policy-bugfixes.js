const fs = require("fs");
const vm = require("vm");

const engine = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const app = fs.readFileSync(require.resolve("./js/app.js"), "utf8");
const config = app.slice(app.indexOf("function _applyVariant(seat){"), app.indexOf("\nfunction aiStep(){"));
if (!config.startsWith("function _applyVariant") || !config.trimEnd().endsWith("}")) {
  throw new Error("本番AI設定を抽出できません");
}

const test = String.raw`
render=()=>{}; updateGamePanel=()=>{}; toast=()=>{}; snapshotTurn=()=>{}; glog=()=>{};
const emptyHand=()=>({wood:0,brick:0,sheep:0,wheat:0,ore:0});
const emptyDev=()=>({knight:0,vp:0,roads:0,plenty:0,mono:0});
function makeGame(hand){
  return {order:[1,2,3,4],idx:0,vpToWin:10,phase:"main",
    hands:{1:{...emptyHand(),...hand},2:emptyHand(),3:emptyHand(),4:emptyHand()},
    dev:{deck:["knight","vp","mono"],hands:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},bought:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},played:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()}},
    army:{1:0,2:0,3:0,4:0},lr:{holder:null,len:0},la:{holder:null,count:0},robber:18,
    dice:6,rolled:true,devPlayed:false,freeRoads:0,resume:null,discardQueue:[],stealCands:[],ask:null,
    ai:new Set([1,2,3,4]),log:[],turns:[],diceCount:0,rollCount:20,_acts:[],_actionFrames:[],_actionLogMark:0};
}

// 4投以内に6が1回以上出れば都市が完成する局面。7を含む全36通りの確率が保存されること。
numPlayers=4; resetPlacements(); for(let p=1;p<=4;p++)placements[p].cities=new Set();
for(const h of GEO.hexes)board[h.id]={resource:"desert",number:null};
const oreHex=GEO.hexes[0].id, oreVertex=hexVertsG(oreHex)[0];
board[oreHex]={resource:"ore",number:6}; placements[1].settlements=new Set([oreVertex]);
game=makeGame({wheat:2,ore:2}); game.robber=GEO.hexes[1].id;
const got=_pCityByNextTurn(1), expected=1-Math.pow(31/36,4);
if(Math.abs(got-expected)>1e-12)throw new Error("都市到達確率が不正: "+JSON.stringify({got,expected}));

// 本編の建設地評価はUIの選択席(active)ではなく、実際に打っている手番席を使うこと。
// 旧版はactiveがP1のままでもP2〜P4のcomputeAdviceへP1を渡していた。
game=makeGame({}); game.idx=1; game.setup=null; USE_BACKSOLVE=false; FAST_PLAYOUT=false;
resetPlacements(); for(let p=1;p<=4;p++)placements[p].cities=new Set();
placements[2].settlements=new Set([oreVertex]); placements[2].roads=new Set();
active=1; const seenSeats=new Set(), oldVertexModelScore=vertexModelScore;
vertexModelScore=(vid,p)=>{seenSeats.add(p);return oldVertexModelScore(vid,p);};
computeAdvice(); vertexModelScore=oldVertexModelScore;
if(seenSeats.size!==1||!seenSeats.has(2))throw new Error("本編の建設地評価が手番席を見ていません: "+JSON.stringify([...seenSeats]));

// 銀行に不足資源が無い時は、手札上は4:1可能でも「交換で完成」と判定しないこと。
game=makeGame({wood:4,wheat:1,ore:3}); game.hands[2].wheat=18;
if(bankOf("wheat")!==0||_canCompleteByTrade(1,COST.city))throw new Error("銀行切れの麦を交換可能と判定しました");

// 開拓地を5軒使い切った相手を、盗賊評価で「次に家を建てられる」と数えないこと。
resetPlacements();for(let p=1;p<=4;p++)placements[p].cities=new Set();
placements[1].settlements=new Set([0,7,14,20,30]);game=makeGame({});
if(_rpBuildOptions(1).some(x=>x.kind==="settle"))throw new Error("開拓地5軒の相手に家候補を生成しました");

// 無敵AIは最強AIの港・配置設定を全て継承し、探索だけ追加すること。
seatAI={1:"invincible",2:"strong",3:"human",4:"strong"};
_applyVariant(1);
if(!PORT_SYNERGY||!HP1_PORT||!HUMAN_SETUP||!ROBBER_DELAY||ROAD_NEAR_WIN!==false||!ROLLOUT_SEATS||!ROLLOUT_SEATS.has(1)||!DYNAMIC_ROUTE_CFG||!DYNAMIC_ROUTE_CFG[1]){
  throw new Error("無敵AIが最強AIの設定を継承していません");
}

// 街道建設は「木土不足」ではなく、10点ルートのLR支持と相手との競争で使用/温存を切り替える。
game=makeGame({});game.dev.hands[1].roads=1;game.lr={holder:null,len:0};
const oldBackSolve=backSolve,oldLongest=longestRoadOf,oldHasSpot=_dynamicHasSettleSpot;
longestRoadOf=p=>p===1?2:0;_dynamicHasSettleSpot=()=>true;
let rivalEta=30;backSolve=()=>({dynamic:{support:{LR:.9,settle:0},races:{LR:{mine:{eta:8},rival:{q:2,eta:rivalEta}}}}});
if(!_dynamicRoadCardIntent(1).use)throw new Error("勝てる道賞レースで街道建設を温存しました");
rivalEta=1;if(_dynamicRoadCardIntent(1).use)throw new Error("大差で負ける道賞レースへ街道建設を浪費しました");
backSolve=oldBackSolve;longestRoadOf=oldLongest;_dynamicHasSettleSpot=oldHasSpot;

// カード使用後のfreeRoadsも再計画で無料道路として残る。
game=makeGame({});game.freeRoads=2;game.lr={holder:null,len:0};placements[1].roads=new Set([0,1,2]);
const oldExt=_rwBestExtension;_rwBestExtension=()=>({edges:[3,4],len:5});
const freeEta=_dynamicAwardRaceEta(1,1,"LR");_rwBestExtension=oldExt;
if(freeEta.paid!==0||freeEta.eta!==0)throw new Error("街道建設使用後の無料道路を再計画へ引き継げません: "+JSON.stringify(freeEta));

// 8点になるだけの道賞を通常評価より先に強制しない。確定10点経路は後段で別に検証する。
resetPlacements(); for(let p=1;p<=4;p++)placements[p].cities=new Set();
placements[1].settlements=new Set([0,7,10,14]);placements[1].cities=new Set([20]);placements[1].roads=new Set([0,1,2,3]);
game=makeGame({wood:1,brick:1});game.lr={holder:2,len:5};
const oldAffordable=_rwAffordableRoads,oldExtension=_rwBestExtension,oldBuildPlans=_rwWinningBuildPlans,oldP2=_rwP2VPNextTurn,oldOpp=_rwOppCanExceed;
_rwAffordableRoads=()=>({n:1});_rwBestExtension=()=>({edges:[17],len:6});_rwWinningBuildPlans=()=>[];_rwP2VPNextTurn=()=>1;_rwOppCanExceed=()=>false;
ROAD_WIN_SEATS=new Set([1]);ROAD_NEAR_WIN=false;
if(_roadWinRule(1))throw new Error("道賞で8点になる旧条件が強制発火しました");
_rwAffordableRoads=oldAffordable;_rwBestExtension=oldExtension;_rwWinningBuildPlans=oldBuildPlans;_rwP2VPNextTurn=oldP2;_rwOppCanExceed=oldOpp;

// 終局プレイアウトでは、実戦と同じ確定10点探索を使えること。
resetPlacements(); for(let p=1;p<=4;p++)placements[p].cities=new Set();
placements[1].settlements=new Set([0,7,10]); placements[1].cities=new Set([14,20]);
placements[1].roads=new Set([0,1,2,3]); game=makeGame({wood:1,brick:1,wheat:2,ore:3}); game.dev.deck=[];
ROAD_WIN_SEATS=new Set([1]); FORCED_WIN_SEATS=new Set([1]); USE_BACKSOLVE=false;
CITY_FOCUS=false; AGGRO_TRADE=false; STEAL_PRIZE=false; _rwP2VPNextTurn=()=>0;
_inPlayout=true; _allowForcedWinInPlayout=true;
if(!_forcedWinRule(1)||game.phase!=="over"||vpOf(1)!==10)throw new Error("終局プレイアウトが確定勝ちを取り切れません");

console.log("policy-bugfixes ok:",JSON.stringify({cityBy4:got,expected,mainSeat:[...seenSeats],bankShortage:false,invincibleInherited:true,dynamicRoute:true,roadCardRace:true,freeRoadsCarried:true,nearWinForced:false,playoutForcedWin:true}));
`;

const deterministicMath = Object.create(Math);
deterministicMath.random = () => 0.42;
const context = {
  console, setTimeout, clearTimeout, Math: deterministicMath,
  performance: { now: () => Date.now() },
  document: { getElementById: () => null, querySelector: () => null, createElement: () => ({}) },
  window: { addEventListener: () => {} }, Option: function Option() {},
  seatAI: {1:"strong",2:"strong",3:"human",4:"strong"}
};
vm.runInNewContext(engine + "\n" + config + "\n" + test, context, { timeout: 30000 });

const multiplayer = fs.readFileSync(require.resolve("./js/multiplayer.js"), "utf8");
if (!multiplayer.includes('policyVersion: "20260929a"')) throw new Error("研究データの方策版が古いままです");
