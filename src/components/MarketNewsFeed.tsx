"use client";

import { formatDate } from "@/lib/formatters";
import clsx from "clsx";
import { ArrowRight, ExternalLink, Headphones, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type MarketNewsItem = {
  id: string;
  artistId: string;
  artistName: string;
  ticker: string;
  eventDate: string;
  eventType: string;
  title: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceDomain?: string | null;
  sourceIconUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaLabel?: string | null;
  sentimentScore: number;
  impactScore: number;
  confidence: number;
};

type MarketNewsResponse = {
  ok: boolean;
  news?: MarketNewsItem[];
};

type MarketNewsVariant = "home" | "full" | "compact";

const eventLabels: Record<string, string> = {
  release: "Release",
  review: "Review",
  news: "News",
  controversy: "Controversy",
  award: "Award",
  tour: "Tour",
  viral: "Viral",
  market: "Market"
};

export function MarketNewsFeed({
  artistId,
  eventType,
  limit = 8,
  compact = false,
  variant
}: {
  artistId?: string;
  eventType?: string;
  limit?: number;
  compact?: boolean;
  variant?: MarketNewsVariant;
}) {
  const [items, setItems] = useState<MarketNewsItem[]>([]);
  const resolvedVariant: MarketNewsVariant = variant ?? (compact ? "compact" : "full");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: String(limit),
      lookbackDays: "45",
      feed: artistId ? "artist" : resolvedVariant === "home" ? "home" : "news"
    });

    if (artistId) {
      params.set("artistId", artistId);
    }

    if (eventType) {
      params.set("eventType", eventType);
    }

    fetch(`/api/market/news?${params.toString()}`, {
      signal: controller.signal
    })
      .then((response) => response.json() as Promise<MarketNewsResponse>)
      .then((payload) => {
        setItems(payload.ok ? payload.news ?? [] : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setItems([]);
        }
      });

    return () => {
      controller.abort();
    };
  }, [artistId, eventType, limit, resolvedVariant]);

  if (!items.length) {
    return (
      <div className="rounded border border-line bg-panel p-4 text-sm font-bold text-paper/50">
        No recent major catalysts passed the public news filter.
      </div>
    );
  }

  if (resolvedVariant === "home") {
    return <HomeMarketNewsLayout items={items} />;
  }

  return (
    <div className="divide-y divide-line">
      {items.map((item, index) => (
        <MarketNewsArticle
          key={item.id}
          item={item}
          variant={resolvedVariant}
          featured={resolvedVariant === "full" && index === 0}
        />
      ))}
    </div>
  );
}

function HomeMarketNewsLayout({ items }: { items: MarketNewsItem[] }) {
  const [lead, ...rest] = items;
  const secondary = rest.slice(0, 3);
  const briefs = rest.slice(3, 7);

  return (
    <div className="grid gap-4">
      <HomeLeadStory item={lead} />

      {secondary.length ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {secondary.map((item) => (
            <HomeStoryCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      {briefs.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {briefs.map((item) => (
            <HomeBrief key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HomeLeadStory({ item }: { item: MarketNewsItem }) {
  const positive = item.sentimentScore >= 0;
  const source = item.sourceName || item.sourceDomain || "RMI Market Wire";

  return (
    <article className="overflow-hidden rounded border border-line bg-panel shadow-market">
      <div className="grid gap-0 lg:grid-cols-[minmax(260px,0.88fr)_minmax(0,1fr)]">
        <NewsThumbnail item={item} size="hero" />
        <div className="grid content-between gap-5 p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-black text-paper/55">
              <Link
                href={`/artists/${item.artistId}`}
                className="rounded bg-cyan/10 px-2 py-1 text-cyan hover:bg-cyan/15"
              >
                {item.ticker}
              </Link>
              <EventBadge item={item} positive={positive} />
              <span>{formatDate(item.eventDate)}</span>
              <SourceMeta item={item} />
            </div>
            <h2 className="mt-3 text-xl font-black leading-tight text-paper sm:text-2xl">
              {trimTitle(item.title, 132)}
            </h2>
            <p className="mt-3 text-sm font-bold leading-6 text-paper/58">
              {source} catalyst ranked by impact, confidence, and recency for {item.artistName}.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid grid-cols-2 gap-3 text-xs font-black uppercase tracking-wide text-paper/45">
              <ImpactGauge label="Impact" value={item.impactScore} positive={positive} />
              <ImpactGauge label="Confidence" value={item.confidence * 100} positive />
            </div>
            <div className="flex items-center gap-3">
              <MediaLink item={item} />
              <Link
                href={`/artists/${item.artistId}`}
                className="inline-flex min-h-9 items-center gap-2 rounded bg-paper px-3 text-xs font-black text-ink hover:bg-paper/90"
              >
                View quote
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <SourceLink item={item} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function HomeStoryCard({ item }: { item: MarketNewsItem }) {
  const positive = item.sentimentScore >= 0;

  return (
    <article className="overflow-hidden rounded border border-line bg-panel shadow-sm hover:border-cyan/50">
      <NewsThumbnail item={item} size="card" />
      <div className="grid gap-3 p-3.5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-paper/50">
          <Link href={`/artists/${item.artistId}`} className="rounded bg-panelSoft px-2 py-1 text-cyan hover:bg-cyan/10">
            {item.ticker}
          </Link>
          <EventBadge item={item} positive={positive} />
          <span>{formatDate(item.eventDate)}</span>
        </div>
        <h3 className="min-h-[3.2rem] text-sm font-black leading-snug text-paper">
          {trimTitle(item.title, 88)}
        </h3>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <SourceMeta item={item} />
          <div className="flex items-center gap-2">
            <MediaLink item={item} compact />
            <SourceLink item={item} />
          </div>
        </div>
      </div>
    </article>
  );
}

function HomeBrief({ item }: { item: MarketNewsItem }) {
  const positive = item.sentimentScore >= 0;

  return (
    <article className="rounded border border-line bg-panel px-3 py-3 hover:bg-panelSoft/60">
      <div className="grid grid-cols-[46px_minmax(0,1fr)_18px] items-start gap-3">
        <NewsThumbnail item={item} size="small" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-paper/50">
            <span>{formatDate(item.eventDate)}</span>
            <EventBadge item={item} positive={positive} />
            <SourceMeta item={item} />
          </div>
          <h3 className="mt-1 truncate text-sm font-black text-paper">{item.title}</h3>
          <Link href={`/artists/${item.artistId}`} className="mt-1 inline-flex text-xs font-black text-cyan hover:text-cyan/75">
            {item.ticker}
          </Link>
        </div>
        <SourceLink item={item} />
      </div>
    </article>
  );
}

function MarketNewsArticle({
  item,
  variant,
  featured
}: {
  item: MarketNewsItem;
  variant: MarketNewsVariant;
  featured: boolean;
}) {
  const positive = item.sentimentScore >= 0;
  const compact = variant === "compact";
  const titleLimit = featured ? 150 : compact ? 92 : 118;
  const title = item.title.length > titleLimit ? `${item.title.slice(0, titleLimit - 3)}...` : item.title;
  const meta = (
    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-paper/50">
      <span>{formatDate(item.eventDate)}</span>
      <span
        className={clsx(
          "rounded px-1.5 py-0.5",
          positive ? "bg-mint/[0.08] text-mint" : "bg-ember/[0.08] text-ember"
        )}
      >
        {eventLabels[item.eventType] ?? item.eventType}
      </span>
      <SourceMeta item={item} />
    </div>
  );

  if (featured) {
    return (
      <article className="py-4">
        <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
          <NewsThumbnail item={item} size="featured" />
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Link
                href={`/artists/${item.artistId}`}
                className="rounded bg-panelSoft px-2 py-1 text-xs font-black text-cyan hover:bg-cyan/10"
              >
                {item.ticker}
              </Link>
              <div className="flex items-center gap-2">
                <MediaLink item={item} compact />
                <SourceLink item={item} />
              </div>
            </div>
            {meta}
            <h3 className="mt-2 text-xl font-black leading-tight text-paper">{title}</h3>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-paper/40">
              Impact {Math.round(item.impactScore)} · Confidence {Math.round(item.confidence * 100)}%
            </p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={clsx("py-3", compact ? "px-0" : "px-1")}>
      <div className={clsx("grid items-start gap-3", compact ? "grid-cols-[minmax(0,1fr)_18px]" : "grid-cols-[86px_minmax(0,1fr)_18px]")}>
        {compact ? null : <NewsThumbnail item={item} size="row" />}
        <div className="min-w-0">
          {meta}
          <h3 className="mt-1 text-sm font-black leading-snug text-paper">{title}</h3>
          {!compact ? (
            <Link href={`/artists/${item.artistId}`} className="mt-2 inline-flex text-xs font-black text-cyan hover:text-cyan/75">
              {item.artistName} · {item.ticker}
            </Link>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <MediaLink item={item} compact />
          <SourceLink item={item} />
        </div>
      </div>
    </article>
  );
}

function NewsThumbnail({ item, size = "row" }: { item: MarketNewsItem; size?: "hero" | "featured" | "card" | "row" | "small" }) {
  const hasThumbnail = Boolean(item.thumbnailUrl);
  const fallbackIcon = item.sourceIconUrl;
  const dimensions = {
    hero: "h-48 w-full lg:h-full lg:min-h-[250px]",
    featured: "h-24 w-full sm:h-28",
    card: "h-32 w-full",
    row: "h-14 w-[86px]",
    small: "h-11 w-[46px]"
  }[size];

  return (
    <Link
      href={`/artists/${item.artistId}`}
      className={clsx(
        "relative block shrink-0 overflow-hidden rounded border border-line bg-panelSoft",
        dimensions
      )}
      aria-label={`${item.artistName} quote`}
    >
      <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-cyan/10 via-brass/10 to-mint/12 text-sm font-black text-paper/75">
        {fallbackIcon && !hasThumbnail ? (
          <span className="grid place-items-center gap-2">
            <img
              src={fallbackIcon}
              alt=""
              className={clsx(size === "hero" ? "h-10 w-10" : "h-6 w-6", "rounded object-contain")}
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
            {size === "hero" ? <span className="text-4xl">{item.ticker}</span> : null}
          </span>
        ) : (
          <span className={clsx(size === "hero" ? "text-5xl" : size === "card" ? "text-2xl" : "text-sm")}>{item.ticker}</span>
        )}
      </span>
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      {size === "hero" ? (
        <span className="absolute inset-x-0 bottom-0 bg-black/55 px-4 py-3 text-sm font-black text-white">
          {item.artistName} · {item.ticker}
        </span>
      ) : (
        <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-black text-paper shadow-sm">
          {item.ticker}
        </span>
      )}
    </Link>
  );
}

function EventBadge({ item, positive }: { item: MarketNewsItem; positive: boolean }) {
  return (
    <span
      className={clsx(
        "rounded px-1.5 py-0.5",
        item.eventType === "controversy"
          ? "bg-ember/[0.09] text-ember"
          : item.eventType === "review"
            ? "bg-cyan/[0.09] text-cyan"
            : positive
              ? "bg-mint/[0.08] text-mint"
              : "bg-ember/[0.08] text-ember"
      )}
    >
      {eventLabels[item.eventType] ?? item.eventType}
    </span>
  );
}

function ImpactGauge({ label, value, positive }: { label: string; value: number; positive: boolean }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="text-paper/70">{safeValue}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panelSoft">
        <div
          className={clsx("h-full rounded-full", positive ? "bg-mint" : "bg-ember")}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function trimTitle(title: string, limit: number) {
  return title.length > limit ? `${title.slice(0, limit - 3)}...` : title;
}

function SourceMeta({ item }: { item: MarketNewsItem }) {
  const label = item.sourceName || item.sourceDomain;

  if (!label) {
    return null;
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {item.sourceIconUrl ? (
        <img
          src={item.sourceIconUrl}
          alt=""
          className="h-3.5 w-3.5 shrink-0 rounded object-contain"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

function SourceLink({ item }: { item: MarketNewsItem }) {
  if (!item.sourceUrl) {
    return <span />;
  }

  return (
    <a
      href={item.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-1 text-paper/40 hover:text-cyan"
      aria-label="Open source"
    >
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

function MediaLink({ item, compact = false }: { item: MarketNewsItem; compact?: boolean }) {
  if (!item.mediaUrl || !item.mediaLabel) {
    return null;
  }

  const Icon = item.mediaType === "youtube" ? PlayCircle : Headphones;

  return (
    <a
      href={item.mediaUrl}
      target="_blank"
      rel="noreferrer"
      className={clsx(
        "inline-flex items-center gap-1.5 rounded border border-line bg-panelSoft text-xs font-black text-paper/65 hover:border-cyan/45 hover:text-cyan",
        compact ? "px-1.5 py-1" : "min-h-9 px-3"
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {compact ? null : <span>{item.mediaLabel}</span>}
    </a>
  );
}
