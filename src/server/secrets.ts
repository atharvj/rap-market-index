import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export function secureCompare(candidate: string | null | undefined, expected: string | null | undefined) {
  if (!candidate || !expected) {
    return false;
  }

  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}
