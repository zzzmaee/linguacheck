"use client";

import parse, { domToReact, Element, type DOMNode, type HTMLReactParserOptions } from "html-react-parser";
import Link from "next/link";
import type { AnswerKey, QuizData } from "@/lib/types";
import { Quiz } from "./Quiz";

export function RichHtml({
  html,
  quizzes = {},
  answers = {},
  className = "prose-content",
}: {
  html: string;
  quizzes?: Record<string, QuizData>;
  answers?: AnswerKey;
  className?: string;
}) {
  const options: HTMLReactParserOptions = {
    replace(node) {
      if (!(node instanceof Element)) return;
      const { attribs } = node;
      if (attribs["data-quiz"] !== undefined) {
        const quiz = quizzes[attribs["data-quiz"]];
        return quiz ? <Quiz quiz={quiz} answers={answers} /> : <></>;
      }
      if (attribs["data-youtube"]) return <YouTube id={attribs["data-youtube"]} />;
      if (node.name === "a" && attribs.href?.startsWith("/") && !attribs.href.startsWith("/media/")) {
        return <Link href={attribs.href}>{domToReact(node.children as DOMNode[], options)}</Link>;
      }
    },
  };
  return <div className={className}>{parse(html, options)}</div>;
}

export function YouTube({ id }: { id: string }) {
  return (
    <div className="not-prose my-6 aspect-video w-full overflow-hidden rounded-2xl bg-black">
      <iframe
        className="h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title="Video"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
