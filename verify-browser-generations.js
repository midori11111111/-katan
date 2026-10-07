// PLAYWRIGHT_MODULE=/path/to/playwright node verify-browser-generations.js [baseURL] [--smoke]
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.argv[2] || "http://127.0.0.1:4178";
const smoke = process.argv.includes("--smoke");
async function verifyOnline(browser) {
  const pages = [], errors = [];
  try {
    for (let i=0; i<2; i++) {
      const page = await browser.newPage(); pages.push(page);
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if(m.type()==="error") errors.push(`${m.text()} ${m.location().url}`); });
      await page.goto(base, {waitUntil:"networkidle"});
      await page.evaluate(() => { scheduleAI=()=>{}; });
      await page.locator("#mpEntry").click();
      await page.locator("#mpName").fill(`Generation test ${i+1}`);
    }
    const [host, guest] = pages;
    await host.locator("#mpHumanCount").selectOption("2");
    await host.locator("#mpAiKind").selectOption("gen2");
    await host.locator("#mpCreate").click();
    await host.waitForFunction(() => Boolean(MP.code));
    const code = await host.evaluate(() => MP.code);
    await guest.locator("#mpCode").fill(code); await guest.locator("#mpJoin").click();
    await host.waitForFunction(() => Object.keys(MP.room?.members || {}).length===2);
    await guest.waitForFunction(() => MP.room?.aiKind==="gen2");
    await host.locator("#mpStart").click();
    for(const page of pages) await page.waitForFunction(() => MP.active && game?.phase==="setup");
    const hostSeat = await host.evaluate(() => MP.seat);
    async function syncFrom(page) {
      await page.waitForFunction(() => !MP.publishing && MP.outbox.length===0);
      const expected = await page.evaluate(() => JSON.stringify({phase:game.phase,setup:game.setup,hands:game.hands,robber:game.robber,steal:game.stealCands}));
      const other = page===host ? guest : host;
      await other.waitForFunction(expected => JSON.stringify({phase:game.phase,setup:game.setup,hands:game.hands,robber:game.robber,steal:game.stealCands})===expected, expected);
    }
    for(let i=0;i<16;i++) {
      const actor = await host.evaluate(() => game.setup.queue[game.setup.step]);
      const page = actor>=3 || actor===hostSeat ? host : guest;
      await page.evaluate(actor => {
        if(actor>=3) aiStep();
        else if(game.setup.phase==="settle") { active=actor;gameClickVertex(computeBest().ranked[0]); }
        else gameClickEdge(bestRoadFrom(game.setup.lastSettle,false,actor)[0].eid);
      }, actor);
      await syncFrom(page);
    }
    const roller = hostSeat===1 ? host : guest;
    await roller.evaluate(() => doRoll(7)); await syncFrom(roller);
    assert.equal(await roller.evaluate(() => game.phase), "robber");
    await roller.evaluate(() => gameClickHex(robberAdvice().hid)); await syncFrom(roller);
    if(await roller.evaluate(() => game.phase==="steal")) {
      await roller.evaluate(() => stealFrom(game.stealCands[0])); await syncFrom(roller);
    }
    for(const page of pages) {
      assert.deepEqual(await page.evaluate(() => ({...seatAI})), {1:"human",2:"human",3:"gen2",4:"gen2"});
      assert.equal(await page.evaluate(() => game.phase), "main");
    }
    assert.deepEqual(errors, []);
    console.log("Online 2 browsers: gen2 preserved through join, shuffle, all placements, 7/robber/steal; zero errors");
  } finally { for(const page of pages) await page.close(); }
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel:process.env.PLAYWRIGHT_CHANNEL || "chrome" });
  try {
    for (const viewport of [{ width:1440, height:1000 }, { width:390, height:844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", msg => { if (msg.type() === "error") errors.push(`${msg.text()} ${msg.location().url}`); });
      await page.goto(base, { waitUntil:"networkidle" });
      assert.equal(await page.locator('[data-kind="gen1"]').count(), 4);
      assert.equal(await page.locator('[data-kind="gen2"]').count(), 4);
      await page.locator('[data-seat="1"][data-kind="gen1"]').click();
      await page.locator('[data-seat="2"][data-kind="gen2"]').click();
      await page.locator('[data-seat="3"][data-kind="strong"]').click();
      await page.locator('[data-seat="4"][data-kind="invincible"]').click();
      assert.deepEqual(await page.evaluate(() => ({...seatKind})), {1:"gen1",2:"gen2",3:"strong",4:"invincible"});
      const info = await page.evaluate(() => {
        seatAI={...seatKind};
        return [setupLearnedInfo(1),setupLearnedInfo(2),setupLearnedInfo(3)];
      });
      assert.match(info[0].run, /gen1-/); assert.equal(info[0].blend, 1);
      assert.match(info[1].run, /gen2-/); assert.equal(info[1].blend, 0.5);
      assert.match(info[2].run, /gen0-/); assert.equal(info[2].blend, 0.5);
      await page.locator("#mpEntry").click();
      await page.locator("#mpAiKind").selectOption("gen2");
      assert.equal(await page.locator("#mpAiKind").inputValue(), "gen2");
      await page.locator("#mpClose").click();
      if (!smoke) {
        await page.evaluate(() => {
          scheduleAI = () => {}; window.setupTrace = [];
          const original = setupLearnedPick;
          setupLearnedPick = (p, B, v) => {
            const info = setupLearnedInfo(p), result = original(p, B, v);
            window.setupTrace.push({p, kind:seatAI[p], run:info.run, blend:info.blend, result});
            return result;
          };
        });
        await page.locator("#startBtn").click();
        const result = await page.evaluate(() => {
          for(let i=0;i<16;i++) aiStep();
          return {phase:game.phase, trace:window.setupTrace, seats:soloSeatConfig(),
            counts:[1,2,3,4].map(p => placements[p].settlements.size),
            overflow:document.documentElement.scrollWidth > innerWidth};
        });
        assert.equal(result.phase, "roll");
        assert.deepEqual(result.counts, [2,2,2,2]);
        assert.equal(result.trace.length, 8);
        assert.equal(result.trace.find(x => x.kind === "gen1").blend, 1);
        assert.equal(result.trace.find(x => x.kind === "gen2").blend, 0.5);
        assert.match(result.trace.find(x => x.kind === "gen1").run, /gen1-/);
        assert.match(result.trace.find(x => x.kind === "gen2").run, /gen2-/);
        assert.equal(result.seats[1], "gen1"); assert.equal(result.seats[2], "gen2");
        assert.equal(result.overflow, false);
      }
      assert.deepEqual(errors, []);
      console.log(`Browser ${viewport.width}px: generation selection${smoke ? "" : ", all 8 settlements, snapshots"}, zero errors`);
      await page.close();
    }
    if(!smoke) await verifyOnline(browser);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
