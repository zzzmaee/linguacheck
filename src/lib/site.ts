import { findEntry } from "./content";

export const SITE_NAME = "LinguaCheck";
export const SITE_TAGLINE = "Grammar, vocabulary, listening, reading and writing practice for every level.";

export const LEVELS = [
  { key: "a1", label: "A1", name: "Elementary" },
  { key: "a2", label: "A2", name: "Pre-intermediate" },
  { key: "b1", label: "B1", name: "Intermediate" },
  { key: "b1-b2", label: "B1+", name: "Upper-intermediate" },
  { key: "b2", label: "B2", name: "Pre-advanced" },
  { key: "c1", label: "C1", name: "Advanced" },
] as const;

const SECTION_DEFS = [
  { key: "grammar-points", label: "Grammar", blurb: "Lessons with clear explanations and exercises." },
  { key: "vocabulary", label: "Vocabulary", blurb: "Topic vocabulary with practice activities." },
  { key: "listening", label: "Listening", blurb: "Audio and video tests with questions." },
  { key: "reading", label: "Reading", blurb: "Texts with comprehension questions." },
  { key: "use-of-english", label: "Use of English", blurb: "Mixed grammar and vocabulary tasks." },
  { key: "writing", label: "Writing", blurb: "Model texts, tips and writing tasks." },
];

const EXAMS = [
  { label: "A2 Key", path: "/exams/a2-key/" },
  { label: "B1 Preliminary", path: "/exams/b1-preliminary/" },
  { label: "B2 First", path: "/exams/b2-first/" },
  { label: "IELTS", path: "/exams/ielts/" },
  { label: "TOEFL iBT", path: "/exams/toefl-ibt/" },
];

export type NavLink = { label: string; path: string; hint?: string };
export type NavSection = { key: string; label: string; path: string; blurb?: string; links: NavLink[] };

// Built from the content index so menus only link to pages that exist.
export function getNav(): NavSection[] {
  const sections: NavSection[] = SECTION_DEFS.map((s) => ({
    ...s,
    path: `/${s.key}/`,
    links: LEVELS.filter((l) => findEntry(`/${s.key}/${l.key}/`)).map((l) => ({
      label: `${l.label} ${s.label}`,
      hint: l.name,
      path: `/${s.key}/${l.key}/`,
    })),
  }));
  sections.push({
    key: "exams",
    label: "Exams",
    path: "/exams/",
    blurb: "Practice exams for Cambridge, IELTS and TOEFL.",
    links: EXAMS.filter((e) => findEntry(e.path)),
  });
  return sections.filter((s) => findEntry(s.path));
}

export function levelLabel(key: string | null) {
  return LEVELS.find((l) => l.key === key)?.label ?? null;
}
