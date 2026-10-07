// Import final, promotion-approved research artifacts without publishing research data.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const [generation, runArg] = process.argv.slice(2);
if (!["gen1", "gen2"].includes(generation) || !runArg) {
  throw new Error("Usage: node import-setup-generation.js gen1|gen2 /absolute/run");
}
const run = path.resolve(runArg);
const read = name => JSON.parse(fs.readFileSync(path.join(run, name), "utf8"));
const promotion = read("promotion.json"), combined = read("combined-models.json");
if (!promotion.pass || !promotion.confirm || promotion.confirm.blend !== promotion.selectedBlend) {
  throw new Error("Generation has not passed final confirmation");
}
const models = {};
for (const [kind, hashKey] of [["action", "actionModelHash"], ["complete", "completeModelHash"]]) {
  const raw = fs.readFileSync(path.join(run, `${kind}-model.json`));
  if (crypto.createHash("sha256").update(raw).digest("hex") !== combined[hashKey]) {
    throw new Error(`${kind} model differs from confirmed artifact`);
  }
  models[kind] = JSON.parse(raw);
}
const c = promotion.confirm;
const meta = {
  version: 1, generation, run: path.basename(run), enabled: true,
  blend: promotion.selectedBlend, policy: "first-placement-plus-p1-conditional-second",
  actionModelHash: combined.actionModelHash, completeModelHash: combined.completeModelHash,
  evaluation: { opponent: "nonlearned-setup-baseline", format: "2v2-balanced-seats",
    seed: c.seed, boards: c.boards, futures: c.futures, games: c.games, wins: c.wins,
    rate: c.rate, boardClustered95CI: c.ci, meanVpDiff: c.meanVpDiff }
};
const output = path.join(__dirname, `data/setup-learning-${generation}.json`);
fs.writeFileSync(output, JSON.stringify({ meta, ...models }) + "\n");
console.log(`Imported ${generation}: blend=${meta.blend}, ${c.wins}/${c.games}`);
