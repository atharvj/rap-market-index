"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from "@/lib/theme";
import clsx from "clsx";
import {
  Activity,
  BarChart3,
  Home,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Newspaper,
  Search,
  Star,
  Sun,
  UserCircle,
  UserPlus,
  Trophy,
  WalletCards,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/markets", label: "Now Trading", icon: BarChart3 },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/portfolio", label: "Portfolio", icon: WalletCards },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { portfolioValue, state, gainPercent } = useGame();
  const { session, user, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
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

  function chooseTheme(preference: ThemePreference) {
    setThemePreference(preference);
    setResolvedTheme(applyThemePreference(preference));
  }

  function openAppearance() {
    setAccountOpen(false);
    setAppearanceOpen(true);
  }

  const themeLabel =
    themePreference === "system" ? `System (${resolvedTheme})` : themePreference === "dark" ? "Dark" : "Light";

  const accountLabel =
    session && state.username && state.username !== "Demo Guest" ? state.username : user?.email?.split("@")[0] ?? "Guest";
  const accountInitial = (accountLabel.trim()[0] ?? "A").toUpperCase();

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-panel">
        <div className="border-b border-line">
          <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
            <Link href="/" className="flex shrink-0 items-center" aria-label="Rap Market Index home">
              <img src="/logo.svg" alt="Rap Market Index" className="h-10 w-auto max-w-[148px]" />
            </Link>

            <form onSubmit={submitSearch} className="relative hidden min-w-0 flex-1 md:block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/40" />
              <input
                className="h-9 w-full rounded-full border border-line bg-panelSoft pl-11 pr-4 text-sm font-semibold outline-none placeholder:text-paper/40 focus:border-cyan focus:bg-panel"
                placeholder="Search artists or tickers"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => {
                  window.setTimeout(() => setSearchFocused(false), 140);
                }}
              />
              {searchFocused ? (
                <div className="absolute left-0 right-0 top-11 z-40 rounded-2xl border border-line bg-panel p-4 shadow-2xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-black">Trending Artists</h2>
                    {search.trim() ? (
                      <span className="text-xs font-bold text-paper/45">{searchSuggestions.length} matches</span>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {searchSuggestions.length ? (
                      searchSuggestions.map((artist) => (
                        <Link
                          key={artist.id}
                          href={`/artists/${artist.id}`}
                          onClick={() => setSearchFocused(false)}
                          className="flex min-w-0 items-center justify-between gap-3 rounded-full bg-panelSoft px-3 py-1.5 text-sm hover:bg-brass/10"
                        >
                          <span className="min-w-0">
                            <span className="font-black text-cyan">{artist.ticker}</span>{" "}
                            <span className="font-semibold text-paper">{artist.name}</span>
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
                      ))
                    ) : (
                      <p className="rounded border border-line bg-panelSoft px-3 py-2 text-sm font-bold text-paper/50 sm:col-span-2">
                        No matching artists. Add the artist from the admin console if they belong on the market.
                      </p>
                    )}
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
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panelSoft text-sm font-black hover:border-cyan"
                  aria-label="Open account menu"
                  aria-expanded={accountOpen}
                >
                  {session ? accountInitial : <UserCircle className="h-5 w-5 text-paper/60" aria-hidden="true" />}
                </button>
                {accountOpen ? (
                  <div className="absolute right-0 top-11 w-80 rounded border border-line bg-panel p-4 shadow-2xl">
                    <div className="flex items-center gap-3 border-b border-line pb-4">
                      <div className="grid h-12 w-12 place-items-center rounded bg-panelSoft text-xl font-black">
                        {session ? accountInitial : <UserCircle className="h-7 w-7 text-paper/55" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-black">{accountLabel}</p>
                        <p className="truncate text-xs font-bold text-paper/50">
                          {session ? user?.email : "Sign in to trade and save watchlists"}
                        </p>
                      </div>
                    </div>
                    {session ? (
                      <>
                        <div className="grid gap-1 py-3 text-sm font-bold">
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
                          <button
                            type="button"
                            onClick={openAppearance}
                            className="flex items-center justify-between gap-3 rounded px-2 py-2 text-left hover:bg-panelSoft"
                          >
                            <span>Appearance</span>
                            <span className="text-xs font-black text-paper/45">{themeLabel}</span>
                          </button>
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
                        <button
                          type="button"
                          onClick={openAppearance}
                          className="flex min-h-10 items-center justify-between gap-3 rounded border border-line bg-panelSoft px-3 text-left hover:border-cyan"
                        >
                          <span>Appearance</span>
                          <span className="text-xs font-black text-paper/45">{themeLabel}</span>
                        </button>
                        <Link
                          href="/account?mode=signup"
                          onClick={() => setAccountOpen(false)}
                          className="flex min-h-11 items-center justify-center gap-2 rounded bg-paper px-4 text-ink hover:bg-paper/90"
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

        <div className="border-t border-line bg-panel">
          <div className="flex w-full items-center text-xs">
            <span className="inline-flex min-h-9 shrink-0 items-center gap-2 bg-panel px-4 font-black text-paper sm:px-6 lg:px-8">
              <Activity className="h-4 w-4 text-brass" aria-hidden="true" />
              RMI Markets
            </span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-5 overflow-x-auto px-3 py-2 scrollbar-thin">
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
          </div>
        </div>
      </header>

      {appearanceOpen ? (
        <AppearanceModal
          current={themePreference}
          onChange={chooseTheme}
          onClose={() => setAppearanceOpen(false)}
        />
      ) : null}

      <main className="mx-auto min-h-[calc(100vh-12rem)] max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="border-t border-black bg-black">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-12 text-sm text-white/70 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="Rap Market Index" className="h-9 w-auto max-w-[150px]" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-white/45">Virtual rap exchange</p>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm font-bold leading-6 text-white/60">
              Artist prices, market news, portfolios, and leaderboards for fantasy rap trading.
            </p>
            <p className="mt-4 max-w-sm text-xs font-bold uppercase leading-5 tracking-wide text-white/40">
              No real money. No cash-out. Not affiliated with any artists, labels, or platforms.
            </p>
          </div>

          <FooterColumn title="Market">
            <Link href="/markets">Now Trading</Link>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-panel p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="appearance-title" className="text-2xl font-black">
              Appearance
            </h2>
            <p className="mt-1 text-sm font-bold text-paper/55">Choose how RMI looks on this device.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-line text-paper/60 hover:border-cyan hover:text-cyan"
            aria-label="Close appearance settings"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={clsx(
                "grid gap-4 rounded border p-4 text-left",
                current === option.value
                  ? "border-mint bg-mint/10 text-paper"
                  : "border-line bg-panelSoft text-paper/70 hover:border-cyan"
              )}
            >
              <span className="grid h-24 place-items-center rounded border border-line bg-panel">
                <span className="grid h-11 w-16 place-items-center rounded bg-panelSoft text-paper/70">{option.icon}</span>
              </span>
              <span className="flex items-center gap-2 text-sm font-black">
                <span
                  className={clsx(
                    "h-4 w-4 rounded-full border",
                    current === option.value ? "border-mint bg-mint shadow-[inset_0_0_0_3px_rgb(var(--color-panel))]" : "border-paper/35"
                  )}
                />
                {option.label}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 min-w-28 items-center justify-center rounded-full bg-mint px-6 text-sm font-black text-white hover:bg-mint/90"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-black text-white">{title}</h2>
      <div className="mt-4 grid gap-3 font-bold text-white/60 [&_a:hover]:text-cyan">{children}</div>
    </div>
  );
}
