"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary (App Router). Catches render errors anywhere in a
 * page subtree and replaces just the page content — the layout (sidebar, top
 * bar) stays intact. The portfolio lives in localStorage, so nothing is lost;
 * `reset()` re-renders the segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Surface the cause so a render crash is diagnosable (digest points at the
  // matching server-side log entry) rather than swallowed silently.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="panel mx-auto mt-16 max-w-md px-8 py-10 text-center"
    >
      <h2 className="font-display text-lg font-semibold text-ink">
        Something went wrong
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-mute">
        This view hit an unexpected error. Your portfolio is safe in your
        browser — nothing was lost.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
