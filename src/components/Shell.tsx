"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from "@/lib/theme";
import type { Artist } from "@/lib/types";
import clsx from "clsx";
import { LogOut, Monitor, Moon, SlidersHorizontal, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const navItems = [
  { href: "/markets", label: "Markets" },
  { href: "/scout", label: "Scout" },
  { href: "/news", label: "News" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Rankings" }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { portfolioValue, state, gainPercent, isAdminUser, avatarUrl, marketReady } = useGame();
  const { session, user, signOut } = useAuth();
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
    <div className="min-h-screen bg-ink text-paper">
      <header className="border-b border-line/70">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-black" aria-label="RMI home">
            <SlidersHorizontal className="h-5 w-5 text-cyan" aria-hidden="true" />
            <span>RMI</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-5 text-sm font-bold text-paper/70 md:flex" aria-label="Primary">
            {navItems.map((item) => {
              const active = pathname === item.href || (item.href === "/leaderboard" && pathname === "/rankings");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx("hover:text-paper", active ? "text-paper" : "text-paper/70")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div ref={accountMenuRef} className="relative ml-auto">
            {session ? (
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel text-sm font-black hover:border-cyan"
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <UserAvatar avatarUrl={avatarUrl} label={accountLabel} size="sm" />
              </button>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Link
                  href="/account"
                  className="inline-flex min-h-9 items-center rounded-lg border border-line px-4 text-sm font-bold hover:border-cyan"
                >
                  Log in
                </Link>
                <Link
                  href="/account?mode=signup"
                  className="inline-flex min-h-9 items-center rounded-lg bg-paper px-4 text-sm font-bold text-ink hover:bg-paper/90"
                >
                  Sign up
                </Link>
              </div>
            )}

            {accountOpen ? (
              <div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-line bg-panel p-3 shadow-2xl" role="menu">
                <div className="flex items-center gap-3 border-b border-line pb-3">
                  <UserAvatar avatarUrl={avatarUrl} label={accountLabel} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-black">{accountLabel}</p>
                      {isAdminUser ? <AdminBadge compact /> : null}
                    </div>
                    <p className="truncate text-xs font-bold text-paper/45">{user?.email}</p>
                  </div>
                </div>

                <div className="grid gap-1 py-3 text-sm font-bold">
                  <Link href="/account" onClick={() => setAccountOpen(false)} className="rounded-lg px-3 py-2 hover:bg-panelSoft">
                    Manage Account
                  </Link>
                  <Link href="/settings" onClick={() => setAccountOpen(false)} className="rounded-lg px-3 py-2 hover:bg-panelSoft">
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      setAppearanceOpen(true);
                    }}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-panelSoft"
                  >
                    <span>Appearance</span>
                    <span className="text-xs font-black text-paper/45">{themeLabel}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 border-y border-line py-3 text-xs font-bold">
                  <StatMini label="portfolio" value={formatCurrency(portfolioValue)} />
                  <StatMini label="cash" value={formatCurrency(state.cashBalance)} />
                  <StatMini label="today" value={formatPercent(gainPercent)} tone={gainPercent >= 0 ? "good" : "bad"} />
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black hover:bg-panelSoft hover:text-ember"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mx-auto flex max-w-[1440px] items-center gap-2 overflow-x-auto px-4 pb-4 sm:px-6 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold",
                pathname === item.href ? "border-cyan bg-cyan/10 text-paper" : "border-line text-paper/65"
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

      <main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
        {marketReady ? children : <MarketLoadingState />}
      </main>
    </div>
  );
}

function MarketLoadingState() {
  return (
    <div className="space-y-5" aria-label="Loading market data" aria-busy="true">
      <div className="h-8 w-44 rounded bg-panelSoft motion-safe:animate-pulse" />
      <div className="h-12 rounded-xl bg-panelSoft motion-safe:animate-pulse" />
      <div className="overflow-hidden rounded-xl border border-line">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-b-0">
            <div className="h-10 w-10 rounded-full bg-panelSoft motion-safe:animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-panelSoft motion-safe:animate-pulse" />
              <div className="h-2.5 w-20 rounded bg-panelSoft motion-safe:animate-pulse" />
            </div>
            <div className="h-3 w-20 rounded bg-panelSoft motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketTape({ artists }: { artists: Artist[] }) {
  return (
    <div className="flex min-h-10 border-t border-line/70 bg-panelSoft/45" aria-label="Current RMI market prices">
      <Link
        href="/markets"
        className="z-10 flex shrink-0 items-center gap-2 border-r border-line bg-panelSoft px-4 text-xs font-black sm:px-6"
      >
        <span className="h-2 w-2 rounded-full bg-mint" aria-hidden="true" />
        RMI Market
      </Link>
      <div className="market-tape-viewport min-w-0 flex-1 overflow-hidden">
        <div className="market-tape-track flex h-full w-max items-center">
          <MarketTapeGroup artists={artists} />
          <MarketTapeGroup artists={artists} duplicate />
        </div>
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
          className="flex h-full shrink-0 items-center gap-2 border-r border-line/60 px-4 text-xs hover:bg-panelSoft"
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

function StatMini({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] uppercase text-paper/40">{label}</p>
      <p
        className={clsx(
          "truncate text-xs font-black number-tabular",
          tone === "good" && "text-mint",
          tone === "bad" && "text-ember"
        )}
      >
        {value}
      </p>
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
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-2xl">
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
                "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-black",
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
        <button type="button" onClick={onClose} className="mt-5 h-11 w-full rounded-xl bg-paper text-sm font-black text-ink">
          Done
        </button>
      </div>
    </div>
  );
}
