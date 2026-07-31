import Link from "next/link";
import { CalendarDays, ShieldCheck } from "lucide-react";
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
    <article className="mx-auto max-w-5xl space-y-10">
      <header className="border-b border-line pb-8 pt-2 sm:pb-10 sm:pt-5">
        <div className="max-w-3xl">
          <p className="rmi-kicker"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Policies</p>
          <h1 className="mt-4 text-3xl font-bold sm:text-5xl">{title}</h1>
          <p className="mt-4 text-base leading-7 text-paper/65">{summary}</p>
          <p className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-paper/45">
            <CalendarDays className="h-4 w-4 text-cyan" aria-hidden="true" />
            Effective {effectiveDate}
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="h-fit border-b border-line pb-6 lg:sticky lg:top-20 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
          <p className="text-xs font-semibold text-paper/45">On this page</p>
          <nav className="mt-3 grid gap-1" aria-label={`${title} sections`}>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-md px-3 py-2 text-sm font-medium text-paper/60 transition-colors hover:bg-panelSoft hover:text-cyan"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <main className="rmi-card min-w-0 overflow-hidden px-5 sm:px-7">
          <div className="border-b border-line py-6">
            <p className="text-xs font-semibold text-cyan">Current policy</p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          </div>
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className={`scroll-mt-24 py-6 ${index < sections.length - 1 ? "border-b border-line" : ""}`}
            >
              <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 sm:gap-4">
                <span className="number-tabular pt-1 text-xs font-semibold text-paper/30">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="max-w-3xl">
                  <h3 className="text-lg font-semibold">{section.title}</h3>
                  <div className="mt-2 text-sm leading-7 text-paper/65">{section.body}</div>
                </div>
              </div>
            </section>
          ))}
          <div className="border-t border-line py-6">
            <Link href={link.href} className="rmi-button-secondary inline-flex min-h-10 items-center rounded-md border border-line px-4 text-sm font-semibold">
              {link.label}
            </Link>
          </div>
        </main>
      </div>
    </article>
  );
}
