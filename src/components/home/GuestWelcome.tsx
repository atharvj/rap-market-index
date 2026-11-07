import {
  ArrowRight,
  ChartNoAxesCombined,
  Search,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { STARTING_CASH } from "@/lib/trading";
import { formatCurrency } from "@/lib/formatters";

export function GuestWelcome() {
  return (
    <section
      className="rmi-card overflow-hidden"
      aria-label="Start playing RMI"
    >
      <div className="grid gap-7 p-5 sm:p-8 lg:grid-cols-[1.5fr_1fr] lg:p-10">
        <div>
          <p className="rmi-kicker text-cyan">Rap Market Index</p>
          <h1 className="mt-4 max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">
            Back the artists you believe in.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-paper/65">
            Build a rap portfolio with {formatCurrency(STARTING_CASH)} in
            fantasy cash. Follow real music signals, buy and sell artist shares,
            and see how your picks perform.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/account?mode=signup"
              className="rmi-button-primary inline-flex min-h-11 items-center gap-2 px-5 text-sm font-semibold"
            >
              Start your portfolio{" "}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/methodology"
              className="rmi-button-secondary inline-flex min-h-11 items-center px-5 text-sm font-semibold"
            >
              How prices work
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-paper/50">
            Free to play. No deposits, cash-out, or artist affiliation.
          </p>
        </div>
        <ol className="grid content-center gap-5 border-line lg:border-l lg:pl-7">
          {[
            {
              icon: Search,
              title: "Follow your artists",
              detail: "Build a watchlist around the music you know.",
            },
            {
              icon: WalletCards,
              title: "Make your first pick",
              detail:
                "Review a quote and its trading costs before placing an order.",
            },
            {
              icon: ChartNoAxesCombined,
              title: "Track your week",
              detail:
                "See recorded quote changes, relevant stories, and your portfolio.",
            },
          ].map(({ icon: Icon, title, detail }, i) => (
            <li key={title} className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cyan/10 text-cyan">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  <span className="mr-2 text-paper/40">0{i + 1}</span>
                  {title}
                </h2>
                <p className="mt-1 text-sm leading-6 text-paper/60">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
