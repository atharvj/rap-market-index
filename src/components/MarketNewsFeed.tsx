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
  thumbnailUrl?: string | null;
  sentimentScore: number;
  impactScore: number;
  confidence: number;
};

type MarketNewsResponse = {
  ok: boolean;
  news?: MarketNewsItem[];
};

const eventLabels: Record<string, string> = {
  release: "Release",
  review: "Review",
  news: "News",
  controversy: "Controversy",
  award: "Award",
  tour: "Tour",
  viral: "Viral"
};

export function MarketNewsFeed({
  artistId,
  limit = 8,
  compact = false
}: {
  artistId?: string;
  limit?: number;
  compact?: boolean;
}) {
  const [items, setItems] = useState<MarketNewsItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: String(limit),
      lookbackDays: "45"
    });

    if (artistId) {
      params.set("artistId", artistId);
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
  }, [artistId, limit]);

  if (!items.length) {
    return (
      <div className="rounded border border-line bg-panel p-4 text-sm font-bold text-paper/50">
        No recent major catalysts passed the public news filter.
      </div>
    );
  }

  return (
    <div className="divide-y divide-line">
      {items.map((item, index) => (
        <MarketNewsArticle key={item.id} item={item} compact={compact} featured={!compact && index === 0} />
      ))}
    </div>
  );
}

function MarketNewsArticle({
  item,
  compact,
  featured
}: {
  item: MarketNewsItem;
  compact: boolean;
  featured: boolean;
}) {
  const positive = item.sentimentScore >= 0;
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
      {item.sourceName ? <span>{item.sourceName}</span> : null}
    </div>
  );

  if (featured) {
    return (
      <article className="py-4">
        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <NewsThumbnail item={item} featured />
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
    <article className={clsx("py-3", compact ? "px-0" : "px-1")}>
      <div className={clsx("grid items-start gap-3", compact ? "grid-cols-[72px_minmax(0,1fr)_18px]" : "grid-cols-[96px_minmax(0,1fr)_18px]")}>
        <NewsThumbnail item={item} />
        <div className="min-w-0">
          {meta}
          <h3 className="mt-1 text-sm font-black leading-snug text-paper">{title}</h3>
          {!compact ? (
            <Link href={`/artists/${item.artistId}`} className="mt-2 inline-flex text-xs font-black text-cyan hover:text-cyan/75">
              {item.artistName} · {item.ticker}
            </Link>
          ) : null}
        </div>
        <SourceLink item={item} />
      </div>
    </article>
  );
}

function NewsThumbnail({ item, featured = false }: { item: MarketNewsItem; featured?: boolean }) {
  return (
    <Link
      href={`/artists/${item.artistId}`}
      className={clsx(
        "relative block overflow-hidden rounded border border-line bg-panelSoft",
        featured ? "aspect-[16/10] min-h-28" : "h-14 w-full"
      )}
      aria-label={`${item.artistName} quote`}
    >
      <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-cyan/10 via-brass/10 to-mint/12 text-sm font-black text-paper/75">
        {item.ticker}
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
