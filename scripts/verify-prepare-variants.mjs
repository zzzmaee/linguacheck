// Builds raw/verify/variants.json: for every free-text gap, spelling variants of the site-confirmed
// answer to test against the site. Only variants the site accepts are added to the key later.
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";

const answers = JSON.parse(fs.readFileSync("content/answers.json", "utf8"));
const before = JSON.parse(fs.readFileSync("raw/verify/answers-before-fix.json", "utf8"));
const siteFeedback = JSON.parse(fs.readFileSync("content/solve/site-feedback.json", "utf8"));
const agent = {};
for (const f of fs.readdirSync("content/solve/out").filter((f) => /^(chunk|listen|site)-.*\.json$/.test(f)))
  Object.assign(agent, JSON.parse(fs.readFileSync(path.join("content/solve/out", f), "utf8")));
const text = (h) => cheerio.load(h || "", null, false).root().text().replace(/\s+/g, " ").trim();
// Our grader ignores case, spacing and apostrophe style, so only substantive variants are worth testing.
const norm = (s) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();

const PAIRS = [["i'm", "i am"], ["don't", "do not"], ["doesn't", "does not"], ["didn't", "did not"], ["isn't", "is not"], ["aren't", "are not"], ["wasn't", "was not"], ["weren't", "were not"], ["haven't", "have not"], ["hasn't", "has not"], ["hadn't", "had not"], ["won't", "will not"], ["can't", "cannot"], ["can't", "can not"], ["couldn't", "could not"], ["wouldn't", "would not"], ["shouldn't", "should not"], ["mustn't", "must not"], ["needn't", "need not"], ["it's", "it is"], ["that's", "that is"], ["there's", "there is"], ["he's", "he is"], ["she's", "she is"], ["what's", "what is"], ["let's", "let us"]];
const SUFFIX = [["'ll", " will"], ["'ve", " have"], ["'re", " are"], ["'d", " would"], ["'d", " had"]];
function variantsOf(v) {
  const out = new Set();
  const s = norm(v);
  for (const [a, b] of PAIRS) {
    const re = (x) => new RegExp(`(^|\\b)${x.replace(/'/g, "'")}(\\b|$)`, "g");
    if (re(a).test(s)) out.add(s.replace(re(a), `$1${b}$2`));
    if (re(b).test(s)) out.add(s.replace(re(b), `$1${a}$2`));
  }
  for (const [a, b] of SUFFIX) {
    if (s.includes(a)) out.add(s.split(a).join(b));
    if (s.includes(b)) out.add(s.split(b).join(a));
  }
  return [...out];
}

const tests = [];
for (const e of JSON.parse(fs.readFileSync("content/index.json", "utf8"))) {
  const page = JSON.parse(fs.readFileSync(path.join("content/pages", e.file), "utf8"));
  for (const z of page.quizzes || []) {
    const gapsToTest = {};
    for (const q of z.questions) {
      const key = answers[q.id];
      if (q.type !== "gaps" || !key?.gaps) continue;
      q.gaps.forEach((g, i) => {
        const confirmed = key.gaps[i]?.[0];
        if (g.kind !== "text" || !confirmed) return;
        const fbAlts = [...text(siteFeedback[q.id]).matchAll(/Correct answers?:\s*([^‣\n]+)/g)].flatMap((m) => m[1].split(/\s*\/\s*|;\s*/));
        const raw = [confirmed, ...(before[q.id]?.gaps?.[i] || []), ...(agent[q.id]?.gaps?.[i] || []), ...(q.gaps.length === 1 ? fbAlts : [])];
        const cands = new Set();
        for (const r of raw) {
          if (!r) continue;
          cands.add(norm(r));
          for (const v of variantsOf(r)) cands.add(v);
        }
        cands.delete(norm(confirmed));
        const list = [...cands].filter(Boolean).slice(0, 12);
        if (list.length) (gapsToTest[q.id] ||= {})[i] = list;
      });
    }
    if (!Object.keys(gapsToTest).length) continue;
    tests.push({
      q: String(z.id),
      p: String(page.id),
      ids: z.questions.map((q) => String(q.id)),
      wq: z.questions.map((q) => q.id + ":" + (q.choices || []).map((c) => c.id).join(",")).join(" | "),
      base: Object.fromEntries(
        z.questions.map((q) => {
          const k = answers[q.id];
          return [String(q.id), !k ? [] : k.choices ? k.choices.map(String) : k.gaps.map((g) => g[0] ?? "")];
        }),
      ),
      gaps: gapsToTest,
    });
  }
}
fs.writeFileSync("raw/verify/variants.json", JSON.stringify(tests));
const n = tests.reduce((a, t) => a + Object.values(t.gaps).reduce((b, g) => b + Object.values(g).reduce((c, l) => c + l.length, 0), 0), 0);
const rounds = tests.reduce((a, t) => a + Math.max(...Object.values(t.gaps).flatMap((g) => Object.values(g).map((l) => l.length))), 0);
console.log({ quizzes: tests.length, variants: n, submissions: rounds });
