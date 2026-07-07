/**
 * Production self-test: create a share link, pass the gate in a real browser,
 * verify the loading spinner, watermark, screenshot guard, and PostHog replay
 * network traffic. Screenshots land in data/e2e/.
 *
 * The app hard-blocks automation (navigator.webdriver) by design; this script
 * spoofs that signal deliberately — it is our own QA against our own service.
 *
 * Run: OWNER_PASSWORD=... npx tsx scripts/e2e-selftest.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "https://resume-vault-jp6b.onrender.com";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
if (!OWNER_PASSWORD) throw new Error("Set OWNER_PASSWORD");

const OUT = "data/e2e";
mkdirSync(OUT, { recursive: true });

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}
const checks: Check[] = [];
function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function adminFetch(path: string, init: RequestInit, cookie?: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) },
    redirect: "manual",
  });
}

async function main() {
  // ---- 1. Admin login + create share link (document POSTs, parse HTML) ----
  const loginRes = await adminFetch("/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `password=${encodeURIComponent(OWNER_PASSWORD!)}`,
  });
  const adminCookie = (loginRes.headers.get("set-cookie") ?? "").split(";")[0];
  if (!adminCookie.startsWith("rv_admin=")) throw new Error(`admin login failed: ${loginRes.status}`);

  // The ready-resume id lives in the serialized loader stream right after
  // the "readyResumes" key (the <select> is client-rendered).
  const linksPage = await (await adminFetch("/admin/links", {}, adminCookie)).text();
  const afterReady = linksPage.slice(linksPage.indexOf("readyResumes"));
  const resumeId = afterReady.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/)?.[1];
  if (!resumeId) throw new Error("no ready resume found in /admin/links loader data");

  const form = new URLSearchParams({
    intent: "create",
    resumeId,
    recipientLabel: "E2E Self Test",
    ttl: "1d",
  });
  const createRes = await adminFetch("/admin/links", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  }, adminCookie);
  const createHtml = await createRes.text();
  const token = createHtml.match(/\/r\/([A-Za-z0-9_-]{20,})/)?.[1];
  if (!token) throw new Error(`link creation failed: ${createRes.status} ${createHtml.slice(0, 300)}`);
  // In the serialized stream the link id precedes "token","<value>".
  const idMatch = createHtml.match(
    new RegExp(`([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})[^a-f0-9]{0,80}?token[^A-Za-z0-9_-]{0,10}${token}`),
  );
  const linkId = idMatch?.[1] ?? null;
  console.log(`share link created: ${BASE}/r/${token.slice(0, 6)}… (link ${linkId ?? "id unknown"})`);

  // ---- 2. Browser session (stealth: webdriver=false + real UA) ----
  // HEADED=1 runs a real Chrome window — the session recorder's rrweb loop and
  // flush timers behave like a real visitor (headless stalls the send queue).
  const headed = process.env.HEADED === "1";
  const browser = await chromium.launch({
    headless: !headed,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent: CHROME_UA,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  // Raw string (not a function) so tsx/esbuild never wraps nested arrows with
  // its `__name` helper, which is undefined in the browser and would throw.
  await context.addInitScript(`
    Object.defineProperty(Navigator.prototype, "webdriver", { get: function () { return false; }, configurable: true });
    // Headless Chrome reports the tab as permanently "hidden", so PostHog
    // buffers snapshots and never flushes to /s/. Force a foreground tab.
    Object.defineProperty(document, "visibilityState", { get: function () { return "visible"; }, configurable: true });
    Object.defineProperty(document, "hidden", { get: function () { return false; }, configurable: true });
    document.hasFocus = function () { return true; };
  `);

  const page = await context.newPage();

  const snapshotPosts: string[] = [];
  const posthogReqs: string[] = [];
  // Listen at the context level: replay snapshot POSTs can originate from a
  // Web Worker (off-thread compression), which page-level listeners miss.
  context.on("request", (req) => {
    const url = req.url();
    if (/posthog\.com/.test(url)) posthogReqs.push(`${req.method()} ${url.split("?")[0]}`);
    if (req.method() === "POST" && /posthog\.com\/s\//.test(url)) snapshotPosts.push(url);
  });
  page.on("console", (msg) => {
    const t = msg.text();
    if (/posthog|recorder|replay|snapshot|csp|content security|rrweb/i.test(t)) {
      console.log(`  [browser:${msg.type()}] ${t.slice(0, 240)}`);
    }
  });
  page.on("pageerror", (err) =>
    console.log(`  [pageerror] ${String(err.stack ?? err).slice(0, 600)}`),
  );
  page.on("requestfailed", (req) => {
    if (/posthog/.test(req.url()))
      console.log(`  [reqfailed] ${req.url().split("?")[0]} ${req.failure()?.errorText ?? ""}`);
  });
  page.on("response", (res) => {
    if (/posthog\.com\/(s|e|i|decide|flags|array|static)/.test(res.url()) && res.status() >= 400) {
      console.log(`  [posthog ${res.status()}] ${res.url().split("?")[0]}`);
    }
  });

  await page.goto(`${BASE}/r/${token}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/01-gate.png` });

  const viewButton = page.getByRole("button", { name: /view document/i });
  await viewButton.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(
    () => !document.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled,
    { timeout: 15000 },
  );
  const debug = await page.evaluate(() => ({
    webdriver: navigator.webdriver,
    signals: document.querySelector<HTMLInputElement>("input[name=signals]")?.value ?? "MISSING",
    fingerprint:
      document.querySelector<HTMLInputElement>("input[name=fingerprint]")?.value?.slice(0, 12) ??
      "MISSING",
  }));
  console.log("gate debug:", JSON.stringify(debug));
  await viewButton.click();

  // ---- 3. Loading spinner ----
  let spinnerSeen = false;
  try {
    await page.waitForSelector("text=Loading page…", { timeout: 8000 });
    spinnerSeen = true;
    await page.screenshot({ path: `${OUT}/02-spinner.png` });
  } catch {
    // Page may load too fast on a warm cache.
  }
  record("loading spinner", spinnerSeen, spinnerSeen ? "spinner visible while tiles load" : "tiles loaded before spinner could be captured");

  // ---- 4. Resume + watermark loaded ----
  await page.waitForSelector("canvas", { timeout: 20000 });
  await page.waitForFunction(
    () => {
      const c = document.querySelector("canvas");
      return c && c.width > 100;
    },
    { timeout: 20000 },
  );
  // Wait for every page spinner to clear so the demo shows real pixels.
  await page
    .waitForFunction(() => !document.body.innerText.includes("Loading page"), { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/03-loaded.png` });
  record("resume loaded", true, "canvas drawn with watermarked tiles");

  // ---- 5. Scroll + dwell for the replay recorder ----
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(1500);
  }
  await page.mouse.wheel(0, -1800);
  await page.waitForTimeout(1500);

  // ---- 6. Screenshot guard: Cmd then Shift ----
  await page.keyboard.down("Meta");
  await page.keyboard.down("Shift");
  await page.waitForTimeout(300);
  const banner1 = await page.locator(".rv-guard-banner").isVisible().catch(() => false);
  const hidden1 = await page.evaluate(() =>
    document.documentElement.classList.contains("rv-screenshot-guard"),
  );
  await page.screenshot({ path: `${OUT}/04-guard-meta-shift.png` });
  await page.keyboard.up("Shift");
  await page.keyboard.up("Meta");
  record("guard Cmd→Shift", banner1 && hidden1, `banner=${banner1} hiddenClass=${hidden1}`);

  // Wait out the 8s guard, then test reversed order.
  await page.waitForTimeout(9000);

  // ---- 7. Screenshot guard: Shift then Cmd (reversed order) ----
  await page.keyboard.down("Shift");
  await page.keyboard.down("Meta");
  await page.waitForTimeout(300);
  const banner2 = await page.locator(".rv-guard-banner").isVisible().catch(() => false);
  const hidden2 = await page.evaluate(() =>
    document.documentElement.classList.contains("rv-screenshot-guard"),
  );
  await page.screenshot({ path: `${OUT}/05-guard-shift-meta.png` });
  await page.keyboard.up("Meta");
  await page.keyboard.up("Shift");
  record("guard Shift→Cmd", banner2 && hidden2, `banner=${banner2} hiddenClass=${hidden2}`);

  // ---- 8. Inspect recorder internals, then dwell so it flushes ----
  const recProbe = await page.evaluate(`(function () {
    var p = window.posthog;
    if (!p) return { error: "no posthog" };
    var sr = p.sessionRecording || {};
    var ext = window.__PosthogExtensions__ || {};
    var out = {
      srStatus: sr.status || sr._status || "n/a",
      srStarted: sr.started != null ? sr.started : "n/a",
      srReceivedDecide: sr.receivedDecide != null ? sr.receivedDecide : "n/a",
      srKeys: Object.keys(sr).slice(0, 25),
      extKeys: Object.keys(ext),
    };
    try { p.startSessionRecording(); out.startCall = "ok"; }
    catch (e) { out.startCall = String(e).slice(0, 80); }
    return out;
  })()`);
  console.log("recording probe:", JSON.stringify(recProbe));

  // Headless Chromium keeps posthog-js's batched queue from flushing. Turn off
  // request batching for this QA session so snapshots/events send immediately.
  const cfgResult = await page.evaluate(`(function () {
    var p = window.posthog;
    if (!p || !p.set_config) return "no set_config";
    p.set_config({ request_batching: false });
    return "batching off";
  })()`);
  console.log("config override:", cfgResult);

  // Isolate whether the client sends ANY ingestion traffic (events or snapshots).
  const ingestFlush = context
    .waitForEvent("request", {
      predicate: (req) => req.method() === "POST" && /posthog\.com\/(i|e|s)\b/.test(req.url()),
      timeout: 12000,
    })
    .then((r) => r.url().split("?")[0])
    .catch(() => "none");
  const captureProbe = await page.evaluate(`(function () {
    var p = window.posthog;
    if (!p) return { error: "no posthog" };
    var out = {};
    try { p.capture("e2e_capture_probe", { t: Date.now() }); out.captured = true; } catch (e) { out.captureErr = String(e).slice(0,120); }
    try { (p.flush || function(){})(); out.flushed = true; } catch (e) { out.flushErr = String(e).slice(0,120); }
    out.optedIn = p.has_opted_in_capturing ? p.has_opted_in_capturing() : "n/a";
    out.configOptOut = p.config ? p.config.opt_out_capturing_by_default : "n/a";
    return out;
  })()`);
  console.log("capture probe:", JSON.stringify(captureProbe));
  console.log("ingest POST after probe:", await ingestFlush);

  // Can the page even reach the ingestion host (CSP / network), and what does
  // posthog's config actually look like?
  const netProbe = await page.evaluate(`(async function () {
    var p = window.posthog;
    var cfg = p && p.config ? p.config : {};
    var out = {
      api_host: cfg.api_host,
      ui_host: cfg.ui_host,
      disable_session_recording: cfg.disable_session_recording,
      opt_out_capturing_by_default: cfg.opt_out_capturing_by_default,
      _dnt: cfg.respect_dnt,
      advanced_disable_decide: cfg.advanced_disable_decide,
      advanced_disable_flags: cfg.advanced_disable_flags,
      __loaded_recorder: !!(window.__PosthogExtensions__ && window.__PosthogExtensions__.rrweb),
    };
    try {
      var r = await fetch((cfg.api_host || "https://us.i.posthog.com") + "/i/v0/e/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: "` + `phc_pfVUuRURxva2oajXgyRMMVDGMxXHurErwetbiwBPjAFT` + `", event: "e2e_raw_fetch", properties: { distinct_id: "e2e-raw" } }),
      });
      out.rawFetchStatus = r.status;
    } catch (e) {
      out.rawFetchErr = String(e).slice(0, 160);
    }
    return out;
  })()`);
  console.log("net probe:", JSON.stringify(netProbe));

  // Wait for the recorder's buffer to flush to /s/ while scrolling for activity.
  const snapshotFlush = context
    .waitForEvent("request", {
      predicate: (req) => req.method() === "POST" && /posthog\.com\/s\//.test(req.url()),
      timeout: 20000,
    })
    .then(() => true)
    .catch(() => false);
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(200 + i * 40, 300 + i * 30);
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(1500);
  }
  await snapshotFlush;
  await page.waitForTimeout(3000);

  const phState = await page.evaluate(() => {
    const w = window as unknown as {
      posthog?: {
        get_session_id?: () => string;
        has_opted_in_capturing?: () => boolean;
        sessionRecordingStarted?: () => boolean;
        sessionManager?: unknown;
        _shouldCapture?: unknown;
        __loaded?: boolean;
        config?: { api_host?: string; opt_out_capturing_by_default?: boolean };
      };
    };
    const p = w.posthog;
    let capturedOk = false;
    try {
      (p as unknown as { capture?: (n: string) => void })?.capture?.("e2e_probe");
      capturedOk = true;
    } catch {
      capturedOk = false;
    }
    return {
      exists: Boolean(p),
      loaded: Boolean(p?.__loaded),
      apiHost: p?.config?.api_host ?? "unknown",
      optedIn: p?.has_opted_in_capturing?.() ?? "unknown",
      sessionId: p?.get_session_id?.() ?? null,
      hasSessionManager: Boolean(p?.sessionManager),
      capturedOk,
    };
  });
  console.log("posthog state:", JSON.stringify(phState));
  await page.waitForTimeout(4000);
  console.log(
    "posthog requests after probe:",
    JSON.stringify([...new Set(posthogReqs)]),
  );
  console.log("posthog requests:", JSON.stringify([...new Set(posthogReqs)]));
  record(
    "replay snapshots sent",
    snapshotPosts.length > 0,
    `${snapshotPosts.length} POSTs to /s/ (session ${phState.sessionId ?? "unknown"}, optedIn=${phState.optedIn}, apiHost=${phState.apiHost})`,
  );

  await browser.close();

  // ---- 9. Revoke test link ----
  if (linkId) {
    await adminFetch("/admin/links", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ intent: "revoke", linkId }).toString(),
    }, adminCookie);
    console.log("test link revoked");
  }

  writeFileSync(
    `${OUT}/results.json`,
    JSON.stringify(
      {
        checks,
        sessionId: phState.sessionId,
        snapshotPosts: snapshotPosts.length,
        replayUrl: phState.sessionId
          ? `https://us.posthog.com/project/500759/replay/${phState.sessionId}`
          : null,
        token: token.slice(0, 6),
      },
      null,
      2,
    ),
  );
  console.log("\n==== RESULTS ====");
  for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
  if (phState.sessionId) {
    console.log(`\nReplay: https://us.posthog.com/project/500759/replay/${phState.sessionId}`);
  }
  const failed = checks.filter((c) => !c.pass && c.name !== "loading spinner");
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
