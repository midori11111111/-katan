const fs = require("fs");
const vm = require("vm");

const engine = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const test = String.raw`
render=()=>{};updateGamePanel=()=>{};toast=()=>{};snapshotTurn=()=>{};glog=()=>{};
numPlayers=4;resetPlacements();for(let p=1;p<=4;p++)placements[p].cities=new Set();
const hexes=[
  ["brick",6],["wood",3],["ore",8],["wheat",2],["brick",9],["wood",4],["brick",10],
  ["wood",5],["wheat",10],["ore",11],["wood",5],["desert",null],["wheat",8],
  ["sheep",3],["sheep",6],["sheep",9],["ore",4],["sheep",11],["wheat",12]
];
board={};hexes.forEach((x,i)=>board[i]={resource:x[0],number:x[1]});
ports={4:"wood",9:"brick",12:"3:1",33:"3:1",47:"wheat",52:"3:1",60:"ore",62:"3:1",71:"sheep"};
placements[1].settlements=new Set([39]);placements[1].roads=new Set([55]);
placements[2].settlements=new Set([10]);placements[2].roads=new Set([15]);
placements[3].settlements=new Set([18]);placements[3].roads=new Set([21]);
placements[4].settlements=new Set([26]);placements[4].roads=new Set([31]);
game={setup:{queue:[1,2,3,4,4,3,2,1],step:4,phase:"settle"},setupPairDecision:null};
const B={ranked:[32,1],scores:{32:{pip:11,port:null},1:{pip:11,port:null}}};
const pick=setupPairPick(4,B,32),d=game.setupPairDecision;
if(pick!==1||!d||!d.changed)throw new Error("game37の639回帰に失敗: "+JSON.stringify({pick,d}));
if(d.baseline.hand.ore!==1||d.baseline.hand.sheep!==1||d.chosen.hand.brick!==2||d.chosen.hand.wood!==1)
  throw new Error("2軒目の初期資源がETAへ正しく入っていません");
if(!(d.chosen.p12>d.baseline.p12&&d.chosen.eta10<d.baseline.eta10&&d.chosen.port.p12>d.baseline.port.p12))
  throw new Error("港込みの支配条件が再現できません: "+JSON.stringify(d));
if(!d.chosen.port.liquidity||!game.setupPairIntents[4]||game.setupPairIntents[4].target!==40)
  throw new Error("港の流動性または本編へのsoft intentが保存されていません");
const r4={wood:4,brick:4,sheep:4,wheat:4,ore:4},r3={wood:3,brick:3,sheep:3,wheat:3,ore:3};
const burst=_spLiquidity({},r4,r3,0,{wood:3,brick:0,sheep:2,wheat:2,ore:1});
if(burst.burstEscape!==1||Math.abs(burst.score-burst.p7)>1e-12)throw new Error("4:1→3:1のバースト回避価値を拾えていません");
const r2={...r3,wood:2},special=_spLiquidity({},r3,r2,0,{wood:3,brick:0,sheep:0,wheat:0,ore:0});
if(special.unlock!==1)throw new Error("3:1→2:1の整数行動解禁価値を拾えていません");
game.hands={4:{wood:3,brick:0,sheep:2,wheat:2,ore:1}};game.robber=11;game.rollCount=4;
const intentBonus=_setupIntentBonus(4,40);if(!(intentBonus>0))throw new Error("配置時の港ルートが本編候補へ引き継がれていません");
placements[2].settlements.add(40);const blockedBonus=_setupIntentBonus(4,40);if(blockedBonus!==0||game.setupPairIntents[4])throw new Error("塞がれた港ルートを固定し続けています");
console.log("setup-pair ok:",JSON.stringify({from:d.from,to:d.to,p12:[d.baseline.p12,d.chosen.p12],eta:[d.baseline.eta10,d.chosen.eta10],portP12:[d.baseline.port.p12,d.chosen.port.p12],liquidity:d.chosen.port.liquidity,burst,special,intentBonus,blockedBonus}));
`;

const deterministicMath=Object.create(Math);deterministicMath.random=()=>0.42;
const context={console,setTimeout,clearTimeout,Math:deterministicMath,performance:{now:()=>Date.now()},
  document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({})},window:{addEventListener:()=>{}},Option:function Option(){}};
vm.runInNewContext(engine+"\n"+test,context,{timeout:30000});
