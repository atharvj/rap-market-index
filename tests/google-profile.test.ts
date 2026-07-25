import { describe, expect, it } from "vitest";
import { getGoogleSignupAvatarUrl } from "@/server/google-profile";

describe("Google profile pictures", () => {
  it("uses a trusted Google picture for a Google identity", () => {
    expect(
      getGoogleSignupAvatarUrl({
        identities: [
          {
            id: "google-user",
            identity_id: "google-identity",
            user_id: "rmi-user",
            identity_data: {
              picture: "https://lh3.googleusercontent.com/a/example"
            },
            provider: "google",
            created_at: "2026-07-24T00:00:00.000Z",
            updated_at: "2026-07-24T00:00:00.000Z",
            last_sign_in_at: "2026-07-24T00:00:00.000Z"
          }
        ],
        user_metadata: {}
      })
    ).toBe("https://lh3.googleusercontent.com/a/example");
  });

  it("ignores profile metadata when the account has no Google identity", () => {
    expect(
      getGoogleSignupAvatarUrl({
        identities: [],
        user_metadata: {
          picture: "https://lh3.googleusercontent.com/a/example"
        }
      })
    ).toBeUndefined();
  });

  it("rejects a non-Google image host", () => {
    expect(
      getGoogleSignupAvatarUrl({
        identities: [
          {
            id: "google-user",
            identity_id: "google-identity",
            user_id: "rmi-user",
            identity_data: {
              picture: "https://example.com/avatar.jpg"
            },
            provider: "google",
            created_at: "2026-07-24T00:00:00.000Z",
            updated_at: "2026-07-24T00:00:00.000Z",
            last_sign_in_at: "2026-07-24T00:00:00.000Z"
          }
        ],
        user_metadata: {}
      })
    ).toBeUndefined();
  });
});
