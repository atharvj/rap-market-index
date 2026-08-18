import Link from "next/link";
import { Activity, ArrowUpRight, BookOpenCheck, CircleGauge, DatabaseZap, ShieldCheck } from "lucide-react";

const sections = [
  {
    id: "overview",
    title: "What is RMI?",
    body: "Rap Market Index is a fantasy rap trading game. Users receive virtual cash, buy and sell artist shares, build a portfolio, and compete on a leaderboard. There is no real-money deposit, cash-out, gambling, or artist affiliation."
  },
  {
    id: "price-movement",
    title: "How prices move",
    body: "Artist prices are updated by a market engine that looks for meaningful changes in audience momentum, video activity, public attention, releases, reviews, major events, and eligible trading demand. Durable listener, play, subscriber, and view scale also keeps long-term quote levels comparable. The exact weights are kept internal so the game is harder to manipulate."
  },
  {
    id: "quote-meaning",
    title: "What a quote means",
    body: "An RMI quote is a fantasy index value, not an artist's net worth, revenue, or literal market capitalization. A larger established audience generally supports a higher long-term range, while verified momentum and catalysts determine how the quote moves from one market session to the next."
  },
  {
    id: "momentum",
    title: "What RMI Momentum means",
    body: "RMI Momentum is a 1–100 reading of current directional evidence across audience changes, public attention, verified catalysts, reception, and eligible trading demand. It is not the same as 24h: 24h reports the realized quote move since the previous close, while Momentum describes the evidence feeding future market runs. It does not measure fame, audience size, or career stature. Limited or mixed evidence stays near 50."
  },
  {
    id: "audience-size",
    title: "Why audience size is not the whole price",
    body: "Monthly reach can jump temporarily after a feature or playlist placement. RMI treats that as momentum first and waits for durable listening, direct-channel growth, and broader attention before allowing it to become a permanent valuation change."
  },
  {
    id: "catalysts",
    title: "How catalysts are checked",
    body: "Release, review, social, and audience signals are checked during market runs. Routine uploads and isolated fan posts are filtered out, while larger moves require stronger source confidence, independent confirmation, or measurable audience reaction. No single headline determines an artist quote by itself."
  },
  {
    id: "daily-moves",
    title: "Why many daily moves are small",
    body: "RMI does not add volatility just to make the board look active. Weak, conflicting, stale, or single-source evidence receives little or no weight. A major verified release, chart result, reception shift, or measurable demand event can move a quote more sharply, but an old success does not generate the same return again every day."
  },
  {
    id: "outside-music",
    title: "What happens outside music",
    body: "A major appearance, controversy, performance, or cultural moment can create short-term public-attention momentum and may appear in RMI news. It has a smaller and more temporary price effect unless direct music demand, audience growth, or sustained fan interest confirms that the attention is carrying back into the artist's music career."
  },
  {
    id: "purpose",
    title: "Why it exists",
    body: "Rap fans already debate who is rising, falling, overhyped, underrated, or about to break out. RMI turns those debates into a structured fantasy market with prices, charts, watchlists, portfolios, and standings."
  }
];

const facts = [
  { icon: DatabaseZap, label: "Inputs", value: "Multiple independent sources" },
  { icon: CircleGauge, label: "Output", value: "Comparable fantasy quotes" },
  { icon: BookOpenCheck, label: "Evidence", value: "Verified before weighting" },
  { icon: ShieldCheck, label: "Economy", value: "Fantasy cash only" }
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header className="border-b border-line pb-8 pt-2 sm:pb-10 sm:pt-5">
        <div className="max-w-3xl">
          <div className="rmi-kicker"><Activity className="h-3.5 w-3.5" aria-hidden="true" /> About RMI</div>
          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-5xl">A fantasy market for following rapper momentum.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-paper/60">
            RMI combines audience movement, public attention, music events, and eligible fantasy-market activity into comparable artist quotes.
          </p>
        </div>

        <dl className="mt-8 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-panel p-4">
              <div className="flex items-center gap-2 text-cyan">
                <Icon className="h-4 w-4" aria-hidden="true" />
                <dt className="text-xs font-semibold">{label}</dt>
              </div>
              <dd className="mt-2 text-sm font-medium text-paper/70">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="h-fit border-b border-line pb-6 lg:sticky lg:top-20 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
          <p className="text-xs font-semibold text-paper/45">On this page</p>
          <nav className="mt-3 grid gap-1" aria-label="About RMI sections">
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
          <div className="mt-5 border-t border-line pt-5">
            <Link href="/help" className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-paper/60 hover:bg-panelSoft hover:text-cyan">
              Help Center <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </aside>

        <main className="rmi-card min-w-0 overflow-hidden px-5 sm:px-7">
          <div className="border-b border-line py-6">
            <p className="text-xs font-semibold text-cyan">Market guide</p>
            <h2 className="mt-1 text-2xl font-semibold">How RMI works</h2>
          </div>
          <div>
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className={`scroll-mt-24 py-6 ${index < sections.length - 1 ? "border-b border-line" : ""}`}
              >
                <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 sm:gap-4">
                  <span className="number-tabular pt-1 text-xs font-semibold text-paper/30">{String(index + 1).padStart(2, "0")}</span>
                  <div className="max-w-3xl">
                    <h3 className="text-lg font-semibold">{section.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-paper/65">{section.body}</p>
                  </div>
                </div>
              </section>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 border-t border-line py-6">
            {[
              ["Browse Markets", "/markets"],
              ["Read Market News", "/news"],
              ["View Rankings", "/leaderboard"]
            ].map(([label, href]) => (
              <Link key={href} href={href} className="rmi-button-secondary inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold">
                {label}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
