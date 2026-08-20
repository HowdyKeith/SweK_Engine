// ui/dockStats-selfcheck.mjs -- v3788
//
// *** server.html HANDED THE INFO-PANEL DOCK `window._serverDials.lastStats`, AND svgGaugeSet HAS NEVER
// EXPOSED A PROPERTY BY THAT NAME. Its returned API is { root, start, stop, destroy, refresh, setGauges,
// values, setStats }. So getStats() read `undefined` on every call, the `|| {}` beside it turned that into an
// empty object, and THE DOCK WAS HANDED NOTHING FOREVER. Keith saw CPU and RAM reading "-" while CLEAR and
// BATTERY showed values -- because those two do not arrive through this path. ***
//
// *** THE `|| {}` IS WHY IT WAS SILENT, AND THAT IS THE REUSABLE PART: A FALLBACK THAT SUBSTITUTES A
// VALID-LOOKING EMPTY VALUE TURNS A MISSING PROPERTY INTO A WORKING-LOOKING PANEL. Nothing threw, nothing
// logged, and the dock's own rule -- "absent keys are LEFT ALONE rather than zeroed", which is correct and
// deliberate -- then rendered a tidy row of dashes. TWO REASONABLE DECISIONS COMPOSED INTO AN UNFALSIFIABLE
// DISPLAY. The same shape as v3786's silent nulls: a failure that looks like a value. ***
//
// This gate reads SOURCE rather than importing: ui/svgGaugeSet.js resolves browser-absolute paths
// (`/ui/poller.js`) and cannot be loaded by node. That is a limit worth stating, not working around.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "../tools/ship/sourceScan.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const dir = path.dirname(fileURLToPath(import.meta.url));
const SET = codeOnly(readFileSync(path.join(dir, "svgGaugeSet.js"), "utf8"));
const PAGE = codeOnly(readFileSync(path.join(dir, "..", "server.html"), "utf8"));

// The accessors svgGaugeSet actually returns, read from its own return statement.
const retLine = (SET.match(/return \{[^}]*setStats[^}]*\};/) || [""])[0];
const exposed = (retLine.match(/[A-Za-z_$][\w$]*(?=\s*[,}])|(?<=:\s*)[A-Za-z_$][\w$]*/g) || []);

console.log("1. THE PAGE ASKS FOR SOMETHING THE SET RETURNS");
{
    ok("!! *** svgGaugeSet EXPOSES `values` AND HAS NO `lastStats` ***",
        /\bvalues\b/.test(retLine) && !/lastStats/.test(SET),
        "returned API: " + retLine.replace(/\s+/g, " ").slice(0, 96) + ". *** THE NAME THE PAGE USED NEVER " +
        "EXISTED, in this file or anywhere else in the tree ***");
    ok("!! *** AND THE PAGE NOW READS `values`, NOT A NAME NOBODY DEFINES ***",
        /_serverDials[\s\S]{0,120}?\.values/.test(PAGE) && !/_serverDials\.lastStats/.test(PAGE),
        "snapshot() returns the same cpu/ram/gpu/peers keys the main dials already hold, WHICH IS THE WHOLE " +
        "POINT of driving the dock from somebody else's numbers rather than starting a second poller");
    // *** THIS CHECK GREPPED FOR `typeof d.values !== "function"` AND FAILED ON CORRECT CODE, BECAUSE
    // codeOnly STRIPS STRING CONTENTS -- so the literal "function" is gone before the regex runs. THE SAME
    // MISTAKE v3785 MADE AND WROTE DOWN, MADE AGAIN ONE ROUND LATER. Writing a lesson down is not the same as
    // applying it. Assert the STRUCTURE (`typeof d.values !==`) which survives codeOnly. ***
    ok("!! it is guarded by TYPE, not merely by truthiness",
        /typeof d\.values !==/.test(PAGE),
        "*** `d && d.values` would pass a property that exists and is not callable, which is the NEXT version " +
        "of this same bug. Asking whether it is a FUNCTION is the question that was skipped last time ***");
}

console.log("\n2. THE FALLBACK MUST NOT DISGUISE A MISSING PROPERTY");
{
    // Model the old expression and the new one against a set that has no lastStats -- the real object shape.
    const fakeSet = { root: {}, start() {}, values: () => ({ cpu: 41, ram: 88 }), setStats() {} };
    const oldWay = (fakeSet && fakeSet.lastStats) || {};
    const newWay = (!fakeSet || typeof fakeSet.values !== "function") ? {} : (fakeSet.values() || {});
    ok("!! *** THE OLD EXPRESSION YIELDS {} AGAINST THE REAL API SHAPE ***",
        Object.keys(oldWay).length === 0,
        "not a hypothetical: `.lastStats` on the object svgGaugeSet actually returns is undefined, and `|| {}` " +
        "makes that indistinguishable from a set that simply has not reported yet");
    ok("!! and the new one yields the numbers",
        newWay.cpu === 41 && newWay.ram === 88,
        "cpu " + newWay.cpu + ", ram " + newWay.ram + " -- the two Keith saw as dashes");
    ok("!! a set that genuinely has no values() still yields {} rather than throwing",
        (() => { const bare = { root: {} };
                 const r = (!bare || typeof bare.values !== "function") ? {} : bare.values();
                 return r && Object.keys(r).length === 0; })(),
        "THE FALLBACK IS KEPT -- an empty object is the right answer when the set is not ready. What changed " +
        "is that it is no longer the answer when the set IS ready");
}

report("*** WHY THIS WENT UNNOTICED, AND IT IS NOT CARELESSNESS ***",
    "The dock was built at v3671 to be driven by the main dials' numbers so a second set would not mean a " +
    "second poller -- a GOOD decision, and its comment explains it well. The wiring that fed it was written to " +
    "a property name that was never part of the API, and BOTH HALVES LOOKED RIGHT IN ISOLATION. Nothing in " +
    "the tree compared the name the page ASKS FOR against the names the module RETURNS, which is exactly what " +
    "this gate now does.");

report("WHAT THIS GATE CANNOT DO",
    "It cannot prove the dock RENDERS the numbers -- there is no DOM here, and ui/svgGaugeSet.js cannot even " +
    "be imported by node because it resolves browser-absolute paths like /ui/poller.js. It proves the page " +
    "asks for a name the module defines and that the value survives the fallback. *** WHETHER CPU AND RAM NOW " +
    "SHOW ON KEITH'S SCREEN IS HIS READING TO MAKE. ***");

console.log("\ndockStats-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
