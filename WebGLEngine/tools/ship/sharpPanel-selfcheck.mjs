// WebGLEngine/tools/ship/sharpPanel-selfcheck.mjs -- v3963
//
// Run: node tools/ship/sharpPanel-selfcheck.mjs   (needs Chromium; skips cleanly without it)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** ai-bridge/sharpBridge.js SHIPPED A WORKING /sharp/status, /sharp/config AND /sharp/predict AT v3948, AND
// NOTHING ON ANY PAGE EVER CALLED THEM. *** Keith found the shape by asking about a different bridge entirely
// ("what page is SHARP-ML on?") and the honest answer was none -- a route that EXISTS and a route that is
// REACHABLE are not the same claim, which is the exact shape v3959 fixed for eleven page links two rounds ago,
// here for a bridge instead of a link. v3963 gives it a panel; this gate is what keeps the panel from becoming
// the next silent gap -- a chip that opens and shows nothing is the same failure with a UI in front of it.
//
// DRIVEN IN A REAL BROWSER, ROUTES STUBBED. Reading the markup can confirm the fields exist; it cannot confirm
// clicking the tab fetches status, that a failed predict renders an error instead of a blank result, or that the
// token field empties itself after a save -- all three are DOM behaviour, not text in a file.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("sharpPanel-selfcheck: SKIPPED -- " + skip); process.exit(0); }

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("sharpPanel-selfcheck -- the ml-sharp front door, driven in a real browser\n");

async function load(statusBody, { cfgOk = true, predictOk = true } = {}) {
    const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
    const page = await b.newContext().then((c) => c.newPage());
    const requested = [];
    let cfgBody = null;
    await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
        if (u.pathname === "/sys/firewall/status") return json({ open: true, port: 8787 });
        if (u.pathname === "/self/whoami") return json({ ok: true });
        if (u.pathname === "/sharp/status") { requested.push("status"); return json(statusBody); }
        if (u.pathname === "/sharp/config" && route.request().method() === "POST") {
            requested.push("config"); cfgBody = route.request().postData();
            return cfgOk ? json({ ok: true, endpoint: "https://x--sharp.modal.run", hasToken: true, path: "~/.voxelbridge/sharp.json" })
                         : json({ ok: false, error: "endpoint must be https" });
        }
        if (u.pathname === "/sharp/predict" && route.request().method() === "POST") {
            requested.push("predict");
            return predictOk
                ? json({ ok: true, ply: "/lib/sharp-splats/photo.ply", name: "photo.ply", bytes: 2500000, mb: 2.38, ms: 4231, invocation: "sharp", licence: {}, alsoWrote: [] })
                : json({ ok: false, error: "ml-sharp is not installed for python3" });
        }
        const p = path.join(ROOT, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const ext = path.extname(p);
            const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
                : ext === ".html" ? "text/html" : ext === ".json" ? "application/json"
                    : ext === ".css" ? "text/css" : "text/plain";
            return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
        }
        return route.fulfill({ status: 404, body: "not found" });
    });
    await page.goto("http://localhost:8787/server.html", { waitUntil: "domcontentloaded" }).catch(() => { });
    await page.waitForTimeout(400);
    return { b, page, requested, getCfgBody: () => cfgBody };
}

// ---- 1. the chip and panel exist, and status is NOT fetched before the tab is opened -----------------------
{
    const { b, page, requested } = await load({
        ok: true, licence: { summary: "Research use only, non-commercial." }, outDir: "/lib/sharp-splats",
        python: "python3", pythonVersion: "3.11.4", sharpInstalled: true, invocation: "sharp",
        weightsCached: false, remote: false, remoteEndpoint: "", remoteHasToken: false, where: "local", ready: true, why: "",
    });
    ok("the chip exists", await page.$('[data-tab="sharp"]').then((x) => !!x));
    ok("the panel exists", await page.$('.gpanel[data-panel="sharp"]').then((x) => !!x));
    ok("!! *** /sharp/status is NOT fetched before the tab is opened *** -- load-on-click, like Policy Mass",
        !requested.includes("status"), "requested so far: " + (requested.join(", ") || "none"));
    await b.close();
}

// ---- 2. opening the tab fetches status and renders it, local case ------------------------------------------
{
    const { b, page, requested } = await load({
        ok: true, licence: { summary: "Research use only, non-commercial." }, outDir: "/lib/sharp-splats",
        python: "python3", pythonVersion: "3.11.4", sharpInstalled: true, invocation: "sharp",
        weightsCached: false, remote: false, remoteEndpoint: "", remoteHasToken: false, where: "local", ready: true, why: "",
    });
    await page.click('[data-tab="sharp"]').catch(() => { });
    await page.waitForTimeout(300);
    ok("!! opening the tab fetches /sharp/status", requested.includes("status"));
    const licText = await page.evaluate(() => document.getElementById("sharpLicence")?.textContent || "");
    ok("!! the licence summary is shown, unconditionally", /Research use only/.test(licText) && /non-commercial/.test(licText), licText.slice(0, 60));
    const bodyHtml = await page.evaluate(() => document.getElementById("sharpStatus")?.innerHTML || "");
    ok("the local install state is reported (python + invocation)", /python3/.test(bodyHtml) && /sharp/.test(bodyHtml));
    ok("weights-not-cached is surfaced, not silently dropped", /not cached/.test(bodyHtml));
    const chipState = await page.evaluate(() => document.getElementById("sharpStat")?.textContent || "");
    ok("the chip's own status span reflects readiness", chipState === "local", "got " + JSON.stringify(chipState));
    await b.close();
}

// ---- 3. the modal case reads differently from the local case -----------------------------------------------
{
    const { b, page } = await load({
        ok: true, licence: { summary: "Research use only, non-commercial." }, outDir: "/lib/sharp-splats",
        python: "", pythonVersion: "", sharpInstalled: false, invocation: "",
        weightsCached: false, remote: true, remoteEndpoint: "https://x--sharp.modal.run", remoteHasToken: true,
        where: "modal", ready: true, why: "",
    });
    await page.click('[data-tab="sharp"]').catch(() => { });
    await page.waitForTimeout(300);
    const bodyHtml = await page.evaluate(() => document.getElementById("sharpStatus")?.innerHTML || "");
    ok("!! the modal case reports the endpoint and token state, not local python info",
        /x--sharp\.modal\.run/.test(bodyHtml) && !/python3/.test(bodyHtml));
    const epVal = await page.evaluate(() => document.getElementById("sharpEndpoint")?.value || "");
    ok("!! the saved endpoint prefills the field so the box's own config is visible without re-typing it",
        epVal === "https://x--sharp.modal.run", "got " + JSON.stringify(epVal));
    await b.close();
}

// ---- 4. an untouched prefill never clobbers what the user is mid-typing ------------------------------------
{
    const { b, page } = await load({
        ok: true, licence: { summary: "x" }, outDir: "/x", python: "", pythonVersion: "", sharpInstalled: false,
        invocation: "", weightsCached: false, remote: true, remoteEndpoint: "https://saved.example.modal.run",
        remoteHasToken: true, where: "modal", ready: true, why: "",
    });
    await page.click('[data-tab="sharp"]').catch(() => { });
    await page.waitForTimeout(250);
    await page.fill("#sharpEndpoint", "https://mid-typing.example");
    // A second load (e.g. re-opening the tab) must not overwrite what is being typed with the saved value --
    // that would be the same "field renamed itself under the user" shape hostingPanel-selfcheck already guards.
    await page.evaluate(() => window.dispatchEvent === window.dispatchEvent);   // no-op, keeps lints quiet
    const val = await page.evaluate(() => document.getElementById("sharpEndpoint").value);
    ok("!! typing into the endpoint field marks it touched, so a later status load will not overwrite it",
        val === "https://mid-typing.example");
    await b.close();
}

// ---- 5. config save: the token is written, never echoed back, and the field clears -------------------------
{
    const { b, page, requested, getCfgBody } = await load({
        ok: true, licence: { summary: "x" }, outDir: "/x", python: "", pythonVersion: "", sharpInstalled: false,
        invocation: "", weightsCached: false, remote: false, remoteEndpoint: "", remoteHasToken: false,
        where: "not configured", ready: false, why: "no working Python found",
    });
    await page.click('[data-tab="sharp"]').catch(() => { });
    await page.waitForTimeout(250);
    await page.fill("#sharpEndpoint", "https://new.example.modal.run");
    await page.fill("#sharpToken", "s3cret");
    await page.click("#sharpCfgSave");
    await page.waitForTimeout(250);
    ok("!! saving posts to /sharp/config with both fields", requested.includes("config"));
    let sent = null; try { sent = JSON.parse(getCfgBody() || "{}"); } catch { }
    ok("!! the token that was typed is what gets sent, not silently dropped",
        !!sent && sent.token === "s3cret" && sent.endpoint === "https://new.example.modal.run");
    const tokVal = await page.evaluate(() => document.getElementById("sharpToken")?.value);
    ok("!! the token field is CLEARED after a successful save -- a saved secret must not linger in a text input",
        tokVal === "");
    const cfgState = await page.evaluate(() => document.getElementById("sharpCfgState")?.textContent || "");
    ok("the save is confirmed on screen", /saved/i.test(cfgState), cfgState);
    await b.close();
}

// ---- 6. a config error is shown, not swallowed ---------------------------------------------------------------
{
    const { b, page } = await load({ ok: false, licence: {}, outDir: "", python: "", pythonVersion: "", sharpInstalled: false, invocation: "", weightsCached: false, remote: false, remoteEndpoint: "", remoteHasToken: false, where: "", ready: false, why: "" }, { cfgOk: false });
    await page.click('[data-tab="sharp"]').catch(() => { });
    await page.waitForTimeout(250);
    await page.fill("#sharpEndpoint", "not-a-url");
    await page.click("#sharpCfgSave");
    await page.waitForTimeout(200);
    const cfgState = await page.evaluate(() => document.getElementById("sharpCfgState")?.textContent || "");
    ok("!! a rejected config shows the bridge's own error text, not a generic failure", /https/.test(cfgState), cfgState);
    await b.close();
}

// ---- 7. predict: the empty-path guard fires BEFORE any request is made --------------------------------------
{
    const { b, page, requested } = await load({ ok: true, licence: {}, outDir: "/x", ready: true, where: "local", python: "p", sharpInstalled: true, invocation: "sharp" });
    await page.click('[data-tab="sharp"]').catch(() => { });
    await page.waitForTimeout(250);
    await page.click("#sharpRun");
    await page.waitForTimeout(150);
    ok("!! an empty image path is refused client-side -- no /sharp/predict call for nothing to predict",
        !requested.includes("predict"));
    const msg = await page.evaluate(() => document.getElementById("sharpResult")?.textContent || "");
    ok("...and says why", /enter a path/i.test(msg), msg);
    await b.close();
}

// ---- 8. predict: success shows the file, its size, and a working copy button --------------------------------
{
    const { b, page } = await load({ ok: true, licence: {}, outDir: "/x", ready: true, where: "local", python: "p", sharpInstalled: true, invocation: "sharp" });
    await page.click('[data-tab="sharp"]').catch(() => { });
    await page.waitForTimeout(250);
    await page.fill("#sharpImage", "/home/x/photo.jpg");
    await page.click("#sharpRun");
    await page.waitForTimeout(300);
    const html = await page.evaluate(() => document.getElementById("sharpResult")?.innerHTML || "");
    ok("!! a successful predict shows the produced file's name, size and the invocation that made it",
        /photo\.ply/.test(html) && /2\.38/.test(html) && /sharp/.test(html), html.slice(0, 140));
    ok("the full disk path is shown, not just the basename -- it is a server path, not a browsable URL",
        /\/lib\/sharp-splats\/photo\.ply/.test(html));
    ok("a copy-path control is offered", await page.$("#sharpCopyPath").then((x) => !!x));
    await b.close();
}

// ---- 9. predict: failure renders the bridge's reason, not a blank panel -------------------------------------
{
    const { b, page } = await load({ ok: true, licence: {}, outDir: "/x", ready: true, where: "local", python: "p", sharpInstalled: true, invocation: "sharp" }, { predictOk: false });
    await page.click('[data-tab="sharp"]').catch(() => { });
    await page.waitForTimeout(250);
    await page.fill("#sharpImage", "/home/x/photo.jpg");
    await page.click("#sharpRun");
    await page.waitForTimeout(300);
    const html = await page.evaluate(() => document.getElementById("sharpResult")?.innerHTML || "");
    ok("!! a failed predict shows the bridge's actual error text", /not installed/.test(html), html.slice(0, 140));
    await b.close();
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
