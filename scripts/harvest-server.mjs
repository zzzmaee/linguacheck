// Tiny local relay used by browser-side scripts (Claude in Chrome) during verification:
//   GET  /data/<file>  -> serves raw/verify/<file>
//   POST /save/<name>  -> appends one line to raw/verify/<name>.jsonl
// CORS is open only to the original site and the local clone.
// Usage: node scripts/harvest-server.mjs [port]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const port = Number(process.argv[2] || 3999);
const DIR = "raw/verify";
const ORIGINS = new Set(["https://test-english.com", "http://localhost:3123"]);
fs.mkdirSync(DIR, { recursive: true });

http
  .createServer((req, res) => {
    const origin = ORIGINS.has(req.headers.origin) ? req.headers.origin : "https://test-english.com";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin",
    };
    if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
    const [, kind, name] = (req.url || "").split("/");
    const safe = path.basename(name || "");
    if (req.method === "GET" && kind === "data" && fs.existsSync(path.join(DIR, safe))) {
      return res.writeHead(200, { ...cors, "Content-Type": "text/plain; charset=utf-8" }).end(fs.readFileSync(path.join(DIR, safe)));
    }
    if (req.method === "POST" && kind === "save" && safe) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        fs.appendFileSync(path.join(DIR, `${safe}.jsonl`), body.replace(/\n/g, " ") + "\n");
        res.writeHead(200, cors).end("ok");
      });
      return;
    }
    res.writeHead(404, cors).end();
  })
  .listen(port, "127.0.0.1", () => console.log(`relay on http://127.0.0.1:${port}`));
