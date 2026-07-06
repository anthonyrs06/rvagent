import type { GateActionError, GateData } from "~/lib/viewer-contracts";

// Placeholder — implemented by the viewer UI workstream.
export function GateScreen({ gate, error }: { gate: GateData; error: GateActionError | null }) {
  void gate;
  void error;
  return <main className="min-h-svh bg-gray-950" />;
}
