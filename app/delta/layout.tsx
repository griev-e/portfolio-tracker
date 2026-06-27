import type { Metadata } from "next";

// Overrides the root "alpha" metadata for every /delta route: the browser tab
// reads "delta" and the favicon swaps to delta's mark (app/delta/icon.svg is
// picked up by the file convention for this segment).
export const metadata: Metadata = {
  title: "delta",
  description:
    "Personal finance — net worth, accounts, transactions, budgets, goals and cash flow.",
};

export default function DeltaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
