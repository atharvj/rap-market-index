import { ArtistAvatar } from "@/components/ArtistAvatar";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist, PricePoint } from "@/lib/types";
import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export function RmiSection({
  title,
  subtitle,
  action,
  children
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rmi-card overflow-hidden">
      {title ? (
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-black">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm font-bold text-paper/60">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function RmiButton({
  children,
  href,
  variant = "primary",
  onClick,
  type = "button",
  disabled = false
}: {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "danger";
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const className = clsx(
    "inline-flex min-h-9 items-center justify-center rounded-lg px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "bg-paper text-ink hover:bg-paper/90",
    variant === "secondary" && "border border-line bg-transparent text-paper hover:border-cyan",
    variant === "danger" && "border border-ember/60 text-ember hover:bg-ember/10"
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

export function ArtistIdentity({
  artist,
  detail,
  linked = true
}: {
  artist: Artist;
  detail?: string;
  linked?: boolean;
}) {
  const content = (
    <>
      <ArtistAvatar artist={artist} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-black">{artist.name}</span>
        <span className="block truncate text-xs font-bold text-paper/45">${artist.ticker}{detail ? ` · ${detail}` : ""}</span>
      </span>
    </>
  );

  if (!linked) {
    return <div className="flex min-w-0 items-center gap-3">{content}</div>;
  }

  return (
    <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center gap-3">
      {content}
    </Link>
  );
}

export function ChangeText({ value, suffix = "" }: { value: number; suffix?: string }) {
  return (
    <span className={clsx("font-black number-tabular", value >= 0 ? "text-mint" : "text-ember")}>
      {formatPercent(value)}
      {suffix}
    </span>
  );
}

export function RmiLineChart({
  data,
  positive = true,
  height = 110,
  fill = true
}: {
  data: PricePoint[];
  positive?: boolean;
  height?: number;
  fill?: boolean;
}) {
  const points = data.length >= 2 ? data.slice(-24) : buildFlatPoints(data[0]);
  const width = 520;
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(0.01, max - min);
  const step = width / Math.max(1, points.length - 1);
  const coords = points.map((point, index) => {
    const x = index * step;
    const y = height - ((point.price - min) / range) * (height - 12) - 6;

    return { x, y };
  });
  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const color = positive ? "#00c805" : "#ff6570";

  return (
    <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price chart">
      {fill ? <path d={area} fill={color} opacity="0.10" /> : null}
      <path d={line} fill="none" stroke={color} strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

export function ArtistMiniCard({ artist }: { artist: Artist }) {
  return (
    <Link href={`/artists/${artist.id}`} className="rmi-card grid min-w-0 gap-4 p-4 transition hover:-translate-y-0.5 hover:border-cyan/70">
      <ArtistIdentity artist={artist} linked={false} />
      <div>
        <p className="text-lg font-black number-tabular">{formatCurrency(artist.currentPrice)}</p>
        <ChangeText value={artist.dailyChangePercent} />
      </div>
    </Link>
  );
}

export function ArtistTableRow({
  artist,
  right,
  muted = false
}: {
  artist: Artist;
  right?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={clsx("grid grid-cols-[minmax(0,1fr)_92px_82px] items-center gap-4 border-b border-line px-4 py-3 last:border-b-0", muted && "opacity-65")}>
      <ArtistIdentity artist={artist} />
      <p className="text-right text-sm font-black number-tabular">{formatCurrency(artist.currentPrice)}</p>
      <div className="text-right text-sm">{right ?? <ChangeText value={artist.dailyChangePercent} />}</div>
    </div>
  );
}

function buildFlatPoints(point?: PricePoint): PricePoint[] {
  const price = point?.price ?? 0;

  return [
    { date: point?.date ?? "start", price },
    { date: point?.date ?? "current", price }
  ];
}
