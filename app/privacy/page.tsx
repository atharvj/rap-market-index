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
    id: "controls",
    title: "Your Controls",
    body: "You can edit your display name, profile details, avatar, favorite artists, and public visibility. A non-administrator account can be permanently deleted from Account Settings after password verification. Deletion removes the authentication user and associated profile, portfolio, watchlist, and trading records."
  },
  {
    id: "security",
    title: "Security and Retention",
    body: "RMI separates public market data from authenticated account data, validates protected requests, and limits administrative operations to authorized accounts. Operational logs are retained only as needed to run, diagnose, and protect the service. No internet service can guarantee absolute security."
  }
];

export default function PrivacyPage() {
  return (
    <PolicyDocument
      title="Privacy Policy"
      summary="This policy explains what account information RMI uses, what other traders can see, and the controls available to you."
      effectiveDate="July 11, 2026"
      sections={sections}
      link={{ href: "/settings", label: "Open Account Settings" }}
    />
  );
}
