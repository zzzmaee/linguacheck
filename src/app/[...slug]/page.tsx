import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonView } from "@/components/LessonView";
import { RichHtml } from "@/components/RichHtml";
import { answersFor, findEntry, getIndex, getPage } from "@/lib/content";
import { levelLabel } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getIndex()
    .filter((e) => e.path !== "/")
    .map((e) => ({ slug: e.path.split("/").filter(Boolean) }));
}

const toPath = (slug: string[]) => `/${slug.map(decodeURIComponent).join("/")}/`;

export async function generateMetadata({ params }: PageProps<"/[...slug]">): Promise<Metadata> {
  const page = getPage(toPath((await params).slug));
  if (!page) return {};
  return {
    title: page.title,
    description: page.seo.description ?? undefined,
    openGraph: page.seo.image ? { images: [page.seo.image] } : undefined,
  };
}

function Breadcrumbs({ path }: { path: string }) {
  const segs = path.split("/").filter(Boolean);
  const crumbs = segs.slice(0, -1).flatMap((_, i) => {
    const p = `/${segs.slice(0, i + 1).join("/")}/`;
    const entry = findEntry(p);
    return entry ? [{ path: p, title: entry.title }] : [];
  });
  if (!crumbs.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-1 text-sm text-subtle">
      {crumbs.map((c) => (
        <span key={c.path} className="flex gap-1">
          <Link href={c.path} className="hover:text-brand">
            {c.title}
          </Link>
          <span>/</span>
        </span>
      ))}
    </nav>
  );
}

export default async function Page({ params }: PageProps<"/[...slug]">) {
  const page = getPage(toPath((await params).slug));
  if (!page) notFound();
  const level = levelLabel(page.level);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Breadcrumbs path={page.path} />
      <h1 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">
        {level && page.kind === "lesson" && (
          <span className="mr-3 inline-block rounded-lg bg-brand px-2 py-0.5 align-middle text-base text-white">{level}</span>
        )}
        {page.title}
      </h1>

      {page.kind === "lesson" && (
        <LessonView parts={page.parts} explanation={page.explanation} quizzes={page.quizzes} answers={answersFor(page.quizzes)} />
      )}

      {page.kind === "listing" && (
        <>
          {page.intro && <RichHtml html={page.intro} />}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {page.items.map((item) => (
              <Link key={item.path} href={item.path} className="group overflow-hidden rounded-2xl border border-line bg-surface hover:border-brand">
                {item.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
                )}
                <h2 className="p-4 font-semibold leading-snug group-hover:text-brand">{item.title}</h2>
              </Link>
            ))}
          </div>
        </>
      )}

      {(page.kind === "page" || page.kind === "home") && (
        <RichHtml
          html={page.html}
          quizzes={Object.fromEntries(page.quizzes.map((q) => [String(q.id), q]))}
          answers={answersFor(page.quizzes)}
        />
      )}
    </div>
  );
}
