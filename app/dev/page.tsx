"use client";

import { useAuth } from "@/components/AuthProvider";
import { formatCurrency, formatDate, formatPercent } from "@/lib/formatters";
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
import { Children, useEffect, useMemo, useState } from "react";

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

type RunNowState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
      completedBatchCount: number;
      processedArtistCount: number;
    }
  | {
      status: "skipped";
      runDate: string;
      reason: string;
    }
  | {
      status: "success";
      runDate: string | null;
      source: string | null;
      persisted: boolean;
      forced: boolean;
      completedBatchCount: number;
      processedArtistCount: number;
      observationCount: number;
      eventCount: number;
      detectedEventCount: number;
      hasMore: boolean;
      nextOffset: number | null;
      summary: {
        artistCount?: number;
        momentumArtistCount?: number;
        averageMovePercent?: number;
        averageSignalDelta?: number;
        modelVersion?: string;
        topGainer?: { ticker: string; dailyChangePercent: number } | null;
        topLoser?: { ticker: string; dailyChangePercent: number } | null;
      } | null;
      warnings: string[];
      eventScanStatus: string;
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
      gdeltEventCount?: number;
      mediaRssEventCount?: number;
      aiResearchEventCount?: number;
      aiResearchEnabled?: boolean;
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

type AdminActionState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
      label: string;
    }
  | {
      status: "success";
      message: string;
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
  metadata?: Record<string, unknown>;
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
    wikipediaArticleTitle?: string;
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
  wikipediaArticleTitle: string;
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

type ArtistCategory = "superstar" | "mainstream" | "rising" | "underground";

type ArtistRosterRecord = {
  id: string;
  name: string;
  ticker: string;
  currentPrice: number;
  previousClose: number;
  dailyChangePercent: number;
  hypeScore: number;
  volatility: number;
  category: ArtistCategory;
  accent: string;
  isActive: boolean;
};

type ArtistRosterDirectory = {
  artistCount: number;
  activeCount: number;
  inactiveCount: number;
  records: ArtistRosterRecord[];
};

type ArtistRosterForm = {
  selectedId: string;
  id: string;
  name: string;
  ticker: string;
  currentPrice: string;
  previousClose: string;
  volatility: string;
  category: ArtistCategory;
  isActive: boolean;
};

type ArtistRosterSaveState =
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

type AutoArtistPreviewResult = {
  record: ArtistRosterRecord;
  sourceIds: ArtistSourceIdRecord["externalIds"] | null;
  suggestions: SourceResolverSuggestion[];
  warnings: string[];
  starter: {
    source: string;
    price: number;
    category: ArtistCategory;
    volatility: number;
  };
};

type AutoArtistAddState =
  | {
      status: "idle";
    }
  | {
      status: "previewing";
    }
  | {
      status: "preview";
      preview: AutoArtistPreviewResult;
    }
  | {
      status: "saving";
      preview: AutoArtistPreviewResult;
    }
  | {
      status: "saved";
      message: string;
      warnings: string[];
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
  gdeltQuery: "news search query",
  wikipediaArticleTitle: "Wikipedia article title"
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
  },
  {
    key: "wikipediaArticleTitle",
    label: "Wikipedia article title",
    placeholder: "Exact English Wikipedia article title",
    helper: "Optional. Use the exact title shown after /wiki/ on the artist's English Wikipedia page."
  }
];

const artistCategoryOptions: ArtistCategory[] = ["underground", "rising", "mainstream", "superstar"];

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
  config: {
    aiResearchConfigured?: boolean;
    redditCredentialsConfigured?: boolean;
  };
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
    summary?: {
      artistCount?: number;
      momentumArtistCount?: number;
      averageMovePercent?: number;
      averageAbsMovePercent?: number;
      upMoveCount?: number;
      downMoveCount?: number;
      flatMoveCount?: number;
      lowReliabilityCount?: number;
      mediumReliabilityCount?: number;
      highReliabilityCount?: number;
      sourceQualityAnomalyCount?: number;
      sourceQualityStaleCount?: number;
      averageSourceQualityMultiplier?: number;
      technicalAdjustmentCount?: number;
      averageTechnicalAdjustment?: number;
      signalCoverageScore?: number;
      reliabilityScore?: number;
      movementBalanceScore?: number;
      marketQualityScore?: number;
    };
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
    source: string;
    metric: string;
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
  priceTickHealth: {
    latestAt: string | null;
    tickCount: number;
    marketRunTickCount: number;
    tradeTickCount: number;
    migrationTickCount: number;
    manualTickCount: number;
    observedArtistCount: number;
    freshArtistCount: number;
    staleArtistCount: number;
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
  integrityGuardrails: {
    ready: boolean;
    checkedAt: string;
    error: string | null;
  };
  marketOperations: {
    ready: boolean;
    checkedAt: string;
    error: string | null;
    tradingMode: string | null;
    marketOpen: boolean;
    marketImpactEnabled: boolean;
    activeHaltCount: number;
    statusNote: string | null;
  };
  shortingFoundation: {
    ready: boolean;
    checkedAt: string;
    error: string | null;
    openPositionCount: number;
    transactionCount: number;
    riskRowCount: number;
  };
  warnings: string[];
};

type MarketControls = {
  controls: {
    trading_mode: "continuous" | "halted" | "maintenance";
    allow_trading: boolean;
    allow_market_impact: boolean;
    status_note: string;
    day_change_reset: string;
    updated_at: string;
  } | null;
  activeHalts: Array<{
    artist_id: string;
    is_halted: boolean;
    reason: string;
    starts_at: string;
    ends_at: string | null;
  }>;
};

type MarketControlActionState =
  | {
      status: "idle";
    }
  | {
      status: "saving";
      label: string;
    }
  | {
      status: "saved";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

type MarketIntegrity = {
  generatedAt: string;
  since: string;
  lookbackHours: number;
  summary: {
    tradeCount: number;
    marketEligibleTradeCount: number;
    excludedTradeCount: number;
    uniqueTraderCount: number;
    marketEligibleUniqueTraderCount: number;
    grossOrderValue: number;
    marketEligibleGrossOrderValue: number;
    excludedGrossOrderValue: number;
    buyGrossOrderValue: number;
    sellGrossOrderValue: number;
    coverGrossOrderValue: number;
    shortGrossOrderValue: number;
    bullishGrossOrderValue: number;
    bearishGrossOrderValue: number;
    commissionTotal: number;
  };
  excludedTradeSummary: {
    tradeCount: number;
    grossOrderValue: number;
    uniqueTraderCount: number;
    artistCount: number;
    latestTradeAt: string | null;
  };
  concentrationFlags: Array<{
    artistId: string;
    ticker: string;
    name: string;
    severity: "watch" | "high" | "critical";
    reason: string;
    tradeCount: number;
    buyCount: number;
    sellCount: number;
    coverCount: number;
    shortCount: number;
    uniqueTraderCount: number;
    grossOrderValue: number;
    netOrderValue: number;
    largestTrader: {
      userId: string;
      username: string | null;
      tradeCount: number;
      grossOrderValue: number;
      sharePercent: number;
    };
    firstTradeAt: string;
    lastTradeAt: string;
  }>;
  rapidTradeFlags: Array<{
    userId: string;
    username: string | null;
    artistId: string;
    ticker: string;
    name: string;
    tradeCount: number;
    grossOrderValue: number;
    windowMinutes: number;
    severity: "watch" | "high";
    firstTradeAt: string;
    lastTradeAt: string;
  }>;
  warnings: string[];
};

type ModelValidationState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
    }
  | {
      status: "ready";
      data: {
        runDate: string;
        lookbackDays: number;
        snapshotRowCount: number;
        observationRowCount: number;
        validation: {
          status: "collecting" | "provisional" | "measured";
          horizonDays: number;
          sampleCount: number;
          distinctArtistCount: number;
          distinctSignalDateCount: number;
          rankCorrelation: number | null;
          directionalAccuracyPercent: number | null;
          directionalSampleCount: number;
          topBottomAudienceLift: number | null;
          averageMetricsPerSample: number;
          minimumRecommendedSamples: number;
          minimumRecommendedDates: number;
          note: string;
        };
      };
    }
  | {
      status: "error";
      message: string;
    };

type UserSupportDirectory = {
  userCount: number;
  users: Array<{
    id: string;
    email: string | null;
    emailDomainWarning: string | null;
    username: string;
    createdAt: string;
    lastSignInAt: string | null;
    emailConfirmedAt: string | null;
    suspendedUntil: string | null;
    isSuspended: boolean;
    isAdmin: boolean;
    onboardingCompleted: boolean;
    cashBalance: number;
    portfolioValue: number;
    gainPercent: number;
    positionCount: number;
    tradeCount: number;
  }>;
  recentOrders: Array<{
    id: string;
    userId: string;
    username: string;
    artistId: string;
    artistName: string;
    ticker: string;
    type: "buy" | "sell" | "short" | "cover";
    shares: number;
    price: number;
    commission: number;
    marketEligible: boolean;
    createdAt: string;
  }>;
  recentAdminActions: Array<{
    id: string;
    actorUserId: string | null;
    actorUsername: string;
    targetUserId: string | null;
    targetUsername: string | null;
    action: string;
    reason: string;
    details: unknown;
    createdAt: string;
  }>;
};

const plannedPowers = [
  {
    title: "Trade support",
    detail: "Account-level order inspection and atomic portfolio resets are available. Individual order reversal remains intentionally disabled because it can invalidate later cost-basis calculations.",
    status: "Guarded",
    icon: FileWarning
  },
  {
    title: "Shorting readiness",
    detail: "Short position storage and cover logic exist. Public short trading stays off until UX and liquidation checks are ready.",
    status: "Foundation",
    icon: SlidersHorizontal
  }
];

const emptyManualSourceIdForm: ManualSourceIdForm = {
  artistId: "",
  spotifyId: "",
  youtubeChannelId: "",
  musicbrainzId: "",
  lastfmName: "",
  gdeltQuery: "",
  wikipediaArticleTitle: ""
};

const emptyArtistRosterForm: ArtistRosterForm = {
  selectedId: "",
  id: "",
  name: "",
  ticker: "",
  currentPrice: "",
  previousClose: "",
  volatility: "1.4",
  category: "underground",
  isActive: true
};

export default function DevPage() {
  const { configured: authConfigured, loading: authLoading, session } = useAuth();
  const [adminAccess, setAdminAccess] = useState<AdminAccessState>({ status: "loading" });
  const [cloudStatus, setCloudStatus] = useState<AsyncState<CloudStatus>>({ status: "loading" });
  const [marketHealth, setMarketHealth] = useState<AsyncState<MarketHealth>>({ status: "loading" });
  const [marketControls, setMarketControls] = useState<AsyncState<MarketControls>>({ status: "loading" });
  const [marketControlAction, setMarketControlAction] = useState<MarketControlActionState>({ status: "idle" });
  const [haltArtistId, setHaltArtistId] = useState("");
  const [haltReason, setHaltReason] = useState("Trading halted for data review.");
  const [marketIntegrity, setMarketIntegrity] = useState<AsyncState<MarketIntegrity>>({ status: "loading" });
  const [modelValidation, setModelValidation] = useState<ModelValidationState>({ status: "idle" });
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [runNow, setRunNow] = useState<RunNowState>({ status: "idle" });
  const [eventScan, setEventScan] = useState<EventScanState>({ status: "idle" });
  const [resolverPreview, setResolverPreview] = useState<SourceResolverPreviewState>({ status: "idle" });
  const [artistRoster, setArtistRoster] = useState<AsyncState<ArtistRosterDirectory>>({ status: "loading" });
  const [artistRosterForm, setArtistRosterForm] = useState<ArtistRosterForm>(emptyArtistRosterForm);
  const [artistRosterSave, setArtistRosterSave] = useState<ArtistRosterSaveState>({ status: "idle" });
  const [autoArtistName, setAutoArtistName] = useState("");
  const [autoArtistAdd, setAutoArtistAdd] = useState<AutoArtistAddState>({ status: "idle" });
  const [sourceIds, setSourceIds] = useState<AsyncState<SourceIdDirectory>>({ status: "loading" });
  const [manualSourceForm, setManualSourceForm] = useState<ManualSourceIdForm>(emptyManualSourceIdForm);
  const [manualSourceSave, setManualSourceSave] = useState<ManualSourceIdSaveState>({ status: "idle" });
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetStartingCash, setResetStartingCash] = useState("100000");
  const [prelaunchReset, setPrelaunchReset] = useState<AdminActionState>({ status: "idle" });
  const [adminCashValue, setAdminCashValue] = useState("100000");
  const [adminCashAction, setAdminCashAction] = useState<AdminActionState>({ status: "idle" });
  const [userSupport, setUserSupport] = useState<AsyncState<UserSupportDirectory>>({ status: "loading" });
  const [userSupportAction, setUserSupportAction] = useState<AdminActionState>({ status: "idle" });
  const [userSupportReason, setUserSupportReason] = useState("");
  const [userResetCash, setUserResetCash] = useState("100000");
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
    void refreshMarketControls();
    void refreshMarketIntegrity();
    void refreshArtistRoster();
    void refreshSourceIds();
    void refreshUserSupport();
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

  const selectedRosterRecord = useMemo(() => {
    if (artistRoster.status !== "ready" || !artistRosterForm.selectedId) {
      return null;
    }

    return artistRoster.data.records.find((record) => record.id === artistRosterForm.selectedId) ?? null;
  }, [artistRoster, artistRosterForm.selectedId]);

  async function refreshCloudStatus() {
    setCloudStatus({ status: "loading" });

    try {
      const response = await fetch("/api/system/cloud-status", {
        headers: adminHeaders
      });
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

  async function refreshMarketControls() {
    setMarketControls({ status: "loading" });

    try {
      const response = await fetch("/api/admin/market-controls", {
        headers: adminHeaders
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Market controls check failed.");
      }

      setMarketControls({
        status: "ready",
        data: {
          controls: payload.controls ?? null,
          activeHalts: payload.activeHalts ?? []
        }
      });
    } catch (error) {
      setMarketControls({
        status: "error",
        message: error instanceof Error ? error.message : "Market controls check failed."
      });
    }
  }

  async function measureModelValidation() {
    setModelValidation({ status: "loading" });

    try {
      const response = await fetch("/api/admin/model-validation", {
        headers: adminHeaders
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Model validation failed.");
      }

      setModelValidation({
        status: "ready",
        data: payload as Extract<ModelValidationState, { status: "ready" }>["data"]
      });
    } catch (error) {
      setModelValidation({
        status: "error",
        message: error instanceof Error ? error.message : "Model validation failed."
      });
    }
  }

  async function updateMarketControls(
    label: string,
    body: {
      tradingMode?: "continuous" | "halted" | "maintenance";
      allowTrading?: boolean;
      allowMarketImpact?: boolean;
      statusNote?: string;
      artistHalts?: Array<{
        artistId: string;
        isHalted?: boolean;
        reason?: string;
        endsAt?: string | null;
      }>;
    }
  ) {
    setMarketControlAction({ status: "saving", label });

    try {
      const response = await fetch("/api/admin/market-controls", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify(body)
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Market control update failed.");
      }

      setMarketControlAction({
        status: "saved",
        message: `${label} saved.`
      });
      await Promise.all([refreshMarketControls(), refreshMarketHealth()]);
    } catch (error) {
      setMarketControlAction({
        status: "error",
        message: error instanceof Error ? error.message : "Market control update failed."
      });
    }
  }

  function haltSelectedArtist() {
    if (!haltArtistId) {
      setMarketControlAction({ status: "error", message: "Select an artist to halt." });
      return;
    }

    void updateMarketControls("Artist halt", {
      artistHalts: [
        {
          artistId: haltArtistId,
          isHalted: true,
          reason: haltReason
        }
      ]
    });
  }

  function unhaltSelectedArtist() {
    if (!haltArtistId) {
      setMarketControlAction({ status: "error", message: "Select an artist to unhalt." });
      return;
    }

    void updateMarketControls("Artist resume", {
      artistHalts: [
        {
          artistId: haltArtistId,
          isHalted: false
        }
      ]
    });
  }

  async function refreshMarketIntegrity() {
    setMarketIntegrity({ status: "loading" });

    try {
      const response = await fetch("/api/admin/market-integrity", {
        headers: adminHeaders
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Market integrity check failed.");
      }

      setMarketIntegrity({
        status: "ready",
        data: payload as MarketIntegrity
      });
    } catch (error) {
      setMarketIntegrity({
        status: "error",
        message: error instanceof Error ? error.message : "Market integrity check failed."
      });
    }
  }

  async function refreshUserSupport() {
    setUserSupport({ status: "loading" });

    try {
      const response = await fetch("/api/admin/user-support", {
        headers: adminHeaders
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "User support directory failed to load.");
      }

      setUserSupport({
        status: "ready",
        data: {
          userCount: Number(payload.userCount ?? 0),
          users: payload.users ?? [],
          recentOrders: payload.recentOrders ?? [],
          recentAdminActions: payload.recentAdminActions ?? []
        }
      });
    } catch (error) {
      setUserSupport({
        status: "error",
        message: error instanceof Error ? error.message : "User support directory failed to load."
      });
    }
  }

  async function runUserSupportAction(
    action: "suspend" | "restore" | "reset_portfolio" | "delete_unconfirmed" | "delete_account",
    user: UserSupportDirectory["users"][number]
  ) {
    const actionLabel = action === "reset_portfolio"
      ? `Reset ${user.username}'s portfolio`
      : action === "delete_account"
        ? `Permanently delete ${user.email ?? user.username}`
        : action === "delete_unconfirmed"
          ? `Permanently remove ${user.email ?? user.username}`
          : `${action === "suspend" ? "Suspend" : "Restore"} ${user.username}`;

    let confirmationEmail: string | undefined;

    if (action === "delete_account") {
      confirmationEmail = window.prompt(
        `This permanently deletes the suspended account and its owned data. Type ${user.email ?? "the account email"} to continue.`
      )?.trim();

      if (!user.email || confirmationEmail?.toLowerCase() !== user.email.toLowerCase()) {
        return;
      }
    }

    if (
      (action === "suspend" || action === "reset_portfolio" || action === "delete_unconfirmed") &&
      !window.confirm(
        action === "delete_unconfirmed"
          ? `${actionLabel}? This is only for abandoned accounts that never confirmed or signed in. This cannot be undone.`
          : `${actionLabel}? This action will be recorded in the operator audit log.`
      )
    ) {
      return;
    }

    setUserSupportAction({ status: "loading", label: actionLabel });

    try {
      const response = await fetch("/api/admin/user-support", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          action,
          userId: user.id,
          reason: userSupportReason,
          startingCash: Number(userResetCash),
          confirmationEmail
        })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `${actionLabel} failed.`);
      }

      setUserSupportAction({ status: "success", message: `${actionLabel} completed.` });
      await Promise.all([refreshUserSupport(), refreshMarketIntegrity()]);
    } catch (error) {
      setUserSupportAction({
        status: "error",
        message: error instanceof Error ? error.message : `${actionLabel} failed.`
      });
    }
  }

  async function refreshArtistRoster() {
    setArtistRoster({ status: "loading" });

    try {
      const response = await fetch("/api/admin/artist-roster", {
        headers: adminHeaders
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Artist roster load failed.");
      }

      setArtistRoster({
        status: "ready",
        data: {
          artistCount: payload.artistCount ?? 0,
          activeCount: payload.activeCount ?? 0,
          inactiveCount: payload.inactiveCount ?? 0,
          records: payload.records ?? []
        }
      });
    } catch (error) {
      setArtistRoster({
        status: "error",
        message: error instanceof Error ? error.message : "Artist roster load failed."
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

  async function runCoreUpdateNow() {
    setRunNow({ status: "loading", completedBatchCount: 0, processedArtistCount: 0 });

    try {
      const response = await fetch("/api/admin/market-run-now", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          force: false,
          artistLimit: 100,
          artistOffset: 0,
          maxBatches: 10
        })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Market run failed.");
      }

      if (payload.skipped) {
        setRunNow({
          status: "skipped",
          runDate: payload.runDate ?? "today",
          reason: payload.reason ?? "Today's market session is already complete."
        });
        await refreshMarketHealth();
        return;
      }

      const latestResult = payload.result ?? {};
      const summary = latestResult.summary ?? null;

      setRunNow({
        status: "success",
        runDate: payload.runDate ?? null,
        source: payload.source ?? null,
        persisted: Boolean(payload.persisted),
        forced: Boolean(payload.forced),
        completedBatchCount: latestResult.completedBatchCount ?? 0,
        processedArtistCount: latestResult.processedArtistCount ?? 0,
        observationCount: latestResult.observationCount ?? 0,
        eventCount: latestResult.eventCount ?? 0,
        detectedEventCount: latestResult.detectedEventCount ?? 0,
        hasMore: Boolean(latestResult.hasMore),
        nextOffset: typeof latestResult.nextOffset === "number" ? latestResult.nextOffset : null,
        summary,
        warnings: latestResult.warnings ?? [],
        eventScanStatus: "Use event scan card"
      });

      await refreshMarketHealth();
      await refreshMarketControls();
      await refreshMarketIntegrity();
    } catch (error) {
      setRunNow({
        status: "error",
        message: error instanceof Error ? error.message : "Market run failed."
      });
    }
  }

  async function resetPrelaunchMarket() {
    setPrelaunchReset({ status: "loading", label: "Resetting prelaunch market" });

    try {
      const startingCash = Number(resetStartingCash);
      const response = await fetch("/api/admin/prelaunch-reset", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          confirm: resetConfirm,
          startingCash,
          resetWatchlists: false,
          clearHalts: true
        })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Prelaunch reset failed.");
      }

      setPrelaunchReset({
        status: "success",
        message: `Reset ${payload.resetArtistCount ?? 0} artists and ${payload.resetProfileCount ?? 0} profile(s). Run market now to seed fresh charts.`
      });
      setResetConfirm("");
      await Promise.all([
        refreshMarketHealth(),
        refreshMarketControls(),
        refreshMarketIntegrity(),
        refreshArtistRoster(),
        refreshSourceIds()
      ]);
    } catch (error) {
      setPrelaunchReset({
        status: "error",
        message: error instanceof Error ? error.message : "Prelaunch reset failed."
      });
    }
  }

  async function setMyAdminCash() {
    setAdminCashAction({ status: "loading", label: "Setting cash" });

    try {
      const cashBalance = Number(adminCashValue);
      const response = await fetch("/api/admin/profile-cash", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          target: "self",
          cashBalance
        })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Cash update failed.");
      }

      setAdminCashAction({
        status: "success",
        message: `Cash set to ${formatCurrency(payload.profile?.cashBalance ?? cashBalance)}.`
      });
      await refreshMarketIntegrity();
    } catch (error) {
      setAdminCashAction({
        status: "error",
        message: error instanceof Error ? error.message : "Cash update failed."
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
        gdeltEventCount: payload.gdeltEventCount ?? 0,
        mediaRssEventCount: payload.mediaRssEventCount ?? 0,
        aiResearchEventCount: payload.aiResearchEventCount ?? 0,
        aiResearchEnabled: Boolean(payload.aiResearchEnabled),
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

  function selectRosterArtist(artistId: string) {
    const record =
      artistRoster.status === "ready" ? artistRoster.data.records.find((item) => item.id === artistId) : undefined;

    setArtistRosterForm(record ? buildArtistRosterForm(record) : { ...emptyArtistRosterForm, selectedId: artistId });
    setArtistRosterSave({ status: "idle" });
  }

  function startNewRosterArtist() {
    setArtistRosterForm(emptyArtistRosterForm);
    setArtistRosterSave({ status: "idle" });
  }

  async function previewArtistByName() {
    const name = autoArtistName.trim();

    if (!name) {
      setAutoArtistAdd({
        status: "error",
        message: "Enter an artist name first."
      });
      return;
    }

    setAutoArtistAdd({ status: "previewing" });

    try {
      const response = await fetch("/api/admin/artist-autofill", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          name,
          dryRun: true
        })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Artist autofill failed.");
      }

      const record = payload.record as ArtistRosterRecord | undefined;
      const sourceIds = payload.sourceIds as ArtistSourceIdRecord["externalIds"] | null | undefined;

      if (record) {
        setArtistRosterForm(buildArtistRosterForm(record));
        setManualSourceForm({
          ...emptyManualSourceIdForm,
          artistId: record.id,
          spotifyId: sourceIds?.spotifyId ?? "",
          youtubeChannelId: sourceIds?.youtubeChannelId ?? "",
          musicbrainzId: sourceIds?.musicbrainzId ?? "",
          lastfmName: sourceIds?.lastfmName ?? "",
          gdeltQuery: sourceIds?.gdeltQuery ?? "",
          wikipediaArticleTitle: sourceIds?.wikipediaArticleTitle ?? ""
        });
      }

      if (!record) {
        throw new Error("Artist autofill returned no preview record.");
      }

      setAutoArtistAdd({
        status: "preview",
        preview: {
          record,
          sourceIds: sourceIds ?? null,
          suggestions: payload.resolver?.suggestions ?? [],
          warnings: payload.resolver?.warnings ?? [],
          starter: {
            source: payload.starter?.source ?? "default",
            price: typeof payload.starter?.price === "number" ? payload.starter.price : record.currentPrice,
            category: payload.starter?.category ?? record.category,
            volatility: typeof payload.starter?.volatility === "number" ? payload.starter.volatility : record.volatility
          }
        }
      });
    } catch (error) {
      setAutoArtistAdd({
        status: "error",
        message: error instanceof Error ? error.message : "Artist autofill failed."
      });
    }
  }

  async function savePreviewedArtist() {
    if (autoArtistAdd.status !== "preview") {
      return;
    }

    const preview = autoArtistAdd.preview;
    setAutoArtistAdd({ status: "saving", preview });

    try {
      const response = await fetch("/api/admin/artist-autofill", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          name: preview.record.name,
          dryRun: false,
          sourceIds: preview.sourceIds
        })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Artist save failed.");
      }

      const record = payload.record as ArtistRosterRecord | undefined;
      const sourceIds = payload.sourceIds as ArtistSourceIdRecord["externalIds"] | null | undefined;
      const savedSourceLabels = sourceIds
        ? manualSourceIdFields
            .filter((field) => Boolean(sourceIds[field.key]))
            .map((field) => field.label)
        : [];

      if (record) {
        setArtistRosterForm(buildArtistRosterForm(record));
        setManualSourceForm({
          ...emptyManualSourceIdForm,
          artistId: record.id,
          spotifyId: sourceIds?.spotifyId ?? "",
          youtubeChannelId: sourceIds?.youtubeChannelId ?? "",
          musicbrainzId: sourceIds?.musicbrainzId ?? "",
          lastfmName: sourceIds?.lastfmName ?? "",
          gdeltQuery: sourceIds?.gdeltQuery ?? "",
          wikipediaArticleTitle: sourceIds?.wikipediaArticleTitle ?? ""
        });
      }

      setAutoArtistName("");
      setAutoArtistAdd({
        status: "saved",
        message: `Saved ${record?.ticker ?? preview.record.ticker}. ${
          savedSourceLabels.length ? `Source IDs: ${savedSourceLabels.join(", ")}.` : "No high-confidence source IDs were saved."
        }`,
        warnings: payload.resolver?.warnings ?? []
      });
      await refreshArtistRoster();
      await refreshSourceIds();
      await refreshMarketHealth();
    } catch (error) {
      setAutoArtistAdd({
        status: "error",
        message: error instanceof Error ? error.message : "Artist save failed."
      });
    }
  }

  function updateRosterField(field: keyof Omit<ArtistRosterForm, "selectedId">, value: string | boolean) {
    setArtistRosterForm((current) => ({
      ...current,
      [field]: value
    }));
    setArtistRosterSave({ status: "idle" });
  }

  async function saveRosterArtist() {
    setArtistRosterSave({ status: "saving" });

    try {
      const response = await fetch("/api/admin/artist-roster", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          artist: buildArtistRosterPayload(artistRosterForm)
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Artist roster save failed.");
      }

      setArtistRosterSave({
        status: "saved",
        message: `Saved ${payload.record?.ticker ?? (artistRosterForm.ticker || "artist")}.`
      });
      setArtistRosterForm(payload.record ? buildArtistRosterForm(payload.record) : artistRosterForm);
      await refreshArtistRoster();
      await refreshSourceIds();
      await refreshMarketHealth();
    } catch (error) {
      setArtistRosterSave({
        status: "error",
        message: error instanceof Error ? error.message : "Artist roster save failed."
      });
    }
  }

  async function setRosterArtistActive(isActive: boolean) {
    const artistId = selectedRosterRecord?.id ?? artistRosterForm.id;

    if (!artistId) {
      setArtistRosterSave({
        status: "error",
        message: "Choose an artist before changing active status."
      });
      return;
    }

    setArtistRosterSave({ status: "saving" });

    try {
      const response = await fetch("/api/admin/artist-roster", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          artistId,
          isActive
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Artist active status update failed.");
      }

      setArtistRosterSave({
        status: "saved",
        message: `${payload.record?.ticker ?? artistId} is now ${isActive ? "active" : "inactive"}.`
      });
      setArtistRosterForm(payload.record ? buildArtistRosterForm(payload.record) : artistRosterForm);
      await refreshArtistRoster();
      await refreshSourceIds();
      await refreshMarketHealth();
    } catch (error) {
      setArtistRosterSave({
        status: "error",
        message: error instanceof Error ? error.message : "Artist active status update failed."
      });
    }
  }

  async function deleteRosterArtist() {
    const artist = selectedRosterRecord;

    if (!artist) {
      setArtistRosterSave({
        status: "error",
        message: "Choose an artist before deleting."
      });
      return;
    }

    const confirmation = window.prompt(
      `Type ${artist.ticker} to permanently delete ${artist.name} and all related market data.`
    );

    if (confirmation !== artist.ticker) {
      setArtistRosterSave({
        status: "error",
        message: "Permanent delete cancelled."
      });
      return;
    }

    setArtistRosterSave({ status: "saving" });

    try {
      const response = await fetch("/api/admin/artist-roster", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          ...adminHeaders
        },
        body: JSON.stringify({
          artistId: artist.id,
          confirmDelete: confirmation
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Artist delete failed.");
      }

      setArtistRosterSave({
        status: "saved",
        message: `Deleted ${artist.ticker} from the market roster and related market data.`
      });
      setArtistRosterForm(emptyArtistRosterForm);
      setManualSourceForm(emptyManualSourceIdForm);
      await refreshArtistRoster();
      await refreshSourceIds();
      await refreshMarketHealth();
    } catch (error) {
      setArtistRosterSave({
        status: "error",
        message: error instanceof Error ? error.message : "Artist delete failed."
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
            Internal control room for market health, data coverage, integrity alerts, account support, and protected
            operator actions.
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

      <Panel
        title="Trading controls"
        eyebrow="Market operations"
        actionLabel="Refresh"
        onAction={refreshMarketControls}
      >
        {marketControls.status === "loading" ? <LoadingText text="Checking market controls..." /> : null}
        {marketControls.status === "error" ? <ErrorText text={marketControls.message} /> : null}
        {marketControls.status === "ready" ? (
          <MarketControlsPanel
            data={marketControls.data}
            actionState={marketControlAction}
            artistRecords={artistRoster.status === "ready" ? artistRoster.data.records : []}
            selectedArtistId={haltArtistId}
            haltReason={haltReason}
            onSelectArtist={setHaltArtistId}
            onReasonChange={setHaltReason}
            onPauseTrading={() =>
              updateMarketControls("Pause trading", {
                tradingMode: "halted",
                allowTrading: false,
                statusNote: "Trading paused by market operator."
              })
            }
            onResumeTrading={() =>
              updateMarketControls("Resume trading", {
                tradingMode: "continuous",
                allowTrading: true,
                statusNote: "Continuous virtual trading is open."
              })
            }
            onPauseImpact={() =>
              updateMarketControls("Pause market impact", {
                allowMarketImpact: false,
                statusNote: "Trading is open; market impact is paused for review."
              })
            }
            onResumeImpact={() =>
              updateMarketControls("Resume market impact", {
                allowMarketImpact: true,
                statusNote: "Continuous virtual trading is open."
              })
            }
            onHaltArtist={haltSelectedArtist}
            onUnhaltArtist={unhaltSelectedArtist}
          />
        ) : null}
      </Panel>

      <Panel
        title="Market integrity"
        eyebrow="Anti-manipulation"
        actionLabel="Refresh"
        onAction={refreshMarketIntegrity}
      >
        {marketIntegrity.status === "loading" ? <LoadingText text="Checking trade integrity..." /> : null}
        {marketIntegrity.status === "error" ? <ErrorText text={marketIntegrity.message} /> : null}
        {marketIntegrity.status === "ready" ? <MarketIntegrityPanel data={marketIntegrity.data} /> : null}
      </Panel>

      <Panel
        title="Out-of-sample model validation"
        eyebrow="Accuracy evidence"
        actionLabel="Measure"
        onAction={measureModelValidation}
      >
        {modelValidation.status === "idle" ? (
          <p className="text-sm leading-6 text-paper/55">
            Compare each saved signal with subsequent audience-growth acceleration. This does not alter quotes or
            model weights.
          </p>
        ) : null}
        {modelValidation.status === "loading" ? <LoadingText text="Measuring historical outcomes..." /> : null}
        {modelValidation.status === "error" ? <ErrorText text={modelValidation.message} /> : null}
        {modelValidation.status === "ready" ? <ModelValidationPanel data={modelValidation.data} /> : null}
      </Panel>

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-md border border-ember/30 bg-panel/88 p-5 shadow-market">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-ember" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Prelaunch reset</p>
              <h2 className="mt-1 text-2xl font-black">Start the market fresh</h2>
              <p className="mt-2 text-sm leading-6 text-paper/55">
                Clears trades, holdings, shorts, chart history, observations, market events, runs, and halts. This is
                for prelaunch only after you decide the engine is ready.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wide text-paper/45">Type RESET RMI</span>
              <input
                value={resetConfirm}
                onChange={(event) => setResetConfirm(event.target.value)}
                className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold outline-none focus:border-ember"
                placeholder="RESET RMI"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wide text-paper/45">Starting cash</span>
              <input
                value={resetStartingCash}
                onChange={(event) => setResetStartingCash(event.target.value)}
                inputMode="numeric"
                className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold outline-none focus:border-ember"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={resetPrelaunchMarket}
            disabled={prelaunchReset.status === "loading" || resetConfirm !== "RESET RMI"}
            className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ember/45 bg-ember/10 px-4 text-sm font-black text-ember disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Database className="h-4 w-4" />
            Reset prelaunch state
          </button>
          <AdminActionResult state={prelaunchReset} />
        </section>

        <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Admin account</p>
            <h2 className="mt-1 text-2xl font-black">Set my cash balance</h2>
            <p className="mt-2 text-sm leading-6 text-paper/55">
              Updates only your signed-in operator profile and does not alter artist quotes or other accounts.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wide text-paper/45">Cash balance</span>
              <input
                value={adminCashValue}
                onChange={(event) => setAdminCashValue(event.target.value)}
                inputMode="numeric"
                className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold outline-none focus:border-mint"
              />
            </label>
            <button
              type="button"
              onClick={setMyAdminCash}
              disabled={adminCashAction.status === "loading"}
              className="self-end inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-4 text-sm font-black text-mint disabled:cursor-wait disabled:opacity-55"
            >
              <CheckCircle2 className="h-4 w-4" />
              Set cash
            </button>
          </div>
          <AdminActionResult state={adminCashAction} />
        </section>
      </section>

      <Panel
        title="User support"
        eyebrow="Accounts and orders"
        actionLabel="Refresh"
        onAction={refreshUserSupport}
      >
        {userSupport.status === "loading" ? <LoadingText text="Loading account support data..." /> : null}
        {userSupport.status === "error" ? <ErrorText text={userSupport.message} /> : null}
        {userSupport.status === "ready" ? (
          <UserSupportPanel
            data={userSupport.data}
            actionState={userSupportAction}
            reason={userSupportReason}
            resetCash={userResetCash}
            onReasonChange={setUserSupportReason}
            onResetCashChange={setUserResetCash}
            onAction={runUserSupportAction}
          />
        ) : null}
      </Panel>

      <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Market operation</p>
            <h2 className="mt-1 text-2xl font-black">Run market now</h2>
            <p className="mt-2 text-sm leading-6 text-paper/55">
              Writes today's prices, observations, events, and history once. If today's session is already running or
              complete, this safely skips without repeating source calls or quote writes.
            </p>
          </div>
          <button
            type="button"
            onClick={runCoreUpdateNow}
            disabled={runNow.status === "loading"}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-4 text-sm font-black text-mint disabled:cursor-wait disabled:opacity-55"
          >
            <ServerCog className="h-4 w-4" />
            Run today's market
          </button>
        </div>
        <RunNowResult run={runNow} />
      </section>

      <DiagnosticToolsPanel
        preview={preview}
        eventScan={eventScan}
        runCorePreview={runCorePreview}
        runEventScan={runEventScan}
        controlsDisabled={runNow.status === "loading"}
      />

      <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Data quality</p>
            <h2 className="mt-1 text-2xl font-black">Find missing source IDs</h2>
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
            Scan candidates
          </button>
        </div>
        <SourceResolverPreviewResult preview={resolverPreview} onSave={saveSourceResolverProposals} />
      </section>

      <ArtistRosterManager
        state={artistRoster}
        form={artistRosterForm}
        selectedRecord={selectedRosterRecord}
        saveState={artistRosterSave}
        autoName={autoArtistName}
        autoState={autoArtistAdd}
        onRefresh={refreshArtistRoster}
        onNew={startNewRosterArtist}
        onSelectArtist={selectRosterArtist}
        onChange={updateRosterField}
        onSave={saveRosterArtist}
        onSetActive={setRosterArtistActive}
        onDelete={deleteRosterArtist}
        onAutoNameChange={(value) => {
          setAutoArtistName(value);
          setAutoArtistAdd({ status: "idle" });
        }}
        onAutoPreview={previewArtistByName}
        onAutoSave={savePreviewedArtist}
      />

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
          <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Deliberately deferred</p>
          <h2 className="mt-1 text-2xl font-black">Systems not required for initial launch</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plannedPowers.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.title} className="rounded-md border border-line bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3 text-sm font-black">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-brass" />
                    {item.title}
                  </span>
                  <span className="rounded border border-line bg-ink px-2 py-0.5 text-[10px] uppercase tracking-wide text-paper/50">
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-paper/55">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function UserSupportPanel({
  data,
  actionState,
  reason,
  resetCash,
  onReasonChange,
  onResetCashChange,
  onAction
}: {
  data: UserSupportDirectory;
  actionState: AdminActionState;
  reason: string;
  resetCash: string;
  onReasonChange: (value: string) => void;
  onResetCashChange: (value: string) => void;
  onAction: (
    action: "suspend" | "restore" | "reset_portfolio" | "delete_unconfirmed" | "delete_account",
    user: UserSupportDirectory["users"][number]
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = data.users.filter((user) =>
    !normalizedQuery ||
    user.username.toLowerCase().includes(normalizedQuery) ||
    user.email?.toLowerCase().includes(normalizedQuery)
  );
  const actionPending = actionState.status === "loading";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)_180px]">
        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wide text-paper/45">Find account</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold outline-none focus:border-cyan"
            placeholder="Username or email"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wide text-paper/45">Action reason</span>
          <input
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            maxLength={500}
            className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold outline-none focus:border-cyan"
            placeholder="Optional operator note"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wide text-paper/45">Reset starting cash</span>
          <input
            value={resetCash}
            onChange={(event) => onResetCashChange(event.target.value)}
            inputMode="decimal"
            className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold outline-none focus:border-cyan"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-md border border-line">
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3 border-b border-line bg-black/20 px-4 py-3 text-xs font-black uppercase tracking-wide text-paper/45 md:grid-cols-[minmax(220px,1fr)_130px_150px_150px_220px]">
          <span>Account</span>
          <span>Status</span>
          <span className="hidden md:block">Portfolio</span>
          <span className="hidden md:block">Activity</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="max-h-[560px] divide-y divide-line overflow-y-auto scrollbar-thin">
          {filteredUsers.length ? filteredUsers.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-[minmax(0,1fr)_110px] gap-3 px-4 py-4 text-sm md:grid-cols-[minmax(220px,1fr)_130px_150px_150px_220px] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-black">
                  <span className="truncate">{user.username}</span>
                  {user.isAdmin ? (
                    <span className="rounded border border-brass/35 bg-brass/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-brass">Admin</span>
                  ) : null}
                </div>
                <p className="mt-1 break-all font-mono text-[11px] text-paper/50">{user.email ?? "No email"}</p>
                {user.emailDomainWarning ? (
                  <p className="mt-1 text-xs font-black text-brass">{user.emailDomainWarning}</p>
                ) : null}
                <p className="mt-1 text-xs text-paper/35">Joined {formatDate(user.createdAt)}</p>
              </div>
              <div>
                <p className={user.isSuspended ? "font-black text-ember" : "font-black text-mint"}>
                  {user.isSuspended ? "Suspended" : "Active"}
                </p>
                <p className="mt-1 text-xs text-paper/40">{user.emailConfirmedAt ? "Email confirmed" : "Unconfirmed"}</p>
              </div>
              <div className="hidden md:block">
                <p className="font-black number-tabular">{formatCurrency(user.portfolioValue)}</p>
                <p className={user.gainPercent >= 0 ? "mt-1 text-xs font-black text-mint" : "mt-1 text-xs font-black text-ember"}>
                  {formatPercent(user.gainPercent)}
                </p>
              </div>
              <div className="hidden md:block text-xs leading-5 text-paper/50">
                <p>{user.positionCount} positions</p>
                <p>{user.tradeCount} recent orders</p>
                <p>{user.lastSignInAt ? `Seen ${formatDate(user.lastSignInAt)}` : "No sign-in recorded"}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onAction(user.isSuspended ? "restore" : "suspend", user)}
                  disabled={actionPending || user.isAdmin}
                  className={user.isSuspended
                    ? "min-h-9 rounded-md border border-mint/40 px-3 text-xs font-black text-mint disabled:opacity-35"
                    : "min-h-9 rounded-md border border-ember/40 px-3 text-xs font-black text-ember disabled:opacity-35"
                  }
                >
                  {user.isSuspended ? "Restore" : "Suspend"}
                </button>
                <button
                  type="button"
                  onClick={() => onAction("reset_portfolio", user)}
                  disabled={actionPending}
                  className="min-h-9 rounded-md border border-line px-3 text-xs font-black text-paper/65 hover:border-cyan hover:text-paper disabled:opacity-35"
                >
                  Reset portfolio
                </button>
                {user.isSuspended && user.emailConfirmedAt && !user.isAdmin ? (
                  <button
                    type="button"
                    onClick={() => onAction("delete_account", user)}
                    disabled={actionPending}
                    className="min-h-9 rounded-md border border-ember/40 px-3 text-xs font-black text-ember hover:bg-ember/10 disabled:opacity-35"
                  >
                    Delete account
                  </button>
                ) : null}
                {!user.emailConfirmedAt && !user.lastSignInAt && !user.isAdmin ? (
                  <button
                    type="button"
                    onClick={() => onAction("delete_unconfirmed", user)}
                    disabled={actionPending}
                    className="min-h-9 rounded-md border border-ember/40 px-3 text-xs font-black text-ember hover:bg-ember/10 disabled:opacity-35"
                  >
                    Remove unconfirmed
                  </button>
                ) : null}
              </div>
            </div>
          )) : (
            <p className="px-4 py-8 text-center text-sm text-paper/45">No accounts match this search.</p>
          )}
        </div>
      </div>

      <p className="text-xs leading-5 text-paper/45">
        Portfolio reset removes long and short positions and saved orders, then restores the chosen cash balance. It keeps the login, profile, onboarding choices, and watchlist.
      </p>

      <AdminActionResult state={actionState} />

      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-paper/45">Recent order audit</p>
            <p className="mt-1 text-sm text-paper/50">Latest saved long and short orders across all accounts.</p>
          </div>
          <span className="text-xs font-black text-paper/45">{data.userCount} accounts</span>
        </div>
        <div className="mt-3 overflow-x-auto rounded-md border border-line scrollbar-thin">
          <table className="min-w-[760px] w-full border-collapse text-left text-xs">
            <thead className="bg-black/20 uppercase tracking-wide text-paper/45">
              <tr>
                <th className="px-3 py-2.5">Trader</th>
                <th className="px-3 py-2.5">Artist</th>
                <th className="px-3 py-2.5">Order</th>
                <th className="px-3 py-2.5">Execution</th>
                <th className="px-3 py-2.5">Commission</th>
                <th className="px-3 py-2.5">Demand signal</th>
                <th className="px-3 py-2.5">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.recentOrders.length ? data.recentOrders.map((order) => (
                <tr key={order.id}>
                  <td className="px-3 py-2.5 font-black">{order.username}</td>
                  <td className="px-3 py-2.5"><span className="font-black">{order.ticker}</span> <span className="text-paper/40">{order.artistName}</span></td>
                  <td className="px-3 py-2.5 uppercase">{order.type} {order.shares}</td>
                  <td className="px-3 py-2.5 number-tabular">{formatCurrency(order.price)}</td>
                  <td className="px-3 py-2.5 number-tabular">{formatCurrency(order.commission)}</td>
                  <td className={order.marketEligible ? "px-3 py-2.5 font-black text-mint" : "px-3 py-2.5 font-black text-paper/40"}>
                    {order.marketEligible ? "Included" : "Excluded"}
                  </td>
                  <td className="px-3 py-2.5 text-paper/45">{formatOperatorTime(order.createdAt)}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-paper/45">No orders recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data.recentAdminActions.length ? (
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-paper/45">Operator audit trail</p>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line">
            {data.recentAdminActions.slice(0, 12).map((entry) => (
              <div key={entry.id} className="grid gap-1 px-4 py-3 text-xs sm:grid-cols-[180px_minmax(0,1fr)_150px] sm:items-center">
                <span className="font-black">{formatAdminAction(entry.action)}</span>
                <span className="min-w-0 text-paper/50">
                  {entry.actorUsername}{entry.targetUsername ? ` -> ${entry.targetUsername}` : ""}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </span>
                <span className="text-paper/38 sm:text-right">{formatOperatorTime(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatAdminAction(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  const aiResearchCoverage = getObservationFreshness(data, "ai_research", "event_count");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ReadinessTile
          label="Price history"
          ready={data.priceHistoryHealth.freshCoveragePercent >= 80}
          readyText={`${formatPercent(data.priceHistoryHealth.freshCoveragePercent)} fresh`}
          pendingText={`${formatPercent(data.priceHistoryHealth.freshCoveragePercent)} fresh`}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <ReadinessTile
          label="Quote ticks"
          ready={data.priceTickHealth.freshCoveragePercent >= 80}
          readyText={`${formatPercent(data.priceTickHealth.freshCoveragePercent)} fresh`}
          pendingText={`${data.priceTickHealth.tickCount} ticks`}
          icon={<RefreshCcw className="h-4 w-4" />}
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
        <ReadinessTile
          label="AI research"
          ready={data.config.aiResearchConfigured === true && aiResearchCoverage > 0}
          readyText={`${formatPercent(aiResearchCoverage)} fresh`}
          pendingText={data.config.aiResearchConfigured ? "No events" : "No key"}
          icon={<ServerCog className="h-4 w-4" />}
        />
        <ReadinessTile
          label="Shorting"
          ready={data.shortingFoundation.ready}
          readyText="Ready"
          pendingText="Run 018"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      <LaunchReadinessPanel data={data} />

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
        value: formatCoveragePercent(item.coveragePercent),
        detail: `${item.configuredCount} of ${data.activeArtistCount} artists mapped`
      }))} />

      <CoverageGrid title="Observation freshness" items={data.observationHealth.map((item) => ({
        key: item.key,
        label: item.label,
        value: formatCoveragePercent(item.freshCoveragePercent),
        detail: item.latestDate
          ? `${item.freshArtistCount} of ${data.activeArtistCount} artists fresh · Latest ${formatDate(item.latestDate)}`
          : "No observations"
      }))} />

      <CoverageGrid title="Quote tick health" items={[
        {
          key: "quote-ticks:fresh",
          label: "Fresh tick coverage",
          value: formatPercent(data.priceTickHealth.freshCoveragePercent),
          detail: data.priceTickHealth.latestAt ? `Latest ${formatDate(data.priceTickHealth.latestAt)}` : "No ticks"
        },
        {
          key: "quote-ticks:total",
          label: "Total ticks",
          value: String(data.priceTickHealth.tickCount),
          detail: `${data.priceTickHealth.observedArtistCount} artists observed`
        },
        {
          key: "quote-ticks:market",
          label: "Market-run ticks",
          value: String(data.priceTickHealth.marketRunTickCount),
          detail: "Written by market engine runs"
        },
        {
          key: "quote-ticks:trade",
          label: "Trade ticks",
          value: String(data.priceTickHealth.tradeTickCount),
          detail: "Written by buy/sell impact"
        },
        {
          key: "quote-ticks:seed",
          label: "Seed ticks",
          value: String(data.priceTickHealth.migrationTickCount + data.priceTickHealth.manualTickCount),
          detail: "Initial/manual quote records"
        }
      ]} />

      <CoverageGrid title="Shorting foundation" items={[
        {
          key: "shorting:status",
          label: "Storage and RPC base",
          value: data.shortingFoundation.ready ? "Ready" : "Missing",
          detail: data.shortingFoundation.error ?? "Short/cover tables and views are reachable"
        },
        {
          key: "shorting:positions",
          label: "Open short positions",
          value: String(data.shortingFoundation.openPositionCount),
          detail: `${data.shortingFoundation.riskRowCount} risk rows`
        },
        {
          key: "shorting:transactions",
          label: "Short/cover trades",
          value: String(data.shortingFoundation.transactionCount),
          detail: "Historical short-side order flow"
        }
      ]} />

      {data.latestRun?.summary ? (
        <CoverageGrid title="Latest run movement" items={[
          {
            key: "latest-run:up-down",
            label: "Up / down / flat",
            value: `${data.latestRun.summary.upMoveCount ?? 0}/${data.latestRun.summary.downMoveCount ?? 0}/${data.latestRun.summary.flatMoveCount ?? 0}`,
            detail: `${data.latestRun.summary.artistCount ?? 0} artists in latest summary`
          },
          {
            key: "latest-run:avg-move",
            label: "Average move",
            value: formatPercent(data.latestRun.summary.averageMovePercent ?? 0),
            detail: `${formatPercent(data.latestRun.summary.averageAbsMovePercent ?? 0)} average absolute move`
          },
          {
            key: "latest-run:momentum",
            label: "Momentum artists",
            value: String(data.latestRun.summary.momentumArtistCount ?? 0),
            detail: "Artists with confirmed fresh signal"
          },
          {
            key: "latest-run:reliability",
            label: "Reliability bands",
            value: `${data.latestRun.summary.highReliabilityCount ?? 0}/${data.latestRun.summary.mediumReliabilityCount ?? 0}/${data.latestRun.summary.lowReliabilityCount ?? 0}`,
            detail: "High / medium / low"
          },
          {
            key: "latest-run:quality",
            label: "Market quality",
            value: `${Math.round(data.latestRun.summary.marketQualityScore ?? 0)}/100`,
            detail: `Signal ${Math.round(data.latestRun.summary.signalCoverageScore ?? 0)}/100, reliability ${Math.round(data.latestRun.summary.reliabilityScore ?? 0)}/100, balance ${Math.round(data.latestRun.summary.movementBalanceScore ?? 0)}/100`
          },
          {
            key: "latest-run:source-quality",
            label: "Source quality",
            value: `${Math.round((data.latestRun.summary.averageSourceQualityMultiplier ?? 1) * 100)}/100`,
            detail: `${data.latestRun.summary.sourceQualityAnomalyCount ?? 0} anomalies, ${data.latestRun.summary.sourceQualityStaleCount ?? 0} stale inputs`
          },
          {
            key: "latest-run:technicals",
            label: "Price action guardrails",
            value: String(data.latestRun.summary.technicalAdjustmentCount ?? 0),
            detail: `${formatPercent((data.latestRun.summary.averageTechnicalAdjustment ?? 0) * 100)} average signal adjustment`
          }
        ]} />
      ) : null}

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

function ModelValidationPanel({
  data
}: {
  data: Extract<ModelValidationState, { status: "ready" }>["data"];
}) {
  const validation = data.validation;
  const statusClassName =
    validation.status === "measured"
      ? "text-mint"
      : validation.status === "provisional"
        ? "text-brass"
        : "text-paper/55";

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line bg-black/20 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-paper/45">Validation status</p>
            <p className={`mt-1 text-xl font-black capitalize ${statusClassName}`}>{validation.status}</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-paper/58">{validation.note}</p>
          </div>
          <div className="rounded border border-line bg-panel/70 px-3 py-2 text-right">
            <p className="text-[10px] font-black uppercase tracking-wide text-paper/42">Measured through</p>
            <p className="mt-1 text-sm font-black number-tabular">{formatDate(data.runDate)}</p>
          </div>
        </div>
      </div>

      <CoverageGrid title="Forward outcome scorecard" items={[
        {
          key: "validation:samples",
          label: "Usable samples",
          value: String(validation.sampleCount),
          detail: `${validation.minimumRecommendedSamples} recommended before a measured claim`
        },
        {
          key: "validation:dates",
          label: "Signal dates",
          value: String(validation.distinctSignalDateCount),
          detail: `${validation.minimumRecommendedDates} recommended; ${validation.distinctArtistCount} artists represented`
        },
        {
          key: "validation:correlation",
          label: "Rank correlation",
          value: validation.rankCorrelation === null ? "--" : validation.rankCorrelation.toFixed(3),
          detail: "Whether stronger signals rank ahead of later audience acceleration"
        },
        {
          key: "validation:direction",
          label: "Directional accuracy",
          value:
            validation.directionalAccuracyPercent === null
              ? "--"
              : formatPercent(validation.directionalAccuracyPercent),
          detail: `${validation.directionalSampleCount} non-trivial up/down predictions`
        },
        {
          key: "validation:lift",
          label: "Top / bottom lift",
          value:
            validation.topBottomAudienceLift === null
              ? "--"
              : `${validation.topBottomAudienceLift > 0 ? "+" : ""}${validation.topBottomAudienceLift.toFixed(3)}`,
          detail: "Later audience acceleration for top-ranked signals minus bottom-ranked signals"
        },
        {
          key: "validation:coverage",
          label: "Outcome depth",
          value: validation.averageMetricsPerSample.toFixed(2),
          detail: `${data.snapshotRowCount} signal rows and ${data.observationRowCount} audience observations scanned`
        }
      ]} />
    </div>
  );
}

type LaunchReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
  severity: "blocker" | "warning";
};

function LaunchReadinessPanel({ data }: { data: MarketHealth }) {
  const checks = buildLaunchReadinessChecks(data);
  const blockers = checks.filter((check) => !check.ok && check.severity === "blocker");
  const warnings = checks.filter((check) => !check.ok && check.severity === "warning");
  const score = Math.round((checks.filter((check) => check.ok).length / Math.max(1, checks.length)) * 100);
  const statusText = blockers.length ? "Not public-ready" : warnings.length ? "Ready for private review" : "Public-ready";
  const statusClassName = blockers.length ? "text-ember" : warnings.length ? "text-brass" : "text-mint";

  return (
    <div className="rounded-md border border-line bg-black/20 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-paper/45">Launch gate</p>
          <h3 className={`mt-1 text-xl font-black ${statusClassName}`}>{statusText}</h3>
          <p className="mt-1 text-sm font-bold leading-6 text-paper/50">
            {blockers.length
              ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"} before public launch.`
              : warnings.length
                ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} to review before launch.`
                : "Core market, integrity, source coverage, and event systems meet the current launch gate."}
          </p>
        </div>
        <div className="rounded border border-line bg-panel/70 px-3 py-2 text-right">
          <p className="text-[10px] font-black uppercase tracking-wide text-paper/42">Readiness</p>
          <p className={`mt-1 text-2xl font-black number-tabular ${statusClassName}`}>{score}/100</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        {checks.map((check) => (
          <div key={check.id} className="flex gap-3 rounded border border-line bg-panel/55 p-3">
            {check.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
            ) : check.severity === "blocker" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brass" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-black">{check.label}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-paper/48">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildLaunchReadinessChecks(data: MarketHealth): LaunchReadinessCheck[] {
  const latestRunSucceeded = data.latestRun?.status === "succeeded";
  const audienceCoverage = getCoveragePercent(data, "lastfmName");
  const newsCoverage = getCoveragePercent(data, "gdeltQuery");
  const youtubeCoverage = getCoveragePercent(data, "youtubeChannelId");
  const musicbrainzCoverage = getCoveragePercent(data, "musicbrainzId");
  const redditCoverage = getObservationFreshness(data, "reddit", "post_count");
  const aiResearchCoverage = getObservationFreshness(data, "ai_research", "event_count");
  const aiHighConfidenceCoverage = getObservationFreshness(data, "ai_research", "high_confidence_event_count");
  const mediaEventCoverage = getObservationFreshness(data, "media_rss", "classified_event_count");
  const socialCoverage = Math.max(
    redditCoverage,
    getObservationFreshness(data, "bluesky", "post_count"),
    aiResearchCoverage
  );
  const marketQualityScore = data.latestRun?.summary?.marketQualityScore ?? 0;
  const downMoveCount = data.latestRun?.summary?.downMoveCount ?? 0;
  const latestArtistCount = data.latestRun?.summary?.artistCount ?? 0;

  return [
    {
      id: "model-current",
      label: "Latest market run uses current model",
      ok: latestRunSucceeded && data.latestModelVersion === data.configuredModelVersion,
      severity: "blocker",
      detail: latestRunSucceeded
        ? `Latest run ${data.latestModelVersion ?? "unknown"}; configured ${data.configuredModelVersion}.`
        : "Run the market once successfully after code or model changes."
    },
    {
      id: "history",
      label: "Charts have fresh history",
      ok: data.priceHistoryHealth.freshCoveragePercent >= 90,
      severity: "blocker",
      detail: `${formatPercent(data.priceHistoryHealth.freshCoveragePercent)} of active artists have fresh daily price history.`
    },
    {
      id: "quotes",
      label: "Intraday quote ticks are recording",
      ok: data.priceTickHealth.tickCount > 0 && data.priceTickHealth.freshCoveragePercent >= 80,
      severity: "warning",
      detail: `${data.priceTickHealth.tickCount} ticks; ${formatPercent(data.priceTickHealth.freshCoveragePercent)} fresh coverage.`
    },
    {
      id: "source-ids",
      label: "Core source IDs are covered",
      ok: audienceCoverage >= 95 && newsCoverage >= 95 && youtubeCoverage >= 90 && musicbrainzCoverage >= 90,
      severity: "blocker",
      detail: `Audience ${formatPercent(audienceCoverage)}, news ${formatPercent(newsCoverage)}, YouTube ${formatPercent(youtubeCoverage)}, releases ${formatPercent(musicbrainzCoverage)}.`
    },
    {
      id: "events",
      label: "Event/news layer is producing catalysts",
      ok: data.eventHealth.eventCount > 0 && Object.keys(data.eventHealth.typeCounts).length >= 2,
      severity: "blocker",
      detail: `${data.eventHealth.eventCount} recent events across ${Object.keys(data.eventHealth.typeCounts).length} event types.`
    },
    {
      id: "community",
      label: "Underground event discovery is connected",
      ok: redditCoverage > 0 || aiResearchCoverage > 0,
      severity: "blocker",
      detail:
        redditCoverage > 0 || aiResearchCoverage > 0
          ? `Reddit ${formatPercent(redditCoverage)}, AI source-backed ${formatPercent(aiResearchCoverage)}.`
          : "Connect Reddit or the AI research provider before launching underground-heavy coverage."
    },
    {
      id: "ai-research",
      label: "AI source-backed research is producing usable catalysts",
      ok: data.config.aiResearchConfigured === true && (aiResearchCoverage > 0 || aiHighConfidenceCoverage > 0),
      severity: "blocker",
      detail: data.config.aiResearchConfigured
        ? `AI event coverage ${formatPercent(aiResearchCoverage)}, high-confidence ${formatPercent(aiHighConfidenceCoverage)}.`
        : "The AI research provider is not configured, so that research layer is disabled."
    },
    {
      id: "social",
      label: "External discovery signal is active",
      ok: socialCoverage > 0 || mediaEventCoverage > 0,
      severity: "warning",
      detail: `Fresh public social/community/AI coverage is ${formatPercent(socialCoverage)}; media event coverage is ${formatPercent(mediaEventCoverage)}.`
    },
    {
      id: "market-quality",
      label: "Latest run quality is defensible",
      ok: marketQualityScore >= 55,
      severity: "warning",
      detail: `Latest market quality score is ${Math.round(marketQualityScore)}/100.`
    },
    {
      id: "movement-balance",
      label: "Price moves include decliners",
      ok: latestArtistCount < 10 || downMoveCount > 0,
      severity: "warning",
      detail: latestArtistCount
        ? `${downMoveCount} decliner${downMoveCount === 1 ? "" : "s"} in the latest ${latestArtistCount}-artist run.`
        : "No latest run summary yet."
    },
    {
      id: "integrity",
      label: "Anti-manipulation guardrails are installed",
      ok: data.integrityGuardrails.ready,
      severity: "blocker",
      detail: data.integrityGuardrails.error ?? "Integrity tables and checks are reachable."
    },
    {
      id: "operations",
      label: "Trading controls are ready",
      ok: data.marketOperations.ready && data.marketOperations.marketOpen && data.marketOperations.marketImpactEnabled,
      severity: "blocker",
      detail: data.marketOperations.ready
        ? `${data.marketOperations.tradingMode ?? "unknown"} trading; market impact ${data.marketOperations.marketImpactEnabled ? "enabled" : "paused"}.`
        : data.marketOperations.error ?? "Market operation controls are missing."
    },
    {
      id: "shorting",
      label: "Shorting base is installed",
      ok: data.shortingFoundation.ready,
      severity: "warning",
      detail: data.shortingFoundation.error ?? "Short/cover storage exists; UI can stay disabled until you are ready."
    }
  ];
}

function getCoveragePercent(data: MarketHealth, key: string) {
  return data.sourceCoverage.find((item) => item.key === key)?.coveragePercent ?? 0;
}

function getObservationFreshness(data: MarketHealth, source: string, metric: string) {
  return data.observationHealth.find((item) => item.source === source && item.metric === metric)?.freshCoveragePercent ?? 0;
}

function MarketControlsPanel({
  data,
  actionState,
  artistRecords,
  selectedArtistId,
  haltReason,
  onSelectArtist,
  onReasonChange,
  onPauseTrading,
  onResumeTrading,
  onPauseImpact,
  onResumeImpact,
  onHaltArtist,
  onUnhaltArtist
}: {
  data: MarketControls;
  actionState: MarketControlActionState;
  artistRecords: ArtistRosterRecord[];
  selectedArtistId: string;
  haltReason: string;
  onSelectArtist: (artistId: string) => void;
  onReasonChange: (reason: string) => void;
  onPauseTrading: () => void;
  onResumeTrading: () => void;
  onPauseImpact: () => void;
  onResumeImpact: () => void;
  onHaltArtist: () => void;
  onUnhaltArtist: () => void;
}) {
  const controls = data.controls;
  const tradingOpen = controls?.allow_trading === true && controls.trading_mode === "continuous";
  const impactEnabled = controls?.allow_market_impact !== false;
  const selectedArtist = artistRecords.find((artist) => artist.id === selectedArtistId) ?? null;
  const selectedHalt = data.activeHalts.find((halt) => halt.artist_id === selectedArtistId) ?? null;
  const actionBusy = actionState.status === "saving";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReadinessTile
          label="Trading"
          ready={tradingOpen}
          readyText="Open"
          pendingText={controls?.trading_mode ?? "Unknown"}
          icon={<ServerCog className="h-4 w-4" />}
        />
        <ReadinessTile
          label="Market impact"
          ready={impactEnabled}
          readyText="Enabled"
          pendingText="Paused"
          icon={<SlidersHorizontal className="h-4 w-4" />}
        />
        <ReadinessTile
          label="Artist halts"
          ready={data.activeHalts.length === 0}
          readyText="None"
          pendingText={`${data.activeHalts.length} active`}
          icon={<FileWarning className="h-4 w-4" />}
        />
        <ReadinessTile
          label="Daily reset"
          ready={Boolean(controls?.day_change_reset)}
          readyText={controls?.day_change_reset ?? "12:01 AM PT"}
          pendingText="Unknown"
          icon={<RefreshCcw className="h-4 w-4" />}
        />
      </div>

      <div className="rounded-md border border-line bg-black/20 p-3">
        <p className="text-sm font-black">Status note</p>
        <p className="mt-1 text-sm leading-6 text-paper/58">
          {controls?.status_note ?? "Market controls are not loaded."}
        </p>
        {controls?.updated_at ? (
          <p className="mt-1 text-xs font-bold text-paper/42">Updated {formatDate(controls.updated_at)}</p>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-black/20 p-4">
          <h3 className="text-sm font-black uppercase tracking-wide text-paper/45">Global controls</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onPauseTrading}
              disabled={actionBusy || !tradingOpen}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ember/45 bg-ember/10 px-3 text-sm font-black text-ember disabled:cursor-not-allowed disabled:opacity-45"
            >
              <XCircle className="h-4 w-4" />
              Pause trading
            </button>
            <button
              type="button"
              onClick={onResumeTrading}
              disabled={actionBusy || tradingOpen}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-3 text-sm font-black text-mint disabled:cursor-not-allowed disabled:opacity-45"
            >
              <CheckCircle2 className="h-4 w-4" />
              Open trading
            </button>
            <button
              type="button"
              onClick={onPauseImpact}
              disabled={actionBusy || !impactEnabled}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-brass/45 bg-brass/10 px-3 text-sm font-black text-brass disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ShieldCheck className="h-4 w-4" />
              Pause impact
            </button>
            <button
              type="button"
              onClick={onResumeImpact}
              disabled={actionBusy || impactEnabled}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-3 text-sm font-black text-cyan disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCcw className="h-4 w-4" />
              Resume impact
            </button>
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-paper/45">
            Pausing impact keeps trading open but prevents eligible orders from moving public prices.
          </p>
        </div>

        <div className="rounded-md border border-line bg-black/20 p-4">
          <h3 className="text-sm font-black uppercase tracking-wide text-paper/45">Artist halt</h3>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-2 text-sm font-bold text-paper/62">
              Artist
              <select
                value={selectedArtistId}
                onChange={(event) => onSelectArtist(event.target.value)}
                className="min-h-11 rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none"
              >
                <option value="">Select artist</option>
                {artistRecords
                  .filter((artist) => artist.isActive)
                  .map((artist) => (
                    <option key={artist.id} value={artist.id}>
                      {artist.ticker} - {artist.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-paper/62">
              Reason
              <input
                value={haltReason}
                onChange={(event) => onReasonChange(event.target.value)}
                className="min-h-11 rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onHaltArtist}
                disabled={actionBusy || !selectedArtistId || Boolean(selectedHalt)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ember/45 bg-ember/10 px-3 text-sm font-black text-ember disabled:cursor-not-allowed disabled:opacity-45"
              >
                <XCircle className="h-4 w-4" />
                Halt artist
              </button>
              <button
                type="button"
                onClick={onUnhaltArtist}
                disabled={actionBusy || !selectedArtistId || !selectedHalt}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-3 text-sm font-black text-mint disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CheckCircle2 className="h-4 w-4" />
                Unhalt artist
              </button>
            </div>
            <p className="text-xs font-bold leading-5 text-paper/45">
              {selectedHalt
                ? `${selectedArtist?.ticker ?? selectedHalt.artist_id} is halted: ${selectedHalt.reason}`
                : selectedArtist
                  ? `${selectedArtist.ticker} is currently open.`
                  : "Select one active artist to manage a halt."}
            </p>
          </div>
        </div>
      </div>

      {data.activeHalts.length ? (
        <CoverageGrid
          title="Active artist halts"
          items={data.activeHalts.map((halt) => {
            const artist = artistRecords.find((record) => record.id === halt.artist_id);

            return {
              key: halt.artist_id,
              label: artist ? `${artist.ticker} - ${artist.name}` : halt.artist_id,
              value: "Halted",
              detail: halt.reason
            };
          })}
        />
      ) : null}

      {actionState.status === "saving" ? <LoadingText text={`${actionState.label}...`} /> : null}
      {actionState.status === "saved" ? (
        <p className="rounded-md border border-mint/25 bg-mint/10 p-3 text-sm font-bold text-mint">
          {actionState.message}
        </p>
      ) : null}
      {actionState.status === "error" ? <ErrorText text={actionState.message} /> : null}
    </div>
  );
}

function MarketIntegrityPanel({ data }: { data: MarketIntegrity }) {
  const hasTrades = data.summary.tradeCount > 0;

  return (
    <div className="space-y-4">
      <CoverageGrid title={`Trade audit, last ${data.lookbackHours}h`} items={[
        {
          key: "integrity:all-trades",
          label: "All trades",
          value: String(data.summary.tradeCount),
          detail: `${data.summary.uniqueTraderCount} total traders`
        },
        {
          key: "integrity:eligible-trades",
          label: "Market-eligible trades",
          value: String(data.summary.marketEligibleTradeCount),
          detail: `${data.summary.marketEligibleUniqueTraderCount} real-demand traders`
        },
        {
          key: "integrity:excluded-trades",
          label: "Excluded orders",
          value: String(data.summary.excludedTradeCount),
          detail: `${formatCurrency(data.summary.excludedGrossOrderValue)} ignored by trade-flow`
        },
        {
          key: "integrity:eligible-value",
          label: "Eligible order value",
          value: formatCurrency(data.summary.marketEligibleGrossOrderValue),
          detail: `${formatCurrency(data.summary.bullishGrossOrderValue)} bullish, ${formatCurrency(data.summary.bearishGrossOrderValue)} bearish`
        },
        {
          key: "integrity:short-flow",
          label: "Short-side flow",
          value: formatCurrency(data.summary.shortGrossOrderValue + data.summary.coverGrossOrderValue),
          detail: `${formatCurrency(data.summary.shortGrossOrderValue)} shorts, ${formatCurrency(data.summary.coverGrossOrderValue)} covers`
        },
        {
          key: "integrity:commission",
          label: "Commissions",
          value: formatCurrency(data.summary.commissionTotal),
          detail: "Collected across recent trades"
        },
        {
          key: "integrity:generated",
          label: "Checked",
          value: formatDate(data.generatedAt),
          detail: hasTrades ? `Since ${formatDate(data.since)}` : "No recent trades"
        }
      ]} />

      {data.warnings.length ? (
        <div className="rounded-md border border-brass/35 bg-brass/10 p-3">
          <div className="flex items-center gap-2 text-sm font-black text-brass">
            <AlertTriangle className="h-4 w-4" />
            Integrity warnings
          </div>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-paper/62">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <IntegrityList
          title="Concentrated order flow"
          emptyText={hasTrades ? "No concentration flags in recent eligible trades." : "No recent trades to inspect."}
        >
          {data.concentrationFlags.map((flag) => (
            <div key={flag.artistId} className="rounded-md border border-line bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black">{flag.ticker}</p>
                  <p className="text-xs font-bold text-paper/45">{flag.name}</p>
                </div>
                <SeverityPill severity={flag.severity} />
              </div>
              <p className="mt-2 text-sm leading-5 text-paper/58">{flag.reason}</p>
              <div className="mt-3 grid gap-2 text-xs font-bold text-paper/50 sm:grid-cols-3">
                <span>{formatCurrency(flag.grossOrderValue)} gross</span>
                <span>{formatSignedCurrency(flag.netOrderValue)} net</span>
                <span>{flag.uniqueTraderCount} traders</span>
              </div>
              <p className="mt-2 text-xs font-bold text-paper/45">
                Long {flag.buyCount}/{flag.sellCount}; short {flag.shortCount}/{flag.coverCount}.
              </p>
              <p className="mt-2 text-xs font-bold text-paper/45">
                Top trader {flag.largestTrader.username ?? shortId(flag.largestTrader.userId)} controls{" "}
                {formatUnsignedPercent(flag.largestTrader.sharePercent)}.
              </p>
            </div>
          ))}
        </IntegrityList>

        <IntegrityList
          title="Rapid trading"
          emptyText={hasTrades ? "No rapid-trading flags in the latest window." : "No recent trades to inspect."}
        >
          {data.rapidTradeFlags.map((flag) => (
            <div key={`${flag.userId}:${flag.artistId}`} className="rounded-md border border-line bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black">{flag.username ?? shortId(flag.userId)}</p>
                  <p className="text-xs font-bold text-paper/45">
                    {flag.ticker} - {flag.name}
                  </p>
                </div>
                <SeverityPill severity={flag.severity} />
              </div>
              <div className="mt-3 grid gap-2 text-xs font-bold text-paper/50 sm:grid-cols-3">
                <span>{flag.tradeCount} trades</span>
                <span>{formatCurrency(flag.grossOrderValue)} gross</span>
                <span>{flag.windowMinutes} min window</span>
              </div>
            </div>
          ))}
        </IntegrityList>
      </div>

      {data.excludedTradeSummary.tradeCount > 0 ? (
        <div className="rounded-md border border-mint/25 bg-mint/10 p-3 text-sm leading-6 text-paper/62">
          <span className="font-black text-mint">{data.excludedTradeSummary.tradeCount} orders</span> were excluded by
          market-eligibility rules across {data.excludedTradeSummary.artistCount} artists.
        </div>
      ) : null}
    </div>
  );
}

function IntegrityList({
  title,
  emptyText,
  children
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const childArray = Children.toArray(children);

  return (
    <div>
      <h3 className="text-sm font-black uppercase tracking-wide text-paper/45">{title}</h3>
      {childArray.length ? (
        <div className="mt-2 space-y-2">{childArray}</div>
      ) : (
        <div className="mt-2 rounded-md border border-line bg-black/20 p-3 text-sm font-bold text-paper/45">
          {emptyText}
        </div>
      )}
    </div>
  );
}

function SeverityPill({ severity }: { severity: "watch" | "high" | "critical" }) {
  const className =
    severity === "critical"
      ? "border-ember/45 bg-ember/10 text-ember"
      : severity === "high"
        ? "border-brass/45 bg-brass/10 text-brass"
        : "border-cyan/45 bg-cyan/10 text-cyan";

  return (
    <span className={`rounded-md border px-2 py-1 text-xs font-black uppercase tracking-wide ${className}`}>
      {severity}
    </span>
  );
}

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${formatCurrency(value)}`;
}

function formatUnsignedPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatCoveragePercent(value: number) {
  return `${Math.max(0, Math.min(100, value)).toFixed(2)}%`;
}

function shortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
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

function DiagnosticToolsPanel({
  preview,
  eventScan,
  runCorePreview,
  runEventScan,
  controlsDisabled
}: {
  preview: PreviewState;
  eventScan: EventScanState;
  runCorePreview: () => void;
  runEventScan: (mode: "preview" | "persist") => void;
  controlsDisabled: boolean;
}) {
  return (
    <details className="rounded-md border border-line bg-panel/75 p-5 shadow-market">
      <summary className="cursor-pointer text-sm font-black uppercase tracking-wide text-paper/55">
        Diagnostic tools
      </summary>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-md border border-line bg-black/20 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Dry run</p>
              <h3 className="mt-1 text-xl font-black">Market preview</h3>
              <p className="mt-2 text-sm leading-6 text-paper/55">
                Debug-only sample. It does not write prices, observations, or history.
              </p>
            </div>
            <button
              type="button"
              onClick={runCorePreview}
              disabled={preview.status === "loading" || controlsDisabled}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-4 text-sm font-black text-cyan disabled:cursor-wait disabled:opacity-55"
            >
              <PlayCircle className="h-4 w-4" />
              Preview
            </button>
          </div>
          <PreviewResult preview={preview} />
        </div>

        <div className="rounded-md border border-line bg-black/20 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Event layer</p>
              <h3 className="mt-1 text-xl font-black">News/event scanner</h3>
              <p className="mt-2 text-sm leading-6 text-paper/55">
                The daily cron runs this automatically before pricing. These buttons are for debugging scanner output.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => runEventScan("preview")}
                disabled={eventScan.status === "loading" || controlsDisabled}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-cyan/45 bg-cyan/10 px-4 text-sm font-black text-cyan disabled:cursor-wait disabled:opacity-55"
              >
                <PlayCircle className="h-4 w-4" />
                Preview
              </button>
              <button
                type="button"
                onClick={() => runEventScan("persist")}
                disabled={eventScan.status === "loading" || controlsDisabled}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-4 text-sm font-black text-mint disabled:cursor-wait disabled:opacity-55"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save scan
              </button>
            </div>
          </div>
          <EventScanResult scan={eventScan} />
        </div>
      </div>
    </details>
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

function RunNowResult({ run }: { run: RunNowState }) {
  if (run.status === "idle") {
    return null;
  }

  if (run.status === "loading") {
    return (
      <div className="mt-4 rounded-md border border-cyan/35 bg-cyan/10 p-4">
        <LoadingText text="Running persisted core market batches..." />
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <PreviewMetric label="Completed batches" value={String(run.completedBatchCount)} />
          <PreviewMetric label="Processed artists" value={String(run.processedArtistCount)} />
        </div>
      </div>
    );
  }

  if (run.status === "error") {
    return <ErrorText text={run.message} />;
  }

  if (run.status === "skipped") {
    return (
      <div className="mt-4 rounded-md border border-cyan/30 bg-cyan/10 p-4 text-sm font-bold text-paper/65">
        {run.reason} No additional source requests or quote writes were made.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-mint/30 bg-mint/10 p-4">
      <div className="grid gap-3 text-sm sm:grid-cols-5">
        <PreviewMetric label="Run date" value={run.runDate ?? "N/A"} />
        <PreviewMetric label="Artists" value={String(run.processedArtistCount || (run.summary?.artistCount ?? 0))} />
        <PreviewMetric
          label="Avg move"
          value={
            typeof run.summary?.averageMovePercent === "number"
              ? formatPercent(run.summary.averageMovePercent)
              : "N/A"
          }
        />
        <PreviewMetric label="Batches" value={String(run.completedBatchCount)} />
        <PreviewMetric label="Model" value={run.summary?.modelVersion ?? "N/A"} />
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <PreviewMetric label="Observations" value={String(run.observationCount)} />
        <PreviewMetric label="Events loaded" value={String(run.eventCount)} />
        <PreviewMetric label="Detected events" value={String(run.detectedEventCount)} />
        <PreviewMetric label="Event scan" value={run.eventScanStatus} />
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <PreviewMetric
          label="Top gainer"
          value={
            run.summary?.topGainer
              ? `${run.summary.topGainer.ticker} ${formatPercent(run.summary.topGainer.dailyChangePercent)}`
              : "N/A"
          }
        />
        <PreviewMetric
          label="Top loser"
          value={
            run.summary?.topLoser
              ? `${run.summary.topLoser.ticker} ${formatPercent(run.summary.topLoser.dailyChangePercent)}`
              : "N/A"
          }
        />
      </div>
      <div className="rounded-md border border-mint/25 bg-black/20 p-3 text-sm font-bold text-paper/62">
        Persisted {run.persisted ? "yes" : "no"}{run.forced ? " · forced same-day run" : ""}
        {run.hasMore ? ` · more remains at offset ${run.nextOffset ?? "unknown"}` : ""}
      </div>
      {run.warnings.length ? (
        <div className="rounded-md border border-brass/35 bg-brass/10 p-3 text-sm leading-6 text-paper/62">
          {run.warnings.slice(0, 4).map((warning) => (
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
      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <PreviewMetric label="GDELT" value={String(scan.gdeltEventCount ?? 0)} />
        <PreviewMetric label="RSS/media" value={String(scan.mediaRssEventCount ?? 0)} />
        <PreviewMetric label="AI research" value={scan.aiResearchEnabled ? String(scan.aiResearchEventCount ?? 0) : "Off"} />
        <PreviewMetric label="Sources" value={scan.aiResearchEnabled ? "AI + feeds" : "Feeds only"} />
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

function ArtistRosterManager({
  state,
  form,
  selectedRecord,
  saveState,
  autoName,
  autoState,
  onRefresh,
  onNew,
  onSelectArtist,
  onChange,
  onSave,
  onSetActive,
  onDelete,
  onAutoNameChange,
  onAutoPreview,
  onAutoSave
}: {
  state: AsyncState<ArtistRosterDirectory>;
  form: ArtistRosterForm;
  selectedRecord: ArtistRosterRecord | null;
  saveState: ArtistRosterSaveState;
  autoName: string;
  autoState: AutoArtistAddState;
  onRefresh: () => void;
  onNew: () => void;
  onSelectArtist: (artistId: string) => void;
  onChange: (field: keyof Omit<ArtistRosterForm, "selectedId">, value: string | boolean) => void;
  onSave: () => void;
  onSetActive: (isActive: boolean) => void;
  onDelete: () => void;
  onAutoNameChange: (value: string) => void;
  onAutoPreview: () => void;
  onAutoSave: () => void;
}) {
  const records = state.status === "ready" ? state.data.records : [];
  const selectedDisabled = saveState.status === "saving" || autoState.status === "saving" || autoState.status === "previewing";

  return (
    <section className="rounded-md border border-line bg-panel/88 p-5 shadow-market">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Roster control</p>
          <h2 className="mt-1 text-2xl font-black">Artist roster</h2>
          <p className="mt-2 text-sm leading-6 text-paper/55">
            Add artists or move unreliable listings inactive without creating one-off SQL migrations.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onNew}
            disabled={selectedDisabled}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-black/20 px-4 text-sm font-black text-paper/70 disabled:cursor-wait disabled:opacity-55"
          >
            New artist
          </button>
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
      </div>

      {state.status === "loading" ? <LoadingText text="Loading artist roster..." /> : null}
      {state.status === "error" ? <ErrorText text={state.message} /> : null}

      {state.status === "ready" ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-cyan/25 bg-cyan/5 p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-paper/45">Find artist to add</span>
                <input
                  value={autoName}
                  onChange={(event) => onAutoNameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onAutoPreview();
                    }
                  }}
                  disabled={selectedDisabled}
                  placeholder="Lil Tecca"
                  className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none placeholder:text-paper/24 focus:border-cyan disabled:cursor-not-allowed disabled:opacity-55"
                />
                <span className="mt-1 block text-xs font-bold leading-5 text-paper/42">
                  Preview ticker, starter price, volatility, category, and source matches before anything is saved.
                </span>
              </label>
              <button
                type="button"
                onClick={onAutoPreview}
                disabled={!autoName.trim() || selectedDisabled}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-4 text-sm font-black text-mint disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {autoState.status === "previewing" ? "Finding" : "Find info"}
              </button>
            </div>
            {autoState.status === "preview" || autoState.status === "saving" ? (
              <AutoArtistPreviewCard
                preview={autoState.preview}
                saving={autoState.status === "saving"}
                onSave={onAutoSave}
              />
            ) : null}
            {autoState.status === "saved" ? (
              <div className="mt-3 rounded-md border border-mint/35 bg-mint/10 p-3 text-sm font-bold leading-6 text-paper/70">
                <p className="text-mint">{autoState.message}</p>
                {autoState.warnings.slice(0, 2).map((warning) => (
                  <p key={warning} className="text-paper/55">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
            {autoState.status === "error" ? <ErrorText text={autoState.message} /> : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-md border border-line bg-black/20 p-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-paper/45">Existing artist</span>
              <select
                value={form.selectedId}
                onChange={(event) => onSelectArtist(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none focus:border-cyan"
              >
                <option value="">New artist</option>
                {records.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.ticker} - {record.name} {record.isActive ? "" : "(inactive)"}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 grid gap-2">
              <PreviewMetric label="Total listings" value={String(state.data.artistCount)} />
              <PreviewMetric label="Active" value={String(state.data.activeCount)} />
              <PreviewMetric label="Inactive" value={String(state.data.inactiveCount)} />
            </div>

            {selectedRecord ? (
              <div className="mt-4 rounded-md border border-line bg-black/25 p-3">
                <p className="text-xs font-black uppercase tracking-wide text-paper/45">Selected listing</p>
                <div className="mt-2 grid gap-2">
                  <PreviewMetric label="Status" value={selectedRecord.isActive ? "Active" : "Inactive"} />
                  <PreviewMetric label="Price" value={`$${selectedRecord.currentPrice.toFixed(2)}`} />
                  <PreviewMetric label="Hype score" value={String(selectedRecord.hypeScore)} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-line bg-black/20 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-paper/45">Artist ID</span>
                <input
                  value={form.id}
                  onChange={(event) => onChange("id", event.target.value)}
                  disabled={Boolean(selectedRecord) || selectedDisabled}
                  placeholder="auto-from-name"
                  className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none placeholder:text-paper/24 focus:border-cyan disabled:cursor-not-allowed disabled:opacity-55"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-paper/45">Ticker</span>
                <input
                  value={form.ticker}
                  onChange={(event) => onChange("ticker", event.target.value)}
                  disabled={selectedDisabled}
                  placeholder="ARTIST"
                  className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none placeholder:text-paper/24 focus:border-cyan disabled:cursor-not-allowed disabled:opacity-55"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-black uppercase tracking-wide text-paper/45">Name</span>
                <input
                  value={form.name}
                  onChange={(event) => onChange("name", event.target.value)}
                  disabled={selectedDisabled}
                  placeholder="Artist name"
                  className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none placeholder:text-paper/24 focus:border-cyan disabled:cursor-not-allowed disabled:opacity-55"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-paper/45">Current price</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.currentPrice}
                  onChange={(event) => onChange("currentPrice", event.target.value)}
                  disabled={selectedDisabled}
                  className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none focus:border-cyan disabled:cursor-not-allowed disabled:opacity-55"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-paper/45">Previous close</span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.previousClose}
                  onChange={(event) => onChange("previousClose", event.target.value)}
                  disabled={selectedDisabled}
                  className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none focus:border-cyan disabled:cursor-not-allowed disabled:opacity-55"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-paper/45">Volatility</span>
                <input
                  type="number"
                  min="0.4"
                  max="3"
                  step="0.01"
                  value={form.volatility}
                  onChange={(event) => onChange("volatility", event.target.value)}
                  disabled={selectedDisabled}
                  className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none focus:border-cyan disabled:cursor-not-allowed disabled:opacity-55"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-paper/45">Category</span>
                <select
                  value={form.category}
                  onChange={(event) => onChange("category", event.target.value as ArtistCategory)}
                  disabled={selectedDisabled}
                  className="mt-2 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper outline-none focus:border-cyan disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {artistCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-ink px-3 text-sm font-bold text-paper md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => onChange("isActive", event.target.checked)}
                  disabled={selectedDisabled}
                  className="h-4 w-4 accent-cyan"
                />
                Active listing
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-h-6 text-sm font-bold">
                {saveState.status === "saved" ? <span className="text-mint">{saveState.message}</span> : null}
                {saveState.status === "error" ? <span className="text-ember">{saveState.message}</span> : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {selectedRecord ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onSetActive(!selectedRecord.isActive)}
                      disabled={saveState.status === "saving"}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-brass/45 bg-brass/10 px-4 text-sm font-black text-brass disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedRecord.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={saveState.status === "saving"}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ember/45 bg-ember/10 px-4 text-sm font-black text-ember disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete completely
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saveState.status === "saving"}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-4 text-sm font-black text-mint disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {saveState.status === "saving" ? "Saving" : "Save artist"}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      ) : null}
    </section>
  );
}

function AutoArtistPreviewCard({
  preview,
  saving,
  onSave
}: {
  preview: AutoArtistPreviewResult;
  saving: boolean;
  onSave: () => void;
}) {
  const sourceIds = preview.sourceIds;
  const savedSources = manualSourceIdFields
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: sourceIds?.[field.key]
    }))
    .filter((source): source is { key: keyof Omit<ManualSourceIdForm, "artistId">; label: string; value: string } =>
      Boolean(source.value)
    );
  const verifiedSources = savedSources.filter((source) =>
    source.key === "spotifyId" || source.key === "youtubeChannelId" || source.key === "musicbrainzId"
  );
  const textLookupSources = savedSources.filter((source) => source.key === "lastfmName" || source.key === "gdeltQuery");
  const sourceQuality = getAutoArtistSourceQuality(verifiedSources.length, textLookupSources.length);
  const candidates = preview.suggestions.flatMap((suggestion) =>
    Object.entries(suggestion.candidates).flatMap(([source, sourceCandidates]) =>
      (sourceCandidates ?? []).slice(0, 2).map((candidate) => ({
        sourceKey: source,
        ...candidate
      }))
    )
  );

  return (
    <div className="mt-4 rounded-md border border-line bg-black/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-mint">Verification preview</p>
          <h3 className="mt-1 text-xl font-black">
            {preview.record.name} <span className="text-paper/45">{preview.record.ticker}</span>
          </h3>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-paper/55">
            Review the generated listing and source matches. Save only after the verified IDs look like the real artist.
          </p>
          <div
            className={`mt-3 inline-flex rounded border px-3 py-1.5 text-xs font-black uppercase tracking-wide ${sourceQuality.className}`}
          >
            {sourceQuality.label}
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-mint/45 bg-mint/10 px-4 text-sm font-black text-mint disabled:cursor-wait disabled:opacity-55"
        >
          <CheckCircle2 className="h-4 w-4" />
          {saving ? "Saving artist and source IDs" : sourceQuality.saveLabel}
        </button>
      </div>

      {sourceQuality.warning ? (
        <div className="mt-4 rounded-md border border-brass/35 bg-brass/10 p-3 text-sm font-bold leading-6 text-paper/65">
          {sourceQuality.warning}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PreviewMetric label="Ticker" value={preview.record.ticker} />
        <PreviewMetric label="Start price" value={formatCurrency(preview.starter.price)} />
        <PreviewMetric label="Volatility" value={`${preview.starter.volatility.toFixed(2)}x`} />
        <PreviewMetric label="Category" value={preview.starter.category} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-ink/70 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-paper/45">Source IDs to save</p>
          <p className="mt-1 text-xs font-bold leading-5 text-paper/45">
            {verifiedSources.length
              ? `Verified platform/release IDs: ${verifiedSources.map((source) => source.label).join(", ")}.`
              : "No verified Spotify, YouTube, or MusicBrainz ID was found. This listing will rely on text lookups until exact IDs are added."}
          </p>
          {textLookupSources.length ? (
            <p className="mt-1 text-xs font-bold leading-5 text-paper/38">
              Text lookups: {textLookupSources.map((source) => source.label).join(", ")}.
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 text-xs font-bold">
            {savedSources.length ? (
              savedSources.map((source) => (
                <div key={source.label} className="grid gap-1 rounded border border-line bg-panel/70 p-2">
                  <span className="text-paper/45">{source.label}</span>
                  <span className="break-all text-paper">{source.value}</span>
                </div>
              ))
            ) : (
              <p className="rounded border border-brass/35 bg-brass/10 p-3 leading-5 text-paper/65">
                No high-confidence source IDs were found. You can still save the listing, then add exact IDs manually.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-line bg-ink/70 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-paper/45">Best matches found</p>
          <div className="mt-3 grid gap-2 text-xs font-bold">
            {candidates.length ? (
              candidates.map((candidate) => (
                <div key={`${candidate.sourceKey}-${candidate.externalId}`} className="rounded border border-line bg-panel/70 p-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-paper">{candidate.label}</span>
                      <span className="uppercase text-paper/45">{candidate.sourceKey}</span>
                    </span>
                    <span className="shrink-0 text-mint">{Math.round(candidate.confidence * 100)}%</span>
                  </div>
                  <p className="mt-1 leading-5 text-paper/55">{candidate.reason}</p>
                </div>
              ))
            ) : (
              <p className="rounded border border-line bg-panel/70 p-3 leading-5 text-paper/55">
                No resolver candidates were returned for this artist.
              </p>
            )}
          </div>
        </div>
      </div>

      {preview.warnings.length ? (
        <div className="mt-3 rounded-md border border-brass/35 bg-brass/10 p-3 text-xs font-bold leading-5 text-paper/65">
          {preview.warnings.slice(0, 3).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getAutoArtistSourceQuality(verifiedSourceCount: number, textLookupSourceCount: number) {
  if (verifiedSourceCount >= 2) {
    return {
      label: "High-confidence listing",
      saveLabel: "Save verified listing",
      className: "border-mint/40 bg-mint/10 text-mint",
      warning: null
    };
  }

  if (verifiedSourceCount === 1) {
    return {
      label: "Needs quick review",
      saveLabel: "Save after review",
      className: "border-brass/40 bg-brass/10 text-brass",
      warning:
        "Only one exact platform/release ID was found. This can be okay, but check the candidate manually before trusting market data."
    };
  }

  if (textLookupSourceCount > 0) {
    return {
      label: "Text-only match",
      saveLabel: "Save text-only listing",
      className: "border-brass/40 bg-brass/10 text-brass",
      warning:
        "This preview found only text lookups, not exact Spotify, YouTube, or MusicBrainz IDs. Save only if you plan to add exact IDs immediately."
    };
  }

  return {
    label: "Low-confidence listing",
    saveLabel: "Save without IDs",
    className: "border-ember/40 bg-ember/10 text-ember",
    warning:
      "No reliable source IDs were found. Do not use this artist in the public market until exact source IDs are added."
  };
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
  wikipediaArticleTitle?: string | null;
  lastfmName?: string | null;
  gdeltQuery?: string | null;
};

function buildArtistRosterForm(record: ArtistRosterRecord): ArtistRosterForm {
  return {
    selectedId: record.id,
    id: record.id,
    name: record.name,
    ticker: record.ticker,
    currentPrice: String(record.currentPrice),
    previousClose: String(record.previousClose),
    volatility: String(record.volatility),
    category: record.category,
    isActive: record.isActive
  };
}

function buildArtistRosterPayload(form: ArtistRosterForm) {
  const name = form.name.trim();
  const id = form.id.trim() || slugifyArtistName(name);
  const ticker = form.ticker.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const currentPrice = Number(form.currentPrice);
  const previousClose = Number(form.previousClose || form.currentPrice);
  const volatility = Number(form.volatility);

  return {
    id,
    name,
    ticker,
    currentPrice,
    previousClose,
    volatility,
    category: form.category,
    isActive: form.isActive
  };
}

function slugifyArtistName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildManualSourceForm(record: ArtistSourceIdRecord): ManualSourceIdForm {
  return {
    artistId: record.artistId,
    spotifyId: record.externalIds.spotifyId ?? "",
    youtubeChannelId: record.externalIds.youtubeChannelId ?? "",
    musicbrainzId: record.externalIds.musicbrainzId ?? "",
    lastfmName: record.externalIds.lastfmName ?? "",
    gdeltQuery: record.externalIds.gdeltQuery ?? "",
    wikipediaArticleTitle: record.externalIds.wikipediaArticleTitle ?? ""
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

function getEventScanStatus(value: unknown) {
  if (!value || typeof value !== "object") {
    return "Not reported";
  }

  const scan = value as {
    ok?: boolean;
    disabled?: boolean;
    reason?: string;
    error?: string;
    payload?: {
      scannedArtistCount?: number;
      eventCount?: number;
      observationCount?: number;
    };
  };

  if (scan.disabled) {
    return scan.reason ?? "Disabled";
  }

  if (!scan.ok) {
    return scan.error ?? "Failed";
  }

  const scanned = scan.payload?.scannedArtistCount ?? 0;
  const events = scan.payload?.eventCount ?? 0;

  return `${scanned} artists, ${events} events`;
}

function formatOperatorTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles"
  }).format(date);
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    return {
      ok: false,
      error: `Server returned an empty response with HTTP ${response.status}.`
    };
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: text.slice(0, 240) || `Server returned non-JSON with HTTP ${response.status}.`
    };
  }
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
    <div className="min-w-0 overflow-hidden rounded-md border border-line bg-black/20 p-4">
      <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-paper/55">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 break-words">{label}</span>
      </div>
      <p className={`mt-2 min-w-0 break-words text-sm font-black leading-tight number-tabular ${ready ? "text-mint" : "text-brass"}`}>
        {ready ? readyText : pendingText}
      </p>
    </div>
  );
}

function AdminActionResult({ state }: { state: AdminActionState }) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return <p className="mt-4 text-sm font-bold text-cyan">{state.label}...</p>;
  }

  return (
    <p className={`mt-4 text-sm font-bold ${state.status === "success" ? "text-mint" : "text-ember"}`}>
      {state.message}
    </p>
  );
}

function LoadingText({ text }: { text: string }) {
  return <p className="mt-4 text-sm font-bold text-cyan">{text}</p>;
}

function ErrorText({ text }: { text: string }) {
  return <p className="mt-4 text-sm font-bold text-ember">{text}</p>;
}
