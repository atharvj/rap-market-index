import type { User } from "@supabase/supabase-js";

export function getGoogleSignupAvatarUrl(
  user: Pick<User, "identities" | "user_metadata">
) {
  const googleIdentity = user.identities?.find((identity) => identity.provider === "google");

  if (!googleIdentity) {
    return undefined;
  }

  const identityData = googleIdentity.identity_data;
  const candidates = [
    identityData?.avatar_url,
    identityData?.picture,
    user.user_metadata?.avatar_url,
    user.user_metadata?.picture
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    try {
      const url = new URL(candidate);
      const trustedHost =
        url.hostname === "googleusercontent.com" ||
        url.hostname.endsWith(".googleusercontent.com");

      if (url.protocol === "https:" && trustedHost) {
        return url.toString();
      }
    } catch {
      // Ignore malformed identity metadata.
    }
  }

  return undefined;
}
