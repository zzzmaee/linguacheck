// Compares what Claude in Chrome collected from the original site and from localhost.
//   raw/verify/site-questions.jsonl   questions as rendered on test-english.com
//   raw/verify/local-questions.jsonl  questions as rendered on localhost:3123
//   raw/verify/submit-check.jsonl     the site's verdict on our answer key
// Writes raw/verify/report.json and prints a summary.
import * as cheerio from "cheerio";
import fs from "node:fs";

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const norm = (s) => (s || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const tokens = (s) => norm(s).replace(/[^a-z0-9' ]+/g, " ").split(" ").filter(Boolean).join(" ");

const site = new Map();
for (const { quizzes } of readJsonl("raw/verify/site-questions.jsonl"))
  for (const z of quizzes) for (const q of z.questions) if (q.id) site.set(q.id, { ...q, quiz: z.quiz });
const local = new Map();
for (const { path, questions } of readJsonl("raw/verify/local-questions.jsonl")) for (const q of questions) local.set(q.id, { ...q, path });

const issues = { missingOnLocal: [], extraOnLocal: [], type: [], prompt: [], choices: [], gaps: [] };
for (const [id, s] of site) {
  const l = local.get(id);
  if (!l) {
    issues.missingOnLocal.push(id);
    continue;
  }
  if (s.type !== l.type) issues.type.push({ id, site: s.type, local: l.type });
  if (tokens(s.prompt) !== tokens(l.prompt)) issues.prompt.push({ id, site: s.prompt.slice(0, 120), local: l.prompt.slice(0, 120) });
  const sc = s.choices.map((c) => `${c.id}:${tokens(c.text)}`).join("|");
  const lc = l.choices.map((c) => `${c.id}:${tokens(c.text)}`).join("|");
  if (sc !== lc) issues.choices.push({ id, site: sc.slice(0, 200), local: lc.slice(0, 200) });
  const sg = JSON.stringify(s.gaps.map((g) => [g.kind, (g.options || []).map(norm)]));
  const lg = JSON.stringify(l.gaps.map((g) => [g.kind, (g.options || []).map(norm)]));
  if (sg !== lg) issues.gaps.push({ id, site: sg.slice(0, 200), local: lg.slice(0, 200) });
}
for (const id of local.keys()) if (!site.has(id)) issues.extraOnLocal.push(id);

// The site's verdict on our answers
const answers = JSON.parse(fs.readFileSync("content/answers.json", "utf8"));
const verdict = { correct: [], wrongWithKey: [], noKey: [], quizzes: 0, perfectQuizzes: 0 };
for (const { ids, html } of readJsonl("raw/verify/submit-check.jsonl")) {
  verdict.quizzes++;
  const $ = cheerio.load(html, null, false);
  const blocks = $(".show-question").toArray().slice(0, ids.length);
  let perfect = true;
  blocks.forEach((b, i) => {
    const cls = $(b).attr("class") || "";
    const ok = /watupro-resolved/.test(cls) && !/unresolved/.test(cls);
    const id = ids[i];
    if (ok) verdict.correct.push(id);
    else {
      perfect = false;
      (answers[id] ? verdict.wrongWithKey : verdict.noKey).push(id);
    }
  });
  if (perfect) verdict.perfectQuizzes++;
}

const report = { siteQuestions: site.size, localQuestions: local.size, issues, verdict };
fs.writeFileSync("raw/verify/report.json", JSON.stringify(report, null, 1));
console.log({
  siteQuestions: site.size,
  localQuestions: local.size,
  ...Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, v.length])),
  quizzesChecked: verdict.quizzes,
  perfectQuizzes: verdict.perfectQuizzes,
  answersCorrect: verdict.correct.length,
  answersWrong: verdict.wrongWithKey.length,
  noKey: verdict.noKey.length,
});
