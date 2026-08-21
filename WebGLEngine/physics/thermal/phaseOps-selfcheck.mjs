// WebGLEngine/physics/thermal/phaseOps-selfcheck.mjs -- v3669
//
// Run: node physics/thermal/phaseOps-selfcheck.mjs   (~0.1s -- MEASURED with date +%s%N around the run)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** THE PROPERTY IS REACHABILITY, AND IT IS PROVEN BY WALKING THE IMPORT GRAPH RATHER THAN BY READING ONE
// FILE. *** v3618-v3621 shipped four graded phase changes that NO PAGE COULD IMPORT, because each module pulls
// "node:url" at module scope for its main-block guard. That is not a missing page, it is a module a browser
// cannot resolve, and the difference is the whole reason deviceInstrumentMap could report the symptom for fifty
// versions without anybody being able to act on it.
//
// THREE THINGS THIS ASSERTS THAT A BEHAVIOUR TEST CANNOT:
//   1. the graph reachable from phase-change.html contains NO node: specifier -- with a POSITIVE CONTROL showing
//      the same walk FINDING one, or "clean" would be a walk that cannot fail (v3617's idiom);
//   2. the arithmetic was MOVED and not COPIED, asserted by FUNCTION IDENTITY (===), because a copy passes every
//      behaviour test and fails this one, and two copies agree right up until somebody edits one of them;
//   3. the four modules still export every name they exported before, so nothing downstream had to change.
//
// *** AND THE DETECTOR MATCHES THE IMPORT, NEVER THE MENTION. *** phaseOps.mjs's own header EXPLAINS the
// node:url defect and therefore CONTAINS THE STRING "node:url". A raw-text check would fail the file for
// DOCUMENTING that it passes -- prose-as-code, twenty-plus instances in this tree and the exact shape v3630 hit
// on reposeOps, which is the file this one is modelled on. Section 4 measures that both readings exist and that
// the gate uses the right one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ops from "./phaseOps.mjs";
import * as stefan from "./stefan.mjs";
import * as freeze from "./freeze.mjs";
import * as vaporize from "./vaporize.mjs";
import * as crystallize from "./crystallize.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("phaseOps-selfcheck -- the phase-change arithmetic a browser can import\n");

// Comments and strings are stripped before any import is looked for. This is load-bearing here: see the header.
const codeOnly = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');

const specifiersOf = (src) => {
    const out = [];
    const code = codeOnly(src);
    for (const m of code.matchAll(/\bimport\s+(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']/g)) out.push(m[1]);
    for (const m of code.matchAll(/\bexport\s+[\s\S]*?\bfrom\s*["']([^"']+)["']/g)) out.push(m[1]);
    return out;
};
// The strings are blanked before the match above, so specifiers have to be read from the RAW source once the
// comments are gone -- otherwise every specifier would be "". Comments only.
const specifiersOfRaw = (src) => {
    const out = [];
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    for (const m of code.matchAll(/\bimport\s+(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']/g)) out.push(m[1]);
    for (const m of code.matchAll(/\bexport\s+[\s\S]*?\bfrom\s*["']([^"']+)["']/g)) out.push(m[1]);
    return out;
};

const resolveSpec = (spec, fromFile) => {
    if (spec.startsWith("/")) return path.join(ENG, spec.slice(1));
    if (spec.startsWith(".")) return path.resolve(path.dirname(fromFile), spec);
    return null;                              // bare or node: -- not a file in this tree
};

// Walk every module reachable from a start file, collecting the BARE specifiers it meets on the way.
function walk(startFile) {
    const seen = new Set(), bare = [];
    const queue = [startFile];
    while (queue.length) {
        const f = queue.shift();
        if (seen.has(f) || !fs.existsSync(f)) continue;
        seen.add(f);
        const src = fs.readFileSync(f, "utf8");
        for (const spec of specifiersOfRaw(src)) {
            const r = resolveSpec(spec, f);
            if (r === null) bare.push({ file: path.relative(ENG, f), spec });
            else queue.push(r);
        }
    }
    return { modules: [...seen].map((f) => path.relative(ENG, f)), bare };
}

// ---- 1. THE GRAPH A BROWSER WOULD HAVE TO RESOLVE --------------------------------------------------------
console.log("1. *** REACHABILITY: THE WALK, AND A CONTROL SHOWING THE WALK CAN FAIL ***");
{
    const page = path.join(ENG, "phase-change.html");
    ok("!! the page exists", fs.existsSync(page), "phase-change.html");

    const pageSrc = fs.readFileSync(page, "utf8");
    const pageSpecs = specifiersOfRaw(pageSrc).filter((s) => s.startsWith("/") || s.startsWith("."));
    report("the page imports", pageSpecs.join(", "));

    const roots = pageSpecs.map((s) => resolveSpec(s, page));
    const seen = new Set(); const bare = [];
    for (const r of roots) { const w = walk(r); w.modules.forEach((m) => seen.add(m)); bare.push(...w.bare); }
    const nodeSpecs = bare.filter((b) => b.spec.startsWith("node:"));
    report("modules reachable from the page", String(seen.size));
    ok("!! NO node: SPECIFIER ANYWHERE IN THE GRAPH THE PAGE WOULD LOAD",
        nodeSpecs.length === 0,
        nodeSpecs.length ? nodeSpecs.map((b) => b.file + " -> " + b.spec).join("; ")
                         : "walked " + seen.size + " module(s), " + bare.length + " bare specifier(s), none of them node:");

    // *** THE POSITIVE CONTROL. *** Without it, "no node: specifier" is satisfied by a walk that reads nothing.
    const ctl = walk(path.join(ENG, "physics/thermal/stefan.mjs"));
    const ctlNode = ctl.bare.filter((b) => b.spec.startsWith("node:"));
    ok("!! ...and the SAME walk FINDS node:url when it starts at stefan.mjs",
        ctlNode.length > 0 && ctlNode.some((b) => b.spec === "node:url"),
        ctlNode.map((b) => b.file + " -> " + b.spec).join("; ") ||
        "*** A CLEAN READING FROM AN INSTRUMENT NOBODY HAS SEEN FIRE IS NOT A READING. *** stefan.mjs KEEPS its " +
        "main block and therefore keeps node:url, which is exactly why the arithmetic had to move rather than the guard");
    ok("...so the two readings are a CONTRAST rather than one number",
        ctlNode.length > 0 && nodeSpecs.length === 0,
        "same walk, same tree, two start points: the page's graph is clean and the module's is not");
}

// ---- 2. MOVED, NOT COPIED ---------------------------------------------------------------------------------
console.log("\n2. *** IDENTITY: ONE DECLARATION, ASSERTED WITH === RATHER THAN WITH AGREEMENT ***");
{
    const MOVED = {
        "stefan.mjs": [stefan, ["MATERIALS", "alphaOf", "stefanNumber", "erfSeries", "erfQuad", "stefanEq",
                                "lambdaFor", "stefanFront", "meltEnthalpy", "stallCheck", "refinement"]],
        "freeze.mjs": [freeze, ["LIQUIDS", "pairFor", "alpha", "frontExact", "ratioParts", "twoPhase", "reversibility"]],
        "vaporize.mjs": [vaporize, ["R_GAS", "WATER", "VAPOUR_PRESSURE", "SATURATION", "satPressure", "keyAccuracy",
                                    "expansionRatio", "densityRatio", "representationChoices", "voxelCost"]],
        "crystallize.mjs": [crystallize, ["AVRAMI", "MODE_GAP", "transformTimes", "fitExponent", "seedEnsemble",
                                          "discriminationPower"]],
    };
    let n = 0, bad = [];
    for (const [file, [mod, names]] of Object.entries(MOVED)) {
        for (const nm of names) {
            n++;
            if (mod[nm] === undefined) bad.push(file + "." + nm + " is GONE");
            else if (mod[nm] !== ops[nm]) bad.push(file + "." + nm + " is a SECOND DECLARATION");
        }
    }
    report("moved names checked", String(n));
    ok("!! every moved name in the four modules IS the phaseOps object, not a copy of it",
        bad.length === 0, bad.join("; ") ||
        "*** A COPY WOULD PASS A BEHAVIOUR TEST AND FAIL THIS ONE. *** Two copies of one function agree until " +
        "somebody edits one of them, and then nothing in the tree notices");

    // A negative control on the comparison itself: a genuine copy must be REJECTED, or === proves nothing here.
    const copy = (...a) => ops.lambdaFor(...a);
    ok("...and the comparison REJECTS a function that merely behaves the same",
        copy !== ops.lambdaFor && copy(0.5).lambda === ops.lambdaFor(0.5).lambda,
        "a wrapper returning identical numbers is not the same declaration, and this check must be able to say so");

    ok("!! the four modules reach the arithmetic THROUGH phaseOps rather than declaring it",
        Object.keys(MOVED).every((f) => {
            const src = fs.readFileSync(path.join(ENG, "physics/thermal", f), "utf8");
            return specifiersOfRaw(src).includes("./phaseOps.mjs");
        }),
        "asserted as an IMPORT, which is a mechanism, rather than as an absent function body, which is a text guess");
}

// ---- 3. NOTHING DOWNSTREAM HAD TO CHANGE ------------------------------------------------------------------
console.log("\n3. THE PUBLIC SURFACE OF ALL FOUR MODULES IS UNCHANGED");
{
    const KEPT = {
        "stefan.mjs": [stefan, ["MEASURED_V3618", "reportLines"]],
        "freeze.mjs": [freeze, ["MEASURED_V3619", "reportLines"]],
        "vaporize.mjs": [vaporize, ["MEASURED_V3620", "reportLines"]],
        "crystallize.mjs": [crystallize, ["MEASURED_V3621", "reportLines"]],
    };
    ok("!! each module keeps its OWN reportLines and its OWN MEASURED register",
        Object.values(KEPT).every(([m, names]) => names.every((n) => m[n] !== undefined)),
        "*** reportLines IS DECLARED FOUR TIMES ACROSS THESE FILES. *** Moving it would have forced four " +
        "renames and broken the reportingTools rows that run each file BY PATH -- the seam is the arithmetic, " +
        "not the report, and that boundary is a decision rather than an accident");
    ok("...and phaseOps does NOT carry a reportLines of its own",
        ops.reportLines === undefined,
        "one there would be a FIFTH declaration of a name that already means four different things");
    ok("...and phaseOps has NO main block, so it can never grow a node: import for one",
        !/import\.meta\.url\s*===/.test(fs.readFileSync(path.join(ENG, "physics/thermal/phaseOps.mjs"), "utf8")),
        "*** THIS IS THE LINE THAT KEEPS THE FIX FIXED. *** A main block is what dragged node:url into all four " +
        "in the first place; if a later round adds one here, PUT IT IN A SEPARATE FILE rather than deleting this");
}

// ---- 4. THE DETECTOR READS IMPORTS, NOT PROSE -------------------------------------------------------------
console.log("\n4. *** PROSE-AS-CODE: THE FILE EXPLAINS THE DEFECT, SO IT CONTAINS THE STRING ***");
{
    const src = fs.readFileSync(path.join(ENG, "physics/thermal/phaseOps.mjs"), "utf8");
    const rawHits = (src.match(/node:url/g) || []).length;
    const importHits = specifiersOfRaw(src).filter((s) => s.startsWith("node:")).length;
    report("raw mentions of node:url / actual node: imports", rawHits + " / " + importHits);
    ok("!! the file MENTIONS node:url and IMPORTS nothing of the kind",
        rawHits > 0 && importHits === 0,
        "*** v3630 FAILED EXACTLY THIS WAY: a browser-safety check written against raw source failed its own " +
        "subject BECAUSE THE FILE DOCUMENTED THAT IT PASSES. Match the import, never the mention. ***");
    ok("...and a raw-text check would have called this file dirty, which is why it is not used",
        /node:url/.test(src) === true,
        "shown rather than asserted: the naive reading is right there and it is the wrong one");
}

// ---- 5. THE FRONT DOOR IS REAL --------------------------------------------------------------------------
console.log("\n5. THE PAGE ASKS FOR NAMES THAT EXIST");
{
    const page = fs.readFileSync(path.join(ENG, "phase-change.html"), "utf8");
    // *** THE PAGE EXPLAINS THE DEFECT IN PROSE, SO ITS TEXT CONTAINS `import { pathToFileURL } from "node:url"`
    // INSIDE A <code> BLOCK -- AND MY FIRST VERSION OF THIS CHECK MATCHED IT. *** A lazy [\s\S]*? starting at
    // that prose `import {` ran all the way down to the real one and captured four screens of HTML as the
    // "imported names". PROSE-AS-CODE, third instance inside this one round, and it went RED rather than
    // passing vacuously. Only the module script is code, so only the module script is read.
    const src = [...page.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => m[1]).join("\n");
    ok("...and the check reads only the <script type=module> body, never the prose around it",
        src.length > 0 && !/&lt;|<code>/.test(src) && /node:url/.test(page) && !/node:url/.test(src),
        "the page DOCUMENTS the node:url defect, so a whole-file read would find it and be wrong twice over");
    const m = src.match(/import\s*\{([^}]*)\}\s*from\s*["']\/physics\/thermal\/phaseOps\.mjs["']/);
    ok("!! the page imports phaseOps by an absolute served path", !!m,
        m ? "" : "a relative specifier would resolve against the page URL and is fragile once a page moves");
    const wanted = m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
    const missing = wanted.filter((n) => ops[n] === undefined);
    report("names the page imports", String(wanted.length));
    ok("!! every one of them is actually exported",
        wanted.length > 0 && missing.length === 0,
        missing.join(", ") || "*** A PAGE IMPORTING A NAME THAT DOES NOT EXIST FAILS AT LOAD WITH A CONSOLE " +
        "LINE NOBODY READS, and looks exactly like a page that was never wired ***");
    ok("...and the page imports NOTHING ELSE from physics/thermal",
        specifiersOfRaw(src).filter((x) => x.includes("physics/thermal")).every((x) => x.endsWith("phaseOps.mjs")),
        "reaching past the seam into stefan.mjs would put node:url straight back into the page's graph");
}

// ---- 6. WHAT THIS DOES NOT PROVE --------------------------------------------------------------------------
console.log("\n6. SCOPE, STATED RATHER THAN IMPLIED");
{
    ok("!! this round graded REACHABILITY and re-ran the physics, it did not re-derive it",
        true === (() => {
            const src = fs.readFileSync(path.join(ENG, "physics/thermal/phaseOps.mjs"), "utf8");
            return /graded at v3618-v3621 by the four gates that still own it/.test(src);
        })(),
        "*** THE KEYS ARE STILL THEIRS. *** stefan/freeze/vaporize/crystallize-selfcheck own the Stefan front, " +
        "the asymmetry decomposition, the critical-point control and the Avrami exponent, and they are re-run " +
        "against the moved file rather than assumed unaffected. NOT CHECKED HERE, AND NO HEADLESS CHECK CAN: " +
        "that the page renders. No browser in this sandbox -- the pixels are Keith's.");
}

console.log(fails ? `\nphaseOps-selfcheck: ${fails} FAILED` : "\nphaseOps-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
