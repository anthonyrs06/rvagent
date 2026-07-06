import type { UnavailableReason } from "~/lib/viewer-contracts";

/**
 * Contentless terminal states. Copy explains just enough to be humane;
 * the "bot" variant deliberately explains nothing. No resume information
 * (labels, names, page counts) may ever appear here.
 */
const COPY: Record<UnavailableReason, { message: string; showHint: boolean }> = {
  expired: { message: "This link has expired", showHint: true },
  revoked: { message: "Access to this document was withdrawn", showHint: true },
  paused: { message: "This link is temporarily paused", showHint: true },
  locked: { message: "This link was locked after unusual activity", showHint: true },
  exhausted: { message: "This link has reached its view limit", showHint: true },
  not_ready: {
    message: "This document is still being prepared — try again in a minute",
    showHint: true,
  },
  bot: { message: "This is a private document", showHint: false },
};

function LockGlyph() {
  return (
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gray-800 bg-gray-950 text-gray-500">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    </span>
  );
}

export function UnavailableScreen({ reason }: { reason: UnavailableReason }) {
  const copy = COPY[reason];
  return (
    <main className="flex min-h-svh items-center justify-center bg-gray-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center shadow-2xl">
        <LockGlyph />
        <h1 className="mt-5 text-lg font-semibold text-white">{copy.message}</h1>
        {copy.showHint && (
          <p className="mt-2 text-sm text-gray-500">
            Ask the person who shared this for a new link.
          </p>
        )}
      </div>
    </main>
  );
}
