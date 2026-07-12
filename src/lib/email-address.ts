const COMMON_DOMAIN_CORRECTIONS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmali.com": "gmail.com",
  "gnail.com": "gmail.com",
  "hotnail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com"
};

export function getEmailDomainSuggestion(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  const separator = normalized?.lastIndexOf("@") ?? -1;

  if (!normalized || separator <= 0 || separator === normalized.length - 1) {
    return null;
  }

  const localPart = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  const correctedDomain = COMMON_DOMAIN_CORRECTIONS[domain];

  return correctedDomain ? `${localPart}@${correctedDomain}` : null;
}

export function getEmailDomainWarning(email: string | null | undefined) {
  const suggestion = getEmailDomainSuggestion(email);

  return suggestion ? `Check this address. Did you mean ${suggestion}?` : null;
}
