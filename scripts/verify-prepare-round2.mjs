// Second confirmation round for questions the site has not confirmed yet (free-text gaps, checkboxes
// without a selection limit). Builds candidate lists; nothing enters the key unless the site accepts it.
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";

const text = (h) => cheerio.load(h || "", null, false).root().text().replace(/\s+/g, " ").trim();
const before = JSON.parse(fs.readFileSync("raw/verify/answers-before-fix.json", "utf8"));
const answers = JSON.parse(fs.readFileSync("content/answers.json", "utf8"));
const siteFeedback = JSON.parse(fs.readFileSync("content/solve/site-feedback.json", "utf8"));
const agent = {};
for (const f of fs.readdirSync("content/solve/out").filter((f) => /^(chunk|listen|site)-.*\.json$/.test(f)))
  Object.assign(agent, JSON.parse(fs.readFileSync(path.join("content/solve/out", f), "utf8")));

const pending = new Map();
for (const l of fs.readFileSync("raw/verify/fix-results-round1.jsonl", "utf8").split("\n").filter(Boolean)) {
  const { out } = JSON.parse(l);
  for (const [id, r] of Object.entries(out)) if (!r.confirmed) pending.set(id, r);
}

const words = (s) => s.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9']+/g) || [];
function variants(raw, before, after) {
  const out = new Set();
  const add = (s) => {
    s = s.trim().replace(/\s+/g, " ").replace(/^[,.;:!?]+|[,.;:!?]+$/g, "");
    if (!s) return;
    out.add(s);
    out.add(s.replace(/’/g, "'"));
    out.add(s.replace(/'/g, "’"));
    out.add(s.charAt(0).toLowerCase() + s.slice(1));
  };
  for (const base of raw) {
    add(base);
    // drop words that already stand right before / after the gap in the sentence
    let w = base.split(/\s+/);
    const b = words(before).slice(-4), a = words(after).slice(0, 4);
    for (let k = Math.min(b.length, w.length - 1); k > 0; k--)
      if (words(w.slice(0, k).join(" ")).join(" ") === b.slice(-k).join(" ")) {
        w = w.slice(k);
        break;
      }
    for (let k = Math.min(a.length, w.length - 1); k > 0; k--)
      if (words(w.slice(-k).join(" ")).join(" ") === a.slice(0, k).join(" ")) {
        w = w.slice(0, -k);
        break;
      }
    add(w.join(" "));
    // "landscape(s)" -> landscape / landscapes
    if (/\(s\)$/.test(base)) {
      add(base.replace(/\(s\)$/, ""));
      add(base.replace(/\(s\)$/, "s"));
    }
  }
  const PAIRS = [["I'm", "I am"], ["don't", "do not"], ["doesn't", "does not"], ["didn't", "did not"], ["isn't", "is not"], ["aren't", "are not"], ["wasn't", "was not"], ["weren't", "were not"], ["haven't", "have not"], ["hasn't", "has not"], ["hadn't", "had not"], ["won't", "will not"], ["can't", "cannot"], ["couldn't", "could not"], ["wouldn't", "would not"], ["shouldn't", "should not"], ["'ll", " will"], ["'ve", " have"], ["'re", " are"], ["'d", " would"]];
  for (const s of [...out]) {
    const plain = s.replace(/’/g, "'");
    for (const [short, long] of PAIRS) {
      if (plain.includes(short)) add(plain.split(short).join(long).trim());
      if (plain.includes(long.trim()) && long.startsWith(" ") === false) add(plain.split(long).join(short));
    }
    if (/^[a-z]+$/i.test(plain)) {
      if (!plain.endsWith("s")) add(plain + "s");
      else add(plain.slice(0, -1));
    }
  }
  return [...out].slice(0, 25);
}

const fix = [];
for (const e of JSON.parse(fs.readFileSync("content/index.json", "utf8"))) {
  const page = JSON.parse(fs.readFileSync(path.join("content/pages", e.file), "utf8"));
  for (const z of page.quizzes || []) {
    if (!z.questions.some((q) => pending.has(String(q.id)))) continue;
    const questions = z.questions.map((q) => {
      const id = String(q.id);
      const key = answers[id];
      if (!pending.has(id))
        return { id, type: q.type, check: false, fixed: key ? (key.choices ? key.choices.map(String) : key.gaps.map((g) => g[0] ?? "")) : [] };
      if (q.type === "gaps") {
        const r = pending.get(id);
        const fbAnswers = [...text(siteFeedback[id]).matchAll(/Correct answers?:\s*([^‣\n]+?)(?=\s*‣|\s+\d+\s*Correct|$)/g)].map((m) => m[1]);
        return {
          id,
          type: q.type,
          check: true,
          gaps: q.gaps.map((g, i) => {
            if (r.gaps?.[i]?.length) return { first: r.gaps[i][0], options: null, known: true };
            const parts = q.prompt.split(`<span data-gap="${i}"></span>`);
            const raw = [
              ...(q.gaps.length === 1 ? fbAnswers : fbAnswers[i] ? [fbAnswers[i]] : []),
              ...(before[id]?.gaps?.[i] || []),
              ...(agent[id]?.gaps?.[i] || []),
            ];
            const opts = g.kind === "select" ? g.options : variants(raw, text(parts[0] || ""), text(parts[1] || ""));
            return { first: opts[0] ?? "", options: opts.length ? opts : null };
          }),
        };
      }
      // checkbox without a selection limit: every non-empty subset (choices are few)
      const ids = (q.choices || []).map((c) => String(c.id));
      const subsets = [];
      for (let m = 1; m < 1 << ids.length && ids.length <= 6; m++) subsets.push(ids.filter((_, i) => m & (1 << i)));
      subsets.sort((a, b) => a.length - b.length);
      return { id, type: q.type, check: true, cands: subsets };
    });
    fix.push({
      q: String(z.id),
      p: String(page.id),
      ids: z.questions.map((q) => String(q.id)),
      wq: z.questions.map((q) => q.id + ":" + (q.choices || []).map((c) => c.id).join(",")).join(" | "),
      questions,
    });
  }
}
fs.writeFileSync("raw/verify/fix.json", JSON.stringify(fix));
console.log({ quizzes: fix.length, pending: pending.size });
