// Applies site-confirmed answers from raw/verify/fix-results.jsonl to content/answers.json.
// - confirmed by the site            -> becomes the key (with the site's feedback)
// - site rejected ours, nothing found -> our wrong key is removed (or the unconfirmed gaps are emptied)
import fs from "node:fs";

const answers = JSON.parse(fs.readFileSync("content/answers.json", "utf8"));
const siteFeedback = JSON.parse(fs.readFileSync("content/solve/site-feedback.json", "utf8"));
const lines = fs.readFileSync("raw/verify/fix-results.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const stats = { confirmed: 0, partialGaps: 0, removed: 0 };
for (const { out } of lines) {
  for (const [id, r] of Object.entries(out)) {
    const feedback = siteFeedback[id] ?? answers[id]?.feedback;
    if (r.gaps) {
      if (r.gaps.some((g) => g.length)) {
        answers[id] = { gaps: r.gaps, ...(feedback ? { feedback } : {}) };
        r.confirmed ? stats.confirmed++ : stats.partialGaps++;
      } else if (answers[id]) {
        delete answers[id];
        stats.removed++;
      }
    } else if (r.confirmed && r.choices) {
      answers[id] = { choices: r.choices.map(Number), ...(feedback ? { feedback } : {}) };
      stats.confirmed++;
    } else if (answers[id]) {
      delete answers[id];
      stats.removed++;
    }
  }
}
fs.writeFileSync("content/answers.json", JSON.stringify(answers));
console.log({ ...stats, keyed: Object.keys(answers).length });
