"use client";

import { useAuth } from "@/components/AuthProvider";
import { RmiSection } from "@/components/RmiPrimitives";
import { formatCurrency, formatShares } from "@/lib/formatters";
import type { Artist, Transaction } from "@/lib/types";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TransactionHistoryResponse = {
  ok: boolean;
  error?: string;
  transactions?: Transaction[];
  pagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
};

const PAGE_SIZE = 20;

export function TransactionHistory({
  artists,
  initialTransactions
}: {
  artists: Artist[];
  initialTransactions: Transaction[];
}) {
  const { session } = useAuth();
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(initialTransactions.slice(0, PAGE_SIZE));
  const [totalCount, setTotalCount] = useState(initialTransactions.length);
  const [totalPages, setTotalPages] = useState(initialTransactions.length ? 1 : 0);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState("");
  const artistById = useMemo(() => new Map(artists.map((artist) => [artist.id, artist])), [artists]);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetch(`/api/profile/transactions?page=${page}&pageSize=${PAGE_SIZE}`, {
      signal: controller.signal,
      headers: { authorization: `Bearer ${session.access_token}` }
    })
      .then(async (response) => {
        const payload = await response.json() as TransactionHistoryResponse;

        if (!response.ok || !payload.ok || !payload.pagination) {
          throw new Error(payload.error || "Could not load transaction history.");
        }

        setItems(payload.transactions ?? []);
        setTotalCount(payload.pagination.totalCount);
        setTotalPages(payload.pagination.totalPages);
      })
      .catch((fetchError: unknown) => {
        if (!controller.signal.aborted) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not load transaction history.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [page, session?.access_token]);

  return (
    <RmiSection
      title="Transaction History"
      subtitle={totalCount
        ? `${totalCount.toLocaleString("en-US")} executed fantasy trade${totalCount === 1 ? "" : "s"} in this account.`
        : "Every executed fantasy trade in this account appears here."}
    >
      {error ? (
        <div className="border-b border-line bg-ember/8 px-4 py-3 text-sm font-medium text-ember" role="alert">
          {error} Showing the locally synced history when available.
        </div>
      ) : null}
      {loading ? (
        <div className="flex min-h-32 items-center justify-center gap-2 text-sm font-medium text-paper/50" aria-busy="true">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading transaction history
        </div>
      ) : items.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="rmi-table-head grid grid-cols-[minmax(150px,1fr)_76px_90px_100px_100px_90px_156px] gap-3 px-4 py-3 text-xs text-paper/45">
              <span>Artist</span>
              <span>Side</span>
              <span className="text-right">Shares</span>
              <span className="text-right">Fill</span>
              <span className="text-right">Gross</span>
              <span className="text-right">Fee</span>
              <span className="text-right">Executed</span>
            </div>
            {items.map((transaction) => {
              const artist = artistById.get(transaction.artistId);
              const positiveSide = transaction.type === "buy" || transaction.type === "cover";

              return (
                <div
                  key={transaction.id}
                  className="rmi-table-row grid grid-cols-[minmax(150px,1fr)_76px_90px_100px_100px_90px_156px] items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{artist?.name ?? transaction.artistId}</span>
                    <span className="block text-xs text-paper/40">{artist ? `$${artist.ticker}` : transaction.artistId}</span>
                  </span>
                  <span className={clsx("font-semibold capitalize", positiveSide ? "text-mint" : "text-ember")}>
                    {transaction.type}
                  </span>
                  <span className="text-right font-semibold number-tabular">{formatShares(transaction.shares)}</span>
                  <span className="text-right font-semibold number-tabular">{formatCurrency(transaction.price)}</span>
                  <span className="text-right font-semibold number-tabular">
                    {formatCurrency(transaction.grossValue ?? transaction.shares * transaction.price)}
                  </span>
                  <span className="text-right font-semibold number-tabular">{formatCurrency(transaction.commission ?? 0)}</span>
                  <time className="text-right text-xs font-medium text-paper/50" dateTime={transaction.createdAt}>
                    {formatTransactionDate(transaction.createdAt)}
                  </time>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-5 text-sm text-paper/55">No executed trades yet.</div>
      )}

      {!loading && totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <button
            type="button"
            className="rmi-button-secondary inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-35"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
          </button>
          <span className="text-xs font-semibold text-paper/50 number-tabular">Page {page} of {totalPages}</span>
          <button
            type="button"
            className="rmi-button-secondary inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-35"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
          >
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </RmiSection>
  );
}

function formatTransactionDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}
