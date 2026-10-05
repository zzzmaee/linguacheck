// Builds plain-text work chunks (content/solve/in/chunk-NN.txt) for writing the answer key by hand/LLM.
// Usage: node scripts/solve-prepare.mjs [questionsPerChunk]
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";

const PER_CHUNK = Number(process.argv[2]) || 600;
const IN_DIR = "content/solve/in";
const index = JSON.parse(fs.readFileSync("content/index.json", "utf8"));
const answers = JSON.parse(fs.readFileSync("content/answers.json", "utf8"));

// Listening questions need the audio, which is not available as text.
const skip = (p) => p.section === "listening" || /listening/.test(p.path);

const text = (html) => {
  const $ = cheerio.load(html.replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|h\d|li|div|tr)>/g, "$&\n"), null, false);
  return $.root().text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
};

function quizContext(html, quizId) {
  // Text between the previous quiz (or start) and this quiz: instructions, reading passage, etc.
  const marker = `<div data-quiz="${quizId}"></div>`;
  const before = html.slice(0, html.indexOf(marker));
  const prev = before.lastIndexOf('<div data-quiz="');
  return text(prev >= 0 ? before.slice(before.indexOf("</div>", prev) + 6) : before);
}

function renderQuestion(q) {
  let prompt = q.prompt;
  (q.gaps || []).forEach((_, i) => (prompt = prompt.replace(`<span data-gap="${i}"></span>`, ` {${i + 1}} `)));
  const lines = [`Q ${q.id} [${q.type}${q.maxSelections ? `, pick ${q.maxSelections}` : ""}] ${text(prompt).replace(/\n/g, " / ")}`];
  (q.gaps || []).forEach((g, i) =>
    lines.push(g.kind === "select" ? `  {${i + 1}} options: ${g.options.join(" | ")}` : `  {${i + 1}} free text`),
  );
  for (const c of q.choices || []) lines.push(`  ${c.id}) ${c.letter ?? ""} ${text(c.html)}`.replace(/\s+/g, " "));
  return lines.join("\n");
}

const blocks = [];
for (const e of index) {
  if (skip(e)) continue;
  const page = JSON.parse(fs.readFileSync(path.join("content/pages", e.file), "utf8"));
  if (!page.quizzes?.length) continue;
  const htmls = page.kind === "lesson" ? page.parts : [page.html];
  for (const quiz of page.quizzes) {
    const todo = quiz.questions.filter((q) => !answers[q.id]);
    if (!todo.length) continue;
    const html = htmls.find((h) => h.includes(`data-quiz="${quiz.id}"`)) ?? "";
    const ctx = quizContext(html, quiz.id);
    blocks.push({
      n: todo.length,
      body: [`=== PAGE ${e.path} | ${e.title} | level ${e.level ?? "-"}`, `--- QUIZ ${quiz.id}`, ctx && `CONTEXT:\n${ctx}`, ...todo.map(renderQuestion)]
        .filter(Boolean)
        .join("\n"),
    });
  }
}

fs.rmSync(IN_DIR, { recursive: true, force: true });
fs.mkdirSync(IN_DIR, { recursive: true });
let chunk = [], count = 0, n = 0;
const flush = () => {
  if (!chunk.length) return;
  fs.writeFileSync(path.join(IN_DIR, `chunk-${String(++n).padStart(2, "0")}.txt`), chunk.join("\n\n") + "\n");
  chunk = [];
  count = 0;
};
for (const b of blocks) {
  if (count + b.n > PER_CHUNK) flush();
  chunk.push(b.body);
  count += b.n;
}
flush();
console.log({ chunks: n, quizzes: blocks.length, questions: blocks.reduce((a, b) => a + b.n, 0) });
