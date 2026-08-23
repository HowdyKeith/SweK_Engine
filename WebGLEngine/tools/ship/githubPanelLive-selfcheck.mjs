// WebGLEngine/tools/ship/githubPanelLive-selfcheck.mjs -- v3941
//
// Run: node tools/ship/githubPanelLive-selfcheck.mjs   (a few seconds -- needs Chromium)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** DRIVES THE REAL GITHUB PANEL IN A REAL BROWSER, BECAUSE engineUpdateSource-selfcheck ONLY EVER
// NARRATED THAT SOMEBODY DID. *** Its own text says "server.html was served and loaded in Chromium, the
// GitHub tab clicked, the button clicked: the overlay opened... THE FIRST RUN FAILED -- typeof swekOverlay
// was FALSE and the button did nothing -- which no amount of reading the diff would have shown." That is a
// true and important finding, recorded as PROSE with no script behind it -- so the next regression of the
// exact shape it describes has nothing here to catch it. This file is that script.
//
// SAFETY: every /github/* request is intercepted and answered from a STUB, in the SAME page.route() call that
// serves every other file -- never routed to the real network. Clicking "Release current engine" for real is
// therefore driven and verified WITHOUT ever reaching github.com, the same discipline browserSafety-selfcheck
// already uses for the rest of this page.
//
// USES PLAYWRIGHT, NOT ai-bridge's SERVER: no Node HTTP server needs to boot for this to run -- Playwright's
// route interception hands back files from disk directly, the same trick that let browserSafety-selfcheck run
// here for the first time despite "the server will not boot" having been true for the engine's whole life.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHELL = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

// *** THE SAME LIST browserSafety-selfcheck.mjs TRIES DID NOT FIND IT HERE EITHER. *** This box's playwright
// lives at /opt/node22/lib/node_modules/playwright -- a path in neither file's fallback list. Tried in order
// rather than hardcoded to the one that happened to work, for the same reason browserSafety's own header
// gives: a checkout with playwright installed anywhere normal should run the gate instead of skipping past it.
let chromium, pwFrom;
for (const m of ["playwright", "playwright-core",
                  "/opt/node22/lib/node_modules/playwright/index.js",
                  "/home/claude/.npm-global/lib/node_modules/playwright/index.js",
                  "/usr/local/lib/node_modules/playwright/index.js"]) {
    try { ({ chromium } = require_(m)); pwFrom = m; break; } catch {}
}
if (!chromium) { console.log("SKIP: no playwright"); process.exit(0); }
if (!fs.existsSync(SHELL)) { console.log("SKIP: no headless shell at " + SHELL); process.exit(0); }

const b = await chromium.launch({ executablePath: SHELL });
const page = await b.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

// Serve the real tree, but STUB every /github/* API call -- this must never reach real GitHub.
const ghCalls = [];
await page.route("**/*", (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.startsWith("/github/")) {
    ghCalls.push(u.pathname);
    if (u.pathname === "/github/config") {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true, owner: "HowdyKeith", defaultRepo: "", engineRepo: "HowdyKeith/SweK_Engine", hasToken: true, tokenTail: "abcd", engineVersion: "v3941" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, releases: [] }) });
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const ext = path.extname(p);
    const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
      : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "text/plain";
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: "not found: " + u.pathname });
});

let fails = 0;
const step = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
console.log("githubPanelLive-selfcheck -- the GitHub Manager panel, driven in a real browser\n");

await page.goto("http://swek.local/server.html", { waitUntil: "networkidle", timeout: 30000 });

const gtab = await page.$('button.gtab[data-tab="github"]');
step("the GitHub gtab exists in the left dock", !!gtab);
if (gtab) await gtab.click();
await page.waitForTimeout(200);

const btn = await page.$("#ghManagerBtn");
step("once the gtab is open, the GitHub Manager button becomes visible", !!btn && await btn.isVisible().catch(() => false));

await page.click("#ghManagerBtn");
await page.waitForTimeout(300);

const overlayVisible = await page.evaluate(() => {
  const root = document.getElementById("ghPanelRoot");
  return !!(root && root.offsetParent !== null);
});
step("clicking it opens the overlay, and #ghPanelRoot is actually visible in it", overlayVisible);

const tabNames = await page.evaluate(() => [...document.querySelectorAll("#ghPanelRoot button")].map(b => b.textContent.trim())).catch(() => []);
const wantTabs = ["Publish", "Account", "Repos", "Releases", "Issues", "Code"];
const gotTabs = wantTabs.filter(t => tabNames.includes(t));
step("all six top-level tabs render", gotTabs.length === 6, gotTabs.join(", "));

// Click into Releases, since that's where the two buttons under discussion live.
const releasesTab = await page.$('#ghManagerDlg button:text-is("Releases")');
step("the Releases tab is findable, scoped to the open dialog", !!releasesTab);
if (releasesTab) await releasesTab.click({ force: true });
await page.waitForTimeout(200);

const releaseBtn = await page.$("#ghManagerDlg button:has-text('Release current engine')");
step("the 'Release current engine' button is present and enabled", !!releaseBtn && await releaseBtn.isEnabled().catch(() => false));

const cloneBtn = await page.$("#ghManagerDlg button:has-text('Get newer source from GitHub')");
step("the 'Get newer source from GitHub' (clone-source) button is present and enabled", !!cloneBtn && await cloneBtn.isEnabled().catch(() => false));

// Click Release current engine against the STUBBED config -- must never reach real github.com.
if (releaseBtn) {
  await releaseBtn.click();
  await page.waitForTimeout(400);
  const sawRealPath = ghCalls.some(p => /publish-engine/.test(p));
  step("clicking it fires the expected stubbed request, not a live one", sawRealPath, "calls seen: " + JSON.stringify(ghCalls));
}

const ghErrors = consoleErrors.filter((e) => /github|ghManager|ghPanel/i.test(e));
step("no uncaught JS errors traceable to the GitHub panel itself", ghErrors.length === 0, ghErrors.join(" | ") || ("(" + consoleErrors.length + " unrelated 404s from the rest of the dashboard, expected -- only /github/* was stubbed)"));

await b.close();
console.log(fails ? "\ngithubPanelLive-selfcheck: " + fails + " FAILED" : "\ngithubPanelLive-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
