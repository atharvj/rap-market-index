import { PolicyDocument } from "@/components/PolicyDocument";

const sections = [
  {
    id: "fantasy-market",
    title: "Fantasy Market Only",
    body: "RMI is an entertainment game using fictional cash. Quotes, holdings, and returns have no cash value, cannot be deposited or withdrawn, and are not securities, financial products, gambling proceeds, or investment advice."
  },
  {
    id: "accounts",
    title: "Accounts and Access",
    body: "Provide accurate registration information, protect your login credentials, and maintain only one RMI account. A verified email/password login and Google login using the same email may be linked to that one account. Email confirmation may be required before trading, and you are responsible for activity performed through your account."
  },
  {
    id: "fair-play",
    title: "Fair Play",
    body: "Do not create or coordinate multiple accounts, delete and recreate an account to reset fantasy cash or rankings, automate orders, manipulate quotes, exploit defects, impersonate another person, scrape protected account data, or interfere with the service. Deleted accounts have a 7-day recreation cooldown; limited operator test accounts may be exempt. RMI may exclude suspicious activity, pause trading, reverse a broken operation, or restrict an account to protect fair play."
  },
  {
    id: "market-data",
    title: "Quotes and Market Data",
    body: "Quotes are model-generated fantasy estimates based on available audience, media, event, and eligible order-flow signals. Sources can be delayed, incomplete, duplicated, or wrong. RMI may correct source data or update its model. Routine market runs remain subject to movement limits, while any exceptional baseline correction is handled separately from daily performance."
  },
  {
    id: "profiles",
    title: "Profiles and Uploaded Content",
    body: "Use a lawful display name, biography, and image that you have permission to publish. Do not upload abusive, deceptive, infringing, malicious, or privacy-invasive content."
  },
  {
    id: "availability",
    title: "Availability and Changes",
    body: "RMI may change features, pause an artist or the full market, remove unreliable data, or discontinue functionality. The service is provided without a guarantee of uninterrupted availability or a guarantee that any quote will match public opinion."
  }
];

export default function TermsPage() {
  return (
    <PolicyDocument
      title="Terms of Use"
      summary="These terms establish the rules for using RMI's fantasy artist market and participating in its public rankings."
      effectiveDate="July 21, 2026"
      sections={sections}
      link={{ href: "/about", label: "Read How RMI Works" }}
    />
  );
}
