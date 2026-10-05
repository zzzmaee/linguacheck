import fs from "node:fs";
import path from "node:path";
import type { AnswerKey, IndexEntry, Page, QuizData } from "./types";

const DIR = path.join(process.cwd(), "content");

let index: IndexEntry[] | undefined;
let byPath: Map<string, IndexEntry> | undefined;
let answers: AnswerKey | undefined;

export function getIndex(): IndexEntry[] {
  index ??= JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8")) as IndexEntry[];
  return index;
}

export function findEntry(p: string): IndexEntry | undefined {
  byPath ??= new Map(getIndex().map((e) => [e.path, e]));
  return byPath.get(p);
}

export function getPage(p: string): Page | null {
  const entry = findEntry(p);
  if (!entry) return null;
  return JSON.parse(fs.readFileSync(path.join(DIR, "pages", entry.file), "utf8")) as Page;
}

// Only the keys for the questions on this page are sent to the browser.
export function answersFor(quizzes: QuizData[]): AnswerKey {
  answers ??= JSON.parse(fs.readFileSync(path.join(DIR, "answers.json"), "utf8")) as AnswerKey;
  const out: AnswerKey = {};
  for (const quiz of quizzes)
    for (const q of quiz.questions) if (answers[q.id]) out[q.id] = answers[q.id];
  return out;
}
