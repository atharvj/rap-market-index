import Link from "next/link";

const sections = [
  {
    title: "What is RMI?",
    body: "Rap Market Index is a fantasy rap trading game. Users receive virtual cash, buy and sell artist shares, build a portfolio, and compete on a leaderboard. There is no real-money deposit, cash-out, gambling, or artist affiliation."
  },
  {
    title: "How prices move",
    body: "Artist prices are updated by a market engine that looks for meaningful changes in audience momentum, video activity, public attention, releases, reviews, major events, and eligible trading demand. The exact model is kept internal so the game is harder to manipulate."
  },
  {
    title: "Why it exists",
    body: "Rap fans already debate who is rising, falling, overhyped, underrated, or about to break out. RMI turns those debates into a structured fantasy market with prices, charts, watchlists, portfolios, and standings."
  },
  {
    title: "Market integrity",
    body: "Admin and test trades do not move prices. The platform also includes controls for trading pauses, artist halts, suspicious order-flow review, and data-quality checks before public scale."
  }
];

export default function AboutPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <main className="rounded border border-line bg-panel shadow-market">
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
        <section className="rounded border border-line bg-panel p-5 shadow-market">
          <h2 className="text-sm font-black uppercase tracking-wide">Quick links</h2>
          <div className="mt-4 grid gap-3 text-sm font-bold text-cyan">
            <Link href="/markets">Now Trading</Link>
            <Link href="/news">News and Events</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/portfolio">My Portfolio</Link>
          </div>
        </section>

        <section className="rounded border border-line bg-panel p-5 shadow-market">
          <h2 className="text-sm font-black uppercase tracking-wide">Public beta</h2>
          <p className="mt-3 text-sm font-bold leading-6 text-paper/58">
            RMI is still being tested. The core goal is to make artist quotes and market history reliable before wider launch.
          </p>
        </section>
      </aside>
    </div>
  );
}
