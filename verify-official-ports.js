const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync(require.resolve("./js/engine.js"), "utf8");
const test = String.raw`
const expected=[34,52,68,69,60,28,13,2,18];
if(JSON.stringify(OFFICIAL_PORT_EDGES)!==JSON.stringify(expected))
  throw new Error("公式港位置がずれています: "+JSON.stringify(OFFICIAL_PORT_EDGES));
if(expected.some(eid=>!BOUNDARY.has(eid)))
  throw new Error("公式港に海岸線でない辺があります");
officialPorts();
const actual=Object.keys(ports).map(Number);
const sortedExpected=expected.slice().sort((a,b)=>a-b);
if(JSON.stringify(actual)!==JSON.stringify(sortedExpected))
  throw new Error("生成盤面の港位置が公式配置と違います: "+JSON.stringify(actual));
const count={};for(const type of Object.values(ports))count[type]=(count[type]||0)+1;
if(count["3:1"]!==4||count.wood!==1||count.brick!==1||count.sheep!==1||count.wheat!==1||count.ore!==1)
  throw new Error("港種類の構成が標準セットと違います: "+JSON.stringify(count));
console.log("official-ports ok:",JSON.stringify({edges:actual,count}));
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
