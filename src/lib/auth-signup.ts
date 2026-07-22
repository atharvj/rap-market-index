export const EMAIL_CONFIRMATION_PENDING_KEY = "rmi.email-confirmation-pending";

export function isObfuscatedExistingSignup(
  user: { identities?: unknown[] | null } | null | undefined
) {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}
