import Link from "next/link";
import { getNav, SITE_NAME } from "@/lib/site";

export function Header() {
  const nav = getNav();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">✓</span>
          {SITE_NAME}
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {nav.map((s) => (
            <div key={s.key} className="group relative">
              <Link href={s.path} className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted">
                {s.label}
              </Link>
              {s.links.length > 0 && (
                <div className="invisible absolute left-0 top-full min-w-56 rounded-xl border border-line bg-background p-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  {s.links.map((l) => (
                    <Link key={l.path} href={l.path} className="flex justify-between gap-4 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                      <span>{l.label}</span>
                      {l.hint && <span className="text-subtle">{l.hint}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Link href="/level-test/" className="ml-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong">
            Level test
          </Link>
        </nav>

        <details className="relative lg:hidden">
          <summary className="cursor-pointer list-none rounded-lg border border-line px-3 py-2 text-sm font-semibold">Menu</summary>
          <div className="absolute right-0 top-full mt-2 max-h-[75vh] w-72 overflow-y-auto rounded-xl border border-line bg-background p-3 shadow-lg">
            {nav.map((s) => (
              <div key={s.key} className="mb-3">
                <Link href={s.path} className="block px-2 py-1 font-semibold">
                  {s.label}
                </Link>
                <div className="flex flex-wrap gap-1 px-2">
                  {s.links.map((l) => (
                    <Link key={l.path} href={l.path} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                      {l.label.replace(` ${s.label}`, "")}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <Link href="/level-test/" className="block rounded-lg bg-brand px-3 py-2 text-center font-semibold text-white">
              Level test
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}

export function Footer() {
  const links = [
    ["About us", "/about-us/"],
    ["Contact", "/contact-us/"],
    ["Site map", "/site-map/"],
    ["Terms of use", "/terms-of-use/"],
    ["Privacy policy", "/privacy-policy/"],
  ];
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-subtle">
        <span>© {new Date().getFullYear()} {SITE_NAME}</span>
        <nav className="flex flex-wrap gap-4">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
