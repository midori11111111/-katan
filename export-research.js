#!/usr/bin/env node
// 公開対局の匿名研究データを書き出す。
// RESEARCH_EXPORT_TOKEN=... node export-research.js [baseUrl] [outDir] [limit]
const fs = require("fs");
const path = require("path");

const base = String(process.argv[2] || "https://catan-challenger-online.vercel.app").replace(/\/$/, "");
const outDir = path.resolve(process.argv[3] || "research_exports");
const limit = Math.max(1, Math.min(1000, Number(process.argv[4]) || 100));
const token = process.env.RESEARCH_EXPORT_TOKEN || "";
if (!token) { console.error("RESEARCH_EXPORT_TOKEN が必要です"); process.exit(1); }
const headers = { Authorization: `Bearer ${token}` };

async function get(url) {
  const response = await fetch(url, { headers });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(`${response.status} ${body.error || "request_failed"}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const list = await get(`${base}/api/research?limit=${limit}`);
  let saved = 0, decisions = 0;
  for (const item of list.records || []) {
    let first;
    try {
      first = await get(`${base}/api/research?id=${encodeURIComponent(item.id)}&decisions=1&start=0&limit=5000`);
    } catch (error) {
      // 一覧取得と詳細取得の間にTTLが切れた1件のため、残り全件を失敗させない。
      if (error.status === 404) { console.warn(`[skip] ${item.id} は期限切れです`); continue; }
      throw error;
    }
    const doc = { record: first.record, decisions: first.decisions || [] };
    fs.writeFileSync(path.join(outDir, `${item.id}.json`), JSON.stringify(doc));
    saved++; decisions += doc.decisions.length;
    console.log(`[${saved}/${list.records.length}] ${item.id} ${doc.record.status} ${doc.decisions.length} decisions`);
  }
  console.log(`完了: ${saved}対局 / ${decisions}判断 → ${outDir}`);
})().catch(error => { console.error(error); process.exit(1); });
