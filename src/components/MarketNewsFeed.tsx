"use client";

import { formatDate } from "@/lib/formatters";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";
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

  return (
    <div className={resolvedVariant === "home" ? "grid gap-3" : "divide-y divide-line"}>
      {items.map((item, index) => (
        <MarketNewsArticle
          key={item.id}
          item={item}
          variant={resolvedVariant}
          featured={resolvedVariant === "full" && index === 0}
          homeLead={resolvedVariant === "home" && index === 0}
        />
      ))}
    </div>
  );
}

function MarketNewsArticle({
  item,
  variant,
  featured,
  homeLead
}: {
  item: MarketNewsItem;
  variant: MarketNewsVariant;
  featured: boolean;
  homeLead: boolean;
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

  if (homeLead) {
    return (
      <article className="rounded border border-line bg-panelSoft px-3 py-3">
        <div className="grid grid-cols-[74px_minmax(0,1fr)_18px] items-start gap-3">
          <NewsThumbnail item={item} size="home" />
          <div className="min-w-0">
            {meta}
            <h3 className="mt-1 text-base font-black leading-snug text-paper">{title}</h3>
            <Link href={`/artists/${item.artistId}`} className="mt-1 inline-flex text-xs font-black text-cyan hover:text-cyan/75">
              {item.artistName} · {item.ticker}
            </Link>
          </div>
          <SourceLink item={item} />
        </div>
      </article>
    );
  }

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
              <SourceLink item={item} />
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
    <article className={clsx("py-3", compact ? "px-0" : variant === "home" ? "rounded border border-line px-3 hover:bg-panelSoft/60" : "px-1")}>
      <div className={clsx("grid items-start gap-3", compact ? "grid-cols-[minmax(0,1fr)_18px]" : variant === "home" ? "grid-cols-[54px_minmax(0,1fr)_18px]" : "grid-cols-[86px_minmax(0,1fr)_18px]")}>
        {compact ? null : <NewsThumbnail item={item} size={variant === "home" ? "small" : "row"} />}
        <div className="min-w-0">
          {meta}
          <h3 className="mt-1 text-sm font-black leading-snug text-paper">{title}</h3>
          {!compact && variant !== "home" ? (
            <Link href={`/artists/${item.artistId}`} className="mt-2 inline-flex text-xs font-black text-cyan hover:text-cyan/75">
              {item.artistName} · {item.ticker}
            </Link>
          ) : variant === "home" ? (
            <Link href={`/artists/${item.artistId}`} className="mt-1 inline-flex text-xs font-black text-cyan hover:text-cyan/75">
              {item.ticker}
            </Link>
          ) : null}
        </div>
        <SourceLink item={item} />
      </div>
    </article>
  );
}

function NewsThumbnail({ item, size = "row" }: { item: MarketNewsItem; size?: "featured" | "home" | "row" | "small" }) {
  const hasThumbnail = Boolean(item.thumbnailUrl);
  const fallbackIcon = item.sourceIconUrl;
  const dimensions = {
    featured: "h-24 w-full sm:h-28",
    home: "h-16 w-[74px]",
    row: "h-14 w-[86px]",
    small: "h-12 w-[54px]"
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
          <img
            src={fallbackIcon}
            alt=""
            className="h-6 w-6 rounded object-contain"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          item.ticker
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
      <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-black text-paper shadow-sm">
        {item.ticker}
      </span>
    </Link>
  );
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
