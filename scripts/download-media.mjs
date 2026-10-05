// Downloads every file listed in content/media.json into public/.
// Usage: node scripts/download-media.mjs   (re-runnable: skips files already on disk)
import fs from "node:fs";
import path from "node:path";

const list = JSON.parse(fs.readFileSync("content/media.json", "utf8"));
const CONCURRENCY = 4;
const failed = [];
let done = 0, skipped = 0;

async function download([url, local]) {
  const dest = path.join("public", decodeURIComponent(local));
  if (fs.existsSync(dest)) return void skipped++;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.status === 404) break;
      if (!res.ok) throw new Error(String(res.status));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return void done++;
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  failed.push(url);
}

const queue = list.slice();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      await download(queue.shift());
      await new Promise((r) => setTimeout(r, 150));
    }
  }),
);
fs.writeFileSync("content/media-failed.json", JSON.stringify(failed, null, 1));
console.log({ total: list.length, downloaded: done, skipped, failed: failed.length });
