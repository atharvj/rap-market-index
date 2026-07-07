import { BarChart3, Newspaper, ShieldCheck, Trophy, WalletCards } from "lucide-react";

const points = [
  {
    title: "Fantasy market",
    detail: "RMI uses virtual cash only. There is no real-money deposit, cash-out, or artist affiliation.",
    icon: WalletCards
  },
  {
    title: "Artist securities",
    detail: "Each listed rapper has a quote, daily movement, score, history, watchlist state, and trade flow.",
    icon: BarChart3
  },
  {
    title: "Catalyst-driven pricing",
    detail: "Prices react to audience momentum, public attention, releases, reviews, media events, and eligible order flow.",
    icon: Newspaper
  },
  {
    title: "Market integrity",
    detail: "Admin/test trades are excluded from market impact, with controls for pauses, artist halts, and trade monitoring.",
    icon: ShieldCheck
  }
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded border border-line bg-panel p-5 shadow-market">
        <p className="text-[11px] font-black uppercase tracking-wide text-brass">About RMI</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-black leading-tight">A fantasy rap exchange built around artist momentum.</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-paper/60">
          Rap Market Index is a virtual trading game where users buy and sell artist shares with fantasy cash.
          The goal is to make rap-market momentum readable: who is gaining attention, who is cooling off, and
          which catalysts are moving prices.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {points.map((point) => {
          const Icon = point.icon;

          return (
            <article key={point.title} className="rounded border border-line bg-panel p-4 shadow-market">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded bg-brass/10 text-brass">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h2 className="text-sm font-black uppercase tracking-wide">{point.title}</h2>
              </div>
              <p className="mt-3 text-sm font-bold leading-6 text-paper/58">{point.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded border border-line bg-panel p-5 shadow-market">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1 rounded bg-brass" />
          <Trophy className="h-4 w-4 text-brass" aria-hidden="true" />
          <h2 className="text-xs font-black uppercase tracking-wide">What comes next</h2>
        </div>
        <p className="mt-3 text-sm font-bold leading-6 text-paper/58">
          Public feedback, leagues, deeper social signals, and more asset types can be added after the core artist market
          is stable. For now, RMI is focused on making artist quotes, charts, accounts, trading, and market operations reliable.
        </p>
      </section>
    </div>
  );
}
