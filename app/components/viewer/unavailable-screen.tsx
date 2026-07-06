import type { UnavailableReason } from "~/lib/viewer-contracts";

// Placeholder — implemented by the viewer UI workstream.
export function UnavailableScreen({ reason }: { reason: UnavailableReason }) {
  void reason;
  return <main className="min-h-svh bg-gray-950" />;
}
