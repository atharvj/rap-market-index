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
    body: "Provide accurate registration information, protect your login credentials, and use only accounts you are authorized to control. Email confirmation may be required before trading. You are responsible for activity performed through your account."
  },
  {
    id: "fair-play",
    title: "Fair Play",
    body: "Do not automate orders, coordinate accounts to manipulate quotes or rankings, exploit defects, impersonate another person, scrape protected account data, or interfere with the service. RMI may exclude suspicious activity, pause trading, reverse a broken operation, or restrict an account to protect fair play."
  },
  {
    id: "market-data",
    title: "Quotes and Market Data",
    body: "Quotes are model-generated fantasy estimates based on available audience, media, event, and eligible order-flow signals. Sources can be delayed, incomplete, duplicated, or wrong. RMI may correct source data, update its model, or rebase quotes while preserving an audit trail of the change."
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
      effectiveDate="July 11, 2026"
      sections={sections}
      link={{ href: "/about", label: "Read How RMI Works" }}
    />
  );
}
