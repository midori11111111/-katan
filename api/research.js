const crypto = require("crypto");
const { getResearchSnapshot, listResearchSnapshots, getResearchDecisions } = require("./store");

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || "")), bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}
function bearer(req) {
  const value = String(req.headers && req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });
  const expected = process.env.RESEARCH_EXPORT_TOKEN || "";
  if (!expected) return send(res, 503, { error: "research_export_not_configured" });
  if (!safeEqual(bearer(req), expected)) return send(res, 401, { error: "invalid_token" });
  try {
    const url = new URL(req.url, "http://localhost");
    const id = String(url.searchParams.get("id") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (id) {
      const record = await getResearchSnapshot(id);
      if (!record) return send(res, 404, { error: "record_not_found" });
      const includeDecisions = url.searchParams.get("decisions") === "1";
      const decisions = includeDecisions
        ? await getResearchDecisions(id, url.searchParams.get("start"), url.searchParams.get("limit"))
        : undefined;
      return send(res, 200, { record, ...(includeDecisions ? { decisions } : {}) });
    }
    const records = await listResearchSnapshots(url.searchParams.get("limit"));
    return send(res, 200, { records });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "server_error" });
  }
};
