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
      {items.map((item) => {
        const positive = item.sentimentScore >= 0;
        const title = item.title.length > 92 ? `${item.title.slice(0, 89)}...` : item.title;

        return (
          <article key={item.id} className={clsx("py-3", compact ? "px-0" : "px-1")}>
            <div className="flex items-start gap-3">
              <Link
                href={`/artists/${item.artistId}`}
                className="mt-0.5 min-w-12 rounded bg-panelSoft px-2 py-1 text-center text-xs font-black text-cyan"
              >
                {item.ticker}
              </Link>
              <div className="min-w-0 flex-1">
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
                <h3 className="mt-1 text-sm font-black leading-snug text-paper">{title}</h3>
              </div>
              {item.sourceUrl ? (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 text-paper/40 hover:text-cyan"
                  aria-label="Open source"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
