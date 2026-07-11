"use client";

import { useGame } from "@/components/GameProvider";
import { PriceChart } from "@/components/PriceChart";
import { ArtistIdentity, ArtistMiniCard, ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { formatPercent } from "@/lib/formatters";
import { buildMarketIndexSeries, getMarketBreadth, getSeriesChangePercent } from "@/lib/market-analytics";
import { Activity, Info, Radar, ShieldCheck, TrendingUp } from "lucide-react";
import { useMemo } from "react";

export default function ScoutPage() {
  const { state } = useGame();
  const emergingArtists = useMemo(
    () =>
      [...state.artists]
        .filter((artist) => artist.category === "underground" || artist.category === "rising")
        .sort((first, second) => {
          const firstSignal = first.hypeScore + Math.max(0, first.dailyChangePercent) * 4;
          const secondSignal = second.hypeScore + Math.max(0, second.dailyChangePercent) * 4;
          return secondSignal - firstSignal;
        })
        .slice(0, 12),
    [state.artists]
  );
  const discoveryIndex = useMemo(() => buildMarketIndexSeries(emergingArtists), [emergingArtists]);
  const discoveryChange = getSeriesChangePercent(discoveryIndex);
  const breadth = getMarketBreadth(emergingArtists);
  const averageSignal = emergingArtists.length
    ? emergingArtists.reduce((total, artist) => total + artist.hypeScore, 0) / emergingArtists.length
    : 0;
  const breakoutLeader = emergingArtists[0];

  return (
    <div className="space-y-6">
      <header className="grid gap-5 rounded-lg border border-line bg-panel p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan">
            <Radar className="h-4 w-4" aria-hidden="true" />
            Discovery
          </div>
          <h1 className="mt-3 text-3xl font-black">Scout Emerging Artists</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper/65">
            Explore smaller artists already trading on RMI, ranked by current market signal and momentum.
          </p>
        </div>
        <RmiButton href="/markets" variant="secondary">View Every Market</RmiButton>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ScoutStat label="Tracked Here" value={String(emergingArtists.length)} detail="active listings" />
        <ScoutStat label="Advancing" value={String(breadth.advancers)} detail="positive today" tone="good" />
        <ScoutStat label="Average Signal" value={`${Math.round(averageSignal)}/100`} detail="across Scout" />
        <ScoutStat label="Radar Move" value={formatPercent(discoveryChange)} detail="recorded window" tone={discoveryChange >= 0 ? "good" : "bad"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <RmiSection
          title="Scout Market Trend"
          subtitle="Average quote movement for the emerging artists currently surfaced by Scout."
          action={<TrendingUp className="h-4 w-4 text-cyan" aria-hidden="true" />}
        >
          <div className="p-4">
            <PriceChart data={discoveryIndex} height={190} />
          </div>
        </RmiSection>

        <RmiSection title="Radar Leader" subtitle="Highest combined signal and positive momentum.">
          {breakoutLeader ? (
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <ArtistIdentity artist={breakoutLeader} />
                <ChangeText value={breakoutLeader.dailyChangePercent} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <SignalTile label="RMI Signal" value={`${breakoutLeader.hypeScore}/100`} />
                <SignalTile label="Volatility" value={`${breakoutLeader.volatility.toFixed(2)}x`} />
              </div>
            </div>
          ) : null}
        </RmiSection>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
          <h2 className="text-lg font-black">On the Radar</h2>
            <p className="mt-1 text-sm text-paper/55">Smaller active listings showing the strongest current RMI signals.</p>
          </div>
          <span className="text-xs text-paper/45">{emergingArtists.length} shown</span>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {emergingArtists.map((artist) => <ArtistMiniCard key={artist.id} artist={artist} />)}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <ScoutMethod
          icon={<Activity className="h-4 w-4" />}
          title="Momentum"
          copy="Recent audience, discovery, video, and quote movement determine who rises on the radar."
        />
        <ScoutMethod
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Evidence"
          copy="Verified releases and coverage can strengthen a signal; routine uploads and weak chatter do not."
        />
        <ScoutMethod
          icon={<Info className="h-4 w-4" />}
          title="Context"
          copy="Scout is a discovery view of active RMI listings, not a promise that an artist will keep rising."
        />
      </section>
    </div>
  );
}

function ScoutStat({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="rounded-lg bg-panelSoft p-4">
      <p className="text-xs font-bold text-paper/50">{label}</p>
      <p className={tone === "good" ? "mt-1 text-xl font-black text-mint number-tabular" : tone === "bad" ? "mt-1 text-xl font-black text-ember number-tabular" : "mt-1 text-xl font-black number-tabular"}>{value}</p>
      <p className="mt-1 text-xs text-paper/40">{detail}</p>
    </div>
  );
}

function SignalTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panelSoft p-3">
      <p className="text-paper/45">{label}</p>
      <p className="mt-1 font-black number-tabular">{value}</p>
    </div>
  );
}

function ScoutMethod({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-panelSoft p-4">
      <span className="mt-0.5 text-cyan">{icon}</span>
      <div>
        <h3 className="text-sm font-black">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-paper/55">{copy}</p>
      </div>
    </div>
  );
}
