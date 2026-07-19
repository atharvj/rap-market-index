import { BarChart3, Home, Search } from "lucide-react";
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="mx-auto flex min-h-[520px] max-w-3xl items-center justify-center py-12">
      <div className="rmi-card w-full p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded bg-brass/10 text-brass">
            <Search className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brass">Not found</p>
            <h1 className="mt-2 text-2xl font-semibold">That page does not exist.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-paper/58">
              The page may have moved, or the address may be incorrect.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/markets"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:bg-paper/90"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Now trading
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-line px-4 text-sm font-semibold transition-colors hover:border-cyan hover:text-cyan"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
