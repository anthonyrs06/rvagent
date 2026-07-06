import { describe, expect, it } from "vitest";

import { parseZonesPayload } from "../zone-validation";

const validZone = {
  id: "z1",
  pageIndex: 0,
  x: 0.1,
  y: 0.2,
  w: 0.3,
  h: 0.1,
  kind: "redact",
  label: "Contact",
  revealable: true,
};

describe("parseZonesPayload", () => {
  it("accepts an empty array", () => {
    const result = parseZonesPayload("[]", 2);
    expect(result).toEqual({ ok: true, zones: [] });
  });

  it("accepts a valid mixed payload and normalizes it", () => {
    const payload = JSON.stringify([
      validZone,
      { id: "z2", pageIndex: 1, x: 0, y: 0, w: 0.5, h: 0.5, kind: "section", label: "  Experience  " },
    ]);
    const result = parseZonesPayload(payload, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.zones).toHaveLength(2);
    expect(result.zones[0]).toEqual(validZone);
    // Labels are trimmed; sections carry no revealable flag.
    expect(result.zones[1]).toEqual({
      id: "z2",
      pageIndex: 1,
      x: 0,
      y: 0,
      w: 0.5,
      h: 0.5,
      kind: "section",
      label: "Experience",
    });
  });

  it("rejects malformed JSON", () => {
    expect(parseZonesPayload("not json", 1).ok).toBe(false);
  });

  it("rejects non-array payloads", () => {
    expect(parseZonesPayload('{"a":1}', 1).ok).toBe(false);
  });

  it("rejects a pageIndex outside the page range", () => {
    const payload = JSON.stringify([{ ...validZone, pageIndex: 2 }]);
    expect(parseZonesPayload(payload, 2).ok).toBe(false);
  });

  it("rejects a non-integer pageIndex", () => {
    const payload = JSON.stringify([{ ...validZone, pageIndex: 0.5 }]);
    expect(parseZonesPayload(payload, 2).ok).toBe(false);
  });

  it("rejects coordinates outside 0..1", () => {
    expect(parseZonesPayload(JSON.stringify([{ ...validZone, x: -0.1 }]), 1).ok).toBe(false);
    expect(parseZonesPayload(JSON.stringify([{ ...validZone, y: 1.2 }]), 1).ok).toBe(false);
  });

  it("rejects zones that are too small", () => {
    expect(parseZonesPayload(JSON.stringify([{ ...validZone, w: 0.005 }]), 1).ok).toBe(false);
    expect(parseZonesPayload(JSON.stringify([{ ...validZone, h: 0.001 }]), 1).ok).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(parseZonesPayload(JSON.stringify([{ ...validZone, kind: "blur" }]), 1).ok).toBe(false);
  });

  it("rejects an empty or over-long label", () => {
    expect(parseZonesPayload(JSON.stringify([{ ...validZone, label: "   " }]), 1).ok).toBe(false);
    expect(parseZonesPayload(JSON.stringify([{ ...validZone, label: "x".repeat(41) }]), 1).ok).toBe(false);
  });

  it("rejects a missing or empty zone id", () => {
    expect(parseZonesPayload(JSON.stringify([{ ...validZone, id: "" }]), 1).ok).toBe(false);
  });

  it("rejects a non-boolean revealable on redact zones", () => {
    expect(parseZonesPayload(JSON.stringify([{ ...validZone, revealable: "yes" }]), 1).ok).toBe(false);
  });

  it("defaults revealable to false for redact zones that omit it", () => {
    const { revealable: _drop, ...withoutRevealable } = validZone;
    const result = parseZonesPayload(JSON.stringify([withoutRevealable]), 1);
    expect(result).toEqual({ ok: true, zones: [{ ...withoutRevealable, revealable: false }] });
  });
});
