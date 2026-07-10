import { UserCircle } from "lucide-react";

export function UserAvatar({
  avatarUrl,
  label,
  size = "md"
}: {
  avatarUrl?: string | null;
  label: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizeClass = {
    sm: "h-9 w-9 text-sm",
    md: "h-12 w-12 text-lg",
    lg: "h-28 w-28 text-4xl",
    xl: "h-32 w-32 text-5xl"
  }[size];
  const initial = (label.trim()[0] ?? "A").toUpperCase();

  return (
    <span
      className={`${sizeClass} relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-panelSoft font-black text-paper/75`}
      aria-label={`${label} profile picture`}
    >
      {size === "sm" || size === "md" ? (
        <span>{initial}</span>
      ) : (
        <UserCircle className="h-3/5 w-3/5 text-paper/40" aria-hidden="true" />
      )}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}
