export type Choice = { id: number; letter?: string; html: string };

export type Gap = { kind: "select"; options: string[] } | { kind: "text" };

export type Question = {
  id: number;
  num: string;
  type: "radio" | "checkbox" | "gaps";
  prompt: string;
  intro?: string; // passage or task text shown above the question
  gaps?: Gap[];
  choices?: Choice[];
  display?: "dropdown";
  maxSelections?: number;
};

export type QuizData = { id: number; questions: Question[] };

// Keyed by question id. `choices` = correct choice ids, `gaps` = accepted answers per gap.
export type AnswerKey = Record<string, { choices?: number[]; gaps?: string[][]; feedback?: string }>;

export type IndexEntry = {
  id: number;
  path: string;
  parentId: number | null;
  order: number;
  section: string | null;
  level: string | null;
  kind: "lesson" | "listing" | "page" | "home";
  title: string;
  image: string | null;
  modified: string;
  file: string;
};

type PageBase = {
  id: number;
  path: string;
  section: string | null;
  level: string | null;
  title: string;
  seo: { title: string | null; description: string | null; image: string | null };
};

export type LessonPage = PageBase & { kind: "lesson"; parts: string[]; explanation: string | null; quizzes: QuizData[] };
export type ListingPage = PageBase & {
  kind: "listing";
  intro: string;
  items: { path: string; title: string; image: string | null }[];
};
export type HtmlPage = PageBase & { kind: "page" | "home"; html: string; quizzes: QuizData[] };

export type Page = LessonPage | ListingPage | HtmlPage;
