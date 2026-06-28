import { describe, expect, it } from "vitest";
import { splitCredentials } from "./simplefin";

describe("splitCredentials", () => {
  it("extracts user:pass into a Basic auth header and strips them from the URL", () => {
    const { url, headers } = splitCredentials(
      "https://demo:demo@beta-bridge.simplefin.org/simplefin/restricted/abc123"
    );
    expect(url).toBe("https://beta-bridge.simplefin.org/simplefin/restricted/abc123");
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("demo:demo").toString("base64")}`);
  });

  it("decodes percent-encoded credentials before encoding the header", () => {
    const { headers } = splitCredentials("https://a%40b:p%40ss@bridge.example.com/x");
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("a@b:p@ss").toString("base64")}`);
  });

  it("returns no auth header when the URL has no credentials", () => {
    const { url, headers } = splitCredentials("https://bridge.example.com/claim/xyz");
    expect(url).toBe("https://bridge.example.com/claim/xyz");
    expect(headers).toEqual({});
  });
});
