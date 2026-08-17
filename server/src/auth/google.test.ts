import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdTokenMock = vi.fn();

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(function () {
    return { verifyIdToken: verifyIdTokenMock };
  }),
}));

const { getGoogleUserFromIdToken } = await import("./google.js");

describe("getGoogleUserFromIdToken", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
  });

  it("returns sub and email from a verified payload", async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub-1", email: "user@example.com" }),
    });

    const result = await getGoogleUserFromIdToken("fake.id.token");

    expect(result).toEqual({ sub: "google-sub-1", email: "user@example.com" });
  });

  it("returns undefined email when the payload has no email", async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub-1" }),
    });

    const result = await getGoogleUserFromIdToken("fake.id.token");

    expect(result).toEqual({ sub: "google-sub-1", email: undefined });
  });

  it("throws when the verified payload is missing sub", async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => ({ email: "user@example.com" }),
    });

    await expect(getGoogleUserFromIdToken("fake.id.token")).rejects.toThrow(
      "id_token missing sub",
    );
  });

  it("throws when verifyIdToken returns no payload at all", async () => {
    verifyIdTokenMock.mockResolvedValue({
      getPayload: () => undefined,
    });

    await expect(getGoogleUserFromIdToken("fake.id.token")).rejects.toThrow(
      "id_token missing sub",
    );
  });

  it("propagates rejection when Google verification fails", async () => {
    verifyIdTokenMock.mockRejectedValue(new Error("Token used too late"));

    await expect(getGoogleUserFromIdToken("fake.id.token")).rejects.toThrow(
      "Token used too late",
    );
  });
});
