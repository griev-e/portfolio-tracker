import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secretBox";

const URL_WITH_CREDS = "https://user:pass@bridge.simplefin.org/simplefin";

describe("secretBox", () => {
  const prev = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-for-sealing";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = prev;
  });

  it("round-trips a secret", () => {
    const sealed = sealSecret(URL_WITH_CREDS);
    expect(sealed).not.toContain("user:pass");
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(openSecret(sealed)).toBe(URL_WITH_CREDS);
  });

  it("uses a fresh IV per seal (no deterministic ciphertext)", () => {
    expect(sealSecret(URL_WITH_CREDS)).not.toBe(sealSecret(URL_WITH_CREDS));
  });

  it("passes legacy plaintext through unchanged", () => {
    expect(openSecret(URL_WITH_CREDS)).toBe(URL_WITH_CREDS);
  });

  it("throws on a tampered ciphertext (GCM auth)", () => {
    const sealed = sealSecret(URL_WITH_CREDS);
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => openSecret(tampered)).toThrow();
  });

  it("throws when sealed under a different secret (rotation)", () => {
    const sealed = sealSecret(URL_WITH_CREDS);
    process.env.AUTH_SECRET = "rotated-secret";
    expect(() => openSecret(sealed)).toThrow();
  });
});
