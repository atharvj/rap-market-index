"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, BarChart3, Home, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <section className="mx-auto flex min-h-[520px] max-w-3xl items-center justify-center py-12">
      <div className="rmi-card w-full p-6 shadow-market">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded bg-ember/10 text-ember">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-brass">System notice</p>
            <h1 className="mt-2 text-2xl font-black">This page did not load cleanly.</h1>
            <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-paper/58">
              The market is still available. Try reloading this page, or jump back to the market board.
            </p>
            {error.digest ? (
              <p className="mt-3 text-xs font-bold text-paper/38">Error reference: {error.digest}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-paper px-4 text-sm font-black text-ink hover:bg-paper/90"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
          <Link
            href="/markets"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-line px-4 text-sm font-black hover:border-cyan hover:text-cyan"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Now trading
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-line px-4 text-sm font-black hover:border-cyan hover:text-cyan"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
