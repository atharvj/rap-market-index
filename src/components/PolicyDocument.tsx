import Link from "next/link";
import { FileCheck2, ShieldCheck } from "lucide-react";
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
    <article className="mx-auto max-w-6xl space-y-5">
      <header className="rmi-hero p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-end">
          <div>
            <p className="rmi-kicker"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> RMI Trust Center</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-5xl">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-paper/65">{summary}</p>
          </div>
          <div className="rmi-signal-card rmi-signal-cyan p-4">
            <p className="rmi-data-label">Document Status</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md border border-cyan/35 bg-cyan/10 text-cyan">
                <FileCheck2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Current Policy</p>
                <p className="mt-0.5 text-xs font-medium text-paper/45">Effective {effectiveDate}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="rmi-card h-fit p-4 lg:sticky lg:top-32 lg:self-start">
          <p className="rmi-data-label text-cyan">Document Index</p>
          <nav className="mt-3 grid gap-1 text-sm font-medium text-paper/60" aria-label={`${title} sections`}>
            {sections.map((section, index) => (
              <a key={section.id} href={`#${section.id}`} className="rounded-md border border-transparent px-3 py-2 transition-colors hover:border-cyan/30 hover:bg-cyan/5 hover:text-cyan">
                <span className="mr-2 font-semibold text-cyan">{String(index + 1).padStart(2, "0")}</span>
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <main className="rmi-card min-w-0 overflow-hidden px-5 sm:px-7">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className={`scroll-mt-32 py-7 ${index < sections.length - 1 ? "border-b border-line" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-cyan/35 bg-cyan/10 text-xs font-semibold text-cyan">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="text-xl font-semibold">{section.title}</h2>
              </div>
              <div className="mt-3 text-sm leading-7 text-paper/65">{section.body}</div>
            </section>
          ))}
          <Link href={link.href} className="rmi-button-secondary mb-7 mt-1 inline-flex min-h-10 items-center rounded-md border border-line px-4 text-sm font-semibold">
            {link.label}
          </Link>
        </main>
      </div>
    </article>
  );
}
