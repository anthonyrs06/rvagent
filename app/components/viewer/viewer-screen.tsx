import type { ViewerData } from "~/lib/viewer-contracts";

// Placeholder — implemented by the viewer UI workstream.
export function ViewerScreen({ viewer }: { viewer: ViewerData }) {
  void viewer;
  return <main className="min-h-svh bg-gray-950" />;
}
