// tools/ship/dockRows-selfcheck.mjs
//
// Run: node tools/ship/dockRows-selfcheck.mjs   (live half skips cleanly without Chromium)
// RUNTIME 4.25s MEASURED (median of 3 -- 4246/4273/4255 ms, with date(1) around the run). The live half is a
// real headless Chromium mounting the dock against a stub bridge -- and it waits out two poll cycles on
// purpose, because the property that matters most (an unreachable bridge reads "-" and never 0) can only be
// seen by taking the bridge away mid-run.
//
// v4020 -- Keith, looking at the dock on hosting.html: "we want a 3rd row available to list the brains
// available in fleet and how many are working... I think we already have that row, but we want it available as
// the 3rd row." And: "I think we also prepared a 4th row, which is the record video button row, so any page
// that has that dock can be recorded."
//
// HE WAS RIGHT ABOUT ONE AND WRONG ABOUT THE OTHER, AND BOTH ANSWERS WERE WORTH FINDING BEFORE BUILDING.
// The brains row was REAL AND LIVE -- /ai/brain/health has published registeredBrains and brainsBusy for
// rounds, and server.html read them -- but as a MORPHABLE CONTENDER for slot 2, competing with the peers row,
// on ONE page. Every other docked page had no brains row at all. The record row had never existed: the
// capability did (canvasRecorder.js, and recordFloat.js's floating button on 25 pages) but nothing in the dock.
//
// *** THE CAP WAS THE WHOLE BLOCKER, AND IT WAS A TYPED NUMBER. *** readGaugeConfig() did g.slice(0, 6) and
// padded to 6. dockedGauges has ALWAYS derived _rows from ceil(cells/3) -- the ▲/▼ scroll was generic from the
// start -- so nothing about rows 3 and 4 needed inventing; a literal 6 guarding a list of 6 was the only thing
// pinning the dock at two rows. It is derived from DEFAULT_GAUGES.length now, so a fifth row is one edit.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
// *** BOTH STRIPPERS, AND GETTING IT WRONG COST FOUR FALSE FAILURES ON THIS FILE'S FIRST RUN. ***
// codeOnly() blanks STRING CONTENTS as well as comments -- so "/ai/brain/health", querySelector("canvas") and
// import("./canvasRecorder.js") all read as empty. noComments() keeps strings and drops comments, which is what
// a check for a string LITERAL needs; codeOnly is what a check for a code SHAPE needs, because both files here
// explain the old rules in prose and raw text would read the explanation as the defect.
// FOURTH TIME THIS SPECIES BIT TODAY (gateWalk, artifactSize, patchBase, here). The rule is simple and I keep
// having to relearn it: searching for a string wants noComments, searching for a shape wants codeOnly.
import { codeOnly, noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const SRC = fs.readFileSync(path.join(ENG, "ui", "svgGaugeSet.js"), "utf8");
const CODE = codeOnly(SRC);      // shapes
const TEXT = noComments(SRC);    // string literals

console.log("dockRows-selfcheck -- does the dock have a fleet row and an actions row, on every page?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE CAP IS DERIVED, NOT TYPED ***");
{
    // The literal that pinned the dock at two rows for its whole life. A gate on the NUMBER would have to be
    // updated every time a row is added, which is the same defect one level up -- so this asserts the SHAPE:
    // the cap must be read from the list it guards.
    ok("!! *** readGaugeConfig no longer slices to a hardcoded 6 ***", !/slice\(0,\s*6\)/.test(CODE),
        "a literal 6 guarding a list of 6 is a number that has to be remembered; it was not, for 2354 versions");
    ok("!! ...and the cap comes from DEFAULT_GAUGES.length", /DEFAULT_GAUGES\.length/.test(CODE),
        "so adding a row is a one-place edit");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** FOUR ROWS OF THREE, IN THE ORDER KEITH ASKED FOR ***");
let DEFAULTS = [];
{
    // Parsed from the module rather than re-declared here: a gate holding its own copy of the row order would
    // agree with itself forever (v3527, met more times this week than any other rule).
    const block = (SRC.match(/const DEFAULT_GAUGES = \[([\s\S]*?)\n\];/) || ["", ""])[1];
    DEFAULTS = [...block.matchAll(/\{\s*(?:source|action):\s*"([^"]+)"/g)].map((m) => m[1]);
    ok("!! the default set is 12 cells -- four rows of three", DEFAULTS.length === 12,
        DEFAULTS.length + " cells: " + DEFAULTS.join(", "));
    ok("!! row 3 is the FLEET: brains, then how many are working",
        DEFAULTS[6] === "brains" && DEFAULTS[7] === "solving",
        "row 3 = " + DEFAULTS.slice(6, 9).join(", "));
    ok("!! row 4 is the ACTIONS row, record first",
        DEFAULTS[9] === "record" && DEFAULTS.slice(9, 12).join(",") === "record,mp4,clip",
        "row 4 = " + DEFAULTS.slice(9, 12).join(", "));
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE FLEET NUMBERS COME FROM THE BRIDGE THAT ALREADY PUBLISHED THEM ***");
{
    ok("!! the set polls /ai/brain/health rather than inventing a second source",
        /\/ai\/brain\/health/.test(TEXT),
        "server.html has read registeredBrains + brainsBusy from there for rounds; this is the same endpoint, " +
        "not a new one");
    ok("!! ...and reads registeredBrains and brainsBusy by name",
        /registeredBrains/.test(CODE) && /brainsBusy/.test(CODE));
    ok("!! ...and only fetches when a fleet dial is actually mounted",
        /needsBrains/.test(CODE),
        "a docked page with no brain dial should not poll the brain bridge every 2s");
    // COUNTS, NOT PERCENTS. "3 BRAINS" is a headcount; rendering it as 3% would be a number that looks like a
    // reading and means nothing.
    ok("!! brains and solving render as COUNTS", /COUNT_SOURCES[\s\S]{0,200}?"brains",\s*"solving"/.test(TEXT),
        "a headcount drawn as a percent is a number that looks like a reading and means nothing");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** AN ACTION CELL REFUSES A PAGE IT CANNOT SERVE ***");
{
    // recordFloat.js (v3950) settled this for the floating button, quoting this tree's own claim: "v2579 A flag
    // that lies is worse than no flag." A record button on a page with no <canvas> is decoration that fails on
    // click, and the same reasoning binds here.
    ok("!! the record cell checks for a canvas before offering to record",
        /querySelector\("canvas"\)/.test(TEXT),
        "nine of recordFloat's twenty-five pages have no canvas at all");
    ok("!! ...and asks the recorder's own capabilities() rather than assuming",
        /capabilities\s*&&\s*rec\.capabilities\(\)|rec\.capabilities\(\)/.test(CODE),
        "captureStream + MediaRecorder are not secure-context gated, but the codecs can still be missing");
    ok("!! ...and the recorder is imported LAZILY, on the click that needs it",
        /await import\("\.\/canvasRecorder\.js"\)/.test(TEXT),
        "installing a MediaRecorder on every docked page would be a cost paid by pages that never record");
    ok("!! an action handle still satisfies the refresh contract",
        /action:\s*cfg\.action,\s*update\(\)\s*\{\s*\}/.test(CODE),
        "refresh() must never have to ask whether a handle is real");

    // *** v4050 -- Keith, looking at the record row: "circles need to be smaller, same size as the other
    // rows." *** Every dial (_makeGauge, _makeWeatherGauge) tilts its SVG with
    // perspective(150px) rotateX(17deg) -- the "physical dial" look, which FORESHORTENS the painted box. The
    // action button was the same nominal 42*scale diameter but FLAT, so at an identical width it painted
    // rounder/bigger than every dial beside it in the same row. This file's own comment above the action-cell
    // builder ("An ACTION cell is the same box as a dial") was true of the width and false of the one property
    // that actually decides how big a circle READS as. Section 5 below re-proves this live, on real pixels.
    // TEXT (noComments), not CODE (codeOnly) -- this is a STRING LITERAL value, and codeOnly() blanks string
    // contents. This file's own header names this exact trap ("codeOnly is what a code SHAPE needs"); the
    // first run of this very check matched 0 against CODE for that reason.
    const dialTransforms = (TEXT.match(/perspective\(150px\) rotateX\(17deg\)/g) || []).length;
    ok("!! the action button now tilts with the SAME transform as every dial, not a flat circle beside tilted ones",
        dialTransforms === 3,
        dialTransforms + " occurrences (want 3: _makeWeatherGauge, _makeGauge, and now _makeActionCell) -- " +
        "fewer than 3 means the action button is still flat and will read bigger than its row-mates");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** AND IT ACTUALLY RENDERS FOUR ROWS IN A REAL BROWSER ***");
{
    const { chromium, from } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 read the source, and source cannot show that " +
               "twelve cells actually lay out as four rows or that a dial reads 3 instead of a dash.");
    } else {
        let health = { registeredBrains: 3, brainsBusy: 2 };
        const srv = http.createServer((rq, rs) => {
            const u = rq.url.split("?")[0];
            if (u === "/ai/brain/health") {
                if (health === null) { rs.writeHead(500); return rs.end(); }
                rs.writeHead(200, { "Content-Type": "application/json" }); return rs.end(JSON.stringify(health));
            }
            if (u === "/system/stats") { rs.writeHead(200, { "Content-Type": "application/json" }); return rs.end("{}"); }
            if (u === "/") {
                rs.writeHead(200, { "Content-Type": "text/html" });
                return rs.end('<canvas width=9 height=9></canvas><div id=h></div><script type="module">' +
                    'import{mountSvgGaugeSet}from"/ui/svgGaugeSet.js";' +
                    // scale:2 matches ui/pageGauges.js's real mount call -- the size-parity check below needs
                    // the SAME scale production actually uses, because the flat-vs-tilted gap it measures is
                    // small at scale:1 and only becomes reliably visible (and reliably gate-able) at scale:2.
                    'mountSvgGaugeSet(document.getElementById("h"),{columns:3,pollMs:400,scale:2}).start();</script>');
            }
            let body = null;
            try { body = fs.readFileSync(path.join(ENG, u)); } catch {}
            if (body) { rs.writeHead(200, { "Content-Type": "text/javascript" }); rs.end(body); }
            else { rs.writeHead(404); rs.end(); }
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL || undefined });
        const page = await browser.newPage();
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e)));
        await page.goto("http://127.0.0.1:" + srv.address().port + "/", { waitUntil: "networkidle" });
        await page.waitForTimeout(1800);

        const shape = await page.evaluate(() => {
            const grid = document.querySelector("#h > div");
            const cells = [...grid.children];
            return { cells: cells.length, buttons: cells.filter((c) => c.querySelector("button")).length,
                     cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length };
        });
        ok("!! *** TWELVE CELLS IN A THREE-COLUMN GRID -- FOUR ROWS ***",
            shape.cells === 12 && shape.cols === 3,
            shape.cells + " cells, " + shape.cols + " columns => " + Math.ceil(shape.cells / 3) + " rows");
        ok("!! ...and three of them are real buttons", shape.buttons === 3, shape.buttons + " buttons");

        const live = await page.evaluate(() =>
            [...document.querySelectorAll("#h > div > div")].map((c) => c.textContent.trim()).slice(6, 8));
        ok("!! *** THE FLEET DIALS READ THE BRIDGE'S REAL NUMBERS ***",
            /3/.test(live[0]) && /2/.test(live[1]),
            JSON.stringify(live) + " from {registeredBrains:3, brainsBusy:2}");

        // *** THE ONE THAT MATTERS MOST: UNREACHABLE IS NOT ZERO. *** v3237/v3258's rule, which this same file
        // has now had to learn three times. A fleet that cannot be reached and a fleet with no brains are
        // different facts and only one of them should look alarming.
        health = null;
        await page.waitForTimeout(1400);
        const dead = await page.evaluate(() =>
            [...document.querySelectorAll("#h > div > div")].map((c) => c.textContent.trim()).slice(6, 8));
        ok("!! *** AND AN UNREACHABLE BRIDGE READS '-', NEVER 0 ***",
            /–|-/.test(dead[0]) && !/^0/.test(dead[0]) && !/^0/.test(dead[1]),
            JSON.stringify(dead) + " -- a dial reading 0 on an unreachable fleet is a convincing nothing");

        ok("!! no page errors", errs.length === 0, errs.length ? errs.slice(0, 2).join(" | ") : "clean");

        // *** THE CLAIM ITSELF, MEASURED ON REAL PAINTED PIXELS RATHER THAN SOURCE TEXT. *** Section 4's
        // static check can only prove the SAME transform string is present; it cannot prove that string
        // actually makes the two circles the same visual size once the browser paints them. This does.
        const sizes = await page.evaluate(() => {
            const cells = [...document.querySelectorAll("#h > div > div")];
            const dial = cells[0].querySelector("svg");         // row 1, cell 1: a dial (CPU)
            const action = cells[9].querySelector("button");    // row 4, cell 1: an action (record)
            const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
            return { dial: r(dial), action: r(action) };
        });
        // WIDTH, not height, is what discriminates here -- MEASURED both directions. A flat circle button is
        // exactly square (84x84 at scale:2); the tilted dial foreshortens to ~90x85 (wider than tall). Fixed,
        // the action button measures ~91x81 -- width within 1px of the dial's 90, because both now carry the
        // identical tilt. Height actually moves FARTHER apart post-fix (81 vs 85) than a flat button's height
        // happens to sit (84 vs 85) -- foreshortening trims height on both, unevenly, so height alone is not a
        // reliable signal here. Width is: 90 vs 84 (flat, off by 6) against 90 vs 91 (tilted, off by 1).
        ok("!! *** THE RECORD BUTTON PAINTS THE SAME WIDTH AS A DIAL, NOT VISIBLY BIGGER *** (Keith's own words)",
            Math.abs(sizes.dial[0] - sizes.action[0]) <= 3,
            "dial=" + JSON.stringify(sizes.dial) + "  action(record)=" + JSON.stringify(sizes.action) +
            " -- a FLAT circle at this scale measures a squared-off 84x84 against the dial's tilted ~90x85; " +
            "width alone separates them (off by ~6px flat, ~1px tilted) because a flat button's height happens " +
            "to coincidentally sit close to the dial's foreshortened height too");

        await browser.close();
        await new Promise((r) => srv.close(r));
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
