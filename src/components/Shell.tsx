"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { useAuth } from "@/components/AuthProvider";
import { GlobalArtistSearch } from "@/components/GlobalArtistSearch";
import { useGame } from "@/components/GameProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from "@/lib/theme";
import type { Artist } from "@/lib/types";
import clsx from "clsx";
import { Activity, CircleHelp, LogOut, Monitor, Moon, Palette, Settings, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const navItems = [
  { href: "/markets", label: "Markets" },
  { href: "/scout", label: "Scout" },
  { href: "/news", label: "News" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Rankings" },
  { href: "/leagues", label: "Leagues" }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { portfolioValue, portfolioDayChange, state, isAdminUser, avatarUrl, marketReady, marketError } = useGame();
  const { loading: authLoading, session, user, signOut } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const tapeArtists = useMemo(
    () =>
      [...(marketReady ? state.artists : [])]
        .sort((first, second) => Math.abs(second.dailyChangePercent) - Math.abs(first.dailyChangePercent))
        .slice(0, 14),
    [marketReady, state.artists]
  );

  const accountLabel =
    session && state.username && state.username !== "Demo Guest" ? state.username : user?.email?.split("@")[0] ?? "Guest";
  const portfolioDayChangePercent =
    portfolioValue - portfolioDayChange > 0 ? (portfolioDayChange / (portfolioValue - portfolioDayChange)) * 100 : 0;

  async function handleSignOut() {
    setAccountOpen(false);
    await signOut();
    router.push("/");
  }

  useEffect(() => {
    const preference = getStoredThemePreference();
    const nextTheme = applyThemePreference(preference);

    setThemePreference(preference);
    setResolvedTheme(nextTheme);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if (getStoredThemePreference() === "system") {
        setResolvedTheme(applyThemePreference("system"));
      }
    };

    media.addEventListener("change", handleSystemChange);
    return () => media.removeEventListener("change", handleSystemChange);
  }, []);

  useEffect(() => {
    if (!accountOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  function chooseTheme(preference: ThemePreference) {
    setThemePreference(preference);
    setResolvedTheme(applyThemePreference(preference));
  }

  const themeLabel =
    themePreference === "system" ? `System (${resolvedTheme})` : themePreference === "dark" ? "Dark" : "Light";

  return (
    <div className="flex min-h-screen flex-col bg-ink text-paper">
      <header className="sticky top-0 z-[80] border-b border-line/75 bg-ink/90 shadow-[0_14px_38px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <div className="market-grid border-b border-line/45">
          <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="RMI home">
            <span className="rmi-brand-mark grid h-9 w-9 place-items-center rounded-md">
              <Activity className="h-[18px] w-[18px] text-cyan transition-transform group-hover:scale-110" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-black tracking-[0.08em]">RMI</span>
              <span className="hidden text-[8px] font-bold uppercase tracking-[0.2em] text-cyan/70 xl:block">Live Index</span>
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 text-xs font-bold text-paper/60 md:flex" aria-label="Primary">
            {navItems.map((item) => {
              const active = pathname === item.href || (item.href === "/leaderboard" && pathname === "/rankings");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  className="rmi-nav-link rounded-md px-2.5 py-2 transition-colors"
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <GlobalArtistSearch className="ml-auto hidden w-52 lg:block xl:w-72" />

          {!authLoading && session ? (
            <Link
              href="/portfolio"
              className="rmi-metric rmi-metric-mint hidden min-h-10 items-center gap-4 px-3 py-1.5 text-xs hover:border-cyan xl:flex"
              aria-label={`Portfolio ${formatCurrency(portfolioValue)}, today ${formatPercent(portfolioDayChangePercent)}`}
            >
              <span>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-paper/40">Portfolio</span>
                <span className="block font-black number-tabular">{formatCurrency(portfolioValue)}</span>
              </span>
              <span className={portfolioDayChangePercent >= 0 ? "font-black text-mint number-tabular" : "font-black text-ember number-tabular"}>
                {formatPercent(portfolioDayChangePercent)}
              </span>
            </Link>
          ) : null}

          <div ref={accountMenuRef} className="relative ml-auto lg:ml-0">
            {authLoading ? (
              <div
                className="h-10 w-24 rounded-lg bg-panelSoft motion-safe:animate-pulse"
                aria-label="Checking account session"
              />
            ) : session ? (
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel text-sm font-black shadow-[0_0_20px_rgba(var(--color-cyan),0.08)] hover:border-cyan"
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <UserAvatar avatarUrl={avatarUrl} label={accountLabel} size="sm" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Link
                  href="/account"
                  className="rmi-button-secondary inline-flex min-h-9 items-center rounded-md border border-line px-3 text-xs font-bold sm:px-4 sm:text-sm"
                >
                  Log in
                </Link>
                <Link
                  href="/account?mode=signup"
                  className="rmi-button-primary inline-flex min-h-9 items-center rounded-md px-3 text-xs font-bold sm:px-4 sm:text-sm"
                >
                  Sign up
                </Link>
              </div>
            )}

            {accountOpen ? (
              <div
                className="rmi-card absolute right-0 top-12 z-[120] max-h-[calc(100dvh-5.5rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-3 shadow-2xl scrollbar-thin"
                role="menu"
              >
                <div className="flex items-center gap-3 border-b border-line pb-3">
                  <UserAvatar avatarUrl={avatarUrl} label={accountLabel} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-black">{accountLabel}</p>
                      {isAdminUser ? <AdminBadge compact /> : null}
                    </div>
                    <p className="mt-0.5 text-xs font-bold text-paper/45">RMI Trader</p>
                  </div>
                </div>

                <div className="py-3">
                  <Link href="/account" onClick={() => setAccountOpen(false)} className="rmi-button-secondary flex min-h-11 items-center justify-center rounded-md border border-line px-3 text-sm font-black">
                    Manage Your Account
                  </Link>
                </div>

                <div className="grid gap-1 border-t border-line py-3 text-sm font-bold">
                  <Link href="/settings" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-panelSoft">
                    <Settings className="h-4 w-4 text-paper/45" aria-hidden="true" />
                    Account Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      setAppearanceOpen(true);
                    }}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-panelSoft"
                  >
                    <span className="flex items-center gap-3">
                      <Palette className="h-4 w-4 text-paper/45" aria-hidden="true" />
                      Appearance
                    </span>
                    <span className="text-xs font-black text-paper/45">{themeLabel}</span>
                  </button>
                  <Link href="/help" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-panelSoft">
                    <CircleHelp className="h-4 w-4 text-paper/45" aria-hidden="true" />
                    Help Center
                  </Link>
                  <Link href="/about" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-panelSoft">
                    <Activity className="h-4 w-4 text-paper/45" aria-hidden="true" />
                    About RMI
                  </Link>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 border-t border-line px-3 pt-4 text-left text-sm font-black hover:text-ember"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1440px] items-center gap-2 overflow-x-auto border-b border-line/45 px-4 py-2 sm:px-6 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "rmi-nav-link shrink-0 rounded-md px-3 py-1.5 text-xs font-bold",
                pathname === item.href ? "border-cyan/45 bg-cyan/10 text-cyan" : "text-paper/60"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {tapeArtists.length ? <MarketTape artists={tapeArtists} /> : null}

      </header>

      {appearanceOpen ? (
        <AppearanceModal current={themePreference} onChange={chooseTheme} onClose={() => setAppearanceOpen(false)} />
      ) : null}

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {marketError ? (
          <div className="mb-5 rounded-lg border border-ember/45 bg-ember/10 px-4 py-3 text-sm font-bold text-ember" role="alert">
            {marketError}
          </div>
        ) : null}
        {marketReady ? <>{children}</> : <MarketBootPlaceholder />}
      </main>
      <SiteFooter />
    </div>
  );
}

function MarketBootPlaceholder() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading current market data">
      <div className="rmi-hero market-grid rmi-noise grid min-h-[230px] overflow-hidden lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.55fr)]">
        <div className="grid content-center gap-4 px-5 py-8 sm:px-8">
          <div className="h-3 w-32 rounded bg-cyan/10 motion-safe:animate-pulse" />
          <div className="h-10 w-full max-w-lg rounded bg-panelSoft motion-safe:animate-pulse" />
          <div className="h-4 w-full max-w-md rounded bg-panelSoft motion-safe:animate-pulse" />
          <div className="h-11 w-full max-w-xl rounded-md bg-panelSoft motion-safe:animate-pulse" />
        </div>
        <div className="grid divide-y divide-line border-t border-line bg-panelSoft/45 lg:border-l lg:border-t-0">
          {[0, 1, 2].map((item) => (
            <div key={item} className="grid content-center gap-3 p-5">
              <div className="h-3 w-24 rounded bg-panel motion-safe:animate-pulse" />
              <div className="h-8 w-full rounded bg-panel motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rmi-metric h-20 motion-safe:animate-pulse" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
        <div className="rmi-card h-72 motion-safe:animate-pulse" />
        <div className="rmi-card h-72 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

function MarketTape({ artists }: { artists: Artist[] }) {
  return (
    <div className="rmi-tape" aria-label="Current RMI market prices">
      <div className="mx-auto flex min-h-10 max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <Link
          href="/markets"
          className="z-10 flex shrink-0 items-center gap-2 border-r border-line/80 bg-panelSoft/95 pr-5 text-[10px] font-black uppercase tracking-[0.12em]"
        >
          <span className="rmi-live-dot" aria-hidden="true" />
          Market Live
        </Link>
        <div className="market-tape-viewport min-w-0 flex-1 overflow-hidden">
          <div className="market-tape-track flex h-full w-max items-center">
            <MarketTapeGroup artists={artists} />
            <MarketTapeGroup artists={artists} duplicate />
          </div>
        </div>
      </div>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="market-grid relative mt-10 overflow-hidden border-t border-cyan/20 bg-panelSoft/75">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan to-transparent opacity-70" />
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-9 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_0.7fr_0.7fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-2 font-black">
            <span className="rmi-brand-mark grid h-8 w-8 place-items-center rounded-md"><Activity className="h-4 w-4 text-cyan" aria-hidden="true" /></span>
            RMI
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-paper/55">
            A fantasy market for tracking artist momentum, verified catalysts, and portfolio performance.
          </p>
          <p className="mt-3 text-xs leading-5 text-paper/40">No real money, cash-out, or artist affiliation.</p>
        </div>
        <FooterColumn
          title="Market"
          links={[
            ["Markets", "/markets"],
            ["News", "/news"],
            ["Scout", "/scout"]
          ]}
        />
        <FooterColumn
          title="Compete"
          links={[
            ["Portfolio", "/portfolio"],
            ["Watchlist", "/watchlist"],
            ["Rankings", "/leaderboard"]
          ]}
        />
        <div>
          <h2 className="rmi-data-label">About RMI</h2>
          <p className="mt-3 text-sm leading-6 text-paper/55">
            Quotes update from audience momentum, media coverage, verified events, and market activity.
          </p>
          <Link href="/about" className="mt-3 inline-flex text-sm font-black text-cyan hover:text-cyan/75">
            How the market works
          </Link>
          <div className="mt-3 flex gap-4 text-xs font-bold text-paper/50">
            <Link href="/help" className="hover:text-cyan">Help</Link>
            <Link href="/privacy" className="hover:text-cyan">Privacy</Link>
            <Link href="/terms" className="hover:text-cyan">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h2 className="rmi-data-label">{title}</h2>
      <div className="mt-3 grid gap-2 text-sm font-bold text-paper/60">
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="hover:text-cyan">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function MarketTapeGroup({ artists, duplicate = false }: { artists: Artist[]; duplicate?: boolean }) {
  return (
    <div className="flex h-full shrink-0 items-center" aria-hidden={duplicate || undefined}>
      {artists.map((artist) => (
        <Link
          key={`${duplicate ? "copy" : "primary"}-${artist.id}`}
          href={`/artists/${artist.id}`}
          tabIndex={duplicate ? -1 : undefined}
          className="flex h-full shrink-0 items-center gap-2 border-r border-line/35 px-4 text-xs hover:bg-cyan/5"
        >
          <span className="font-black text-cyan">{artist.ticker}</span>
          <span className="number-tabular text-paper/65">{formatCurrency(artist.currentPrice)}</span>
          <span className={clsx("font-black number-tabular", artist.dailyChangePercent >= 0 ? "text-mint" : "text-ember")}>
            {formatPercent(artist.dailyChangePercent)}
          </span>
        </Link>
      ))}
    </div>
  );
}

function AppearanceModal({
  current,
  onChange,
  onClose
}: {
  current: ThemePreference;
  onChange: (preference: ThemePreference) => void;
  onClose: () => void;
}) {
  const options: Array<{ value: ThemePreference; label: string; icon: React.ReactNode }> = [
    { value: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
    { value: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
    { value: "system", label: "System", icon: <Monitor className="h-4 w-4" /> }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
      <div className="rmi-card market-grid w-full max-w-lg p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black">Appearance</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-panelSoft" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={clsx(
                "flex items-center justify-between rounded-md border px-4 py-3 text-left text-sm font-black",
                current === option.value ? "border-cyan bg-cyan/10" : "border-line bg-panelSoft hover:border-cyan"
              )}
            >
              <span className="flex items-center gap-3">
                {option.icon}
                {option.label}
              </span>
              <span className={clsx("h-4 w-4 rounded-full border", current === option.value ? "border-mint bg-mint" : "border-paper/35")} />
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="rmi-button-primary mt-5 h-11 w-full rounded-md text-sm font-black">
          Done
        </button>
      </div>
    </div>
  );
}
