export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_REQUIREMENTS =
  "Use 2-32 characters: letters, numbers, spaces, periods, hyphens, or underscores.";

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]+(?: [A-Za-z0-9_.-]+)*$/;

export function normalizeUsernameInput(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function getUsernameValidationError(value: string) {
  const normalized = normalizeUsernameInput(value);

  if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAX_LENGTH) {
    return USERNAME_REQUIREMENTS;
  }

  return USERNAME_PATTERN.test(normalized) ? null : USERNAME_REQUIREMENTS;
}

export function normalizeUsernameKey(value: string) {
  return normalizeUsernameInput(value).toLocaleLowerCase("en-US");
}
