/**
 * OS screenshot shortcuts we can detect from keyboard events.
 * Best-effort: phone photos and external cameras cannot be blocked in a browser.
 */
export interface ShortcutKeys {
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  /** Windows / OS meta key via getModifierState("OS"). */
  osKey?: boolean;
}

export function matchesScreenshotShortcut({
  key,
  metaKey = false,
  shiftKey = false,
  ctrlKey = false,
  altKey = false,
  osKey = false,
}: ShortcutKeys): boolean {
  const lower = key.toLowerCase();

  if (key === "PrintScreen" || key === "Snapshot" || key === "F13") return true;

  // Windows Snipping Tool / Snip & Sketch (Win+Shift+S).
  if (shiftKey && lower === "s" && (metaKey || osKey)) return true;

  // macOS full-screen / selection / toolbar screenshots (Cmd+Shift+3/4/5/6).
  if (metaKey && shiftKey && ["3", "4", "5", "6"].includes(key)) return true;

  // macOS screenshot-to-clipboard variants (Cmd+Shift+Ctrl+3/4).
  if (metaKey && shiftKey && ctrlKey && ["3", "4"].includes(key)) return true;

  // Linux variants.
  if (shiftKey && key === "PrintScreen") return true;
  if (altKey && key === "PrintScreen") return true;

  return false;
}

export function isScreenshotShortcut(event: KeyboardEvent): boolean {
  return matchesScreenshotShortcut({
    key: event.key,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    osKey: event.getModifierState("OS"),
  });
}
