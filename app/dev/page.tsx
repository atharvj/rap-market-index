"use client";

import { useGame } from "@/components/GameProvider";
import { MetricCard } from "@/components/MetricCard";
import { formatCurrency, formatDate, formatPercent } from "@/lib/formatters";
import {
  CheckCircle2,
  Cloud,
  Database,
  RefreshCcw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  XCircle
} from "lucide-react";
import { useEffect, useState } from "react";

type BackendDryRunState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
    }
  | {
      status: "success";
      summary: {
        artistCount: number;
        averageMovePercent: number;
        topGainer: { ticker: string; dailyChangePercent: number } | null;
        topLoser: { ticker: string; dailyChangePercent: number } | null;
      };
    }
  | {
      status: "error";
      message: string;
    };

type CloudStatusState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      connected: boolean;
      readyForCloudAccounts: boolean;
      readyForAdminJobs: boolean;
      checks: Array<{
        id: string;
        label: string;
        ok: boolean;
        detail: string;
      }>;
    }
  | {
      status: "error";
      message: string;
    };

export default function DevPage() {
  const { simulateDay, resetPortfolio, state, portfolioValue } = useGame();
  const [backendDryRun, setBackendDryRun] = useState<BackendDryRunState>({ status: "idle" });
  const [cloudStatus, setCloudStatus] = useState<CloudStatusState>({ status: "loading" });

  async function refreshCloudStatus() {
    setCloudStatus({ status: "loading" });

    try {
      const response = await fetch("/api/system/cloud-status");
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.checks?.at(-1)?.detail ?? "Cloud status check failed.");
      }

      setCloudStatus({
        status: "ready",
        connected: Boolean(payload.connected),
        readyForCloudAccounts: Boolean(payload.readyForCloudAccounts),
        readyForAdminJobs: Boolean(payload.readyForAdminJobs),
        checks: payload.checks ?? []
      });
    } catch (error) {
      setCloudStatus({
        status: "error",
        message: error instanceof Error ? error.message : "Cloud status check failed."
      });
    }
  }

  useEffect(() => {
    void refreshCloudStatus();
  }, []);

  async function runBackendDryRun() {
    setBackendDryRun({ status: "loading" });

    try {
      const response = await fetch("/api/admin/daily-market-update", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          dryRun: true,
          source: "mock"
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Server update preview failed.");
      }

      setBackendDryRun({
        status: "success",
        summary: payload.summary
      });
    } catch (error) {
      setBackendDryRun({
        status: "error",
        message: error instanceof Error ? error.message : "Server update preview failed."
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brass">Dev console</p>
        <h1 className="mt-2 text-4xl font-black">Market controls</h1>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Last update"
          value={formatDate(state.lastUpdatedAt)}
          detail="Mock daily clock"
          icon={<RefreshCcw className="h-4 w-4" />}
          tone="warm"
        />
        <MetricCard
          label="Artists"
          value={String(state.artists.length)}
          detail="Demo artist list"
          icon={<Database className="h-4 w-4" />}
          tone="cool"
        />
        <MetricCard
          label="Portfolio"
          value={formatCurrency(portfolioValue)}
          detail={`${state.transactions.length} trades`}
          icon={<SlidersHorizontal className="h-4 w-4" />}
          tone="good"
        />
      </section>

      <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Cloud setup</p>
            <h2 className="mt-1 text-2xl font-black">Supabase status</h2>
          </div>
          <button
            type="button"
            onClick={refreshCloudStatus}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-4 text-sm font-black text-cyan"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {cloudStatus.status === "loading" ? (
          <p className="mt-4 text-sm font-bold text-cyan">Checking cloud setup...</p>
        ) : null}

        {cloudStatus.status === "error" ? (
          <p className="mt-4 text-sm font-bold text-ember">{cloudStatus.message}</p>
        ) : null}

        {cloudStatus.status === "ready" ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-line bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-paper/55">
                  <Cloud className="h-4 w-4" />
                  Accounts
                </div>
                <p
                  className={`mt-2 text-2xl font-black ${
                    cloudStatus.readyForCloudAccounts ? "text-mint" : "text-ember"
                  }`}
                >
                  {cloudStatus.readyForCloudAccounts ? "Cloud ready" : "Needs setup"}
                </p>
              </div>
              <div className="rounded-md border border-line bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-paper/55">
                  <ShieldCheck className="h-4 w-4" />
                  Admin jobs
                </div>
                <p
                  className={`mt-2 text-2xl font-black ${
                    cloudStatus.readyForAdminJobs ? "text-mint" : "text-brass"
                  }`}
                >
                  {cloudStatus.readyForAdminJobs ? "Protected" : "Pending"}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cloudStatus.checks.map((check) => (
                <div key={check.id} className="flex min-h-20 gap-3 rounded-md border border-line bg-black/20 p-3">
                  {check.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-black">{check.label}</p>
                    <p className="mt-1 break-words text-xs font-bold leading-5 text-paper/48">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
        <div className="grid gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={simulateDay}
            className="flex min-h-14 items-center justify-center gap-2 rounded-md bg-mint px-4 font-black text-ink"
          >
            <RefreshCcw className="h-4 w-4" />
            Simulate daily update
          </button>
          <button
            type="button"
            onClick={resetPortfolio}
            className="flex min-h-14 items-center justify-center gap-2 rounded-md border border-brass/45 bg-brass/10 px-4 font-black text-brass"
          >
            <Database className="h-4 w-4" />
            Reset demo market
          </button>
          <button
            type="button"
            onClick={runBackendDryRun}
            disabled={backendDryRun.status === "loading"}
            className="flex min-h-14 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-4 font-black text-cyan disabled:cursor-wait disabled:opacity-55"
          >
            <ServerCog className="h-4 w-4" />
            Preview server update
          </button>
          <button
            type="button"
            onClick={resetPortfolio}
            className="flex min-h-14 items-center justify-center gap-2 rounded-md border border-ember/45 bg-ember/10 px-4 font-black text-ember"
          >
            <RotateCcw className="h-4 w-4" />
            Reset portfolio
          </button>
        </div>
        <div className="mt-4 min-h-16 rounded-md border border-line bg-black/20 p-4">
          {backendDryRun.status === "idle" ? (
            <p className="text-sm font-bold text-paper/45">Server update preview has not run in this session.</p>
          ) : null}
          {backendDryRun.status === "loading" ? (
            <p className="text-sm font-bold text-cyan">Calculating backend market update...</p>
          ) : null}
          {backendDryRun.status === "error" ? (
            <p className="text-sm font-bold text-ember">{backendDryRun.message}</p>
          ) : null}
          {backendDryRun.status === "success" ? (
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-paper/45">Artists</p>
                <p className="mt-1 font-black number-tabular">{backendDryRun.summary.artistCount}</p>
              </div>
              <div>
                <p className="text-paper/45">Avg move</p>
                <p className="mt-1 font-black number-tabular">
                  {formatPercent(backendDryRun.summary.averageMovePercent)}
                </p>
              </div>
              <div>
                <p className="text-paper/45">Top gainer</p>
                <p className="mt-1 font-black">
                  {backendDryRun.summary.topGainer
                    ? `${backendDryRun.summary.topGainer.ticker} ${formatPercent(
                        backendDryRun.summary.topGainer.dailyChangePercent
                      )}`
                    : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-paper/45">Top loser</p>
                <p className="mt-1 font-black">
                  {backendDryRun.summary.topLoser
                    ? `${backendDryRun.summary.topLoser.ticker} ${formatPercent(
                        backendDryRun.summary.topLoser.dailyChangePercent
                      )}`
                    : "N/A"}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
        <h2 className="text-xl font-black">Daily artist score weights</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          {[
            ["Streaming", "35%"],
            ["YouTube", "25%"],
            ["Search/social", "15%"],
            ["News/events", "15%"],
            ["Trader demand", "10%"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-line bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-paper/45">{label}</p>
              <p className="mt-2 text-2xl font-black number-tabular">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
