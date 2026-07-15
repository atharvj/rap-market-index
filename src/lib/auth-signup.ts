export function isObfuscatedExistingSignup(
  user: { identities?: unknown[] | null } | null | undefined
) {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}
