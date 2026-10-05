"use client";

import { useMemo, useState } from "react";
import type { AnswerKey, QuizData } from "@/lib/types";
import { RichHtml } from "./RichHtml";

function partLabel(html: string, i: number) {
  const h3 = html.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1]?.replace(/<[^>]+>/g, "").trim();
  return h3 && h3.length < 40 ? h3 : `Part ${i + 1}`;
}

export function LessonView({
  parts,
  explanation,
  quizzes,
  answers,
}: {
  parts: string[];
  explanation: string | null;
  quizzes: QuizData[];
  answers: AnswerKey;
}) {
  const [tab, setTab] = useState<"exercises" | "explanation">("exercises");
  const [part, setPart] = useState(0);
  const quizMap = useMemo(() => Object.fromEntries(quizzes.map((q) => [String(q.id), q])), [quizzes]);

  const tabs = [
    { key: "exercises" as const, label: parts.length > 1 ? "Exercises" : "Test" },
    ...(explanation ? [{ key: "explanation" as const, label: "Explanation" }] : []),
  ];

  return (
    <div>
      {tabs.length > 1 && (
        <div role="tablist" className="mb-6 flex gap-1 border-b border-line">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2.5 font-semibold ${
                tab === t.key ? "border-brand text-brand" : "border-transparent text-subtle hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div hidden={tab !== "exercises"}>
          {parts.length > 1 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {parts.map((html, i) => (
                <button
                  key={i}
                  onClick={() => setPart(i)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                    part === i ? "bg-brand text-white" : "bg-muted hover:bg-line"
                  }`}
                >
                  {partLabel(html, i)}
                </button>
              ))}
            </div>
          )}
          {/* All parts stay mounted (hidden) so answers survive switching and every quiz is in the HTML. */}
          {parts.map((html, i) => (
            <div key={i} hidden={i !== part} data-part={i}>
              <RichHtml html={html} quizzes={quizMap} answers={answers} />
            </div>
          ))}
          {parts.length > 1 && part < parts.length - 1 && (
            <button
              onClick={() => {
                setPart(part + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="mt-2 font-semibold text-brand hover:underline"
            >
              Next: {partLabel(parts[part + 1], part + 1)} →
            </button>
          )}
      </div>

      {explanation && (
        <div hidden={tab !== "explanation"}>
          <RichHtml html={explanation} quizzes={quizMap} answers={answers} />
        </div>
      )}
    </div>
  );
}
