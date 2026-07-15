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

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "discard.email",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getnada.com",
  "grr.la",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "mail.tm",
  "maildrop.cc",
  "mailinator.com",
  "minuteinbox.com",
  "mohmal.com",
  "sharklasers.com",
  "spamgourmet.com",
  "temp-mail.org",
  "tempail.com",
  "tempmail.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com"
]);

export function getEmailDomain(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  const separator = normalized?.lastIndexOf("@") ?? -1;

  if (!normalized || separator <= 0 || separator === normalized.length - 1) {
    return null;
  }

  return normalized.slice(separator + 1).replace(/\.$/, "");
}

export function isDisposableEmailAddress(email: string | null | undefined) {
  const domain = getEmailDomain(email);

  if (!domain) {
    return false;
  }

  return Array.from(DISPOSABLE_EMAIL_DOMAINS).some(
    (blockedDomain) => domain === blockedDomain || domain.endsWith(`.${blockedDomain}`)
  );
}

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

  if (suggestion) {
    return `Check this address. Did you mean ${suggestion}?`;
  }

  return isDisposableEmailAddress(email)
    ? "Use a permanent email address. Temporary email services are not allowed."
    : null;
}
