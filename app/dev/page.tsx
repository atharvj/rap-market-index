"use client";

import { formatDate, formatPercent } from "@/lib/formatters";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Cloud,
  Database,
  Eye,
  FileWarning,
  LockKeyhole,
  PlayCircle,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AsyncState<T> =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      data: T;
    }
  | {
      status: "error";
      message: string;
    };

type PreviewState =
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
        momentumArtistCount?: number;
        averageMovePercent: number;
        averageSignalReliability?: number;
        modelVersion?: string;
        topGainer: { ticker: string; dailyChangePercent: number } | null;
        topLoser: { ticker: string; dailyChangePercent: number } | null;
      };
      warnings: string[];
    }
  | {
      status: "error";
      message: string;
    };

type CloudStatus = {
  connected: boolean;
  readyForCloudAccounts: boolean;
  readyForAdminJobs: boolean;
  checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    detail: string;
  }>;
};

type MarketHealth = {
  runDate: string;
  activeArtistCount: number;
  configuredModelVersion: string;
  latestModelVersion: string | null;
  latestRun: {
    run_date: string;
    source: string;
    status: string;
    model_version: string;
    completed_at: string | null;
  } | null;
  sourceCoverage: Array<{
    key: string;
    label: string;
    configuredCount: number;
    missingCount: number;
    coveragePercent: number;
  }>;
  observationHealth: Array<{
    key: string;
    label: string;
    latestDate: string | null;
    freshArtistCount: number;
    missingArtistCount: number;
    freshCoveragePercent: number;
  }>;
  priceHistoryHealth: {
    latestDate: string | null;
    freshArtistCount: number;
    missingArtistCount: number;
    freshCoveragePercent: number;
  };
  warnings: string[];
};

const plannedPowers = [
  {
    title: "User management",
    detail: "View accounts, freeze suspicious users, grant admin access, and reset a test account when needed.",
    icon: Users
  },
  {
    title: "Market operations",
    detail: "Run dry previews, rerun failed batches, pause trading, and halt one artist during bad data.",
    icon: ServerCog
  },
  {
    title: "Integrity monitoring",
    detail: "Flag concentrated order flow, rapid account creation, duplicate behavior, and unusual portfolio jumps.",
    icon: ShieldCheck
  },
  {
    title: "Data quality",
    detail: "See missing artist IDs, stale source coverage, API failures, and review/event queues.",
    icon: Database
  },
  {
    title: "Trade support",
    detail: "Inspect a user's trades, reverse a broken order, and audit cash/holding changes.",
    icon: FileWarning
  },
  {
    title: "Shorting readiness",
    detail: "Add collateral, cover orders, short exposure limits, and liquidation checks before enabling shorts.",
    icon: SlidersHorizontal
  }
];

const signalCategories = [
  ["Audience", "Streaming and listener momentum"],
  ["Video", "Views, subscribers, and activity"],
  ["Discovery", "Search and social movement"],
  ["Media", "News, reviews, and releases"],
  ["Market", "Order-flow activity"]
];

export default function DevPage() {
  const [cloudStatus, setCloudStatus] = useState<AsyncState<CloudStatus>>({ status: "loading" });
  const [marketHealth, setMarketHealth] = useState<AsyncState<MarketHealth>>({ status: "loading" });
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

  useEffect(() => {
    void refreshCloudStatus();
    void refreshMarketHealth();
  }, []);

  const latestRunLabel = useMemo(() => {
    if (marketHealth.status !== "ready") {
      return "Not loaded";
    }

    const latestRun = marketHealth.data.latestRun;

    if (!latestRun) {
      return "No run";
    }

    return `${latestRun.status} ${latestRun.source}`;
  }, [marketHealth]);

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
        data: {
          connected: Boolean(payload.connected),
          readyForCloudAccounts: Boolean(payload.readyForCloudAccounts),
          readyForAdminJobs: Boolean(payload.readyForAdminJobs),
          checks: payload.checks ?? []
        }
      });
    } catch (error) {
      setCloudStatus({
        status: "error",
        message: error instanceof Error ? error.message : "Cloud status check failed."
      });
    }
  }

  async function refreshMarketHealth() {
    setMarketHealth({ status: "loading" });

    try {
      const response = await fetch("/api/admin/market-health");
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Market health check failed.");
      }

      setMarketHealth({
        status: "ready",
        data: payload as MarketHealth
      });
    } catch (error) {
      setMarketHealth({
        status: "error",
        message: error instanceof Error ? error.message : "Market health check failed."
      });
    }
  }

  async function runCorePreview() {
    setPreview({ status: "loading" });

    try {
      const response = await fetch("/api/admin/daily-market-update", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          dryRun: true,
          source: "core",
          artistLimit: 5,
          artistOffset: 0
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Market preview failed.");
      }

      setPreview({
        status: "success",
        summary: payload.summary,
        warnings: payload.warnings ?? []
      });
    } catch (error) {
      setPreview({
        status: "error",
        message: error instanceof Error ? error.message : "Market preview failed."
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brass">Operator console</p>
          <h1 className="mt-2 text-4xl font-black">Market operations</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-paper/55">
            This page should become the internal control room for market health, data coverage, integrity alerts,
            and protected admin actions. Demo-only market reset controls do not belong here once Supabase is live.
          </p>
        </div>
        <div className="rounded-md border border-ember/35 bg-ember/10 p-4 text-sm font-bold leading-6 text-ember">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4" />
            Protect before launch
          </div>
          <p className="mt-1 text-ember/80">Add admin-only access before real users know this route exists.</p>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <StatusCard
          label="Active artists"
          value={marketHealth.status === "ready" ? String(marketHealth.data.activeArtistCount) : "--"}
          detail="Listed in Supabase"
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatusCard
          label="Latest run"
          value={latestRunLabel}
          detail={marketHealth.status === "ready" && marketHealth.data.latestRun ? formatDate(marketHealth.data.latestRun.run_date) : "No history"}
          icon={<RefreshCcw className="h-4 w-4" />}
        />
        <StatusCard
          label="Model"
          value={marketHealth.status === "ready" ? marketHealth.data.configuredModelVersion : "--"}
          detail="Internal audit label"
          icon={<SlidersHorizontal className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel
          title="Supabase status"
          eyebrow="Cloud setup"
          actionLabel="Refresh"
          onAction={refreshCloudStatus}
        >
          {cloudStatus.status === "loading" ? <LoadingText text="Checking cloud setup..." /> : null}
          {cloudStatus.status === "error" ? <ErrorText text={cloudStatus.message} /> : null}
          {cloudStatus.status === "ready" ? <CloudStatusPanel data={cloudStatus.data} /> : null}
        </Panel>

        <Panel
          title="Market health"
          eyebrow="Engine readiness"
          actionLabel="Refresh"
          onAction={refreshMarketHealth}
        >
          {marketHealth.status === "loading" ? <LoadingText text="Checking market health..." /> : null}
          {marketHealth.status === "error" ? <ErrorText text={marketHealth.message} /> : null}
          {marketHealth.status === "ready" ? <MarketHealthPanel data={marketHealth.data} /> : null}
        </Panel>
      </section>

      <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Safe action</p>
            <h2 className="mt-1 text-2xl font-black">Preview core market update</h2>
            <p className="mt-2 text-sm leading-6 text-paper/55">
              Runs a dry sample against the core market path. It does not write prices, trades, observations, or
              history. Use this before a real persisted run.
            </p>
          </div>
          <button
            type="button"
            onClick={runCorePreview}
            disabled={preview.status === "loading"}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-4 text-sm font-black text-cyan disabled:cursor-wait disabled:opacity-55"
          >
            <PlayCircle className="h-4 w-4" />
            Preview
          </button>
        </div>
        <PreviewResult preview={preview} />
      </section>

      <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Admin roadmap</p>
          <h2 className="mt-1 text-2xl font-black">Powers to add before scale</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plannedPowers.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.title} className="rounded-md border border-line bg-black/20 p-4">
                <div className="flex items-center gap-2 text-sm font-black">
                  <Icon className="h-4 w-4 text-brass" />
                  {item.title}
                </div>
                <p className="mt-2 text-sm leading-6 text-paper/55">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
        <h2 className="text-xl font-black">Market signal coverage</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          {signalCategories.map(([label, value]) => (
            <div key={label} className="rounded-md border border-line bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-paper/45">{label}</p>
              <p className="mt-2 text-sm font-bold leading-5 text-paper/62">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Panel({
  title,
  eyebrow,
  actionLabel,
  onAction,
  children
}: {
  title: string;
  eyebrow: string;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-paper/45">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-black">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-4 text-sm font-black text-cyan"
        >
          <RefreshCcw className="h-4 w-4" />
          {actionLabel}
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusCard({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-panel/88 p-4 shadow-market">
      <div className="flex items-center gap-2 text-sm font-bold text-paper/55">
        {icon}
        {label}
      </div>
      <p className="mt-2 truncate text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold text-paper/42">{detail}</p>
    </div>
  );
}

function CloudStatusPanel({ data }: { data: CloudStatus }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadinessTile
          label="Accounts"
          ready={data.readyForCloudAccounts}
          readyText="Cloud ready"
          pendingText="Needs setup"
          icon={<Cloud className="h-4 w-4" />}
        />
        <ReadinessTile
          label="Admin jobs"
          ready={data.readyForAdminJobs}
          readyText="Protected"
          pendingText="Pending"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>
      <div className="mt-4 grid gap-2">
        {data.checks.map((check) => (
          <div key={check.id} className="flex min-h-16 gap-3 rounded-md border border-line bg-black/20 p-3">
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
  );
}

function MarketHealthPanel({ data }: { data: MarketHealth }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <ReadinessTile
          label="Price history"
          ready={data.priceHistoryHealth.freshCoveragePercent >= 80}
          readyText={`${formatPercent(data.priceHistoryHealth.freshCoveragePercent)} fresh`}
          pendingText={`${formatPercent(data.priceHistoryHealth.freshCoveragePercent)} fresh`}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <ReadinessTile
          label="Latest model"
          ready={data.latestModelVersion === data.configuredModelVersion}
          readyText={data.latestModelVersion ?? "None"}
          pendingText={data.latestModelVersion ?? "No run"}
          icon={<SlidersHorizontal className="h-4 w-4" />}
        />
        <ReadinessTile
          label="Warnings"
          ready={data.warnings.length === 0}
          readyText="Clear"
          pendingText={`${data.warnings.length} warning${data.warnings.length === 1 ? "" : "s"}`}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {data.warnings.length ? (
        <div className="rounded-md border border-brass/35 bg-brass/10 p-3">
          <div className="flex items-center gap-2 text-sm font-black text-brass">
            <AlertTriangle className="h-4 w-4" />
            Warnings
          </div>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-paper/62">
            {data.warnings.slice(0, 5).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <CoverageGrid title="Source ID coverage" items={data.sourceCoverage.map((item) => ({
        key: item.key,
        label: item.label,
        value: formatPercent(item.coveragePercent),
        detail: `${item.configuredCount} mapped, ${item.missingCount} missing`
      }))} />

      <CoverageGrid title="Observation freshness" items={data.observationHealth.slice(0, 8).map((item) => ({
        key: item.key,
        label: item.label,
        value: formatPercent(item.freshCoveragePercent),
        detail: item.latestDate ? `Latest ${formatDate(item.latestDate)}` : "No observations"
      }))} />
    </div>
  );
}

function CoverageGrid({
  title,
  items
}: {
  title: string;
  items: Array<{ key: string; label: string; value: string; detail: string }>;
}) {
  return (
    <div>
      <h3 className="text-sm font-black uppercase tracking-wide text-paper/45">{title}</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.key} className="rounded-md border border-line bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-black">{item.label}</p>
              <p className="shrink-0 text-sm font-black number-tabular">{item.value}</p>
            </div>
            <p className="mt-1 text-xs font-bold text-paper/45">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewResult({ preview }: { preview: PreviewState }) {
  if (preview.status === "idle") {
    return (
      <div className="mt-4 rounded-md border border-line bg-black/20 p-4 text-sm font-bold text-paper/45">
        No preview has run in this session.
      </div>
    );
  }

  if (preview.status === "loading") {
    return <LoadingText text="Calculating a dry market preview..." />;
  }

  if (preview.status === "error") {
    return <ErrorText text={preview.message} />;
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-line bg-black/20 p-4">
      <div className="grid gap-3 text-sm sm:grid-cols-5">
        <PreviewMetric label="Artists" value={String(preview.summary.artistCount)} />
        <PreviewMetric label="With signal" value={String(preview.summary.momentumArtistCount ?? 0)} />
        <PreviewMetric label="Avg move" value={formatPercent(preview.summary.averageMovePercent)} />
        <PreviewMetric
          label="Reliability"
          value={
            typeof preview.summary.averageSignalReliability === "number"
              ? formatPercent(preview.summary.averageSignalReliability * 100)
              : "N/A"
          }
        />
        <PreviewMetric label="Model" value={preview.summary.modelVersion ?? "N/A"} />
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <PreviewMetric
          label="Top gainer"
          value={
            preview.summary.topGainer
              ? `${preview.summary.topGainer.ticker} ${formatPercent(preview.summary.topGainer.dailyChangePercent)}`
              : "N/A"
          }
        />
        <PreviewMetric
          label="Top loser"
          value={
            preview.summary.topLoser
              ? `${preview.summary.topLoser.ticker} ${formatPercent(preview.summary.topLoser.dailyChangePercent)}`
              : "N/A"
          }
        />
      </div>
      {preview.warnings.length ? (
        <div className="rounded-md border border-brass/35 bg-brass/10 p-3 text-sm leading-6 text-paper/62">
          {preview.warnings.slice(0, 3).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-paper/45">{label}</p>
      <p className="mt-1 truncate font-black number-tabular">{value}</p>
    </div>
  );
}

function ReadinessTile({
  label,
  ready,
  readyText,
  pendingText,
  icon
}: {
  label: string;
  ready: boolean;
  readyText: string;
  pendingText: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-black/20 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-paper/55">
        {icon}
        {label}
      </div>
      <p className={`mt-2 text-xl font-black ${ready ? "text-mint" : "text-brass"}`}>
        {ready ? readyText : pendingText}
      </p>
    </div>
  );
}

function LoadingText({ text }: { text: string }) {
  return <p className="mt-4 text-sm font-bold text-cyan">{text}</p>;
}

function ErrorText({ text }: { text: string }) {
  return <p className="mt-4 text-sm font-bold text-ember">{text}</p>;
}
