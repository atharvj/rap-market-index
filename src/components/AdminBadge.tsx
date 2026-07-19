export function AdminBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex w-fit items-center rounded border border-brass/35 bg-brass/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brass">
      {compact ? "Admin" : "RMI Admin"}
    </span>
  );
}
