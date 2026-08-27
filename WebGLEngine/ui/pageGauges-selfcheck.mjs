// ui/pageGauges-selfcheck.mjs
//
// Run: node ui/pageGauges-selfcheck.mjs   (live half skips cleanly without Chromium)
//
// v4051 -- ui/pageGauges.js (the top-center gauge dock on Universal Viewer, PDF/Comics, Pip-Boy and every
// other no-render page) had NO gate at all until this file. Keith, looking at the dock: "move the 2 vertical
// Home/Minimize buttons from the right side of the dock, to the left of the 2 row arrows on the left" -- then
// "the home / minimize buttons should be the same size as the arrows, so they match." Both were real: Home
// and Minimize sat in `topRow` AFTER the scroll arrows (rtb came after scrollBtns in the append call), and at
// 30px against the arrows' 28px -- a plain literal mismatch nobody had asked for, not a deliberate difference.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "../tools/ship/playwrightResolve.mjs";
import { codeOnly, noComments } from "../tools/ship/sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const SRC = fs.readFileSync(path.join(ENG, "ui", "pageGauges.js"), "utf8");
const CODE = codeOnly(SRC);      // code shapes (append order, variable names)
const TEXT = noComments(SRC);    // string literals (glyphs, titles)

console.log("pageGauges-selfcheck -- Home/Minimize moved left of the scroll arrows, and sized to match\n");

console.log("1. *** SOURCE: ONE SIZE CONSTANT, ONE APPEND ORDER ***");
{
    ok("!! a single NAV_BTN_SIZE constant exists, rather than four literals that can drift apart again",
        /const NAV_BTN_SIZE = 28;/.test(CODE),
        "the bug this file guards against IS four literal sizes that started equal and one (30) drifted");
    // ▲▼⌂– below are ▲/▼/⌂/– ESCAPE SEQUENCES ON DISK, not literal glyphs -- pageGauges.js
    // writes them that way (grep confirms), so a regex built from the literal characters matches nothing
    // against noComments() output and reads as "the fix is missing" when it is not. Same family of trap this
    // tree's own sourceScan rule already names for comments/strings; this is the escape-sequence half of it.
    ok("!! the scroll arrows are built from NAV_BTN_SIZE, not a literal",
        /toolBtn\("\\u25B2", "Scroll gauges up", NAV_BTN_SIZE\)/.test(TEXT) &&
        /toolBtn\("\\u25BC", "Scroll gauges down", NAV_BTN_SIZE\)/.test(TEXT),
        "a literal here would leave NAV_BTN_SIZE describing only half the pair it claims to unify");
    ok("!! ...and Home + Minimize are ALSO built from NAV_BTN_SIZE, not their old literal 30",
        /toolBtn\("\\u2302", "Home \\u2014 back to SweK Engine home", NAV_BTN_SIZE\)/.test(TEXT) &&
        /toolBtn\("\\u2013", "Minimize gauges", NAV_BTN_SIZE\)/.test(TEXT),
        "this is the actual fix for 'same size as the arrows' -- a shared constant, not two numbers that happen to match today");
    ok("!! *** THE LOAD-BEARING ORDER: rtb (Home/Minimize) BEFORE scrollBtns in the append call ***",
        /topRow\.append\(rtb, scrollBtns, clip, robotCol, fsCol\)/.test(CODE),
        "DOM append order IS visual left-to-right order in a row flex container -- rtb after scrollBtns would " +
        "still read as 'Home/Minimize to the right of the arrows' regardless of any comment claiming otherwise");
}

console.log("\n2. *** LIVE: A REAL BROWSER, REAL PIXELS, REAL POSITIONS ***");
{
    const { chromium, from } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: section 1 reads the source; only a real browser can show " +
               "which button actually paints to the left of which, or whether two buttons are really the same size.");
    } else {
        const srv = http.createServer((rq, rs) => {
            const u = decodeURIComponent(rq.url.split("?")[0]);
            if (u === "/") {
                rs.writeHead(200, { "Content-Type": "text/html" });
                return rs.end('<script type="module">import{mountPageGauges}from"/ui/pageGauges.js";mountPageGauges();</script>');
            }
            // every fetch this mounts (whoami, sync/peers, brain/health, system/stats, hosting/landing) is
            // wrapped in its own try/catch(()=>{}) upstream, so a blanket 404 here is a safe, honest stand-in
            // for "no bridge" rather than something this gate needs to fake data for.
            let body = null;
            try { body = fs.readFileSync(path.join(ENG, u)); } catch {}
            if (body) { rs.writeHead(200, { "Content-Type": /\.mjs$|\.js$/.test(u) ? "text/javascript" : "application/octet-stream" }); rs.end(body); }
            else { rs.writeHead(404); rs.end(); }
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL || undefined });
        const page = await browser.newPage();
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e)));
        await page.goto("http://127.0.0.1:" + srv.address().port + "/", { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);

        const layout = await page.evaluate(() => {
            const root = document.getElementById("swekPageGauges");
            if (!root) return null;
            const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height) }; };
            // found BY TITLE, not by DOM position -- a positional cols[0]/cols[1] assumption would crash (or
            // silently compare the wrong elements) the moment the append order changes at all, which is
            // exactly the one thing section 1's static check exists to catch. This asks "where IS the button
            // titled X", which stays meaningful regardless of how topRow is ordered.
            const byTitle = (t) => [...root.querySelectorAll("button")].find((b) => b.title === t) || null;
            const homeBtn = byTitle("Home — back to SweK Engine home"), minBtn = byTitle("Minimize gauges");
            const upBtn = byTitle("Scroll gauges up"), dnBtn = byTitle("Scroll gauges down");
            if (!homeBtn || !minBtn || !upBtn || !dnBtn) return { missing: true };
            return { home: r(homeBtn), min: r(minBtn), up: r(upBtn), dn: r(dnBtn) };
        });
        ok("!! the dock actually mounted", !!layout, layout ? "" : "mountPageGauges() produced no #swekPageGauges");
        ok("!! ...and all four buttons this check needs (Home/Minimize/Scroll up/Scroll down) were found by title",
            !!layout && !layout.missing, layout && layout.missing ? "one or more toolBtn() titles changed" : "");

        if (layout && !layout.missing) {
            ok("!! *** Home/Minimize PAINT TO THE LEFT of the scroll arrows, in real pixels *** (Keith's own words)",
                layout.home.x < layout.up.x && layout.min.x < layout.dn.x,
                "home.x=" + layout.home.x + " up.x=" + layout.up.x + "  min.x=" + layout.min.x + " dn.x=" + layout.dn.x +
                " -- the whole request was about which side of the arrows these buttons paint on");
            ok("!! ...and Home/Minimize are the SAME SIZE as the scroll arrows, in real pixels, not just in source",
                layout.home.w === layout.up.w && layout.home.h === layout.up.h &&
                layout.min.w === layout.dn.w && layout.min.h === layout.dn.h,
                "home=" + JSON.stringify(layout.home) + " up=" + JSON.stringify(layout.up) +
                "  min=" + JSON.stringify(layout.min) + " dn=" + JSON.stringify(layout.dn) +
                " -- before the fix this measured 30px against 28px, a mismatch nobody asked for");
        }
        ok("!! no page errors", errs.length === 0, errs.length ? errs.slice(0, 2).join(" | ") : "clean");
        await browser.close();
        await new Promise((r) => srv.close(r));
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
if (fails) process.exit(1);
