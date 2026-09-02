const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("./js/multiplayer.js"), "utf8");
const prelude = String.raw`
let applyLang=()=>{}, seatAiName=p=>"P"+p, isHuman=()=>false, aiMaybeGo=()=>{}, aiStep=()=>{};
let gameClickVertex=()=>{}, gameClickEdge=()=>{}, gameClickHex=()=>{}, doRoll=()=>{}, buyDev=()=>{};
let playDev=()=>{}, resolvePlenty=()=>{}, resolveMono=()=>{}, doTrade=()=>{}, endTurnGame=()=>{};
let stealFrom=()=>{}, humanDiscard=()=>{};
let _inPlayout=false, numPlayers=4, humanSeat=1, seatKind={}, seatAI={};
let board={0:{resource:"desert",number:null}}, ports={};
let placements={};
for(let p=1;p<=4;p++) placements[p]={settlements:new Set(),cities:new Set(),roads:new Set()};
let game={phase:"discard",order:[1,2,3,4],idx:0,
  discardQueue:[{p:2,need:1}],hands:{1:{},2:{wood:1},3:{},4:{}},ai:new Set([2,3,4]),
  turns:[{privateHistory:true}],log:[{msg:"秘密ログ"}],_acts:[{a:"old"}],_actionFrames:[{old:true}]};
const cur=()=>game.order[game.idx];
_botDiscard=()=>{game.hands[2].wood--;game.discardQueue.shift();game.phase="robber";};
`;
const test = String.raw`
MP.active=true; MP.applying=false; MP.host=true; MP.seat=1;
MP.room={aiSeats:[2,3,4],humanCount:1,members:{1:{name:"host"}}};
const published=[];
mpQueuePublish=(actor,source,researchDecision)=>published.push({actor,source,phase:game.phase,researchDecision});
mpInstallHooks();
_botDiscard();
if(published.length!==1 || published[0].actor!==2 || published[0].source!=="_botDiscard" || published[0].phase!=="robber"){
  throw new Error("AI捨て札が同期キューへ入っていません: "+JSON.stringify(published));
}
const rd=published[0].researchDecision;
if(!rd || rd.actor!==2 || rd.before.game.phase!=="discard" || rd.actions[0].a!=="invoke"){
  throw new Error("行動直前の研究判断が同期キューへ入りません: "+JSON.stringify(rd));
}
if(rd.before.game.turns || rd.before.game.log || rd.before.game._acts || rd.before.game._actionFrames){
  throw new Error("研究判断に表示用の重い履歴が混入しています: "+JSON.stringify(rd.before.game));
}
console.log("multiplayer-robber-sync ok:",JSON.stringify(published[0]));
`;

const context = {
  console, setTimeout, clearTimeout, URL, URLSearchParams,
  window:{addEventListener(){}}, document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({})},
  location:{hostname:"localhost",search:"",origin:"http://localhost",pathname:"/"},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}, history:{replaceState(){}}, navigator:{}
};
vm.runInNewContext(prelude + "\n" + source + "\n" + test, context, { timeout: 30000 });
