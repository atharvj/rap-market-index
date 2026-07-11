import Link from "next/link";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan">RMI Policy</p>
        <h1 className="mt-2 text-3xl font-black">Privacy</h1>
        <p className="mt-2 text-sm text-paper/50">Effective July 10, 2026</p>
      </header>

      <PolicySection title="What RMI Stores">
        RMI stores your email address, account identifier, display name, optional profile details, watchlist, fantasy holdings, and trade history. Passwords are handled by Supabase Auth and are not available to RMI administrators.
      </PolicySection>
      <PolicySection title="What Other Traders See">
        Email addresses and trade history are never included on public profiles. Rankings show a display name and fantasy performance. You can hide your profile and holdings from Settings.
      </PolicySection>
      <PolicySection title="Service Providers">
        RMI uses Supabase for authentication and database storage and Vercel for hosting. Public news and artist images may load from the credited publisher, YouTube, or Wikimedia.
      </PolicySection>
      <PolicySection title="Your Controls">
        You can edit profile visibility or permanently delete a non-administrator account from Settings. Account deletion removes the authentication user and associated profile, portfolio, watchlist, and trading records.
      </PolicySection>
      <PolicySection title="Security and Retention">
        RMI limits account data through authenticated access controls and keeps operational logs only as needed to run and protect the service. No internet service can promise absolute security.
      </PolicySection>

      <Link href="/settings" className="inline-flex text-sm font-black text-cyan hover:text-cyan/75">Open Privacy Settings</Link>
    </article>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rmi-card p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-paper/65">{children}</p>
    </section>
  );
}
