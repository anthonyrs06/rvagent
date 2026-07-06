import { useEffect, useMemo, useState } from "react";
import { useBlocker, useNavigation, useSubmit } from "react-router";

import type { Zone, ZoneKind } from "~/lib/types";

const SECTION_QUICK_PICKS = ["Experience", "Skills", "Education", "Projects", "Summary"];
/** Smallest drag (normalized units) that still creates a zone. */
const MIN_DRAW_SIZE = 0.01;

export interface EditorPage {
  pageIndex: number;
  loWidth: number;
  loHeight: number;
}

interface Draft {
  pageIndex: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function newZoneId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `z-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Normalize zones into the exact shape the server persists (trimmed label,
 * `revealable` only on redact zones) so a saved round-trip compares equal.
 */
function toPayload(zones: Zone[]): Zone[] {
  return zones.map((z) => {
    const zone: Zone = {
      id: z.id,
      pageIndex: z.pageIndex,
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
      kind: z.kind,
      label: z.label.trim(),
    };
    if (z.kind === "redact") zone.revealable = z.revealable === true;
    return zone;
  });
}

const canonical = (zones: Zone[]) => JSON.stringify(toPayload(zones));

function rectFromDraft(d: Draft) {
  return {
    x: Math.min(d.x0, d.x1),
    y: Math.min(d.y0, d.y1),
    w: Math.abs(d.x1 - d.x0),
    h: Math.abs(d.y1 - d.y0),
  };
}

const pctStyle = (r: { x: number; y: number; w: number; h: number }) => ({
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`,
});

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3 shrink-0" fill="currentColor" aria-hidden>
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
    </svg>
  );
}

export function ZoneEditor({
  resumeId,
  pages,
  initialZones,
  serverError,
}: {
  resumeId: string;
  pages: EditorPage[];
  initialZones: Zone[];
  serverError: string | null;
}) {
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [mode, setMode] = useState<ZoneKind>("redact");
  const [redactLabel, setRedactLabel] = useState("Contact");
  const [redactRevealable, setRedactRevealable] = useState(true);
  const [sectionLabel, setSectionLabel] = useState("Experience");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = useSubmit();
  const navigation = useNavigation();
  const saving =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "save-zones";

  const dirty = useMemo(
    () => canonical(zones) !== canonical(initialZones),
    [zones, initialZones],
  );

  // Block in-app navigation away from the editor while there are unsaved
  // changes (same-path form posts, i.e. saving, are allowed through).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // Hard reloads / tab closes get the native browser prompt.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  const updateZone = (id: string, patch: Partial<Zone>) => {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  };

  const deleteZone = (id: string) => {
    setZones((prev) => prev.filter((z) => z.id !== id));
    setSelectedZoneId((cur) => (cur === id ? null : cur));
  };

  const save = () => {
    if (zones.some((z) => z.label.trim().length === 0)) {
      setLocalError("Every zone needs a label before saving.");
      return;
    }
    setLocalError(null);
    const fd = new FormData();
    fd.set("intent", "save-zones");
    fd.set("zones", JSON.stringify(toPayload(zones)));
    void submit(fd, { method: "post" });
  };

  const discard = () => {
    setZones(initialZones);
    setSelectedZoneId(null);
    setLocalError(null);
  };

  const pointerCoords = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  };

  const handlePointerDown = (pageIndex: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = pointerCoords(e);
    setDraft({ pageIndex, x0: x, y0: y, x1: x, y1: y });
    setSelectedZoneId(null);
  };

  const handlePointerMove = (pageIndex: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    setDraft((cur) => {
      if (!cur || cur.pageIndex !== pageIndex) return cur;
      const { x, y } = pointerCoords(e);
      return { ...cur, x1: x, y1: y };
    });
  };

  const handlePointerUp = (pageIndex: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draft || draft.pageIndex !== pageIndex) return;
    const { x, y } = pointerCoords(e);
    const rect = rectFromDraft({ ...draft, x1: x, y1: y });
    setDraft(null);
    if (rect.w < MIN_DRAW_SIZE || rect.h < MIN_DRAW_SIZE) return;

    const zone: Zone = {
      id: newZoneId(),
      pageIndex,
      ...rect,
      kind: mode,
      label:
        mode === "redact"
          ? redactLabel.trim().slice(0, 40) || "Contact"
          : sectionLabel.trim().slice(0, 40) || "Section",
    };
    if (mode === "redact") zone.revealable = redactRevealable;
    setZones((prev) => [...prev, zone]);
    setSelectedZoneId(zone.id);
  };

  const modePill = (value: ZoneKind, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
        mode === value
          ? value === "redact"
            ? "bg-red-500/20 text-red-300"
            : "bg-emerald-500/20 text-emerald-300"
          : "text-gray-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  const showBar = dirty || blocker.state === "blocked";
  const errorText = localError ?? serverError;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-3">
        <div className="flex rounded-lg border border-gray-700 p-0.5" role="group" aria-label="Zone mode">
          {modePill("redact", "Redaction box")}
          {modePill("section", "Section")}
        </div>

        {mode === "redact" ? (
          <>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              Label
              <input
                type="text"
                value={redactLabel}
                maxLength={40}
                onChange={(e) => setRedactLabel(e.target.value)}
                className="w-36 rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-red-500/60"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={redactRevealable}
                onChange={(e) => setRedactRevealable(e.target.checked)}
                className="size-3.5 accent-red-500"
              />
              Revealable (viewer can click to unmask — logged)
            </label>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              Label
              <input
                type="text"
                value={sectionLabel}
                maxLength={40}
                onChange={(e) => setSectionLabel(e.target.value)}
                className="w-36 rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500/60"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SECTION_QUICK_PICKS.map((pick) => (
                <button
                  key={pick}
                  type="button"
                  onClick={() => setSectionLabel(pick)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    sectionLabel === pick
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                  }`}
                >
                  {pick}
                </button>
              ))}
            </div>
          </>
        )}

        <span className="ml-auto hidden text-xs text-gray-600 sm:block">
          Drag on a page to draw · click a box to edit
        </span>
      </div>

      {/* Pages */}
      <div className="mx-auto w-full max-w-[800px] space-y-10">
        {pages.map((p) => (
          <div key={p.pageIndex}>
            <div
              className="relative cursor-crosshair touch-none select-none rounded-lg border border-gray-800 bg-gray-900"
              style={{ aspectRatio: `${p.loWidth} / ${p.loHeight}` }}
              onPointerDown={handlePointerDown(p.pageIndex)}
              onPointerMove={handlePointerMove(p.pageIndex)}
              onPointerUp={handlePointerUp(p.pageIndex)}
              onPointerCancel={() => setDraft(null)}
            >
              <img
                src={`/api/admin/resumes/${resumeId}/page/${p.pageIndex}?tier=lo`}
                alt={`Page ${p.pageIndex + 1}`}
                draggable={false}
                className="w-full select-none rounded-lg"
              />

              {zones
                .filter((z) => z.pageIndex === p.pageIndex)
                .map((z) => {
                  const selected = z.id === selectedZoneId;
                  return (
                    <div
                      key={z.id}
                      style={pctStyle(z)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedZoneId(selected ? null : z.id);
                      }}
                      className={`absolute cursor-pointer border-2 transition-colors ${
                        z.kind === "redact"
                          ? "border-red-500/70 bg-red-500/20 hover:bg-red-500/30"
                          : "border-emerald-500/70 bg-emerald-500/15 hover:bg-emerald-500/25"
                      } ${selected ? "ring-2 ring-white/80" : ""}`}
                    >
                      <span
                        className={`absolute -top-5 left-0 flex max-w-56 items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          z.kind === "redact"
                            ? "bg-red-950/90 text-red-300"
                            : "bg-emerald-950/90 text-emerald-300"
                        }`}
                      >
                        {z.kind === "redact" && <LockIcon />}
                        <span className="truncate">{z.label}</span>
                        {z.kind === "redact" && z.revealable && (
                          <span className="shrink-0 opacity-70">· revealable</span>
                        )}
                      </span>
                    </div>
                  );
                })}

              {draft && draft.pageIndex === p.pageIndex && (
                <div
                  className={`pointer-events-none absolute border-2 ${
                    mode === "redact"
                      ? "border-red-400 bg-red-500/50"
                      : "border-emerald-400 bg-emerald-500/50"
                  }`}
                  style={pctStyle(rectFromDraft(draft))}
                />
              )}

              {selectedZone && selectedZone.pageIndex === p.pageIndex && (
                <div
                  className="absolute z-20 w-64 rounded-xl border border-gray-700 bg-gray-900 p-3 shadow-xl shadow-black/50"
                  style={{
                    left: `${Math.min(selectedZone.x * 100, 62)}%`,
                    top: `${Math.min((selectedZone.y + selectedZone.h) * 100 + 1, 96)}%`,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">
                      {selectedZone.kind === "redact" ? "Redaction box" : "Section"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedZoneId(null)}
                      className="rounded px-1.5 text-xs text-gray-500 hover:text-white"
                      aria-label="Close zone panel"
                    >
                      Done
                    </button>
                  </div>
                  <label className="mt-2 block text-[11px] text-gray-400">
                    Label
                    <input
                      type="text"
                      value={selectedZone.label}
                      maxLength={40}
                      onChange={(e) => updateZone(selectedZone.id, { label: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                    />
                  </label>
                  {selectedZone.kind === "redact" && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-gray-400">
                      <input
                        type="checkbox"
                        checked={selectedZone.revealable === true}
                        onChange={(e) =>
                          updateZone(selectedZone.id, { revealable: e.target.checked })
                        }
                        className="size-3.5 accent-red-500"
                      />
                      Revealable (click-to-reveal is logged)
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteZone(selectedZone.id)}
                    className="mt-3 w-full rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
                  >
                    Delete zone
                  </button>
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-gray-600">
              Page {p.pageIndex + 1} of {pages.length}
            </p>
          </div>
        ))}
      </div>

      {/* Sticky save / leave-confirmation bar */}
      {showBar && (
        <div className="sticky bottom-4 z-30">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-gray-900/95 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur">
            {blocker.state === "blocked" ? (
              <>
                <p className="text-sm text-amber-300">
                  Leave this page without saving your zone changes?
                </p>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => blocker.reset()}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white"
                  >
                    Stay
                  </button>
                  <button
                    type="button"
                    onClick={() => blocker.proceed()}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500"
                  >
                    Leave without saving
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-amber-300">You have unsaved zone changes.</p>
                {errorText && <p className="text-xs text-red-400">{errorText}</p>}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={discard}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save zones"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
