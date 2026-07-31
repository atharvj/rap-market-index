"use client";

import { useAuth } from "@/components/AuthProvider";
import { RmiButton, RmiNotice } from "@/components/RmiPrimitives";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_MESSAGE_MIN_LENGTH,
  type FeedbackCategory
} from "@/lib/feedback";
import {
  CandlestickChart,
  ChevronDown,
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
import { type FormEvent, useEffect, useMemo, useState } from "react";

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
      "Open an artist quote, choose Buy or Sell, enter a whole number of shares, and review the estimated total.",
      "The ticket's Max uses the lowest active limit: available fantasy cash, 25% artist position room, the rolling 24-hour artist allowance, or shares owned.",
      "An artist's 24-hour buy allowance is 40% of portfolio value, with a $1,000 minimum and $5,000 maximum. Wait 30 seconds between orders for the same artist.",
      "Trading requires a confirmed account with completed setup and a fully synced profile. The ticket explains which requirement is still loading or missing.",
      "Trading may pause briefly while the daily market update is verified, while a newly detected artist catalyst is incorporated into the quote, or when market integrity controls are active.",
      "Rapid duplicate orders and daily activity can be limited to protect the fantasy market. Wait for the message shown on the ticket before trying again.",
      "The final execution price can differ slightly from the displayed quote because of spread and slippage.",
      "A positive daily move describes what already happened since the previous close; buying a current gainer does not automatically earn that past return.",
      "Buying and immediately selling normally loses fantasy cash because buys execute above the midpoint, sells execute below it, and each side pays commission.",
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
      "When an order is unavailable, read the explanation above its submit button. Common causes are insufficient cash or shares, the 25% artist limit, the $1 minimum order, profile syncing, a brief rate limit, or a temporary market pause."
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
  const [openTopicIds, setOpenTopicIds] = useState<Set<string>>(new Set());
  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return topics.filter((topic) => {
      const matchesCategory = category === "All" || topic.category === category;
      const searchable = `${topic.title} ${topic.summary} ${topic.category} ${topic.answers.join(" ")}`.toLowerCase();

      return matchesCategory && (!normalized || searchable.includes(normalized));
    });
  }, [category, query]);

  useEffect(() => {
    const topicId = window.location.hash.slice(1);

    if (!topics.some((topic) => topic.id === topicId)) {
      return;
    }

    setOpenTopicIds(new Set([topicId]));
    window.requestAnimationFrame(() => {
      document.getElementById(topicId)?.scrollIntoView({ block: "start" });
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      return;
    }

    setOpenTopicIds(new Set(filteredTopics.map((topic) => topic.id)));
  }, [filteredTopics, query]);

  function chooseCategory(nextCategory: string) {
    setCategory(nextCategory);
    setOpenTopicIds(new Set(
      nextCategory === "All"
        ? []
        : topics.filter((topic) => topic.category === nextCategory).map((topic) => topic.id)
    ));
  }

  function syncTopicState(topicId: string, open: boolean) {
    setOpenTopicIds((current) => {
      if (current.has(topicId) === open) {
        return current;
      }

      const next = new Set(current);

      if (open) {
        next.add(topicId);
      } else {
        next.delete(topicId);
      }

      return next;
    });
  }

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
    <div className="mx-auto max-w-5xl space-y-10">
      <header className="border-b border-line pb-8 pt-2 sm:pb-10 sm:pt-5">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-cyan">
            <HelpCircle className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold">RMI Support</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">How can we help?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper/60">
            Find clear answers about accounts, artist shares, market quotes, portfolios, news, and privacy.
          </p>
          <label className="relative mt-6 block max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-paper/35" aria-hidden="true" />
            <span className="sr-only">Search help</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rmi-terminal-input h-12 w-full rounded-md pl-11 pr-4 text-sm"
              placeholder="Search accounts, trading, quotes, and more"
            />
          </label>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="h-fit border-b border-line pb-6 lg:sticky lg:top-20 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
          <h2 className="text-xs font-semibold text-paper/45">Browse by topic</h2>
          <div className="mt-3 flex flex-wrap gap-1 lg:grid">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => chooseCategory(item)}
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

        <main className="min-w-0">
          {filteredTopics.length ? (
            <div className="space-y-3">
              {filteredTopics.map((topic) => {
                const Icon = topic.icon;

                return (
                  <details
                    key={topic.id}
                    id={topic.id}
                    open={openTopicIds.has(topic.id)}
                    onToggle={(event) => syncTopicState(topic.id, event.currentTarget.open)}
                    className="group rmi-card scroll-mt-24 overflow-hidden"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-4 p-4 marker:hidden sm:p-5 [&::-webkit-details-marker]:hidden">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cyan/10 text-cyan">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-xs font-semibold text-cyan">{topic.category}</span>
                        <span className="mt-0.5 block text-base font-semibold sm:text-lg">{topic.title}</span>
                        <span className="mt-1 block text-sm leading-6 text-paper/55">{topic.summary}</span>
                      </span>
                      <ChevronDown className="h-5 w-5 shrink-0 text-paper/35 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="border-t border-line bg-panelSoft/35 px-4 sm:px-5">
                      <div className="divide-y divide-line/70">
                        {topic.answers.map((answer, index) => (
                          <div key={answer} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 py-4 text-sm leading-6 text-paper/65">
                            <span className="number-tabular pt-0.5 text-xs font-semibold text-paper/30" aria-hidden="true">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <p>{answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          ) : (
            <div className="rmi-card p-8 text-center">
              <h2 className="text-lg font-semibold">No matching help topics</h2>
              <p className="mt-2 text-sm text-paper/55">Try a shorter search or browse all topics.</p>
              <button type="button" onClick={() => { setQuery(""); chooseCategory("All"); }} className="rmi-button-secondary mt-4 px-4 py-2 text-sm">
                Show All Topics
              </button>
            </div>
          )}
        </main>
      </div>

      <section className="rmi-card mx-auto max-w-3xl overflow-hidden" aria-labelledby="feedback-title">
        <div className="border-b border-line p-5 sm:p-7">
          <div className="flex items-center gap-2 text-cyan">
            <Send className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold">Send feedback</span>
          </div>
          <h2 id="feedback-title" className="mt-3 text-2xl font-bold">Help improve RMI</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-paper/60">
            Report a bug or questionable market data, ask for account help, or share an idea. Anonymous reports are allowed; signing in links the report to your account.
          </p>
        </div>

        <form onSubmit={submitFeedback} className="relative grid gap-4 p-5 sm:p-7">
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
            {feedbackState.message ? (
              <RmiNotice tone={feedbackState.status === "error" ? "error" : "success"}>
                {feedbackState.message}
              </RmiNotice>
            ) : <span />}
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
