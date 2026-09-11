import { PolicyDocument } from "@/components/PolicyDocument";

const sections = [
  {
    id: "information",
    title: "Information RMI Stores",
    body: "RMI stores your email address, account identifier, display name, optional profile details, avatar, watchlist, fantasy holdings, and trade history. Passwords are processed by Supabase Auth and are not available to RMI administrators."
  },
  {
    id: "public-data",
    title: "Public Profile Information",
    body: "Public rankings can show your display name, avatar, administrator badge, and fantasy performance. Email addresses and complete trade history are not published. Profile and portfolio visibility can be changed from Account Settings."
  },
  {
    id: "service-providers",
    title: "Service Providers",
    body: "RMI uses Supabase for authentication and database storage and Vercel for hosting. Artist images, supporting media, and credited news may load from their original publisher, YouTube, Wikimedia, or another identified source."
  },
  {
    id: "analytics",
    title: "Product Analytics",
    body: "RMI records limited first-party usage events to understand whether the release experience works: browser sessions, page and artist views, signup starts and completions, first trades, return visits, and optional campaign tags in shared links. Random browser and session identifiers are one-way hashed before storage. This analytics record does not store raw IP addresses, email addresses, passwords, order amounts, or browsing activity outside RMI. Browser Do Not Track is respected, access is limited to authorized operators, and event rows are removed after 180 days."
  },
  {
    id: "controls",
    title: "Your Controls",
    body: "You can edit your display name, profile details, avatar, favorite artists, and public visibility. A non-administrator account can be deleted from Account Settings after password verification or recent Google authentication. Deletion removes the Supabase authentication user—including linked sign-in methods—and the associated profile, portfolio, watchlist, and trading records. It does not delete the user's Google account."
  },
  {
    id: "security",
    title: "Security and Retention",
    body: "RMI separates public market data from authenticated account data, validates protected requests, and limits administrative operations to authorized accounts. After account deletion, RMI retains a keyed, non-public fingerprint of the normalized email and the deletion time for the 7-day cooldown solely to prevent deletion from being used as a fantasy-cash reset; the raw deleted email is not stored in that record, and daily cleanup removes expired cooldown records. Limited operator test accounts may be exempt from this cooldown. Operational and security logs are retained only as needed to run, diagnose, and protect the service. No internet service can guarantee absolute security."
  }
];

export default function PrivacyPage() {
  return (
    <PolicyDocument
      title="Privacy Policy"
      summary="This policy explains what account information RMI uses, what other traders can see, and the controls available to you."
      effectiveDate="September 5, 2026"
      sections={sections}
      link={{ href: "/settings", label: "Open Account Settings" }}
    />
  );
}
