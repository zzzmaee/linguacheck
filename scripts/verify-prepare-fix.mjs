// From raw/verify/report.json, builds raw/verify/fix.json: for every quiz with questions the site
// marked wrong (or that have no key), the candidates to try so the site itself confirms the answer.
import fs from "node:fs";
import path from "node:path";

const report = JSON.parse(fs.readFileSync("raw/verify/report.json", "utf8"));
const answers = JSON.parse(fs.readFileSync("content/answers.json", "utf8"));
const todo = new Set([...report.verdict.wrongWithKey, ...report.verdict.noKey]);
const doneQuizzes = new Set(
  fs.existsSync("raw/verify/fix-results.jsonl")
    ? fs.readFileSync("raw/verify/fix-results.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).q)
    : [],
);

const combos = (ids, k) => {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) return void out.push(acc);
    for (let i = start; i < ids.length; i++) rec(i + 1, [...acc, ids[i]]);
  };
  rec(0, []);
  return out;
};

const fix = [];
for (const e of JSON.parse(fs.readFileSync("content/index.json", "utf8"))) {
  const page = JSON.parse(fs.readFileSync(path.join("content/pages", e.file), "utf8"));
  for (const z of page.quizzes || []) {
    if (doneQuizzes.has(String(z.id)) || !z.questions.some((q) => todo.has(String(q.id)))) continue;
    const questions = z.questions.map((q) => {
      const id = String(q.id);
      const key = answers[id];
      const base = { id, type: q.type, check: todo.has(id) };
      if (!base.check) return { ...base, fixed: key ? (key.choices ? key.choices.map(String) : key.gaps.map((g) => g[0] ?? "")) : [] };
      if (q.type === "gaps")
        return {
          ...base,
          gaps: q.gaps.map((g, i) => ({
            first: key?.gaps?.[i]?.[0] ?? "",
            // Dropdowns: try every option. Free text: only the variants we already have.
            options: g.kind === "select" ? g.options : key?.gaps?.[i]?.length > 1 ? key.gaps[i] : null,
          })),
        };
      const ids = (q.choices || []).map((c) => String(c.id));
      const k = q.type === "checkbox" ? q.maxSelections || 0 : 1;
      const cands = q.type === "checkbox" ? (k ? combos(ids, k) : []) : ids.map((x) => [x]);
      return { ...base, cands };
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
console.log({ quizzes: fix.length, questions: todo.size });
