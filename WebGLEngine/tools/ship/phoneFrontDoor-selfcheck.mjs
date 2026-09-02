#!/usr/bin/env node
// WebGLEngine/tools/ship/phoneFrontDoor-selfcheck.mjs -- v4303
//
// GATES #87: phone.html has a FRONT DOOR, and the avatar dock is at the top of every phone-facing page.
// Keith: "the real phone entry point should be a similar view as of server.html ... phone.html is kind of a
// placement spot for misc panels" and "we should see the avatar dock at the top of every phone page."
//
// Two things, both derived rather than typed:
//   THE LAUNCHER IS BUILT FROM THE MENU. Home's tiles come from #tabs and #phoneTools at runtime, so the
//   count asserted here is the count of those buttons, read from the same page, and a panel added to the
//   menu without a tile is impossible by construction.
//   THE CENSUS OF PHONE-FACING PAGES IS READ FROM phone.html. Every page phone.html opens must mount
//   ui/pageGauges.js (the dock the other 62 non-render pages already mount), or be index.html, which is the
//   engine and mounts ui/dockedGauges.js from main.js instead.
//
// Section B boots phone.html in a real browser: lands on Home, counts the tiles, taps one, and measures that
// the dock sits ABOVE the header rather than on it.
//
// Run: node tools/ship/phoneFrontDoor-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const read = (p) => fs.readFileSync(path.join(ENG, p), "utf8");
const phone = read("phone.html");

// ---------------------------------------------------------------------------------------------------------
sec("A. THE SOURCE: HOME IS FIRST AND ACTIVE, THE OLD AUTO-JUMP IS GONE, THE DOCK IS ON EVERY PHONE-FACING PAGE");
// ---------------------------------------------------------------------------------------------------------
const tabButtons = [...phone.matchAll(/<button data-tab="([a-z]+)"([^>]*)>/g)].map((m) => ({ tab: m[1], active: /class="active"/.test(m[2]) }));
const tools = [...phone.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]);
{
    ok(tabButtons.length >= 14 && tabButtons[0].tab === "home" && tabButtons[0].active && tabButtons.filter((b) => b.active).length === 1,
       "*** the first menu button is Home and it is the only active one ***", `${tabButtons.length} buttons: ${tabButtons.map((b) => b.tab).join(" ")}`);
    const tabDivs = [...phone.matchAll(/<div class="tab( active)?" id="tab-([a-z]+)">/g)].map((m) => ({ tab: m[2], active: !!m[1] }));
    ok(tabDivs[0].tab === "home" && tabDivs[0].active && tabDivs.filter((d) => d.active).length === 1,
       "and the first panel is Home and the only active panel", `${tabDivs.length} panels`);
    ok(/id="appCaptionLabel">🏠 Home</.test(phone), "the caption pill reads Home at boot");
    ok(!/if \(savedBtn\) savedBtn\.click\(\);/.test(phone) && /Resume/.test(phone) && /voxelengine\.phoneTab/.test(phone),
       "*** the v639 auto-jump to the saved tab is gone; the saved tab is a Resume tile instead ***",
       "a front door is what you land on; the v639 promise survives as one tap");
    ok(/querySelectorAll\("#tabs button\[data-tab\]"\)\.forEach/.test(phone) && /querySelectorAll\("#phoneTools \[data-tool\]"\)\.forEach/.test(phone),
       "tiles are DERIVED from #tabs and #phoneTools at runtime, never listed a second time");
    ok(/get\("tab"\)/.test(phone), "?tab=<name> still deep-links a panel");
    ok(tools.length >= 10, "the Tools list has its pages", `${tools.length} tools`);

    // the census: every page phone.html opens mounts the dock, or is the engine
    const opened = [...new Set([...phone.matchAll(/(?:window\.open\(|href=)["'](\/?[A-Za-z0-9_.-]+\.html)/g)].map((m) => m[1].replace(/^\//, "")))]
        .filter((p) => p !== "phone.html" && fs.existsSync(path.join(ENG, p)));
    const missing = opened.filter((p) => p !== "index.html" && !/pageGauges\.js/.test(read(p)));
    ok(opened.length >= 4 && missing.length === 0,
       "*** every page phone.html opens mounts ui/pageGauges.js (index.html is the engine and mounts dockedGauges) ***",
       missing.length ? "MISSING: " + missing.join(", ") : opened.join(", "));
    ok(/import\("\/ui\/pageGauges\.js"\)/.test(phone) && /--swekDockH/.test(phone) && /header \{ top:var\(--swekDockH/.test(phone),
       "phone.html mounts the dock and pushes its sticky header and nav below it by the dock's measured height");
    ok(/mountDockedGauges\(\)/.test(read("main.js")), "and index.html's engine mounts the render dock from main.js");
}

// ---------------------------------------------------------------------------------------------------------
sec("B. IN A REAL BROWSER: LANDS ON HOME, TILES MATCH THE MENU, A TAP SWITCHES, THE DOCK IS ABOVE THE HEADER");
// ---------------------------------------------------------------------------------------------------------
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("  SKIP  section B -- " + skip); } else {
    const browser = await chromium.launch({ executablePath: HEADLESS_SHELL });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });   // a phone
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.hostname === "swek.local") {
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                const ext = path.extname(p);
                return route.fulfill({ status: 200, contentType: ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : ext === ".json" ? "application/json" : ext === ".svg" ? "image/svg+xml" : "text/javascript", body: fs.readFileSync(p) });
            }
        }
        return route.fulfill({ status: 404, body: "not found" });
    });
    try {
        await page.goto("http://swek.local/phone.html", { waitUntil: "domcontentloaded", timeout: 30000 });
        let err = null;
        await page.waitForFunction(() => document.querySelector("#tab-home.active") && document.querySelectorAll("#homeTiles .tile").length > 5 && document.getElementById("swekPageGauges"),
            undefined, { timeout: 30000 }).catch((e) => { err = e; });
        ok(!err, "*** phone.html lands on Home with tiles built and the dock mounted ***", err ? String(err).slice(0, 140) : "landed");
        const got = await page.evaluate(() => {
            const tabs = document.querySelectorAll("#tabs button[data-tab]").length, tools = document.querySelectorAll("#phoneTools [data-tool]").length;
            const tiles = document.querySelectorAll("#homeTiles .tile:not(.resume)").length, pages = document.querySelectorAll("#homePages .tile").length;
            const dock = document.getElementById("swekPageGauges"), header = document.querySelector("header");
            const d = dock.getBoundingClientRect(), h = header.getBoundingClientRect();
            return { tabs, tools, tiles, pages, dockBottom: d.bottom, headerTop: h.top, dockH: d.height, pad: parseFloat(getComputedStyle(document.body).paddingTop),
                     caption: document.getElementById("appCaptionLabel").textContent.trim(), active: document.querySelector("#tabs button.active").dataset.tab };
        });
        ok(got.tiles === got.tabs - 1 && got.pages === got.tools, "*** one tile per menu button (minus Home) and one per tool, counted from the live page ***",
           `${got.tiles} panel tiles for ${got.tabs} buttons, ${got.pages} page tiles for ${got.tools} tools`);
        ok(got.active === "home" && got.caption === "🏠 Home", "the caption and the active button both say Home", got.caption);
        ok(got.dockH > 40 && got.headerTop >= got.dockBottom - 1 && got.pad >= got.dockH,
           "*** the dock is above the header, not on it: the header's top is at or below the dock's bottom ***",
           `dock ${got.dockH.toFixed(0)} px tall ending at ${got.dockBottom.toFixed(0)}, header starts at ${got.headerTop.toFixed(0)}, body padded ${got.pad.toFixed(0)}`);
        await page.click('#homeTiles .tile[data-go="demos"]');
        const after = await page.evaluate(() => ({ active: document.querySelector("#tabs button.active").dataset.tab, panel: !!document.querySelector("#tab-demos.active"), home: !!document.querySelector("#tab-home.active") }));
        ok(after.active === "demos" && after.panel && !after.home, "tapping the Demos tile opens the Demos panel and leaves Home", JSON.stringify(after));
        // the saved-tab memory now appears as a Resume tile on the next boot
        await page.goto("http://swek.local/phone.html", { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForFunction(() => document.querySelectorAll("#homeTiles .tile").length > 5, undefined, { timeout: 30000 }).catch(() => {});
        const resume = await page.evaluate(() => { const t = document.querySelector("#homeTiles .tile.resume"); return { text: t ? t.textContent : null, home: !!document.querySelector("#tab-home.active") }; });
        ok(resume.home && resume.text && /Resume .*Demos/.test(resume.text), "*** the next boot lands on Home again and offers the last panel as a Resume tile ***", JSON.stringify(resume.text));
        // one sibling page: the dock is there too
        await page.goto("http://swek.local/view.html", { waitUntil: "domcontentloaded", timeout: 30000 });
        let vErr = null; await page.waitForFunction(() => document.getElementById("swekPageGauges"), undefined, { timeout: 20000 }).catch((e) => { vErr = e; });
        ok(!vErr, "view.html, opened from the phone, mounts the same dock", vErr ? String(vErr).slice(0, 100) : "mounted");
        ok(errors.length === 0, "no page errors across the three boots", errors.join(" | "));
    } catch (e) {
        ok(false, "section B ran to its end", String(e && e.message || e).slice(0, 160));
    } finally { await browser.close(); }
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  Listener made the landing tab again (active button and active panel moved back).
//      -> exit=1, FIVE lines: both source checks, the browser never finds #tab-home.active, the caption line,
//      and section B cannot even find a tile to tap. This is the page as it was for 3,600 rounds.
//
//   B  view.html's dock import pointed at a module that does not exist.
//      -> exit=1, two lines: the census names view.html as MISSING, and the browser boot of view.html finds
//      no #swekPageGauges. The census is read from phone.html's own links, so a page added to the phone's
//      Tools list later is censused without anyone adding it here.
//
//   C  the header's `top: var(--swekDockH)` rule removed.
//      -> exit=1, the source line. (The browser measurement stayed GREEN: at boot nothing has scrolled, so a
//      padded body puts the header below the dock either way; the rule matters once the sticky header
//      sticks. Recorded so nobody mistakes the source check for redundant.)
//
//   D  one menu button (Voice) skipped when the tiles are built.
//      -> exit=1: "13 panel tiles for 15 buttons". The count is read from the live page's own menu, which is
//      why a typed number was never an option.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the 62 pages that already mounted the dock before this round (their census is " +
    "pageGauges' own), what the tiles LOOK like, and the Android TV browser's window.open refusal path.");
process.exit(fails ? 1 : 0);
