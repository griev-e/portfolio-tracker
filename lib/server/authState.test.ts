import { describe, expect, it, vi } from "vitest";

// readStateBody is pure, but the module's requireUser pulls in next-auth and
// the DB client, neither of which loads in the vitest node environment.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ isDbConfigured: () => false }));

import { readStateBody } from "./authState";

/** Route-boundary body validation for the /api/state PUTs. */
describe("readStateBody", () => {
  const req = (body: string) =>
    new Request("http://local/api/state/portfolio", { method: "PUT", body });

  it("accepts an object blob", async () => {
    const r = await readStateBody(req(JSON.stringify({ holdings: [], cash: 1 })));
    expect(r.ok).toBe(true);
  });

  it("accepts explicit null (clearing the blob) and an empty body", async () => {
    expect((await readStateBody(req("null"))).ok).toBe(true);
    const empty = await readStateBody(req(""));
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.value).toBeNull();
  });

  it("rejects arrays and scalars as bad shape", async () => {
    for (const bad of ["[1,2]", "42", '"str"']) {
      const r = await readStateBody(req(bad));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    }
  });

  it("rejects malformed JSON", async () => {
    const r = await readStateBody(req("{oops"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bad_json");
  });

  it("rejects oversized payloads with 413", async () => {
    const big = `{"x":"${"a".repeat(2_100_000)}"}`;
    const r = await readStateBody(req(big));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });
});
