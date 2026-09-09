const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const test = String.raw`
render=()=>{}; updateGamePanel=()=>{}; toast=()=>{}; snapshotTurn=()=>{}; glog=()=>{};
numPlayers=4; resetPlacements();
for(let p=1;p<=4;p++) placements[p].cities=new Set();
const emptyHand=()=>({wood:0,brick:0,sheep:0,wheat:0,ore:0});
const emptyDev=()=>({knight:0,vp:0,roads:0,plenty:0,mono:0});
placements[1].settlements=new Set([0,10,14]); placements[1].cities=new Set([7]);
placements[1].roads=new Set([0,1,2,3,4]);
game={order:[1,2,3,4],idx:0,vpToWin:10,phase:"main",
  hands:{1:{wood:4,brick:0,sheep:2,wheat:0,ore:0},2:emptyHand(),3:emptyHand(),4:emptyHand()},
  dev:{deck:["knight","vp","mono"],hands:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},bought:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()},played:{1:emptyDev(),2:emptyDev(),3:emptyDev(),4:emptyDev()}},
  army:{1:1,2:3,3:0,4:0},lr:{holder:2,len:5},la:{holder:2,count:3},robber:0,
  dice:6,rolled:true,devPlayed:false,freeRoads:0,resume:null,discardQueue:[],stealCands:[],ask:null,
  ai:new Set([1]),log:[],turns:[],diceCount:0,rollCount:40,_acts:[],_actionFrames:[],_actionLogMark:0};

// T47型: 木4枚を2:1で麦・鉄へ変え、通常候補比較からカードを購入する。
const realRateFor=rateFor; rateFor=(p,r)=>p===1&&r==="wood"?2:realRateFor(p,r);
const realLongestRoadOf=longestRoadOf; longestRoadOf=p=>p===1?5:realLongestRoadOf(p);
PRIZE_TRADE_DEV_SEATS=new Set([1]); PRIZE_THREAT_SEATS=null; STEAL_PRIZE=false;
ROAD_WIN_SEATS=null; FORCED_WIN_SEATS=null; SETTLE_FLOOR=0; USE_BACKSOLVE=false;
const candidates=computeAdvice().filter(a=>a.can);
if(!candidates[0]||!candidates[0].label.startsWith("交換して発展カード"))throw new Error("交換→発展が首位候補になりません: "+JSON.stringify(candidates.slice(0,3)));
_botMain(1);
if(game.hands[1].wood!==0||Object.values(game.dev.hands[1]).reduce((a,b)=>a+b,0)!==1)throw new Error("交換→発展を完遂しません: "+JSON.stringify({hand:game.hands[1],dev:game.dev.hands[1]}));

// 公開8点では賞防衛を強制せず、公開9点かつ最大脅威の時だけ、賞を移す正確な辺を使う。
game.hands[1]={wood:1,brick:1,sheep:0,wheat:0,ore:0}; game.lr={holder:2,len:5};game.phase="main";
PRIZE_THREAT_SEATS=new Set([1]);PRIZE_EXACT_SEATS=new Set([1]);PRIZE_THREAT_MIN_VP_CFG={1:9};
_rpRouteThreatVector=()=>({2:10,3:1,4:1});_rpArmyShareVector=()=>({});_rwBestExtension=()=>({edges:[17]});
let visible=8,picked=null;_rpVisibleVP=q=>q===2?visible:2;gameClickEdge=id=>{picked=id;};
if(_prizeThreatDefense(1,[])||picked!==null)throw new Error("公開8点で賞防衛を強制しました");
visible=9;if(!_prizeThreatDefense(1,[])||picked!==17)throw new Error("公開9点で正確な賞辺を選べません: "+picked);
console.log("prize-strategy ok:",JSON.stringify({tradeDev:true,public8Forced:false,public9ExactEdge:picked}));
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
