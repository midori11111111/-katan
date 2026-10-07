const fs = require("node:fs");
const vm = require("node:vm");
const { buildSource, paths } = require("./build-setup-learning-model.js");

if (fs.readFileSync(paths.output, "utf8") !== buildSource()) {
  throw new Error("setup-learning-model.js is stale; run npm run build:setup-model");
}

const engine = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const bundle = fs.readFileSync(require.resolve("./js/setup-learning-model.js"), "utf8");
const runtime = fs.readFileSync(require.resolve("./js/setup-learning.js"), "utf8");
const test = String.raw`
render=()=>{};updateGamePanel=()=>{};toast=()=>{};snapshotTurn=()=>{};glog=()=>{};
numPlayers=4;active=1;resetPlacements();
const hexes=[
  ["brick",6],["wood",3],["ore",8],["wheat",2],["brick",9],["wood",4],["brick",10],
  ["wood",5],["wheat",10],["ore",11],["wood",5],["desert",null],["wheat",8],
  ["sheep",3],["sheep",6],["sheep",9],["ore",4],["sheep",11],["wheat",12]
];
board={};hexes.forEach((x,i)=>board[i]={resource:x[0],number:x[1]});
ports={34:"wood",52:"brick",68:"3:1",69:"3:1",60:"wheat",28:"3:1",13:"ore",2:"3:1",18:"sheep"};
game={setup:{queue:[1,2,3,4,4,3,2,1],step:0,phase:"settle"},hands:{},rollCount:0};
for(let p=1;p<=4;p++)game.hands[p]={wood:0,brick:0,sheep:0,wheat:0,ore:0};
const root=computeBest(),baseline=root.ranked[0],first=setupLearnedPick(1,root,baseline);
if(!root.ranked.slice(0,12).includes(first))throw new Error("learned first pick escaped training support");
if(placements[1].settlements.size!==0)throw new Error("first-pick inference mutated placements");
SETUP_LEARNED_ENABLED=false;
if(setupLearnedPick(1,root,baseline)!==baseline)throw new Error("setup-learning rollback flag failed");
SETUP_LEARNED_ENABLED=true;
for(let step=0;step<7;step++){
  game.setup.step=step;const p=game.setup.queue[step],B=computeBest(),v=(step===0?first:B.ranked[0]);
  placements[p].settlements.add(v);
}
game.setup.step=7;active=1;
const finalB=computeBest(),before=JSON.stringify(Object.fromEntries([1,2,3,4].map(p=>[p,[...placements[p].settlements]])));
const second=setupLearnedPick(1,finalB,finalB.ranked[0]);
if(!finalB.ranked.includes(second))throw new Error("learned conditional second pick is illegal");
const after=JSON.stringify(Object.fromEntries([1,2,3,4].map(p=>[p,[...placements[p].settlements]])));
if(before!==after)throw new Error("conditional-second inference mutated placements");
const info=setupLearnedInfo(1);
if(!info.enabled||info.run!==expectedRun||info.blend!==expectedBlend)throw new Error("setup model metadata mismatch");
if(setupLearnedBundle(1)!==SETUP_LEARNED_GENERATIONS[expectedGeneration])throw new Error("wrong generation selected");
SETUP_LEARNED_ENABLED=false;
if(setupLearnedInfo(1).enabled)throw new Error("disabled flag missing from metadata");
console.log("setup-learning ok:",JSON.stringify({baseline,first,second,run:info.run,blend:info.blend,rate:info.evaluation.rate}));
`;

const math = Object.create(Math); math.random = () => 0.42;
const context = {
  console, setTimeout, clearTimeout, Math:math, performance:{now:()=>Date.now()},
  document:{getElementById:()=>null,querySelector:()=>null,createElement:()=>({})},
  window:{addEventListener:()=>{}}, Option:function Option(){}
};
for (const [generation, run, blend] of [
  ["gen0", "2026-09-26T08-00-11-086Z-gen0-e60077", 0.5],
  ["gen1", "2026-09-30T17-15-42-677Z-gen1-96f2da", 1],
  ["gen2", "2026-10-04T18-45-49-385Z-gen2-dd5d05", 0.5]
]) {
  vm.runInNewContext(engine + "\n" + bundle + "\n" + runtime + "\n" + test, {
    ...context, seatAI:{1:generation === "gen0" ? "strong" : generation},
    expectedGeneration:generation, expectedRun:run, expectedBlend:blend
  }, { timeout:30000 });
}
