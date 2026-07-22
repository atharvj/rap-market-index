"use client";

import { useAuth } from "@/components/AuthProvider";
import { RmiButton } from "@/components/RmiPrimitives";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_MESSAGE_MIN_LENGTH,
  type FeedbackCategory
} from "@/lib/feedback";
import {
  CandlestickChart,
  CircleUserRound,
  HelpCircle,
  Newspaper,
  Search,
  Send,
  ShieldCheck,
  WalletCards,
  Wrench
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";

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
const feedbackCategoryLabels: Record<FeedbackCategory, string> = {
  bug: "Bug",
  data: "Market data",
  account: "Account",
  idea: "Idea",
  other: "Other"
};

export default function HelpPage() {
  const { session } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>("bug");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [feedbackState, setFeedbackState] = useState<
    { status: "idle" | "sending" | "success" | "error"; message: string }
  >({ status: "idle", message: "" });
  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return topics.filter((topic) => {
      const matchesCategory = category === "All" || topic.category === category;
      const searchable = `${topic.title} ${topic.summary} ${topic.category} ${topic.answers.join(" ")}`.toLowerCase();

      return matchesCategory && (!normalized || searchable.includes(normalized));
    });
  }, [category, query]);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackState({ status: "sending", message: "" });

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          category: feedbackCategory,
          message: feedbackMessage,
          contactEmail,
          website
        })
      });
      const payload = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not send feedback.");
      }

      setFeedbackMessage("");
      setContactEmail("");
      setWebsite("");
      setFeedbackState({ status: "success", message: "Thanks—your feedback was sent." });
    } catch (error) {
      setFeedbackState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not send feedback."
      });
    }
  }

  return (
    <div className="space-y-6">
      <header className="rmi-page-head grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-cyan">
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide">RMI Support</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">How can we help?</h1>
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
        <aside className="rmi-card h-fit border-t-2 border-t-cyan/70 p-4 lg:sticky lg:top-24">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-paper/45">Browse by Topic</h2>
          <div className="mt-3 grid gap-1 sm:grid-cols-4 lg:grid-cols-1">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={category === item
                  ? "rounded-md bg-cyan/10 px-3 py-2 text-left text-sm font-semibold text-cyan"
                  : "rounded-md px-3 py-2 text-left text-sm font-medium text-paper/60 transition-colors hover:bg-panelSoft hover:text-paper"
                }
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-5 text-sm font-medium">
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
                  <article key={topic.id} id={topic.id} className="rmi-signal-card p-5">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cyan/10 text-cyan">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-cyan">{topic.category}</p>
                        <h2 className="mt-1 text-lg font-semibold">{topic.title}</h2>
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
              <h2 className="text-lg font-semibold">No matching help topics</h2>
              <p className="mt-2 text-sm text-paper/55">Try a shorter search or browse all topics.</p>
              <button type="button" onClick={() => { setQuery(""); setCategory("All"); }} className="rmi-button-secondary mt-4 px-4 py-2 text-sm">
                Show All Topics
              </button>
            </div>
          )}
        </main>
      </div>

      <section className="rmi-card grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,0.7fr)_minmax(360px,1fr)]" aria-labelledby="feedback-title">
        <div>
          <div className="flex items-center gap-2 text-cyan">
            <Send className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide">Send Feedback</span>
          </div>
          <h2 id="feedback-title" className="mt-3 text-2xl font-bold">Help improve RMI</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-paper/60">
            Report a bug or questionable market data, ask for account help, or share an idea. Anonymous reports are allowed; signing in links the report to your account.
          </p>
        </div>

        <form onSubmit={submitFeedback} className="relative grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-xs font-semibold text-paper/60">
              Category
              <select
                value={feedbackCategory}
                onChange={(event) => setFeedbackCategory(event.target.value as FeedbackCategory)}
                className="rmi-terminal-input h-11 px-3 text-sm font-medium text-paper"
                disabled={feedbackState.status === "sending"}
              >
                {FEEDBACK_CATEGORIES.map((item) => (
                  <option key={item} value={item}>{feedbackCategoryLabels[item]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs font-semibold text-paper/60">
              Contact email <span className="font-normal text-paper/35">(optional)</span>
              <input
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={254}
                className="rmi-terminal-input h-11 px-3 text-sm font-medium"
                placeholder="you@example.com"
                disabled={feedbackState.status === "sending"}
              />
            </label>
          </div>

          <label className="grid gap-2 text-xs font-semibold text-paper/60">
            Message
            <textarea
              value={feedbackMessage}
              onChange={(event) => setFeedbackMessage(event.target.value)}
              minLength={FEEDBACK_MESSAGE_MIN_LENGTH}
              maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
              rows={6}
              required
              className="rmi-terminal-input h-40 resize-none px-3 py-3 text-sm font-medium leading-6"
              placeholder="Describe what happened, what looks wrong, or what you would improve."
              disabled={feedbackState.status === "sending"}
            />
            <span className="text-right text-[11px] font-normal text-paper/35 number-tabular">
              {feedbackMessage.length}/{FEEDBACK_MESSAGE_MAX_LENGTH}
            </span>
          </label>

          <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label>
              Website
              <input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite">
              {feedbackState.message ? (
                <p className={feedbackState.status === "error" ? "text-sm font-semibold text-ember" : "text-sm font-semibold text-mint"}>
                  {feedbackState.message}
                </p>
              ) : null}
            </div>
            <RmiButton type="submit" disabled={feedbackState.status === "sending"} className="sm:min-w-36">
              <Send className="h-4 w-4" aria-hidden="true" />
              {feedbackState.status === "sending" ? "Sending..." : "Send Feedback"}
            </RmiButton>
          </div>
        </form>
      </section>
    </div>
  );
}
