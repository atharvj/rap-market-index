import Link from "next/link";

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
    body: "RMI Score is a normalized 1-99 reading of current signal strength across audience momentum, public attention, verified catalysts, reception, and eligible trading demand. It is not a price target, forecast, or daily percentage change, so the strongest signal and the day's top gainer can be different artists."
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
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <main className="rmi-card shadow-market">
        <section className="border-b border-line p-5">
          <p className="text-[11px] font-black uppercase tracking-wide text-brass">About RMI</p>
          <h1 className="mt-2 text-3xl font-black leading-tight">Rap Market Index</h1>
          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-paper/60">
            A virtual rap exchange for tracking artist momentum, market prices, news catalysts, and fantasy portfolios.
          </p>
        </section>

        <div className="divide-y divide-line">
          {sections.map((section) => (
            <section key={section.title} className="p-5">
              <h2 className="text-lg font-black">{section.title}</h2>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-paper/60">{section.body}</p>
            </section>
          ))}
        </div>
      </main>

      <aside className="space-y-5">
        <section className="rmi-card p-5 shadow-market">
          <h2 className="text-sm font-black uppercase tracking-wide">Quick links</h2>
          <div className="mt-4 grid gap-3 text-sm font-bold text-cyan">
            <Link href="/markets">Now Trading</Link>
            <Link href="/news">News and Events</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/portfolio">My Portfolio</Link>
            <Link href="/help">Help Center</Link>
          </div>
        </section>

        <section className="rmi-card p-5 shadow-market">
          <h2 className="text-sm font-black uppercase tracking-wide">Need help?</h2>
          <p className="mt-3 text-sm font-bold leading-6 text-paper/58">
            Find answers about accounts, trading, artist quotes, portfolios, privacy, and common problems.
          </p>
          <Link href="/help" className="mt-4 inline-flex text-sm font-black text-cyan hover:text-cyan/75">
            Open Help Center
          </Link>
        </section>
      </aside>
    </div>
  );
}
