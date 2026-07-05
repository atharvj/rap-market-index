"use client";

import { useAuth } from "@/components/AuthProvider";
import { formatDate, formatPercent } from "@/lib/formatters";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Cloud,
  Database,
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

type EventScanState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
      mode: "preview" | "persist";
    }
  | {
      status: "success";
      mode: "preview" | "persist";
      runDate: string;
      scannedArtistCount: number;
      totalArtistCount: number;
      observationCount: number;
      eventCount: number;
      eventTypeCounts: Record<string, number>;
      artists: Array<{
        id: string;
        ticker: string;
        name: string;
        latestNewsScanDate: string | null;
      }>;
      topEvents: Array<{
        artistId: string;
        eventDate: string;
        eventType: string;
        title: string;
        sourceName: string | null;
        confidence: number;
        impactScore: number;
        sentimentScore: number | null;
      }>;
    }
  | {
      status: "error";
      message: string;
    };

type SourceResolverPreviewState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
    }
  | {
      status: "success";
      proposedRecordCount: number;
      savedRecordCount?: number;
      minConfidence: number;
      warnings: string[];
      batch: {
        artistCount: number;
        totalArtists: number;
        prioritizedCandidateCount?: number;
        nextOffset: number | null;
        hasMore: boolean;
      };
      suggestions: SourceResolverSuggestion[];
      records: Record<string, unknown>[];
      saveStatus?: "idle" | "saving" | "saved";
    }
  | {
      status: "error";
      message: string;
    };

type SourceResolverCandidate = {
  source: string;
  label: string;
  externalId: string;
  confidence: number;
  reason: string;
};

type SourceResolverSuggestion = {
  artistId: string;
  ticker: string;
  name: string;
  candidates: Record<string, SourceResolverCandidate[] | undefined>;
  proposedRecord: Record<string, unknown> | null;
  skippedExisting: string[];
  errors: string[];
};

type ArtistSourceIdRecord = {
  artistId: string;
  ticker: string;
  name: string;
  externalIds: {
    artistId: string;
    spotifyId?: string;
    youtubeChannelId?: string;
    musicbrainzId?: string;
    lastfmName?: string;
    gdeltQuery?: string;
  };
};

type SourceIdDirectory = {
  artistCount: number;
  records: ArtistSourceIdRecord[];
};

type ManualSourceIdForm = {
  artistId: string;
  spotifyId: string;
  youtubeChannelId: string;
  musicbrainzId: string;
  lastfmName: string;
  gdeltQuery: string;
};

type ManualSourceIdSaveState =
  | {
      status: "idle";
    }
  | {
      status: "saving";
    }
  | {
      status: "saved";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

const sourceIdFieldBySource: Record<string, string> = {
  spotify: "spotifyId",
  youtube: "youtubeChannelId",
  musicbrainz: "musicbrainzId"
};

const sourceIdLabelByField: Record<string, string> = {
  spotifyId: "Spotify ID",
  youtubeChannelId: "YouTube channel",
  musicbrainzId: "MusicBrainz ID",
  lastfmName: "audience search name",
  gdeltQuery: "news search query"
};

const manualSourceIdFields: Array<{
  key: keyof Omit<ManualSourceIdForm, "artistId">;
  label: string;
  placeholder: string;
  helper: string;
}> = [
  {
    key: "youtubeChannelId",
    label: "YouTube channel",
    placeholder: "UC..., @handle, or YouTube channel URL",
    helper: "Use a UC... ID, youtube.com/channel/UC... URL, @handle, or youtube.com/@handle URL."
  },
  {
    key: "spotifyId",
    label: "Spotify artist",
    placeholder: "Spotify artist ID or URL",
    helper: "Optional. Paste a Spotify artist ID, artist URL, or spotify:artist URI."
  },
  {
    key: "musicbrainzId",
    label: "MusicBrainz",
    placeholder: "UUID",
    helper: "Optional. Paste the MusicBrainz artist UUID."
  },
  {
    key: "lastfmName",
    label: "Audience search name",
    placeholder: "Artist name",
    helper: "Optional override for listener/play lookup when the artist name needs special spelling."
  },
  {
    key: "gdeltQuery",
    label: "News search query",
    placeholder: "\"Artist Name\"",
    helper: "Optional override for news/review/event matching."
  }
];

type AdminAccessState =
  | {
      status: "loading";
    }
  | {
      status: "granted";
      email: string | null;
    }
  | {
      status: "denied";
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
  eventHealth: {
    latestDate: string | null;
    eventCount: number;
    freshEventCount: number;
    observedArtistCount: number;
    freshArtistCount: number;
    missingArtistCount: number;
    freshCoveragePercent: number;
    eventFreshnessDays: number;
    typeCounts: Record<string, number>;
    freshTypeCounts: Record<string, number>;
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

const emptyManualSourceIdForm: ManualSourceIdForm = {
  artistId: "",
  spotifyId: "",
  youtubeChannelId: "",
  musicbrainzId: "",
  lastfmName: "",
  gdeltQuery: ""
};

export default function DevPage() {
  const { configured: authConfigured, loading: authLoading, session } = useAuth();
  const [adminAccess, setAdminAccess] = useState<AdminAccessState>({ status: "loading" });
  const [cloudStatus, setCloudStatus] = useState<AsyncState<CloudStatus>>({ status: "loading" });
  const [marketHealth, setMarketHealth] = useState<AsyncState<MarketHealth>>({ status: "loading" });
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [eventScan, setEventScan] = useState<EventScanState>({ status: "idle" });
  const [resolverPreview, setResolverPreview] = useState<SourceResolverPreviewState>({ status: "idle" });
  const [sourceIds, setSourceIds] = useState<AsyncState<SourceIdDirectory>>({ status: "loading" });
  const [manualSourceForm, setManualSourceForm] = useState<ManualSourceIdForm>(emptyManualSourceIdForm);
  const [manualSourceSave, setManualSourceSave] = useState<ManualSourceIdSaveState>({ status: "idle" });
  const adminHeaders = useMemo<Record<string, string>>(() => {
    if (!session) {
      return {} as Record<string, string>;
    }

    return {
      authorization: `Bearer ${session.access_token}`
    };
  }, [session]);

  useEffect(() => {
    if (authLoading) {
      setAdminAccess({ status: "loading" });
      return;
    }

    if (!authConfigured) {
      setAdminAccess({
        status: "denied",
        message: "Supabase auth is not configured, so admin access cannot be verified."
      });
      return;
    }

    if (!session) {
      setAdminAccess({
        status: "denied",
        message: "Sign in with an admin account to access market operations."
      });
      return;
    }

    let active = true;
    setAdminAccess({ status: "loading" });

    fetch("/api/admin/session", {
      headers: adminHeaders
    })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (!active) {
          return;
        }

        if (!ok || !payload.ok) {
          throw new Error(payload.error ?? "Admin access check failed.");
        }

        setAdminAccess({
          status: "granted",
          email: payload.email ?? null
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setAdminAccess({
          status: "denied",
          message: error instanceof Error ? error.message : "Admin access check failed."
        });
      });

    return () => {
      active = false;
    };
  }, [adminHeaders, authConfigured, authLoading, session]);

  useEffect(() => {
    if (adminAccess.status !== "granted") {
      return;
    }

    void refreshCloudStatus();
    void refreshMarketHealth();
    void refreshSourceIds();
  }, [adminAccess.status]);

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

  const selectedManualSourceRecord = useMemo(() => {
    if (sourceIds.status !== "ready" || !manualSourceForm.artistId) {
      return null;
    }

    return sourceIds.data.records.find((record) => record.artistId === manualSourceForm.artistId) ?? null;
  }, [manualSourceForm.artistId, sourceIds]);

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
      const response = await fetch("/api/admin/market-health", {
        headers: adminHeaders
      });
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

  async function refreshSourceIds() {
    setSourceIds({ status: "loading" });

    try {
      const response = await fetch("/api/admin/artist-source-ids", {
        headers: adminHeaders
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Source ID list failed.");
      }

      setSourceIds({
        status: "ready",
        data: {
          artistCount: payload.artistCount ?? 0,
          records: payload.records ?? []
        }
      });
    } catch (error) {
      setSourceIds({
        status: "error",
        message: error instanceof Error ? error.message : "Source ID list failed."
      });
    }
  }

  async function runCorePreview() {
    setPreview({ status: "loading" });

    try {
      const response = await fetch("/api/admin/daily-market-update", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
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

  async function runEventScan(mode: "preview" | "persist") {
    setEventScan({ status: "loading", mode });

    try {
      const response = await fetch("/api/admin/market-event-scan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          dryRun: mode === "preview",
          artistLimit: 3,
          maxRecords: 8
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Market event scan failed.");
      }

      setEventScan({
        status: "success",
        mode,
        runDate: payload.runDate,
        scannedArtistCount: payload.scannedArtistCount ?? 0,
        totalArtistCount: payload.totalArtistCount ?? 0,
        observationCount: payload.observationCount ?? 0,
        eventCount: payload.eventCount ?? 0,
        eventTypeCounts: payload.eventTypeCounts ?? {},
        artists: payload.artists ?? [],
        topEvents: payload.topEvents ?? []
      });

      if (mode === "persist") {
        void refreshMarketHealth();
      }
    } catch (error) {
      setEventScan({
        status: "error",
        message: error instanceof Error ? error.message : "Market event scan failed."
      });
    }
  }

  async function runSourceResolverPreview() {
    setResolverPreview({ status: "loading" });

    try {
      const response = await fetch("/api/admin/artist-source-resolver", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          dryRun: true,
          artistLimit: 5,
          artistOffset: 0,
          sources: ["spotify", "youtube", "musicbrainz"],
          minConfidence: 0.88,
          prioritizeMissing: true
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Source resolver preview failed.");
      }

      setResolverPreview({
        status: "success",
        proposedRecordCount: payload.proposedRecordCount ?? 0,
        minConfidence: payload.minConfidence ?? 0.88,
        warnings: payload.warnings ?? [],
        batch: payload.batch,
        suggestions: payload.suggestions ?? [],
        records: payload.records ?? [],
        saveStatus: "idle"
      });
    } catch (error) {
      setResolverPreview({
        status: "error",
        message: error instanceof Error ? error.message : "Source resolver preview failed."
      });
    }
  }

  async function saveSourceResolverProposals() {
    if (resolverPreview.status !== "success" || !resolverPreview.records.length) {
      return;
    }

    setResolverPreview({
      ...resolverPreview,
      saveStatus: "saving"
    });

    try {
      const response = await fetch("/api/admin/artist-source-ids", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          dryRun: false,
          records: resolverPreview.records
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Source ID save failed.");
      }

      setResolverPreview({
        ...resolverPreview,
        savedRecordCount: payload.recordCount ?? resolverPreview.records.length,
        saveStatus: "saved"
      });
      void refreshMarketHealth();
    } catch (error) {
      setResolverPreview({
        status: "error",
        message: error instanceof Error ? error.message : "Source ID save failed."
      });
    }
  }

  function selectManualSourceArtist(artistId: string) {
    const record =
      sourceIds.status === "ready" ? sourceIds.data.records.find((item) => item.artistId === artistId) : undefined;

    setManualSourceForm(record ? buildManualSourceForm(record) : { ...emptyManualSourceIdForm, artistId });
    setManualSourceSave({ status: "idle" });
  }

  function updateManualSourceField(field: keyof Omit<ManualSourceIdForm, "artistId">, value: string) {
    setManualSourceForm((current) => ({
      ...current,
      [field]: value
    }));
    setManualSourceSave({ status: "idle" });
  }

  async function saveManualSourceIds() {
    if (!selectedManualSourceRecord) {
      setManualSourceSave({
        status: "error",
        message: "Choose an artist before saving source IDs."
      });
      return;
    }

    const record = buildManualSourceIdUpsert(manualSourceForm, selectedManualSourceRecord);

    if (Object.keys(record).length === 1) {
      setManualSourceSave({
        status: "error",
        message: "No source ID changes to save for this artist."
      });
      return;
    }

    setManualSourceSave({ status: "saving" });

    try {
      const response = await fetch("/api/admin/artist-source-ids", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          dryRun: false,
          records: [record]
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? payload.errors?.[0] ?? "Manual source ID save failed.");
      }

      setManualSourceSave({
        status: "saved",
        message: `Saved source IDs for ${selectedManualSourceRecord.ticker}.`
      });
      const savedExternalIds = payload.saved?.[selectedManualSourceRecord.artistId];

      if (savedExternalIds) {
        setManualSourceForm(
          buildManualSourceForm({
            ...selectedManualSourceRecord,
            externalIds: savedExternalIds
          })
        );
      }

      await refreshSourceIds();
      await refreshMarketHealth();
    } catch (error) {
      setManualSourceSave({
        status: "error",
        message: error instanceof Error ? error.message : "Manual source ID save failed."
      });
    }
  }

  if (adminAccess.status !== "granted") {
    return <AdminAccessGate state={adminAccess} />;
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
        <div className="rounded-md border border-mint/35 bg-mint/10 p-4 text-sm font-bold leading-6 text-mint">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Admin-only access
          </div>
          <p className="mt-1 text-mint/80">{adminAccess.email ?? "Verified admin session"}</p>
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
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Event layer</p>
            <h2 className="mt-1 text-2xl font-black">Scan news and event signals</h2>
            <p className="mt-2 text-sm leading-6 text-paper/55">
              The daily cron runs this automatically before pricing. These controls only preview or backfill a small
              least-recently-scanned artist batch.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => runEventScan("preview")}
              disabled={eventScan.status === "loading"}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-4 text-sm font-black text-cyan disabled:cursor-wait disabled:opacity-55"
            >
              <PlayCircle className="h-4 w-4" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => runEventScan("persist")}
              disabled={eventScan.status === "loading"}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-4 text-sm font-black text-mint disabled:cursor-wait disabled:opacity-55"
            >
              <CheckCircle2 className="h-4 w-4" />
              Backfill scan
            </button>
          </div>
        </div>
        <EventScanResult scan={eventScan} />
      </section>

      <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Data quality</p>
            <h2 className="mt-1 text-2xl font-black">Preview missing source IDs</h2>
            <p className="mt-2 text-sm leading-6 text-paper/55">
              Runs a dry resolver pass for missing Spotify, YouTube, and MusicBrainz IDs. It does not save candidate
              IDs.
            </p>
          </div>
          <button
            type="button"
            onClick={runSourceResolverPreview}
            disabled={resolverPreview.status === "loading"}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-4 text-sm font-black text-cyan disabled:cursor-wait disabled:opacity-55"
          >
            <PlayCircle className="h-4 w-4" />
            Preview
          </button>
        </div>
        <SourceResolverPreviewResult preview={resolverPreview} onSave={saveSourceResolverProposals} />
      </section>

      <ManualSourceIdEditor
        state={sourceIds}
        form={manualSourceForm}
        selectedRecord={selectedManualSourceRecord}
        saveState={manualSourceSave}
        onRefresh={refreshSourceIds}
        onSelectArtist={selectManualSourceArtist}
        onChange={updateManualSourceField}
        onSave={saveManualSourceIds}
      />

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

function AdminAccessGate({ state }: { state: AdminAccessState }) {
  const loading = state.status === "loading";
  const message = state.status === "denied" ? state.message : "Checking your admin session...";

  return (
    <section className="mx-auto max-w-xl rounded-md border border-line bg-panel/88 p-6 shadow-market">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-brass text-ink">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Operator console</p>
          <h1 className="mt-2 text-3xl font-black">Admin access required</h1>
          <p className="mt-3 text-sm leading-6 text-paper/58">
            {loading ? "Checking your admin session..." : message}
          </p>
        </div>
      </div>
    </section>
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <ReadinessTile
          label="Market events"
          ready={data.eventHealth.eventCount > 0}
          readyText={`${data.eventHealth.freshEventCount} fresh`}
          pendingText="Idle"
          icon={<FileWarning className="h-4 w-4" />}
        />
      </div>

      {data.warnings.length ? (
        <div className="rounded-md border border-brass/35 bg-brass/10 p-3">
          <div className="flex items-center gap-2 text-sm font-black text-brass">
            <AlertTriangle className="h-4 w-4" />
            Warnings
          </div>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-paper/62">
            {data.warnings.map((warning) => (
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

      <CoverageGrid title="Observation freshness" items={data.observationHealth.map((item) => ({
        key: item.key,
        label: item.label,
        value: formatPercent(item.freshCoveragePercent),
        detail: item.latestDate ? `Latest ${formatDate(item.latestDate)}` : "No observations"
      }))} />

      <CoverageGrid title="Event layer" items={[
        {
          key: "event-count",
          label: "Recent market events",
          value: String(data.eventHealth.eventCount),
          detail: data.eventHealth.latestDate ? `Latest ${formatDate(data.eventHealth.latestDate)}` : "No events"
        },
        {
          key: "fresh-event-coverage",
          label: "Fresh event artists",
          value: formatPercent(data.eventHealth.freshCoveragePercent),
          detail: `${data.eventHealth.freshArtistCount} active in ${data.eventHealth.eventFreshnessDays} days`
        },
        {
          key: "fresh-event-types",
          label: "Fresh event types",
          value: String(Object.keys(data.eventHealth.freshTypeCounts).length),
          detail: formatEventTypeCounts(data.eventHealth.freshTypeCounts)
        },
        {
          key: "all-event-types",
          label: "Recent event types",
          value: String(Object.keys(data.eventHealth.typeCounts).length),
          detail: formatEventTypeCounts(data.eventHealth.typeCounts)
        }
      ]} />
    </div>
  );
}

function formatEventTypeCounts(counts: Record<string, number>) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    return "No classified events";
  }

  return entries
    .slice(0, 3)
    .map(([type, count]) => `${type} ${count}`)
    .join(", ");
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

function EventScanResult({ scan }: { scan: EventScanState }) {
  if (scan.status === "idle") {
    return (
      <div className="mt-4 rounded-md border border-line bg-black/20 p-4 text-sm font-bold text-paper/45">
        No event scan has run in this session.
      </div>
    );
  }

  if (scan.status === "loading") {
    return (
      <LoadingText
        text={scan.mode === "persist" ? "Saving a small market event scan..." : "Previewing a small market event scan..."}
      />
    );
  }

  if (scan.status === "error") {
    return <ErrorText text={scan.message} />;
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-line bg-black/20 p-4">
      <div className="grid gap-3 text-sm sm:grid-cols-5">
        <PreviewMetric label="Mode" value={scan.mode === "persist" ? "Saved" : "Preview"} />
        <PreviewMetric label="Artists" value={`${scan.scannedArtistCount}/${scan.totalArtistCount}`} />
        <PreviewMetric label="Observations" value={String(scan.observationCount)} />
        <PreviewMetric label="Events" value={String(scan.eventCount)} />
        <PreviewMetric label="Run date" value={formatDate(scan.runDate)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-black/20 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-paper/45">Scanned artists</p>
          <div className="mt-2 grid gap-2">
            {scan.artists.length ? (
              scan.artists.map((artist) => (
                <div key={artist.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-black">
                    {artist.ticker} <span className="font-bold text-paper/45">{artist.name}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-paper/42">
                    {artist.latestNewsScanDate ? `Last ${formatDate(artist.latestNewsScanDate)}` : "New scan"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm font-bold text-paper/45">No artists scanned.</p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-line bg-black/20 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-paper/45">Event types</p>
          <p className="mt-2 text-sm font-bold leading-6 text-paper/62">
            {formatEventTypeCounts(scan.eventTypeCounts)}
          </p>
        </div>
      </div>

      {scan.topEvents.length ? (
        <div className="grid gap-2">
          {scan.topEvents.map((event, index) => (
            <div key={`${event.artistId}-${event.eventDate}-${event.title}-${index}`} className="rounded-md border border-line bg-black/20 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{event.title}</p>
                  <p className="mt-1 text-xs font-bold text-paper/42">
                    {event.eventType} - {formatDate(event.eventDate)}
                    {event.sourceName ? ` - ${event.sourceName}` : ""}
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-2 text-right text-xs font-black number-tabular">
                  <span>{formatPercent(event.confidence * 100)}</span>
                  <span>{formatPercent(event.impactScore * 100)}</span>
                  <span>{event.sentimentScore === null ? "N/A" : formatPercent(event.sentimentScore * 100)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-brass/35 bg-brass/10 p-3 text-sm font-bold leading-6 text-paper/62">
          No classified events were found in this small scan. Saved scans still persist article-count observations.
        </div>
      )}
    </div>
  );
}

function SourceResolverPreviewResult({
  preview,
  onSave
}: {
  preview: SourceResolverPreviewState;
  onSave: () => void;
}) {
  if (preview.status === "idle") {
    return (
      <div className="mt-4 rounded-md border border-line bg-black/20 p-4 text-sm font-bold text-paper/45">
        No source resolver preview has run in this session.
      </div>
    );
  }

  if (preview.status === "loading") {
    return <LoadingText text="Resolving candidate source IDs..." />;
  }

  if (preview.status === "error") {
    return <ErrorText text={preview.message} />;
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-line bg-black/20 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="grid flex-1 gap-3 text-sm sm:grid-cols-4">
          <PreviewMetric label="Artists" value={String(preview.batch.artistCount)} />
          <PreviewMetric label="Missing pool" value={String(preview.batch.prioritizedCandidateCount ?? 0)} />
          <PreviewMetric
            label={preview.saveStatus === "saved" ? "Saved" : "Proposed"}
            value={String(preview.savedRecordCount ?? preview.proposedRecordCount)}
          />
          <PreviewMetric label="More" value={preview.batch.hasMore ? String(preview.batch.nextOffset ?? "") : "No"} />
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!preview.records.length || preview.saveStatus === "saving" || preview.saveStatus === "saved"}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-4 text-sm font-black text-mint disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          {preview.saveStatus === "saving"
            ? "Saving"
            : preview.saveStatus === "saved"
              ? "Saved"
              : `Save proposed ${preview.proposedRecordCount}`}
        </button>
      </div>

      {preview.warnings.length ? (
        <div className="rounded-md border border-brass/35 bg-brass/10 p-3 text-sm leading-6 text-paper/62">
          {preview.warnings.slice(0, 3).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2">
        {preview.suggestions.slice(0, 5).map((suggestion) => (
          <SourceResolverSuggestionRow
            key={suggestion.artistId}
            suggestion={suggestion}
            minConfidence={preview.minConfidence}
          />
        ))}
      </div>
    </div>
  );
}

function SourceResolverSuggestionRow({
  suggestion,
  minConfidence
}: {
  suggestion: SourceResolverSuggestion;
  minConfidence: number;
}) {
  const topCandidates = ["spotify", "youtube", "musicbrainz"]
    .map((source) => ({
      source,
      candidate: suggestion.candidates[source]?.[0]
    }))
    .filter((item): item is { source: string; candidate: SourceResolverCandidate } => Boolean(item.candidate));
  const proposedKeys = suggestion.proposedRecord
    ? Object.keys(suggestion.proposedRecord).filter((key) => key !== "artistId")
    : [];
  const proposedLabels = proposedKeys.map((key) => sourceIdLabelByField[key] ?? key);

  return (
    <div className="rounded-md border border-line bg-black/25 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-black">
            {suggestion.ticker} <span className="text-paper/45">{suggestion.name}</span>
          </p>
          <p className="mt-1 text-xs font-bold text-paper/45">
            {proposedLabels.length ? `Will save ${proposedLabels.join(", ")}` : "No high-confidence source IDs"}
          </p>
        </div>
        {suggestion.skippedExisting.length ? (
          <p className="text-xs font-bold uppercase tracking-wide text-mint/80">
            Existing {suggestion.skippedExisting.join(", ")}
          </p>
        ) : null}
      </div>

      {topCandidates.length ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {topCandidates.map(({ source, candidate }) => {
            const proposedField = sourceIdFieldBySource[source];
            const willSave = Boolean(
              proposedField &&
                suggestion.proposedRecord &&
                Object.prototype.hasOwnProperty.call(suggestion.proposedRecord, proposedField)
            );
            const alreadySaved = suggestion.skippedExisting.includes(source);
            const statusLabel = willSave ? "Will save" : alreadySaved ? "Already saved" : "Not saving";
            const statusClassName = willSave
              ? "border-mint/40 bg-mint/10 text-mint"
              : alreadySaved
                ? "border-cyan/35 bg-cyan/10 text-cyan"
                : "border-brass/35 bg-brass/10 text-brass";
            const cardClassName = willSave
              ? "border-mint/35 bg-mint/5"
              : alreadySaved
                ? "border-cyan/25 bg-cyan/5"
                : "border-line bg-black/20";

            return (
              <div key={source} className={`rounded-md border p-2 ${cardClassName}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-paper/45">{source}</p>
                    <p className="mt-1 text-xs font-black number-tabular">{formatPercent(candidate.confidence * 100)}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${statusClassName}`}
                  >
                    {statusLabel}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm font-bold">{candidate.label}</p>
                <p className="mt-1 truncate text-xs font-bold text-paper/42">
                  {willSave
                    ? candidate.reason
                    : alreadySaved
                      ? "Existing ID is already stored."
                      : `Below ${formatPercent(minConfidence * 100)} save threshold.`}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      {suggestion.errors.length ? (
        <div className="mt-3 rounded-md border border-ember/35 bg-ember/10 p-2 text-xs font-bold leading-5 text-ember">
          {suggestion.errors.slice(0, 2).map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ManualSourceIdEditor({
  state,
  form,
  selectedRecord,
  saveState,
  onRefresh,
  onSelectArtist,
  onChange,
  onSave
}: {
  state: AsyncState<SourceIdDirectory>;
  form: ManualSourceIdForm;
  selectedRecord: ArtistSourceIdRecord | null;
  saveState: ManualSourceIdSaveState;
  onRefresh: () => void;
  onSelectArtist: (artistId: string) => void;
  onChange: (field: keyof Omit<ManualSourceIdForm, "artistId">, value: string) => void;
  onSave: () => void;
}) {
  const records = state.status === "ready" ? state.data.records : [];
  const selectedDisabled = state.status !== "ready" || !selectedRecord || saveState.status === "saving";

  return (
    <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Data quality</p>
          <h2 className="mt-1 text-2xl font-black">Manual source IDs</h2>
          <p className="mt-2 text-sm leading-6 text-paper/55">
            Review one artist at a time and save exact source IDs when automatic matching is uncertain.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={state.status === "loading"}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-4 text-sm font-black text-cyan disabled:cursor-wait disabled:opacity-55"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {state.status === "loading" ? <LoadingText text="Loading stored source IDs..." /> : null}
      {state.status === "error" ? <ErrorText text={state.message} /> : null}

      {state.status === "ready" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-md border border-line bg-black/20 p-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-paper/45">Artist</span>
              <select
                value={form.artistId}
                onChange={(event) => onSelectArtist(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none focus:border-cyan"
              >
                <option value="">Select artist</option>
                {records.map((record) => (
                  <option key={record.artistId} value={record.artistId}>
                    {record.ticker} - {record.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 grid gap-2">
              <PreviewMetric label="Loaded artists" value={String(state.data.artistCount)} />
              <PreviewMetric label="Selected" value={selectedRecord ? selectedRecord.ticker : "None"} />
            </div>

            {selectedRecord ? (
              <div className="mt-4 rounded-md border border-line bg-black/25 p-3">
                <p className="text-xs font-black uppercase tracking-wide text-paper/45">Current stored data</p>
                <div className="mt-2 grid gap-2">
                  {manualSourceIdFields.map((field) => {
                    const value = selectedRecord.externalIds[field.key];

                    return (
                      <div key={field.key} className="min-w-0">
                        <p className="text-xs font-bold text-paper/42">{field.label}</p>
                        <p className={`mt-1 truncate text-xs font-black ${value ? "text-paper/70" : "text-brass"}`}>
                          {value ?? "Missing"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-line bg-black/20 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {manualSourceIdFields.map((field) => (
                <label key={field.key} className={field.key === "gdeltQuery" ? "block md:col-span-2" : "block"}>
                  <span className="text-xs font-black uppercase tracking-wide text-paper/45">{field.label}</span>
                  <input
                    value={form[field.key]}
                    onChange={(event) => onChange(field.key, event.target.value)}
                    disabled={selectedDisabled}
                    placeholder={field.placeholder}
                    className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none placeholder:text-paper/24 focus:border-cyan disabled:cursor-not-allowed disabled:opacity-55"
                  />
                  <span className="mt-1 block text-xs font-bold leading-5 text-paper/42">{field.helper}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-h-6 text-sm font-bold">
                {saveState.status === "saved" ? <span className="text-mint">{saveState.message}</span> : null}
                {saveState.status === "error" ? <span className="text-ember">{saveState.message}</span> : null}
              </div>
              <button
                type="button"
                onClick={onSave}
                disabled={!selectedRecord || saveState.status === "saving"}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-4 text-sm font-black text-mint disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saveState.status === "saving" ? "Saving" : "Save manual IDs"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type ManualSourceIdUpsert = {
  artistId: string;
  spotifyId?: string | null;
  youtubeChannelId?: string | null;
  musicbrainzId?: string | null;
  lastfmName?: string | null;
  gdeltQuery?: string | null;
};

function buildManualSourceForm(record: ArtistSourceIdRecord): ManualSourceIdForm {
  return {
    artistId: record.artistId,
    spotifyId: record.externalIds.spotifyId ?? "",
    youtubeChannelId: record.externalIds.youtubeChannelId ?? "",
    musicbrainzId: record.externalIds.musicbrainzId ?? "",
    lastfmName: record.externalIds.lastfmName ?? "",
    gdeltQuery: record.externalIds.gdeltQuery ?? ""
  };
}

function buildManualSourceIdUpsert(
  form: ManualSourceIdForm,
  selectedRecord: ArtistSourceIdRecord
): ManualSourceIdUpsert {
  const upsert: ManualSourceIdUpsert = {
    artistId: selectedRecord.artistId
  };

  for (const field of manualSourceIdFields) {
    const key = field.key;
    const currentValue = selectedRecord.externalIds[key] ?? "";
    const nextValue = form[key].trim();

    if (nextValue && nextValue !== currentValue) {
      upsert[key] = nextValue;
    } else if (!nextValue && currentValue) {
      upsert[key] = null;
    }
  }

  return upsert;
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
