// Adds spelling variants the site accepted (raw/verify/variant-results.jsonl) to content/answers.json.
// The site-confirmed answer stays first; nothing the site rejected is added.
import fs from "node:fs";

const answers = JSON.parse(fs.readFileSync("content/answers.json", "utf8"));
const norm = (s) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
let added = 0, questions = 0;
for (const line of fs.readFileSync("raw/verify/variant-results.jsonl", "utf8").split("\n").filter(Boolean)) {
  const { accepted } = JSON.parse(line);
  for (const [id, gaps] of Object.entries(accepted || {})) {
    const key = answers[id];
    if (!key?.gaps) continue;
    questions++;
    for (const [i, list] of Object.entries(gaps)) {
      const g = key.gaps[i];
      for (const v of list) if (!g.some((x) => norm(x) === norm(v))) g.push(v), added++;
    }
  }
}
fs.writeFileSync("content/answers.json", JSON.stringify(answers));
console.log({ questions, variantsAdded: added });
