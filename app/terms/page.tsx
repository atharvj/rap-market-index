import Link from "next/link";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan">RMI Policy</p>
        <h1 className="mt-2 text-3xl font-black">Terms of Use</h1>
        <p className="mt-2 text-sm text-paper/50">Effective July 10, 2026</p>
      </header>

      <PolicySection title="Fantasy Market Only">
        RMI is an entertainment game using fictional cash. Quotes, holdings, and returns have no cash value, cannot be withdrawn, and are not financial products or investment advice.
      </PolicySection>
      <PolicySection title="Fair Play">
        Do not automate orders, create accounts to manipulate quotes or rankings, exploit defects, impersonate another person, or interfere with the service. RMI may exclude suspicious activity, halt trading, or restrict an account to protect market integrity.
      </PolicySection>
      <PolicySection title="Market Data">
        Quotes are model-generated estimates based on available audience, media, event, and eligible order-flow signals. Sources can be delayed, incomplete, or wrong, so RMI may correct data and rebase quotes when its model changes.
      </PolicySection>
      <PolicySection title="Profiles and Content">
        Use a lawful display name and profile image that you have permission to use. Do not upload abusive, deceptive, infringing, or malicious content.
      </PolicySection>
      <PolicySection title="Availability">
        RMI may change features, pause an artist or the full market, reverse a broken operation, or discontinue beta functionality. The service is provided without a guarantee of uninterrupted availability.
      </PolicySection>

      <Link href="/about" className="inline-flex text-sm font-black text-cyan hover:text-cyan/75">How RMI Works</Link>
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
