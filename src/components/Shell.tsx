"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import clsx from "clsx";
import {
  BarChart3,
  Newspaper,
  LogIn,
  LogOut,
  Search,
  Star,
  UserCircle,
  UserPlus,
  Trophy,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const navItems = [
  { href: "/", label: "Market", icon: BarChart3 },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/news", label: "News", icon: Newspaper }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { portfolioValue, state, gainPercent } = useGame();
  const { session, user, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const tapeArtists = useMemo(
    () =>
      [...state.artists]
        .sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent))
        .slice(0, 12),
    [state.artists]
  );
  const searchSuggestions = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    if (!normalized) {
      return tapeArtists.slice(0, 6);
    }

    return state.artists
      .filter(
        (artist) =>
          artist.name.toLowerCase().includes(normalized) ||
          artist.ticker.toLowerCase().includes(normalized)
      )
      .slice(0, 6);
  }, [search, state.artists, tapeArtists]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = search.trim().toLowerCase();

    if (!normalized) {
      return;
    }

    const match = state.artists.find(
      (artist) =>
        artist.ticker.toLowerCase() === normalized ||
        artist.name.toLowerCase().includes(normalized) ||
        artist.ticker.toLowerCase().includes(normalized)
    );

    if (match) {
      setSearchFocused(false);
      router.push(`/artists/${match.id}`);
    }
  }

  async function handleSignOut() {
    setAccountOpen(false);
    await signOut();
    router.push("/");
  }

  const accountLabel =
    session && state.username && state.username !== "Demo Guest" ? state.username : user?.email?.split("@")[0] ?? "Guest";
  const accountInitial = (accountLabel.trim()[0] ?? "A").toUpperCase();

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-panel">
        <div className="border-b border-line">
          <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <Link href="/" className="flex shrink-0 items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded border border-brass/30 bg-brass/10 text-brass">
                <img src="/logo.svg" alt="" className="h-6 w-6" />
              </div>
              <div className="leading-tight">
                <p className="text-lg font-black">Rap Market Index</p>
                <p className="hidden text-[11px] font-bold uppercase tracking-wide text-paper/50 sm:block">
                  Virtual rap exchange
                </p>
              </div>
            </Link>

            <form onSubmit={submitSearch} className="relative hidden min-w-0 flex-1 md:block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/40" />
              <input
                className="h-10 w-full rounded-full border border-line bg-panelSoft pl-11 pr-4 text-sm font-bold outline-none placeholder:text-paper/40 focus:border-cyan focus:bg-panel"
                placeholder="Search artists or tickers"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => {
                  window.setTimeout(() => setSearchFocused(false), 140);
                }}
              />
              {searchFocused ? (
                <div className="absolute left-0 right-0 top-12 z-40 rounded-2xl border border-line bg-panel p-4 shadow-2xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-black">Trending Artists</h2>
                    {search.trim() ? (
                      <span className="text-xs font-bold text-paper/45">{searchSuggestions.length} matches</span>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {searchSuggestions.map((artist) => (
                      <Link
                        key={artist.id}
                        href={`/artists/${artist.id}`}
                        onClick={() => setSearchFocused(false)}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-full bg-panelSoft px-3 py-2 hover:bg-brass/10"
                      >
                        <span className="min-w-0">
                          <span className="font-black text-cyan">{artist.ticker}</span>{" "}
                          <span className="font-bold text-paper">{artist.name}</span>
                        </span>
                        <span
                          className={clsx(
                            "shrink-0 text-xs font-black number-tabular",
                            artist.dailyChangePercent >= 0 ? "text-mint" : "text-ember"
                          )}
                        >
                          {formatPercent(artist.dailyChangePercent)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </form>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {session ? (
                <>
                  <Link
                    href="/portfolio"
                    className="hidden min-w-0 rounded border border-line bg-panel px-3 py-2 text-xs font-bold hover:border-cyan lg:block"
                  >
                    <span className="text-paper/50">Portfolio</span>{" "}
                    <span className="number-tabular">{formatCurrency(portfolioValue)}</span>
                  </Link>
                  <Link
                    href="/account"
                    className="hidden min-w-0 rounded border border-line bg-panel px-3 py-2 text-xs font-bold hover:border-cyan sm:block"
                  >
                    <span className="text-paper/50">Cash</span>{" "}
                    <span className="number-tabular">{formatCurrency(state.cashBalance)}</span>
                  </Link>
                  <span
                    className={clsx(
                      "hidden rounded border px-3 py-2 text-xs font-black number-tabular sm:inline-flex",
                      gainPercent >= 0
                        ? "border-mint/20 bg-mint/[0.08] text-mint"
                        : "border-ember/20 bg-ember/[0.08] text-ember"
                    )}
                  >
                    {formatPercent(gainPercent)}
                  </span>
                </>
              ) : null}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountOpen((value) => !value)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panelSoft text-sm font-black hover:border-cyan"
                  aria-label="Open account menu"
                  aria-expanded={accountOpen}
                >
                  {session ? accountInitial : <UserCircle className="h-5 w-5 text-paper/60" aria-hidden="true" />}
                </button>
                {accountOpen ? (
                  <div className="absolute right-0 top-12 w-80 rounded border border-line bg-panel p-4 shadow-2xl">
                    <div className="flex items-center gap-3 border-b border-line pb-4">
                      <div className="grid h-14 w-14 place-items-center rounded bg-panelSoft text-2xl font-black">
                        {session ? accountInitial : <UserCircle className="h-8 w-8 text-paper/55" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black">{accountLabel}</p>
                        <p className="truncate text-sm font-bold text-paper/50">
                          {session ? user?.email : "Sign in to trade and save watchlists"}
                        </p>
                      </div>
                    </div>
                    {session ? (
                      <>
                        <div className="grid gap-2 py-3 text-sm font-bold">
                          <Link
                            href="/portfolio"
                            onClick={() => setAccountOpen(false)}
                            className="rounded px-2 py-2 hover:bg-panelSoft"
                          >
                            Portfolio
                          </Link>
                          <Link
                            href="/account"
                            onClick={() => setAccountOpen(false)}
                            className="rounded px-2 py-2 hover:bg-panelSoft"
                          >
                            Manage account
                          </Link>
                          <Link
                            href="/watchlist"
                            onClick={() => setAccountOpen(false)}
                            className="rounded px-2 py-2 hover:bg-panelSoft"
                          >
                            Watchlist
                          </Link>
                        </div>
                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="flex w-full items-center gap-2 border-t border-line pt-3 text-left text-sm font-black text-paper hover:text-ember"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </button>
                      </>
                    ) : (
                      <div className="grid gap-2 pt-4 text-sm font-black">
                        <Link
                          href="/account?mode=signup"
                          onClick={() => setAccountOpen(false)}
                          className="flex min-h-11 items-center justify-center gap-2 rounded bg-paper px-4 text-white hover:bg-paper/90"
                        >
                          <UserPlus className="h-4 w-4" />
                          Create account
                        </Link>
                        <Link
                          href="/account"
                          onClick={() => setAccountOpen(false)}
                          className="flex min-h-11 items-center justify-center gap-2 rounded border border-line hover:border-cyan"
                        >
                          <LogIn className="h-4 w-4" />
                          Sign in
                        </Link>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-line bg-panel">
          <nav className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8" aria-label="Primary">
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex min-h-9 shrink-0 items-center gap-2 rounded px-3 text-sm font-bold transition",
                    active
                      ? "bg-brass/12 text-brass"
                      : "text-paper/70 hover:bg-panelSoft hover:text-paper"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="bg-panel">
          <div className="mx-auto flex max-w-[1440px] items-center gap-4 overflow-x-auto px-4 py-2 text-xs scrollbar-thin sm:px-6 lg:px-8">
            <span className="sticky left-0 z-10 shrink-0 bg-panel pr-2 font-black text-paper">RMI Markets</span>
            {tapeArtists.map((artist) => (
              <Link key={artist.id} href={`/artists/${artist.id}`} className="flex shrink-0 items-center gap-2">
                <span className="font-black text-cyan">{artist.ticker}</span>
                <span className="number-tabular text-paper/70">{formatCurrency(artist.currentPrice)}</span>
                <span className={clsx("font-black number-tabular", artist.dailyChangePercent >= 0 ? "text-mint" : "text-ember")}>
                  {formatPercent(artist.dailyChangePercent)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-12rem)] max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="border-t border-line bg-[#eef2f5]">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-12 text-sm text-paper/70 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded border border-brass/30 bg-white text-brass">
                <img src="/logo.svg" alt="" className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xl font-black text-paper">Rap Market Index</p>
                <p className="text-xs font-bold uppercase tracking-wide text-paper/45">Virtual rap exchange</p>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-6 text-paper/60">
              Artist prices, market news, portfolios, and leaderboards for fantasy rap trading.
            </p>
            <p className="mt-4 max-w-sm text-xs font-bold uppercase leading-5 tracking-wide text-paper/45">
              No real money. No cash-out. Not affiliated with any artists, labels, or platforms.
            </p>
          </div>

          <FooterColumn title="Market">
            <Link href="/">Now Trading</Link>
            <Link href="/news">News</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/watchlist">Watchlist</Link>
          </FooterColumn>

          <FooterColumn title="Account">
            <Link href="/portfolio">Portfolio</Link>
            <Link href="/account">Profile</Link>
            <Link href="/account?mode=signup">Create account</Link>
            <Link href="/dev">Admin console</Link>
          </FooterColumn>

          <FooterColumn title="About">
            <span>RMI Score: 1-99 artist market signal</span>
            <span>Fantasy trading only</span>
            <span>Data may update daily or during admin runs</span>
            <span>Public beta</span>
          </FooterColumn>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-black text-paper">{title}</h2>
      <div className="mt-4 grid gap-3 font-bold text-paper/58 [&_a:hover]:text-cyan">{children}</div>
    </div>
  );
}
