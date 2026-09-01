#!/usr/bin/env node
// tools/ship/phoneQR-selfcheck.mjs -- v4210
//
// Run: node tools/ship/phoneQR-selfcheck.mjs   (needs Chromium; skips cleanly without it)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/phoneConnectQR.js AND server.html's "Phone Mode" button.
//
// *** THE BUG THIS EXISTS FOR: server.html's "Phone Mode" button opened the phone UI ON THE PC. *** Keith:
// "what should phone button do on server.html really? i remember, show a qr code so the phone can open it."
// It ran window.open("/phone.html"), putting a touch UI -- sticks, thumb-sized targets -- in a desktop tab,
// while the actual phone was still left needing someone to read an IP off the screen and type it in.
//
// The QR already existed, in ui/phoneConnectQR.js, SEALED INSIDE initPhoneConnectQR'S CLOSURE and reachable
// only from the engine's left rail. v4210 lifted the modal to module scope and exported it so this page
// raises THE SAME one rather than growing a second copy -- and that lift is exactly the kind of refactor
// that breaks the ORIGINAL caller silently, so this file drives BOTH entry points, not just the new one.
// (It did break one: `getActive: () => !!card` in the rail mount still read the variable that had moved,
// which would throw on every hover. Caught here, before it shipped.)
//
// THE LOCALHOST SUBSTITUTION IS THE POINT OF THE WHOLE FEATURE and is asserted rather than assumed: a QR
// encoding "http://localhost:8787/phone.html" is WORSE than no QR, because a phone scanning it resolves
// localhost to its OWN loopback and shows a broken page with no hint why. /net/info is stubbed with a LAN
// address here and the rendered URL is read back out of the DOM.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, "ui", "phoneConnectQR.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("phoneQR-selfcheck -- the scan-to-connect QR, driven from BOTH its entry points\n");

// ---- 1. STATIC: the exports the second caller depends on actually exist ------------------------------------
{
    console.log("1. THE MODULE EXPOSES THE MODAL, NOT JUST THE ENGINE'S MOUNT");
    const src = fs.readFileSync(SRC, "utf8");
    const mod = await import("../../ui/phoneConnectQR.js");
    for (const name of ["showPhoneQR", "closePhoneQR", "togglePhoneQR", "isPhoneQROpen", "controlURLForPhone", "initPhoneConnectQR"]) {
        ok("exports " + name, typeof mod[name] === "function");
    }
    ok("!! isPhoneQROpen() is false before anything is shown -- and does not throw without a DOM",
        mod.isPhoneQROpen() === false);
    // The stale-closure defect this round introduced and caught: the rail's getActive must not read a
    // variable that now lives at module scope. An ABSENCE is a code shape, so this reads code, not comments.
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    ok("!! *** the rail's getActive does NOT read the moved `card` binding (it threw before this was fixed) ***",
        !/getActive:\s*\(\)\s*=>\s*!!card\b/.test(codeOnly), "must call isPhoneQROpen() instead");
    ok("the modal state lives at module scope, so two hosts cannot each open their own",
        /^let _card = null;$/m.test(codeOnly));
}

// ---- browser harness --------------------------------------------------------------------------------------
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) {
    console.log("\n(browser sections SKIPPED -- " + skip + ")");
    console.log("\nphoneQR-selfcheck: " + (fails ? fails + " FAILED" : "static checks pass"));
    process.exit(fails ? 1 : 0);
}

const LAN = "http://192.168.50.41:8787/";
const RAIL_PAGE = '<!doctype html><meta charset=utf-8><body><script type="module">\n'
    + 'import { initPhoneConnectQR, isPhoneQROpen } from "/ui/phoneConnectQR.js";\n'
    + 'window.__isOpen = isPhoneQROpen;\n'
    + 'initPhoneConnectQR().then(function(){ window.__ready = 1; });\n'
    + '</scr' + 'ipt></body>';

const srv = http.createServer((q, r) => {
    const u = new URL(q.url, "http://x");
    if (u.pathname === "/__rail.html") { r.writeHead(200, { "Content-Type": "text/html" }); r.end(RAIL_PAGE); return; }
    // Stubbed so the localhost -> LAN substitution has something real to substitute.
    if (u.pathname === "/net/info") {
        r.writeHead(200, { "Content-Type": "application/json" });
        r.end(JSON.stringify({ recommended: LAN, lanIps: ["192.168.50.41"], port: 8787 }));
        return;
    }
    let p = path.join(ROOT, decodeURIComponent(u.pathname));
    try { if (fs.statSync(p).isDirectory()) p = path.join(p, "index.html"); } catch {}
    fs.readFile(p, (e, d) => {
        if (e) { r.writeHead(404); r.end("not found"); return; }
        const x = path.extname(p);
        r.writeHead(200, { "Content-Type": x === ".js" || x === ".mjs" ? "text/javascript"
            : x === ".html" ? "text/html" : x === ".json" ? "application/json"
            : x === ".css" ? "text/css" : "application/octet-stream" });
        r.end(d);
    });
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const port = srv.address().port;
const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });

async function open(url) {
    const page = await b.newContext({ viewport: { width: 1280, height: 900 } }).then((c) => c.newPage());
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto("http://127.0.0.1:" + port + url, { waitUntil: "domcontentloaded" }).catch(() => {});
    return { page, errs };
}
const modalUp = (page) => page.evaluate(() => !!document.getElementById("phone-qr-slot"));

// ---- 2. server.html's "Phone Mode" button raises the QR, and does NOT open a tab --------------------------
{
    console.log("\n2. *** server.html's PHONE MODE BUTTON SHOWS A QR INSTEAD OF OPENING phone.html ON THE PC ***");
    const { page, errs } = await open("/server.html");
    await page.waitForTimeout(2500);
    // If the old behaviour came back, THIS is what would catch it: a new tab rather than a modal.
    await page.evaluate(() => { window.__opened = 0; const o = window.open; window.open = function(){ window.__opened++; return o.apply(window, arguments); }; });
    ok("!! the pfPhone button exists on this page", await page.evaluate(() => !!document.getElementById("pfPhone")));
    ok("no QR modal before the click", (await modalUp(page)) === false);
    await page.evaluate(() => document.getElementById("pfPhone").click());
    await page.waitForTimeout(2200);
    ok("!! *** clicking it raises the QR modal ***", await modalUp(page));
    ok("!! *** and does NOT window.open() a phone UI onto this desktop -- the v4210 bug in one assertion ***",
        (await page.evaluate(() => window.__opened)) === 0);
    const info = await page.evaluate(() => {
        const slot = document.getElementById("phone-qr-slot");
        const img = slot && slot.querySelector("img");
        const txt = slot && slot.parentElement ? slot.parentElement.textContent : "";
        return { hasImg: !!img, w: img ? Math.round(img.getBoundingClientRect().width) : 0,
                 url: (txt.match(/https?:\/\/[^\s]+?\/phone\.html/) || [""])[0] };
    });
    ok("!! a QR image actually rendered, at a scannable size", info.hasImg && info.w >= 100,
        JSON.stringify(info));
    ok("!! *** the encoded URL is the LAN address, NOT localhost -- a localhost QR is worse than none ***",
        info.url === LAN.replace(/\/+$/, "") + "/phone.html", "got " + info.url);
    await page.evaluate(() => document.getElementById("pfPhone").click());
    await page.waitForTimeout(700);
    ok("clicking again closes it (one modal, toggled, not stacked)", (await modalUp(page)) === false);
    ok("no uncaught page errors through the whole cycle", errs.length === 0, errs.join(" | ").slice(0, 200));
    await page.close();
}

// ---- 3. THE ORIGINAL CALLER STILL WORKS -- the half a refactor breaks silently -----------------------------
{
    console.log("\n3. *** THE ENGINE'S OWN LEFT-RAIL BUTTON STILL WORKS -- what the lift could have broken ***");
    const { page, errs } = await open("/__rail.html");
    await page.waitForTimeout(1800);
    ok("initPhoneConnectQR() resolved", await page.evaluate(() => !!window.__ready));
    ok("!! the rail button mounted", await page.evaluate(() => !!document.getElementById("phone-qr-btn")));
    ok("isPhoneQROpen() reads false before opening", (await page.evaluate(() => window.__isOpen())) === false);
    await page.evaluate(() => document.getElementById("phone-qr-btn").click());
    await page.waitForTimeout(1500);
    ok("!! the rail button raises the SAME modal", await modalUp(page));
    ok("!! *** isPhoneQROpen() tracks it -- this is what getActive reads, and reading `card` would throw ***",
        (await page.evaluate(() => window.__isOpen())) === true);
    await page.evaluate(() => document.getElementById("phone-qr-btn").click());
    await page.waitForTimeout(700);
    ok("and toggles it closed", (await modalUp(page)) === false);
    ok("no uncaught page errors from the rail path", errs.length === 0, errs.join(" | ").slice(0, 200));
    await page.close();
}

await b.close();
srv.close();
console.log("\nphoneQR-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
