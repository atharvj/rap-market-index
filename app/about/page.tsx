import Link from "next/link";
import { Activity, ArrowUpRight, BookOpenCheck, CircleGauge, DatabaseZap, ShieldCheck } from "lucide-react";

const sections = [
  {
    title: "What is RMI?",
    body: "Rap Market Index is a fantasy rap trading game. Users receive virtual cash, buy and sell artist shares, build a portfolio, and compete on a leaderboard. There is no real-money deposit, cash-out, gambling, or artist affiliation."
  },
  {
    title: "How prices move",
    body: "Artist prices are updated by a market engine that looks for meaningful changes in audience momentum, video activity, public attention, releases, reviews, major events, and eligible trading demand. Durable listener, play, subscriber, and view scale also keeps long-term quote levels comparable. The exact weights are kept internal so the game is harder to manipulate."
  },
  {
    title: "What a quote means",
    body: "An RMI quote is a fantasy index value, not an artist's net worth, revenue, or literal market capitalization. A larger established audience generally supports a higher long-term range, while verified momentum and catalysts determine how the quote moves from one market session to the next."
  },
  {
    title: "What the RMI Score means",
    body: "RMI Score is a 1-99 reading of current signal strength across audience momentum, public attention, verified catalysts, reception, and eligible trading demand. Scores near 50 are neutral or mixed, scores below 40 are weakening, and scores above 60 are strengthening. It is not a price target, forecast, or daily percentage change, so the strongest signal and the day's top gainer can be different artists."
  },
  {
    title: "Why audience size is not the whole price",
    body: "Monthly reach can jump temporarily after a feature or playlist placement. RMI treats that as momentum first and waits for durable listening, direct-channel growth, and broader attention before allowing it to become a permanent valuation change."
  },
  {
    title: "How catalysts are checked",
    body: "Release, review, social, and audience signals are checked during market runs. Routine uploads and isolated fan posts are filtered out, while larger moves require stronger source confidence, independent confirmation, or measurable audience reaction. No single headline determines an artist quote by itself."
  },
  {
    title: "What happens outside music",
    body: "A major appearance, controversy, performance, or cultural moment can create short-term public-attention momentum and may appear in RMI news. It has a smaller and more temporary price effect unless direct music demand, audience growth, or sustained fan interest confirms that the attention is carrying back into the artist's music career."
  },
  {
    title: "Why it exists",
    body: "Rap fans already debate who is rising, falling, overhyped, underrated, or about to break out. RMI turns those debates into a structured fantasy market with prices, charts, watchlists, portfolios, and standings."
  }
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rmi-page-head market-grid rmi-noise relative overflow-hidden p-5 sm:p-8">
        <div className="relative z-10 grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="rmi-kicker"><Activity className="h-3.5 w-3.5" aria-hidden="true" /> System Brief</div>
            <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight sm:text-5xl">The signal layer for rap momentum.</h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-paper/60">
              RMI turns verified audience movement, public attention, music events, and fantasy-market activity into a transparent experience for following artist momentum.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TrustMetric icon={DatabaseZap} label="Inputs" value="Multi-source" tone="cyan" />
            <TrustMetric icon={CircleGauge} label="Output" value="Daily quotes" tone="violet" />
            <TrustMetric icon={BookOpenCheck} label="Evidence" value="Verified" tone="mint" />
            <TrustMetric icon={ShieldCheck} label="Economy" value="Fantasy only" tone="brass" />
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="rmi-card overflow-hidden shadow-market">
          <section className="rmi-section-header">
            <div>
              <p className="rmi-data-label text-cyan">Market Framework</p>
              <h2 className="mt-1 text-xl font-black">How RMI works</h2>
            </div>
            <span className="rmi-status-chip border-mint/30 bg-mint/8 text-mint"><span className="rmi-live-dot" /> Operational</span>
          </section>

          <div className="grid md:grid-cols-2">
            {sections.map((section, index) => (
              <section key={section.title} className="group border-b border-line p-5 transition hover:bg-panelSoft/55 md:odd:border-r">
                <div className="flex items-start gap-4">
                  <span className="number-tabular text-xs font-black text-cyan/70">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-base font-black group-hover:text-cyan">{section.title}</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-paper/56">{section.body}</p>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </main>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <section className="rmi-card overflow-hidden shadow-market">
            <div className="rmi-section-header">
              <h2 className="text-sm font-black">Exchange Directory</h2>
              <Activity className="h-4 w-4 text-cyan" aria-hidden="true" />
            </div>
            <div className="divide-y divide-line">
              {[
                ["Now Trading", "/markets"],
                ["Market News", "/news"],
                ["Global Rankings", "/leaderboard"],
                ["My Portfolio", "/portfolio"],
                ["Help Center", "/help"]
              ].map(([label, href]) => (
                <Link key={href} href={href} className="flex items-center justify-between px-4 py-3 text-sm font-bold text-paper/65 transition hover:bg-cyan/5 hover:text-cyan">
                  {label}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>

          <section className="rmi-signal-card market-grid border-t-2 border-t-violet/70 p-5 shadow-market">
            <p className="rmi-data-label text-violet">Support Channel</p>
            <h2 className="mt-2 text-lg font-black">Need a clearer signal?</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-paper/55">
              Find answers about accounts, trading, artist quotes, portfolios, privacy, and common problems.
            </p>
            <Link href="/help" className="rmi-button-secondary mt-5 flex h-10 items-center justify-center text-sm">Open Help Center</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function TrustMetric({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string; tone: "cyan" | "violet" | "mint" | "brass" }) {
  const tones = {
    cyan: "border-cyan/25 bg-cyan/7 text-cyan",
    violet: "border-violet/25 bg-violet/7 text-violet",
    mint: "border-mint/25 bg-mint/7 text-mint",
    brass: "border-brass/25 bg-brass/7 text-brass"
  };

  return (
    <div className={`rounded-md border p-3 ${tones[tone]}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <p className="mt-3 text-[10px] font-black uppercase text-paper/40">{label}</p>
      <p className="mt-0.5 text-sm font-black text-paper">{value}</p>
    </div>
  );
}
