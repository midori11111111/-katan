const http = require("http");
const fs = require("fs");
const path = require("path");
const rooms = require("./api/rooms");
const research = require("./api/research");
const root = __dirname;
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/rooms")) return rooms(req, res);
  if (req.url.startsWith("/api/research")) return research(req, res);
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; return res.end("Not found");
  }
  res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
const port = Number(process.env.PORT || 4173);
server.listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}`));
