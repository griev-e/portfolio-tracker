import type { Metadata } from "next";

// Overrides the root "alpha" metadata for every /theta route: the browser tab
// reads "theta" and the favicon swaps to theta's mark (app/theta/icon.svg is
// picked up by the file convention for this segment). The ThetaProvider that
// backs these routes is mounted in AppShell's /theta delegation.
export const metadata: Metadata = {
  title: "theta",
  description:
    "Personal finance — net worth, accounts, transactions, budgets, goals and cash flow.",
};

export default function ThetaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
