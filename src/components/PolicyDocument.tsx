import Link from "next/link";
import type { ReactNode } from "react";

type PolicySection = {
  id: string;
  title: string;
  body: ReactNode;
};

export function PolicyDocument({
  title,
  summary,
  effectiveDate,
  sections,
  link
}: {
  title: string;
  summary: string;
  effectiveDate: string;
  sections: PolicySection[];
  link: { href: string; label: string };
}) {
  return (
    <article className="mx-auto max-w-5xl">
      <header className="border-b border-line pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan">RMI Policy</p>
        <h1 className="mt-2 text-3xl font-black">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-paper/65">{summary}</p>
        <p className="mt-3 text-xs font-bold text-paper/40">Effective {effectiveDate}</p>
      </header>

      <div className="grid gap-8 py-7 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-paper/40">On This Page</p>
          <nav className="mt-3 grid gap-2 text-sm font-bold text-paper/60" aria-label={`${title} sections`}>
            {sections.map((section, index) => (
              <a key={section.id} href={`#${section.id}`} className="hover:text-cyan">
                {index + 1}. {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-8 border-b border-line py-6 first:pt-0 last:border-b-0">
              <p className="text-xs font-black text-cyan">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="mt-1 text-xl font-black">{section.title}</h2>
              <div className="mt-3 text-sm leading-7 text-paper/65">{section.body}</div>
            </section>
          ))}
          <Link href={link.href} className="mt-6 inline-flex text-sm font-black text-cyan hover:text-cyan/75">
            {link.label}
          </Link>
        </main>
      </div>
    </article>
  );
}
