import { ArtistAvatar } from "@/components/ArtistAvatar";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export function RmiSection({
  title,
  subtitle,
  action,
  children,
  className
}: {
  title?: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rmi-card overflow-hidden", className)}>
      {title ? (
        <div className="rmi-section-header flex items-start justify-between gap-4 border-b border-line/80 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs font-medium text-paper/55">{subtitle}</p> : null}
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
  disabled = false,
  className
}: {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "danger";
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const buttonClassName = clsx(
    "inline-flex min-h-9 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "rmi-button-primary",
    variant === "secondary" && "rmi-button-secondary border border-line bg-transparent text-paper",
    variant === "danger" && "border border-ember/60 text-ember hover:bg-ember/10",
    className
  );

  if (href) {
    return (
      <Link href={href} className={buttonClassName}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={buttonClassName}>
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
        <span className="block truncate text-sm font-semibold">{artist.name}</span>
        <span className="block truncate text-xs font-medium text-paper/45">${artist.ticker}{detail ? ` · ${detail}` : ""}</span>
      </span>
    </>
  );

  if (!linked) {
    return <div className="flex min-w-0 items-center gap-3">{content}</div>;
  }

  return (
    <Link href={`/artists/${artist.id}`} className="flex min-w-0 items-center gap-3 hover:text-cyan">
      {content}
    </Link>
  );
}

export function ChangeText({ value, suffix = "" }: { value: number; suffix?: string }) {
  return (
    <span className={clsx("font-semibold number-tabular", value >= 0 ? "text-mint" : "text-ember")}>
      {formatPercent(value)}
      {suffix}
    </span>
  );
}

export function ArtistMiniCard({ artist }: { artist: Artist }) {
  return (
    <Link href={`/artists/${artist.id}`} className="rmi-signal-card grid min-w-0 gap-4 p-4">
      <ArtistIdentity artist={artist} linked={false} />
      <div>
        <p className="text-lg font-semibold number-tabular">{formatCurrency(artist.currentPrice)}</p>
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
    <div className={clsx("grid grid-cols-[minmax(0,1fr)_92px_82px] items-center gap-4 border-b border-line/70 px-4 py-3 transition-colors last:border-b-0 hover:bg-cyan/[0.035]", muted && "opacity-65")}>
      <ArtistIdentity artist={artist} />
      <p className="text-right text-sm font-semibold number-tabular">{formatCurrency(artist.currentPrice)}</p>
      <div className="text-right text-sm">{right ?? <ChangeText value={artist.dailyChangePercent} />}</div>
    </div>
  );
}
