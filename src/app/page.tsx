import Link from "next/link";
import { getIndex } from "@/lib/content";
import { getNav, LEVELS, levelLabel, SITE_TAGLINE } from "@/lib/site";
import { findEntry } from "@/lib/content";

export default function Home() {
  const nav = getNav();
  const latest = getIndex()
    .filter((e) => e.kind === "lesson" && e.level && e.image)
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-14 sm:py-20">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Learn and practise English <span className="text-brand">at your level</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-subtle">{SITE_TAGLINE}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/level-test/" className="rounded-full bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-strong">
            Take the level test
          </Link>
          <Link href="/grammar-points/" className="rounded-full border border-line px-6 py-3 font-semibold hover:bg-muted">
            Browse grammar
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Choose a skill</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {nav.map((s) => (
            <div key={s.key} className="rounded-2xl border border-line bg-surface p-5">
              <Link href={s.path} className="text-xl font-bold hover:text-brand">
                {s.label}
              </Link>
              {s.blurb && <p className="mt-1 text-sm text-subtle">{s.blurb}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {s.links.map((l) => (
                  <Link key={l.path} href={l.path} className="rounded-full bg-muted px-3 py-1 text-sm font-semibold hover:bg-brand hover:text-white">
                    {l.label.replace(` ${s.label}`, "")}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="mb-4 text-2xl font-bold">Study by level</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {LEVELS.filter((l) => findEntry(`/level-${l.key}/`)).map((l) => (
            <Link key={l.key} href={`/level-${l.key}/`} className="rounded-2xl border border-line p-4 text-center hover:border-brand">
              <div className="text-2xl font-bold text-brand">{l.label}</div>
              <div className="text-sm text-subtle">{l.name}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="mb-4 text-2xl font-bold">Latest lessons and tests</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {latest.map((e) => (
            <Link key={e.path} href={e.path} className="group overflow-hidden rounded-2xl border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.image!} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
              <div className="p-3">
                <span className="text-xs font-semibold uppercase text-brand">{levelLabel(e.level)}</span>
                <h3 className="font-semibold leading-snug group-hover:text-brand">{e.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
