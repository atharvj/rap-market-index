"use client";

import { useAuth } from "@/components/AuthProvider";
import { Activity, ArrowLeft, BarChart3, Eye, LogIn, RefreshCcw, Repeat2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AnalyticsSummary = {
  days: number;
  startsAt: string;
  endsAt: string;
  stages: {
    visitors: number;
    sessions: number;
    artistViewers: number;
    signupStarters: number;
    completedSignups: number;
    firstTraders: number;
    d1EligibleSignups: number;
    d1ReturningSignups: number;
  };
  daily: Array<{
    date: string;
    visitors: number;
    signups: number;
    firstTraders: number;
  }>;
  topArtists: Array<{
    artistId: string;
    name: string;
    ticker: string;
    viewers: number;
  }>;
  sources: Array<{
    source: string;
    visitors: number;
  }>;
  topPaths: Array<{
    path: string;
    viewers: number;
  }>;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; summary: AnalyticsSummary };

const rangeOptions = [7, 30, 90] as const;

export default function ProductAnalyticsPage() {
  const { configured, loading: authLoading, session } = useAuth();
  const [days, setDays] = useState<number>(30);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const accessToken = session?.access_token;

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!configured || !accessToken) {
      setState({ status: "error", message: "Sign in with the admin account to view product analytics." });
      return;
    }

    let active = true;
    setState({ status: "loading" });

    fetch(`/api/admin/product-analytics?days=${days}`, {
      headers: { authorization: `Bearer ${accessToken}` }
    })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; error?: string; summary?: AnalyticsSummary };

        if (!response.ok || !payload.ok || !payload.summary) {
          throw new Error(payload.error ?? "Product analytics could not be loaded.");
        }

        return payload.summary;
      })
      .then((summary) => {
        if (active) {
          setState({ status: "ready", summary });
        }
      })
      .catch((error) => {
        if (active) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Product analytics could not be loaded."
          });
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, authLoading, configured, days]);

  const summary = state.status === "ready" ? state.summary : null;
  const conversion = useMemo(() => {
    if (!summary) {
      return null;
    }

    return {
      artistViewRate: percent(summary.stages.artistViewers, summary.stages.visitors),
      signupStartRate: percent(summary.stages.signupStarters, summary.stages.visitors),
      d1Rate: percent(summary.stages.d1ReturningSignups, summary.stages.d1EligibleSignups)
    };
  }, [summary]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link href="/dev" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan hover:text-cyan/75">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Market operations
          </Link>
          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-brass">Admin only</p>
          <h1 className="mt-2 text-4xl font-black">Launch analytics</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-paper/55">
            First-party, privacy-limited product events. Browser identifiers are one-way hashed, raw IP addresses and
            emails are not stored here, and old rows are removed after 180 days.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-paper/45">
            Historical accounts and first trades may be backfilled without historical visits or signup starts.
            These totals are separate activity counts, not a matched conversion funnel. Next-day retention includes only completed UTC days.
          </p>
        </div>
        <div className="flex rounded-md border border-line bg-panel p-1" aria-label="Analytics range">
          {rangeOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={option === days
                ? "min-h-9 rounded px-4 text-sm font-bold bg-cyan text-ink"
                : "min-h-9 rounded px-4 text-sm font-bold text-paper/55 hover:text-paper"}
            >
              {option}D
            </button>
          ))}
        </div>
      </header>

      {state.status === "loading" ? (
        <div className="rmi-card flex min-h-44 items-center justify-center gap-3 text-sm font-semibold text-paper/55" role="status">
          <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading launch analytics…
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="rounded-md border border-ember/45 bg-ember/10 px-4 py-4 text-sm font-semibold text-ember" role="alert">
          {state.message}
        </div>
      ) : null}

      {summary && conversion ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={<Users />} label="Unique visitors" value={summary.stages.visitors} detail={`${summary.stages.sessions.toLocaleString()} sessions`} />
            <MetricCard icon={<Eye />} label="Artist viewers" value={summary.stages.artistViewers} detail={`${conversion.artistViewRate} of visitors`} />
            <MetricCard icon={<LogIn />} label="Signup starts" value={summary.stages.signupStarters} detail={`${conversion.signupStartRate} of visitors`} />
            <MetricCard icon={<UserPlus />} label="Accounts created" value={summary.stages.completedSignups} detail="Server-verified account creation" />
            <MetricCard icon={<BarChart3 />} label="First traders" value={summary.stages.firstTraders} detail="Server-verified first trades" />
            <MetricCard icon={<Repeat2 />} label="Returned next day" value={summary.stages.d1ReturningSignups} detail={`${conversion.d1Rate} of ${summary.stages.d1EligibleSignups.toLocaleString()} eligible signups`} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <AnalyticsPanel title="Daily funnel" subtitle="Unique visitors, completed signups, and first trades by UTC day.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-paper/40">
                    <tr>
                      <th className="px-2 py-3 font-bold">Date</th>
                      <th className="px-2 py-3 text-right font-bold">Visitors</th>
                      <th className="px-2 py-3 text-right font-bold">Signups</th>
                      <th className="px-2 py-3 text-right font-bold">First trades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/65">
                    {summary.daily.slice(-14).reverse().map((day) => (
                      <tr key={day.date}>
                        <td className="px-2 py-3 font-semibold">{formatDate(day.date)}</td>
                        <td className="px-2 py-3 text-right number-tabular">{day.visitors.toLocaleString()}</td>
                        <td className="px-2 py-3 text-right number-tabular">{day.signups.toLocaleString()}</td>
                        <td className="px-2 py-3 text-right number-tabular">{day.firstTraders.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AnalyticsPanel>

            <AnalyticsPanel title="Acquisition" subtitle="UTM source first, then external referrer host.">
              <RankedList rows={summary.sources.map((row) => ({ label: row.source, value: row.visitors }))} empty="No attributed visits yet." />
            </AnalyticsPanel>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <AnalyticsPanel title="Most-viewed artists" subtitle="Unique viewers, not raw page refreshes.">
              <RankedList
                rows={summary.topArtists.map((artist) => ({
                  label: `${artist.name} · $${artist.ticker}`,
                  value: artist.viewers,
                  href: `/artists/${artist.artistId}`
                }))}
                empty="No artist views yet."
              />
            </AnalyticsPanel>
            <AnalyticsPanel title="Top paths" subtitle="One view per path in each browser session.">
              <RankedList
                rows={summary.topPaths.map((row) => ({ label: row.path, value: row.viewers, href: row.path === "/users/profile" ? undefined : row.path }))}
                empty="No page views yet."
              />
            </AnalyticsPanel>
          </section>

          <section className="rmi-card p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Activity className="mt-0.5 h-5 w-5 shrink-0 text-cyan" aria-hidden="true" />
              <div>
                <h2 className="font-bold">Use a different tracked link for each subreddit</h2>
                <p className="mt-1 text-sm leading-6 text-paper/55">
                  Append <code className="text-paper">?utm_source=playmygame&amp;utm_medium=reddit&amp;utm_campaign=public_beta</code>,
                  replacing <code className="text-paper">playmygame</code> with each subreddit name. The dashboard records the source, medium, and campaign without saving the full referring URL.
                </p>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: number; detail: string }) {
  return (
    <article className="rmi-card p-5">
      <div className="flex items-center gap-2 text-paper/45">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-black number-tabular">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm font-semibold text-paper/50">{detail}</p>
    </article>
  );
}

function AnalyticsPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rmi-card overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h2 className="font-bold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-paper/45">{subtitle}</p>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function RankedList({
  rows,
  empty
}: {
  rows: Array<{ label: string; value: number; href?: string }>;
  empty: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-paper/45">{empty}</p>;
  }

  return (
    <ol className="divide-y divide-line/65">
      {rows.map((row, index) => (
        <li key={`${row.label}-${index}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <span className="mr-2 text-xs font-bold text-paper/35">{String(index + 1).padStart(2, "0")}</span>
            {row.href ? (
              <Link href={row.href} className="break-all text-sm font-semibold hover:text-cyan">{row.label}</Link>
            ) : (
              <span className="break-all text-sm font-semibold">{row.label}</span>
            )}
          </div>
          <span className="shrink-0 text-sm font-black number-tabular">{row.value.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

function percent(value: number, total: number) {
  if (total <= 0) {
    return "—";
  }

  return `${((value / total) * 100).toFixed(value / total >= 0.1 ? 0 : 1)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}
