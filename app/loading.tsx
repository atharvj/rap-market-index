export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <span className="sr-only" role="status">
        Loading market data
      </span>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="rmi-skeleton h-3 w-28 rounded" />
          <div className="rmi-skeleton h-9 w-full max-w-xl rounded" />
          <div className="rmi-skeleton h-4 w-full max-w-md rounded" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rmi-card space-y-4 p-5">
              <div className="rmi-skeleton h-3 w-24 rounded" />
              <div className="rmi-skeleton h-7 w-32 rounded" />
              <div className="rmi-skeleton h-20 w-full rounded" />
            </div>
          ))}
        </div>
        <div className="rmi-card space-y-4 p-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 border-b border-line/70 pb-4 last:border-0 last:pb-0">
              <div className="rmi-skeleton h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="rmi-skeleton h-4 w-40 rounded" />
                <div className="rmi-skeleton h-3 w-24 rounded" />
              </div>
              <div className="rmi-skeleton h-5 w-20 rounded" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
