// Validates and merges solved chunks into content/answers.json.
//   node scripts/solve-merge.mjs check 07   -> validate content/solve/out/chunk-07*.json against chunk-07.txt
//   node scripts/solve-merge.mjs merge      -> validate everything and merge valid entries into answers.json
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "content/solve/out";
const IN_DIR = "content/solve/in";
const [mode, chunkArg] = process.argv.slice(2);

const questions = new Map();
for (const e of JSON.parse(fs.readFileSync("content/index.json", "utf8"))) {
  const page = JSON.parse(fs.readFileSync(path.join("content/pages", e.file), "utf8"));
  for (const quiz of page.quizzes || []) for (const q of quiz.questions) questions.set(String(q.id), q);
}

const norm = (s) => s.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();

function validate(id, a) {
  const q = questions.get(id);
  if (!q) return "unknown question id";
  if (!a || typeof a !== "object") return "entry must be an object";
  if (a.feedback !== undefined && typeof a.feedback !== "string") return "feedback must be a string";
  if (q.type === "gaps") {
    if (!Array.isArray(a.gaps) || a.gaps.length !== q.gaps.length) return `needs gaps array of length ${q.gaps.length}`;
    for (let i = 0; i < q.gaps.length; i++) {
      const acc = a.gaps[i];
      if (!Array.isArray(acc) || acc.some((s) => typeof s !== "string" || !s.trim())) return `gap ${i + 1}: needs string array`;
      if (!acc.length) continue; // gap the site gives no answer for
      const g = q.gaps[i];
      if (g.kind === "select" && !acc.some((s) => g.options.map(norm).includes(norm(s)))) return `gap ${i + 1}: answer not among options`;
    }
    if (!a.gaps.some((g) => g.length)) return "all gaps empty";
    return null;
  }
  if (!Array.isArray(a.choices) || !a.choices.length) return "needs choices array";
  const ids = (q.choices || []).map((c) => c.id);
  if (a.choices.some((c) => !ids.includes(c))) return `choice id not in ${ids.join(",")}`;
  if (q.type === "radio" && a.choices.length !== 1) return "radio needs exactly one choice";
  if (q.maxSelections && a.choices.length > q.maxSelections) return `max ${q.maxSelections} choices`;
  return null;
}

function load(files) {
  const merged = {};
  for (const f of files) {
    try {
      Object.assign(merged, JSON.parse(fs.readFileSync(f, "utf8")));
    } catch (err) {
      console.log(`INVALID JSON ${f}: ${err.message}`);
    }
  }
  return merged;
}

const outFiles = (prefix) =>
  fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).map((f) => path.join(OUT_DIR, f)) : [];

if (mode === "check") {
  const chunk = /^\d+$/.test(chunkArg) ? `chunk-${String(chunkArg).padStart(2, "0")}` : chunkArg;
  const expected = [...fs.readFileSync(path.join(IN_DIR, `${chunk}.txt`), "utf8").matchAll(/^Q (\d+) /gm)].map((m) => m[1]);
  const got = load(outFiles(chunk));
  const errors = Object.entries(got).map(([id, a]) => [id, validate(id, a)]).filter(([, e]) => e);
  const missing = expected.filter((id) => !got[id]);
  for (const [id, e] of errors.slice(0, 40)) console.log(`ERROR ${id}: ${e}`);
  if (missing.length) console.log(`MISSING ${missing.length}: ${missing.slice(0, 60).join(" ")}${missing.length > 60 ? " …" : ""}`);
  console.log(`${chunk}: expected ${expected.length}, answered ${Object.keys(got).length}, errors ${errors.length}, missing ${missing.length}`);
  process.exit(errors.length || missing.length ? 1 : 0);
}

if (mode === "merge") {
  const answersPath = "content/answers.json";
  const answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
  const got = { ...load(outFiles("chunk-")), ...load(outFiles("listen-")) };
  let added = 0, rejected = 0;
  for (const [id, a] of Object.entries(got)) {
    if (validate(id, a)) {
      rejected++;
      continue;
    }
    if (!answers[id]) added++;
    answers[id] = a;
  }
  // Feedback returned by the original site (listening transcripts) wins over generated feedback.
  const serverFeedback = fs.existsSync("content/solve/server-feedback.json")
    ? JSON.parse(fs.readFileSync("content/solve/server-feedback.json", "utf8"))
    : {};
  for (const [id, fb] of Object.entries(serverFeedback)) if (answers[id]) answers[id].feedback = fb;
  // Hand-checked answers (content/solve/manual.json) always win.
  if (fs.existsSync("content/solve/manual.json")) Object.assign(answers, JSON.parse(fs.readFileSync("content/solve/manual.json", "utf8")));
  fs.writeFileSync(answersPath, JSON.stringify(answers));
  console.log({ added, rejected, total: Object.keys(answers).length, questions: questions.size });
}

// node scripts/solve-merge.mjs site -> answers.json built only from the original site:
// explicit answers (site-answers.json) first, then answers read from the site's feedback
// (listen-*.json, site-NN-*.json). Every entry carries the site's own feedback.
if (mode === "site") {
  const explicit = JSON.parse(fs.readFileSync("content/solve/site-answers.json", "utf8"));
  const siteFeedback = JSON.parse(fs.readFileSync("content/solve/site-feedback.json", "utf8"));
  const derived = { ...load(outFiles("listen-")), ...load(outFiles("site-")) };
  const answers = {};
  const stats = { explicit: 0, fromFeedback: 0, rejected: 0 };
  for (const [id, a] of Object.entries(explicit)) {
    if (validate(id, a)) stats.rejected++;
    else {
      answers[id] = a;
      stats.explicit++;
    }
  }
  for (const [id, a] of Object.entries(derived)) {
    if (answers[id] || !siteFeedback[id]) continue; // only questions the site actually explained
    const entry = { ...a, feedback: siteFeedback[id] };
    if (validate(id, entry)) stats.rejected++;
    else {
      answers[id] = entry;
      stats.fromFeedback++;
    }
  }
  fs.writeFileSync("content/answers.json", JSON.stringify(answers));
  console.log({ ...stats, total: Object.keys(answers).length, questions: questions.size });
}
