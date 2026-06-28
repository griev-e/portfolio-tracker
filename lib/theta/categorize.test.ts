import { describe, expect, it } from "vitest";
import { categorize, CATEGORIZE_RULES } from "./categorize";

describe("categorize", () => {
  it("matches common merchants to their category", () => {
    expect(categorize("Whole Foods Market")).toBe("Food & Dining");
    expect(categorize("UBER *TRIP")).toBe("Transport");
    expect(categorize("Netflix.com")).toBe("Subscriptions");
    expect(categorize("ConEdison")).toBe("Utilities");
    expect(categorize("CVS/PHARMACY #1234")).toBe("Health");
    expect(categorize("AMC THEATRES")).toBe("Entertainment");
    expect(categorize("Amazon.com")).toBe("Shopping");
  });

  it("treats payroll/interest as income regardless of casing", () => {
    expect(categorize("ACME CORP PAYROLL")).toBe("Income");
    expect(categorize("Interest Earned")).toBe("Income");
  });

  it("treats moves between accounts as transfers", () => {
    expect(categorize("Transfer to Savings")).toBe("Transfer");
    expect(categorize("Venmo cashout")).toBe("Transfer");
  });

  it("falls back to Other for unknown merchants", () => {
    expect(categorize("Zorp Industries LLC")).toBe("Other");
    expect(categorize("")).toBe("Other");
  });

  it("prefers the first matching rule (specific before generic)", () => {
    // "apple store" is Shopping; income keywords should not be reachable here.
    expect(categorize("APPLE STORE R123")).toBe("Shopping");
    expect(CATEGORIZE_RULES.length).toBeGreaterThan(0);
  });
});
