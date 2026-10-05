// Maps raw WatuPRO result pages (raw/test-english-listening-answers.json) onto our questions.
// Writes content/solve/server-feedback.json ({ questionId: feedbackHtml }) and
// content/solve/in/listen-NN.txt chunks (question + choices + server feedback) for solving.
// Answers stated explicitly ("B is correct", "Correct answer: …") go straight to content/solve/out/listen-direct.json.
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";

const raw = JSON.parse(fs.readFileSync("raw/test-english-listening-answers.json", "utf8"));
const index = JSON.parse(fs.readFileSync("content/index.json", "utf8"));

const questions = new Map();
for (const e of index) {
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
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function similarity(a, b) {
  const A = new Set(norm(a).split(" ")), B = new Set(norm(b).split(" "));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(A.size, B.size);
}

const feedback = {};
const direct = {};
const todo = [];
let unmatched = 0;

for (const [quizId, { ids, html }] of Object.entries(raw)) {
  const $ = cheerio.load(html, null, false);
  const blocks = $(".show-question")
    .map((_, b) => {
      const content = $(b).find(".show-question-content").first().clone();
      content.find(".watupro_num").remove();
      const fb = $(b).find(".watupro-main-feedback").first();
      fb.find("img").remove();
      return { qtext: text(content.html()), fb: (fb.html() || "").replace(/\s+/g, " ").trim() };
    })
    .get()
    .filter((b) => b.fb || b.qtext);

  // Match each of our questions to the most similar unused result block (falls back to order).
  const used = new Set();
  ids.forEach((id, i) => {
    const q = questions.get(String(id));
    if (!q) return;
    const ours = text(q.prompt.replace(/<span data-gap="\d+"><\/span>/g, " "));
    let best = -1, bestScore = -1;
    blocks.forEach((b, j) => {
      if (used.has(j)) return;
      const s = similarity(ours, b.qtext) + (j === i ? 0.05 : 0);
      if (s > bestScore) [best, bestScore] = [j, s];
    });
    if (best < 0 || bestScore < 0.3) {
      unmatched++;
      return;
    }
    used.add(best);
    const fbHtml = blocks[best].fb;
    if (!fbHtml) return;
    feedback[id] = fbHtml;

    const fbText = text(fbHtml);
    if (q.type === "radio" && q.choices) {
      const m = fbText.match(/(?:^|\s|‣)\(?([A-F])\)? is (?:the )?correct/) || fbText.match(/correct answer is ([A-F])\b/i);
      const choice = m && q.choices.find((c, k) => (c.letter || "").startsWith(m[1]) || (!c.letter && "ABCDEF"[k] === m[1]));
      if (choice) return void (direct[id] = { choices: [choice.id] });
    }
    if (q.type === "gaps" && q.gaps?.length === 1) {
      const m = fbText.match(/Correct answer:\s*([^\n‣]+)/);
      if (m) {
        const ans = m[1].trim().replace(/[.]$/, "");
        const g = q.gaps[0];
        if (g.kind === "text" || g.options.some((o) => norm(o) === norm(ans))) return void (direct[id] = { gaps: [[ans]] });
      }
    }
    todo.push({ q, fbText, quizId });
  });
}

fs.mkdirSync("content/solve/out", { recursive: true });
fs.writeFileSync("content/solve/server-feedback.json", JSON.stringify(feedback));
fs.writeFileSync("content/solve/out/listen-direct.json", JSON.stringify(direct));

// Chunks for solving the rest with the transcript excerpts.
const render = ({ q, fbText }) => {
  let prompt = q.prompt;
  (q.gaps || []).forEach((_, i) => (prompt = prompt.replace(`<span data-gap="${i}"></span>`, ` {${i + 1}} `)));
  const lines = [`Q ${q.id} [${q.type}${q.maxSelections ? `, pick ${q.maxSelections}` : ""}] ${text(prompt).replace(/\n/g, " / ")}`];
  (q.gaps || []).forEach((g, i) => lines.push(g.kind === "select" ? `  {${i + 1}} options: ${g.options.join(" | ")}` : `  {${i + 1}} free text`));
  for (const c of q.choices || []) lines.push(`  ${c.id}) ${c.letter ?? ""} ${text(c.html)}`.replace(/\s+/g, " "));
  lines.push(`  SITE FEEDBACK: ${fbText.replace(/\n/g, " / ")}`);
  return lines.join("\n");
};
for (const f of fs.readdirSync("content/solve/in")) if (f.startsWith("listen-")) fs.rmSync(path.join("content/solve/in", f));
const PER = 350;
for (let i = 0, n = 1; i < todo.length; i += PER, n++) {
  const part = todo.slice(i, i + PER);
  let out = "", lastPage = "";
  for (const t of part) {
    if (t.q.page !== lastPage) out += `\n=== PAGE ${t.q.page}\n`;
    lastPage = t.q.page;
    out += render(t) + "\n";
  }
  fs.writeFileSync(path.join("content/solve/in", `listen-${String(n).padStart(2, "0")}.txt`), out);
}
console.log({ feedback: Object.keys(feedback).length, direct: Object.keys(direct).length, toSolve: todo.length, unmatched });
