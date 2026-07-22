export const FEEDBACK_CATEGORIES = ["bug", "data", "account", "idea", "other"] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_MESSAGE_MIN_LENGTH = 15;
export const FEEDBACK_MESSAGE_MAX_LENGTH = 4000;

export type ValidFeedbackSubmission = {
  category: FeedbackCategory;
  message: string;
  contactEmail: string | null;
};

export function hasFilledFeedbackHoneypot(input: unknown) {
  if (!isRecord(input)) {
    return false;
  }

  return typeof input.website === "string" && Boolean(input.website.trim());
}

export function validateFeedbackSubmission(
  input: unknown
): { ok: true; value: ValidFeedbackSubmission } | { ok: false; error: string } {
  if (!isRecord(input)) {
    return { ok: false, error: "Enter feedback before submitting." };
  }

  const category = typeof input.category === "string" ? input.category : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const contactEmail = typeof input.contactEmail === "string" ? input.contactEmail.trim().toLowerCase() : "";

  if (!FEEDBACK_CATEGORIES.includes(category as FeedbackCategory)) {
    return { ok: false, error: "Choose a feedback category." };
  }

  if (message.length < FEEDBACK_MESSAGE_MIN_LENGTH || message.length > FEEDBACK_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Feedback must be ${FEEDBACK_MESSAGE_MIN_LENGTH}-${FEEDBACK_MESSAGE_MAX_LENGTH} characters.`
    };
  }

  if (contactEmail && !isValidContactEmail(contactEmail)) {
    return { ok: false, error: "Enter a valid contact email or leave it blank." };
  }

  return {
    ok: true,
    value: {
      category: category as FeedbackCategory,
      message,
      contactEmail: contactEmail || null
    }
  };
}

function isValidContactEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
