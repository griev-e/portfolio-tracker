import type { Metadata } from "next";

// Overrides the root "alpha" metadata for the portal screen: the browser tab
// reads "alpha | theta" and the favicon swaps to a plain black mark (app/lock/icon.svg
// is picked up by the file convention for this segment), since the portal is
// the shared door for both apps rather than either app's own identity.
export const metadata: Metadata = {
  title: "alpha | theta",
};

export default function LockLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
