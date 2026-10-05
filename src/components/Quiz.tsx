"use client";

import parse, { Element, type HTMLReactParserOptions } from "html-react-parser";
import { useState } from "react";
import type { AnswerKey, Question, QuizData } from "@/lib/types";

type Response = { choices?: number[]; gaps?: string[] };
type Grade = { correct: boolean; gaps?: boolean[] } | null; // null = no key for this question

const normalize = (s: string) =>
  s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

function grade(q: Question, r: Response | undefined, answers: AnswerKey): Grade {
  const key = answers[q.id];
  if (!key) return null;
  if (q.type === "gaps") {
    if (!key.gaps) return null;
    // An empty list means the source gives no answer for that gap: it is not graded.
    const gaps = key.gaps.map((accepted, i) => !accepted.length || accepted.map(normalize).includes(normalize(r?.gaps?.[i] ?? "")));
    return { correct: gaps.every(Boolean), gaps };
  }
  if (!key.choices) return null;
  const picked = [...(r?.choices ?? [])].sort();
  const expected = [...key.choices].sort();
  return { correct: picked.length === expected.length && picked.every((v, i) => v === expected[i]) };
}

export function Quiz({ quiz, answers }: { quiz: QuizData; answers: AnswerKey }) {
  const [responses, setResponses] = useState<Record<number, Response>>({});
  const [checked, setChecked] = useState(false);

  const update = (id: number, r: Response) => {
    if (checked) return;
    setResponses((prev) => ({ ...prev, [id]: { ...prev[id], ...r } }));
  };

  const grades = checked ? quiz.questions.map((q) => grade(q, responses[q.id], answers)) : [];
  const graded = grades.filter((g) => g !== null);
  const score = graded.filter((g) => g.correct).length;
  const hasKey = quiz.questions.some((q) => answers[q.id]);

  return (
    <form
      className="not-prose my-6 rounded-2xl border border-line bg-surface p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setChecked(true);
      }}
    >
      <ol className="space-y-6">
        {quiz.questions.map((q, i) => (
          <QuestionView
            key={q.id}
            q={q}
            response={responses[q.id]}
            onChange={(r) => update(q.id, r)}
            grade={checked ? grades[i] : undefined}
            answerKey={checked ? answers[q.id] : undefined}
            // Long passages repeated before every question are shown once, then collapsed.
            collapseIntro={!!q.intro && q.intro.length > 1500 && quiz.questions.slice(0, i).some((p) => p.intro && p.intro.length > 1500)}
          />
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-line pt-5">
        {!checked ? (
          <button type="submit" className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-strong">
            Check answers
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setChecked(false);
              setResponses({});
            }}
            className="rounded-full border border-line px-6 py-2.5 font-semibold hover:bg-muted"
          >
            Try again
          </button>
        )}
        {checked &&
          (graded.length ? (
            <p className="text-lg font-semibold">
              Score: {score} / {graded.length}
              <span className="ml-2 text-sm font-normal text-subtle">({Math.round((score / graded.length) * 100)}%)</span>
            </p>
          ) : (
            <p className="text-sm text-subtle">
              {hasKey ? "" : "The answer key for this exercise has not been added yet (content/answers.json)."}
            </p>
          ))}
      </div>
    </form>
  );
}

function QuestionView({
  q,
  response,
  onChange,
  grade,
  answerKey,
  collapseIntro,
}: {
  q: Question;
  response?: Response;
  onChange: (r: Response) => void;
  grade?: Grade;
  answerKey?: AnswerKey[string];
  collapseIntro?: boolean;
}) {
  const setGap = (i: number, value: string) => {
    const gaps = [...(response?.gaps ?? [])];
    gaps[i] = value;
    onChange({ gaps });
  };

  const promptOptions: HTMLReactParserOptions = {
    replace(node) {
      if (!(node instanceof Element) || node.attribs["data-gap"] === undefined) return;
      const i = Number(node.attribs["data-gap"]);
      const gap = q.gaps?.[i];
      if (!gap) return <></>;
      const state = grade?.gaps ? (grade.gaps[i] ? "ok" : "bad") : undefined;
      const expected = state === "bad" ? answerKey?.gaps?.[i]?.[0] : undefined;
      return (
        <GapInput
          gap={gap}
          value={response?.gaps?.[i] ?? ""}
          onChange={(v) => setGap(i, v)}
          state={state}
          expected={expected}
          label={`Question ${q.num}, gap ${i + 1}`}
        />
      );
    },
  };

  const border = grade === undefined || grade === null ? "border-transparent" : grade.correct ? "border-ok" : "border-bad";

  return (
    <>
    {q.intro && (
      <li className="list-none">
        {collapseIntro ? (
          <details className="rounded-xl bg-muted p-4">
            <summary className="cursor-pointer text-sm font-semibold text-subtle">Show the passage again</summary>
            <div className="prose-content mt-3">{parse(q.intro)}</div>
          </details>
        ) : (
          <div className="prose-content rounded-xl bg-muted p-4">{parse(q.intro)}</div>
        )}
      </li>
    )}
    <li className={`flex gap-3 border-l-4 pl-3 ${border}`} data-qid={q.id} data-type={q.type}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
        {q.num}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="quiz-prompt leading-relaxed">{parse(q.prompt, promptOptions)}</div>
        {q.choices && q.display === "dropdown" && (
          <select
            className="w-full max-w-md rounded-lg border border-line bg-background px-3 py-2"
            value={response?.choices?.[0] ?? ""}
            onChange={(e) => onChange({ choices: e.target.value ? [Number(e.target.value)] : [] })}
            aria-label={`Question ${q.num}`}
          >
            <option value="">- please select -</option>
            {q.choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.html}
              </option>
            ))}
          </select>
        )}
        {q.choices && q.display !== "dropdown" && (
          <div className="grid gap-2">
            {q.choices.map((c) => {
              const selected = response?.choices?.includes(c.id) ?? false;
              const isCorrect = answerKey?.choices?.includes(c.id);
              const tone =
                grade && isCorrect ? "border-ok bg-ok/10" : grade && selected ? "border-bad bg-bad/10" : selected ? "border-brand bg-brand/5" : "border-line";
              return (
                <label key={c.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 ${tone}`}>
                  <input
                    type={q.type === "checkbox" ? "checkbox" : "radio"}
                    data-choice={c.id}
                    name={`q-${q.id}`}
                    className="mt-1 accent-brand"
                    checked={selected}
                    onChange={(e) => {
                      if (q.type !== "checkbox") return onChange({ choices: [c.id] });
                      const current = response?.choices ?? [];
                      if (e.target.checked && q.maxSelections && current.length >= q.maxSelections) return;
                      onChange({ choices: e.target.checked ? [...current, c.id] : current.filter((x) => x !== c.id) });
                    }}
                  />
                  {c.letter && <span className="font-semibold text-subtle">{c.letter}</span>}
                  <span>{parse(c.html)}</span>
                </label>
              );
            })}
          </div>
        )}
        {grade === null && <p className="text-sm text-subtle">No answer key for this question.</p>}
        {grade && answerKey?.feedback && <div className="text-sm text-subtle">{parse(answerKey.feedback)}</div>}
      </div>
    </li>
    </>
  );
}

function GapInput({
  gap,
  value,
  onChange,
  state,
  expected,
  label,
}: {
  gap: NonNullable<Question["gaps"]>[number];
  value: string;
  onChange: (v: string) => void;
  state?: "ok" | "bad";
  expected?: string;
  label: string;
}) {
  const tone = state === "ok" ? "border-ok bg-ok/10" : state === "bad" ? "border-bad bg-bad/10" : "border-line bg-background";
  return (
    <span className="mx-1 inline-flex flex-wrap items-baseline gap-1 align-baseline">
      {gap.kind === "select" ? (
        <select data-gap-select className={`max-w-full rounded-md border px-2 py-0.5 ${tone}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          <option value=""></option>
          {gap.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          data-gap-text
          className={`w-36 rounded-md border px-2 py-0.5 ${tone}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
        />
      )}
      {expected && <span className="text-sm font-semibold text-ok">{expected}</span>}
    </span>
  );
}
