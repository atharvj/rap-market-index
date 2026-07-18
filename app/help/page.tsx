"use client";

import {
  CandlestickChart,
  CircleUserRound,
  HelpCircle,
  Newspaper,
  Search,
  ShieldCheck,
  WalletCards,
  Wrench
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const topics = [
  {
    id: "account",
    category: "Account",
    title: "Create and manage your account",
    summary: "Email confirmation, profile setup, password resets, privacy, and account deletion.",
    icon: CircleUserRound,
    answers: [
      "Confirm your email before completing onboarding or placing an order.",
      "Use Account Settings to change your display name, password, theme, and public-profile visibility.",
      "A deleted account permanently removes its profile, watchlist, holdings, and trade records."
    ]
  },
  {
    id: "trading",
    category: "Trading",
    title: "Buy and sell artist shares",
    summary: "Order estimates, execution prices, commissions, available cash, and position limits.",
    icon: CandlestickChart,
    answers: [
      "Open an artist quote, choose Buy or Sell, enter the number of shares, and review the estimated total.",
      "The final execution price can differ slightly from the displayed quote because of spread and slippage.",
      "RMI uses fantasy cash only. Shares cannot be converted into real money."
    ]
  },
  {
    id: "quotes",
    category: "Market",
    title: "Understand artist quotes",
    summary: "What a quote represents, why it changes, and how market sessions are calculated.",
    icon: CandlestickChart,
    answers: [
      "A quote is a fantasy index value, not an artist's income, net worth, or literal market capitalization.",
      "Audience momentum, durable reach, verified catalysts, reception, and eligible market demand can affect a quote.",
      "Source-backed quotes refresh each morning; eligible orders can also record price movement during the day.",
      "Top Gainer means the largest current-session increase. Strongest Signal means the highest combined RMI signal score, so they can be different artists."
    ]
  },
  {
    id: "portfolio",
    category: "Portfolio",
    title: "Track portfolio performance",
    summary: "Holdings, cost basis, cash, returns, allocation, and global ranking.",
    icon: WalletCards,
    answers: [
      "Portfolio value equals available cash plus the current marked value of open positions.",
      "Cost basis records the average amount paid per share; gain or loss compares that basis with the current quote.",
      "Rankings compare fantasy portfolio values using the same starting cash balance."
    ]
  },
  {
    id: "news",
    category: "News",
    title: "Read market catalysts",
    summary: "How releases, reviews, major events, and audience reaction qualify for the news feed.",
    icon: Newspaper,
    answers: [
      "RMI ranks stories by relevance, evidence quality, likely reach, confidence, and recency.",
      "Routine uploads, duplicate coverage, rumors, and isolated low-signal posts are filtered out.",
      "A headline can inform a quote, but no single story determines an artist price by itself."
    ]
  },
  {
    id: "privacy",
    category: "Safety",
    title: "Control profile privacy",
    summary: "Choose whether other traders can view your profile, holdings, and performance.",
    icon: ShieldCheck,
    answers: [
      "Your email address and authentication details are never displayed on public trader profiles.",
      "Public Profile controls whether your trader page is visible. Public Portfolio separately controls holdings and performance.",
      "Administrative actions and protected account data require an authenticated, authorized request."
    ]
  },
  {
    id: "troubleshooting",
    category: "Troubleshooting",
    title: "Fix common problems",
    summary: "Expired email links, missing quotes, stale pages, rejected orders, and sign-in issues.",
    icon: Wrench,
    answers: [
      "Request a new confirmation or password-reset email when an older link has expired.",
      "Refresh once after a deployment if the browser still holds an older application bundle.",
      "An order can be rejected for insufficient cash, insufficient shares, market controls, or an invalid quantity."
    ]
  }
];

const categories = ["All", ...Array.from(new Set(topics.map((topic) => topic.category)))];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return topics.filter((topic) => {
      const matchesCategory = category === "All" || topic.category === category;
      const searchable = `${topic.title} ${topic.summary} ${topic.category} ${topic.answers.join(" ")}`.toLowerCase();

      return matchesCategory && (!normalized || searchable.includes(normalized));
    });
  }, [category, query]);

  return (
    <div className="space-y-6">
      <header className="rmi-page-head market-grid rmi-noise grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-cyan">
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-black uppercase tracking-wide">RMI Support</span>
          </div>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">How can we help?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper/60">
            Find clear answers about accounts, artist shares, market quotes, portfolios, news, and privacy.
          </p>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-paper/35" aria-hidden="true" />
          <span className="sr-only">Search help</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="rmi-terminal-input h-11 w-full pl-10 pr-3 text-sm"
            placeholder="Search Help"
          />
        </label>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rmi-card h-fit border-t-2 border-t-violet/70 p-4 lg:sticky lg:top-24">
          <h2 className="text-xs font-black uppercase tracking-wide text-paper/45">Browse by Topic</h2>
          <div className="mt-3 grid gap-1 sm:grid-cols-4 lg:grid-cols-1">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={category === item
                  ? "rounded-lg bg-cyan/10 px-3 py-2 text-left text-sm font-black text-cyan"
                  : "rounded-lg px-3 py-2 text-left text-sm font-bold text-paper/60 transition hover:bg-panelSoft hover:text-paper"
                }
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-5 text-sm font-bold">
            <Link href="/about" className="text-cyan hover:text-cyan/75">How RMI Works</Link>
            <Link href="/privacy" className="mt-3 block text-paper/55 hover:text-paper">Privacy Policy</Link>
            <Link href="/terms" className="mt-3 block text-paper/55 hover:text-paper">Terms of Use</Link>
          </div>
        </aside>

        <main>
          {filteredTopics.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredTopics.map((topic) => {
                const Icon = topic.icon;

                return (
                  <article key={topic.id} id={topic.id} className="rmi-signal-card market-grid p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan/10 text-cyan">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-xs font-black text-cyan">{topic.category}</p>
                        <h2 className="mt-1 text-lg font-black">{topic.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-paper/55">{topic.summary}</p>
                      </div>
                    </div>
                    <ul className="mt-5 space-y-3 border-t border-line pt-4 text-sm leading-6 text-paper/65">
                      {topic.answers.map((answer) => (
                        <li key={answer} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" aria-hidden="true" />
                          <span>{answer}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rmi-card p-8 text-center">
              <h2 className="text-lg font-black">No matching help topics</h2>
              <p className="mt-2 text-sm text-paper/55">Try a shorter search or browse all topics.</p>
              <button type="button" onClick={() => { setQuery(""); setCategory("All"); }} className="rmi-button-secondary mt-4 px-4 py-2 text-sm">
                Show All Topics
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
