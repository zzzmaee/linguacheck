// Builds the answer key strictly from the original site's result pages.
// Inputs:  raw/test-english-listening-answers.json  ({ quizId: { ids, html } })
//          raw/test-english-all-answers.jsonl        (one { quiz, ids, html } per line)
// Outputs: content/solve/site-answers.json     answers stated explicitly by the site (+ site feedback)
//          content/solve/site-feedback.json    site feedback for every matched question
//          content/solve/in/site-NN.txt        questions whose answer is only implied by the feedback
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";

const results = [];
if (fs.existsSync("raw/test-english-listening-answers.json"))
  for (const [quiz, r] of Object.entries(JSON.parse(fs.readFileSync("raw/test-english-listening-answers.json", "utf8"))))
    results.push({ quiz, ...r });
if (fs.existsSync("raw/test-english-all-answers.jsonl"))
  for (const line of fs.readFileSync("raw/test-english-all-answers.jsonl", "utf8").split("\n").filter(Boolean)) results.push(JSON.parse(line));

const questions = new Map();
for (const e of JSON.parse(fs.readFileSync("content/index.json", "utf8"))) {
  const page = JSON.parse(fs.readFileSync(path.join("content/pages", e.file), "utf8"));
  for (const quiz of page.quizzes || []) for (const q of quiz.questions) questions.set(String(q.id), { ...q, page: e.path });
}

const text = (html) =>
  cheerio
    .load((html || "").replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|h\d|li|div)>/g, "$&\n"), null, false)
    .root()
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
const norm = (s) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
function similarity(a, b) {
  const A = new Set(norm(a).split(" ")), B = new Set(norm(b).split(" "));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(A.size, B.size);
}

function closeness(a, b) {
  a = norm(a);
  b = norm(b);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length, 1);
}

const letterOf = (q, c, k) => (c.letter || "").replace(/[^A-Z]/g, "") || "ABCDEFGH"[k];

function extractChoices(q, fb) {
  const letters = new Set();
  // Strongest signals first; "X is correct but …" describes a weaker option, so it is ignored.
  const strong = [
    /\b(?:[Oo]ption )?([A-H]) is the (?:best|most|only|right|correct)\b/g,
    /\b(?:[Oo]ption )?([A-H])\b(?:\)|\.)? (?:is|are) (?:also |both )?(?:the )?correct\b(?! but)/g,
    /\b([A-H]) and ([A-H]) are (?:both )?(?:the )?correct\b/g,
    /correct (?:answer|option)s? (?:is|are|:)\s*([A-H])\b(?:\s*(?:and|,)\s*([A-H])\b)?/gi,
  ];
  for (const re of strong) for (const m of fb.matchAll(re)) for (const l of m.slice(1)) if (l) letters.add(l.toUpperCase());
  // "‣ C develops the idea…", "‣ D immediately introduces…" (but not "D, E and F are…" or the article "A …")
  if (!letters.size && q.type === "radio") {
    const m =
      fb.match(/^‣?\s*([B-H])\b(?![,]| and\b| or\b)/) ||
      fb.match(/^‣?\s*(A) (?:is|clearly|immediately|develops|gives|uses|provides|sounds|addresses|explains|offers|introduces|shows|best)\b/);
    if (m) letters.add(m[1]);
  }
  let ids = q.choices.filter((c, k) => letters.has(letterOf(q, c, k))).map((c) => c.id);
  if (!ids.length && q.type === "radio") {
    // Exactly one option's text quoted in the feedback ("To outnumber … means …").
    const f = ` ${norm(fb)} `;
    const opts = q.choices.map((c) => norm(text(c.html)));
    const hits = q.choices.filter((c, k) => opts[k] && f.includes(` ${opts[k]} `));
    // Only trust distinctive options: long enough and not overlapping another option ("want"/"wanted").
    const h = hits.length === 1 ? norm(text(hits[0].html)) : "";
    const overlaps = opts.some((o) => o !== h && (o.includes(h) || h.includes(o)));
    if (h.length >= 4 && !overlaps && !opts.some((o) => /\bboth\b|\ball of\b/.test(o))) ids = [hits[0].id];
  }
  if (!ids.length) {
    // "Correct answer: <option text>" for options without letters (dropdowns, True/False…)
    const m = fb.match(/Correct answers?:\s*([^\n‣]+)/i);
    if (m) {
      const target = norm(m[1]);
      ids = q.choices.filter((c) => norm(text(c.html)) === target).map((c) => c.id);
    }
  }
  if (!ids.length) return null;
  if (q.type === "radio" && ids.length !== 1) return null;
  if (q.maxSelections && ids.length !== q.maxSelections) return null;
  return { choices: ids };
}

function extractGaps(q, fb) {
  const n = q.gaps.length;
  const raw = [];
  if (n === 1) {
    const m = fb.match(/Correct answers?:\s*([^\n‣]+)/i);
    if (m) raw[0] = m[1];
  } else {
    for (const m of fb.matchAll(/(?:^|\s)(\d{1,2})\s*[.)]?\s*Correct answers?:\s*([^\n‣]+?)(?=\s*‣|\s+\d{1,2}\s*[.)]?\s*Correct answers?:|$)/gi)) {
      const i = Number(m[1]) - 1;
      if (i >= 0 && i < n && raw[i] === undefined) raw[i] = m[2];
    }
  }
  // "Correct answers: is raining / are going to get / will take" — one answer per gap, in order.
  if (n > 1 && !raw.some(Boolean)) {
    const m = fb.match(/Correct answers?:\s*([^\n‣]+)/i);
    const parts = m ? m[1].split(/\s*(?:\.\.\.|…)\s*|\s+\/\s+|\s*;\s*/).map((x) => x.trim()).filter(Boolean) : [];
    if (parts.length === n) parts.forEach((p, i) => (raw[i] = p));
  }
  const gaps = [];
  for (let i = 0; i < n; i++) {
    // The site sometimes truncates long feedback; gaps it never states stay unkeyed ([]).
    if (raw[i] === undefined) {
      gaps.push([]);
      continue;
    }
    const alts = raw[i].split(/\s*\/\s*|;\s*/).map((x) => x.trim().replace(/^["“]|["”.]$/g, "")).filter(Boolean);
    const g = q.gaps[i];
    let accepted = alts;
    if (g.kind === "select") {
      accepted = g.options.filter((o) => alts.some((a) => norm(a) === norm(o)));
      // Site text sometimes differs slightly from the option ("contributes to" vs "contributed to").
      // The site often quotes the option with its context ("at most" for option "most", "check my phone" for "check").
      if (!accepted.length) {
        const inside = g.options.filter((o) => alts.some((a) => ` ${norm(a)} `.includes(` ${norm(o)} `)));
        const longest = inside.sort((x, y) => norm(y).length - norm(x).length);
        if (longest.length === 1 || (longest.length > 1 && !` ${norm(longest[0])} `.includes(` ${norm(longest[1])} `) === false))
          accepted = [longest[0]];
      }
      if (!accepted.length) {
        const scored = g.options.map((o) => [o, Math.max(...alts.map((a) => closeness(a, o)))]).sort((x, y) => y[1] - x[1]);
        if (scored[0][1] >= 0.75 && (scored.length < 2 || scored[0][1] - scored[1][1] >= 0.15)) accepted = [scored[0][0]];
      }
    }
    if (!accepted.length) return null;
    gaps.push(accepted);
  }
  if (!gaps.some((g) => g.length)) return null;
  return { gaps };
}

const siteAnswers = {}, siteFeedback = {}, implied = [];
let unmatched = 0, noFeedback = 0;
for (const { ids, html } of results) {
  const $ = cheerio.load(html, null, false);
  const blocks = $(".show-question")
    .map((_, b) => {
      const content = $(b).find(".show-question-content").first().clone();
      content.find(".watupro_num").remove();
      const fb = $(b).find(".watupro-main-feedback").first().clone();
      fb.find("img").remove();
      return { qtext: text(content.html()), fb: (fb.html() || "").replace(/\s+/g, " ").trim() };
    })
    .get();
  const used = new Set();
  ids.forEach((id, i) => {
    const q = questions.get(String(id));
    if (!q) return;
    const ours = text(q.prompt.replace(/<span data-gap="\d+"><\/span>/g, " "));
    let best = -1, bestScore = -1;
    blocks.forEach((b, j) => {
      if (used.has(j)) return;
      const s = similarity(ours, b.qtext) + (j === i ? 0.15 : 0);
      if (s > bestScore) [best, bestScore] = [j, s];
    });
    if (best < 0 || bestScore < 0.3) return void unmatched++;
    used.add(best);
    const fbHtml = blocks[best].fb;
    if (!text(fbHtml)) return void noFeedback++;
    siteFeedback[id] = fbHtml;
    const fb = text(fbHtml);
    const ans = q.type === "gaps" ? extractGaps(q, fb) : q.choices ? extractChoices(q, fb) : null;
    if (ans) siteAnswers[id] = { ...ans, feedback: fbHtml };
    else implied.push({ q, fb });
  });
}

fs.writeFileSync("content/solve/site-answers.json", JSON.stringify(siteAnswers));
fs.writeFileSync("content/solve/site-feedback.json", JSON.stringify(siteFeedback));

for (const f of fs.readdirSync("content/solve/in")) if (f.startsWith("site-")) fs.rmSync(path.join("content/solve/in", f));
const render = ({ q, fb }) => {
  let prompt = q.prompt;
  (q.gaps || []).forEach((_, i) => (prompt = prompt.replace(`<span data-gap="${i}"></span>`, ` {${i + 1}} `)));
  const lines = [`Q ${q.id} [${q.type}${q.maxSelections ? `, pick ${q.maxSelections}` : ""}] ${text(prompt).replace(/\n/g, " / ")}`];
  (q.gaps || []).forEach((g, i) => lines.push(g.kind === "select" ? `  {${i + 1}} options: ${g.options.join(" | ")}` : `  {${i + 1}} free text`));
  for (const c of q.choices || []) lines.push(`  ${c.id}) ${c.letter ?? ""} ${text(c.html)}`.replace(/\s+/g, " "));
  lines.push(`  SITE FEEDBACK: ${fb.replace(/\n/g, " / ")}`);
  return lines.join("\n");
};
const PER = 300;
for (let i = 0, n = 1; i < implied.length; i += PER, n++) {
  let out = "", lastPage = "";
  for (const t of implied.slice(i, i + PER)) {
    if (t.q.page !== lastPage) out += `\n=== PAGE ${t.q.page}\n`;
    lastPage = t.q.page;
    out += render(t) + "\n";
  }
  fs.writeFileSync(path.join("content/solve/in", `site-${String(n).padStart(2, "0")}.txt`), out);
}
console.log({ results: results.length, explicit: Object.keys(siteAnswers).length, implied: implied.length, noFeedback, unmatched, questions: questions.size });
