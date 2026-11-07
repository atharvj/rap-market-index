import Link from "next/link";
import type { Artist } from "@/lib/types";
import { formatDate, formatPercent } from "@/lib/formatters";

export function ArtistQuoteExplanation({ artist }: { artist: Artist }) {
  const mixed =
    artist.stats.streamingGrowth > 0 && artist.stats.socialGrowth < 0;
  return (
    <section className="rmi-card p-4 sm:p-5" aria-label="Quote explanation">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Why this quote moved</h2>
          <p className="mt-1 text-xs text-paper/55">
            {artist.quoteAsOf ? (
              <>
                Model updated{" "}
                <time dateTime={artist.quoteAsOf}>
                  {formatDate(artist.quoteAsOf)}
                </time>
              </>
            ) : (
              "Latest recorded quote"
            )}
            {artist.quoteModelVersion ? ` · ${artist.quoteModelVersion}` : ""}
          </p>
        </div>
        <p className="number-tabular text-sm font-semibold">
          {formatPercent(artist.dailyChangePercent)} this session
        </p>
      </div>
      <p className="mt-4 text-sm leading-7 text-paper/80">
        {artist.lastMoveExplanation}
      </p>
      {mixed ? (
        <p className="mt-3 text-sm leading-6 text-paper/65">
          Listening and audience-response signals point in different directions.
          Listening growth can remain positive while sampled reactions weaken;
          the combined evidence determines the quote.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-cyan">
        <a href="#public-market-indicators">Check dated public indicators</a>
        <a href="#artist-market-news">Read artist news</a>
        <Link href="/methodology">Read pricing rules</Link>
      </div>
    </section>
  );
}
