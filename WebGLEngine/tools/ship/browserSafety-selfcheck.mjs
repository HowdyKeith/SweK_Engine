// WebGLEngine/tools/ship/browserSafety-selfcheck.mjs — v2594
//
// Run: node tools/ship/browserSafety-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE GATE THAT WOULD HAVE CAUGHT THE BUG KEITH'S RIG FOUND.
//
//     bandit.mjs:208 Uncaught ReferenceError: process is not defined
//
// ---- WHAT ACTUALLY HAPPENED --------------------------------------------------------------------------------------
//
// brain/bench/bandit.mjs ended with a CLI guard:
//
//     if (process.argv[1] && process.argv[1].endsWith("bandit.mjs")) { ... }
//
// and paramecium.html line 99 says:
//
//     import { ucb1, uniformRandom } from './brain/bench/bandit.mjs';
//
// `.mjs` TOLD THE BROWSER "THIS IS AN ES MODULE" -- WHICH WAS TRUE. So it fetched it, parsed it, ran it, and
// hit a Node global at top level. THE EXTENSION IS A CLAIM ABOUT THE PARSER, NOT ABOUT THE ENVIRONMENT. There
// is no such thing as a browser-safe file extension.
//
// ---- AND THE AUDIT FOUND TWO MORE THAT WERE JUST WAITING ---------------------------------------------------------
//
//   bz/net/bzfsClient.mjs:407 -- `if (import.meta.url === \`file://${process.argv[1]}\`)`. TOP LEVEL. IDENTICAL
//     BUG. It has never crashed because NOBODY HAS OPENED THE PAGE THAT IMPORTS IT YET.
//   brain/bench.mjs:27 -- `typeof Deno !== "undefined" ? Deno.args : process.argv.slice(2)`. SOMEBODY ALREADY
//     THOUGHT ABOUT A SECOND RUNTIME AND MADE NODE THE FALLBACK. A BROWSER IS NOT NODE. It is inside a function
//     so it only breaks WHEN CALLED -- A BUG THAT WAITS FOR A FUNCTION CALL IS STILL A BUG, it is just politer
//     about when it tells you.
//
// MY FIRST AUDIT MISSED bandit.mjs ENTIRELY: I grepped for `from "..."` with DOUBLE quotes and paramecium.html
// uses SINGLE quotes. THE INSTRUMENT HAD A HOLE IN IT, which is the same disease as v2590's stride-97 and
// v2583's dense sampler. The file the RIG found is the one MY AUDIT COULD NOT SEE.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

/** Every module a page imports, BOTH QUOTE STYLES, because the bug hid behind a quote character. */
function browserLoadedModules() {
    const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
    const hit = new Set();
    for (const p of pages) {
        const src = fs.readFileSync(path.join(ROOT, p), "utf8");
        for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+\.m?js)['"]/g)) {
            const rel = m[1].replace(/^\.\//, "");
            const abs = path.join(ROOT, rel);
            if (fs.existsSync(abs)) hit.add(rel);
        }
    }
    return [...hit];
}

/** A node global used where a browser can reach it. Comments stripped -- A REGEX THAT GREPS PROSE FINDS PROSE. */
function nodeGlobalsIn(rel) {
    // A REGEX THAT STRIPS COMMENTS WILL STRIP A URL. This cost me the whole round.
    //
    // bzfsClient.mjs:410 is:  if (IS_NODE && import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    //
    // `file://` CONTAINS `//`. My stripper deleted from there to the end of the line -- INCLUDING THE OPENING
    // BRACE -- so the depth tracker never saw the guard open, and it flagged the two SAFE lines inside it.
    // v2573 coined "A REGEX THAT GREPS PROSE WILL FIND PROSE"; this is its sibling. Only strip `//` when it is
    // not preceded by a colon, which is exactly what a protocol looks like.
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
    // A LINE-BASED GATE CANNOT SEE A BLOCK, AND THAT IS NOT A DETAIL.
    //
    // My first version flagged bzfsClient.mjs:411 and :416 -- BOTH OF WHICH SIT INSIDE `if (IS_NODE && ...)`
    // AND NEVER EXECUTE IN A BROWSER. It was grepping lines while the guard is a SCOPE. A GATE THAT CRIES WOLF
    // GETS SWITCHED OFF, which is worse than no gate at all: the whole point is that someone believes it at
    // 2am. So it tracks brace depth from the guard and forgives everything inside it.
    //
    // This is not a parser and does not pretend to be. It knows one shape -- `if (IS_NODE ...) { ... }` -- and
    // that is the shape the fix uses. A GATE THAT UNDERSTANDS EXACTLY THE THING IT GUARDS IS HONEST; ONE THAT
    // CLAIMS TO UNDERSTAND JAVASCRIPT IS LYING.
    const bad = [];
    let guardDepth = -1, depth = 0;
    src.split("\n").forEach((line, i) => {
        const opensGuard = /if\s*\(\s*IS_NODE\s*&&/.test(line) || /if\s*\(\s*typeof process\s*!==?\s*["']undefined["']/.test(line);
        const inGuard = guardDepth >= 0 && depth > guardDepth;
        if (!inGuard && !opensGuard) {
            // the guard's own definition line is not a use
            if (!/typeof process\s*!==?\s*["']undefined["']/.test(line)) {
                if (/(^|[^.\w])process\.(argv|env|exit|stdout|versions)/.test(line)) bad.push((i + 1) + ": process");
                if (/(^|[^.\w])require\s*\(/.test(line)) bad.push((i + 1) + ": require");
                if (/(^|[^.\w])__dirname/.test(line)) bad.push((i + 1) + ": __dirname");
            }
        }
        if (opensGuard && guardDepth < 0) guardDepth = depth;
        for (const ch of line) { if (ch === "{") depth++; else if (ch === "}") depth--; }
        if (guardDepth >= 0 && depth <= guardDepth) guardDepth = -1;
    });
    return bad;
}

// ---- 1. THE STATIC GATE -------------------------------------------------------------------------------------------
{
    const mods = browserLoadedModules();
    ok("the audit SEES the file the rig crashed on", mods.includes("brain/bench/bandit.mjs"),
       "found " + mods.length + " browser-loaded modules. MY FIRST AUDIT MISSED THIS FILE: I grepped for `from \"...\"` with DOUBLE quotes and paramecium.html line 99 uses SINGLE quotes -- `import { ucb1, uniformRandom } from './brain/bench/bandit.mjs';`. THE INSTRUMENT HAD A HOLE IN IT, and the file THE RIG FOUND is the one MY AUDIT COULD NOT SEE. Same disease as v2590's stride-97 and v2583's sampler.");

    const broken = mods.map((m) => ({ m, bad: nodeGlobalsIn(m) })).filter((x) => x.bad.length);
    ok("!! NO BROWSER-LOADED MODULE TOUCHES AN UNGUARDED NODE GLOBAL",
       broken.length === 0,
       broken.length
           ? broken.map((x) => x.m + " [" + x.bad.join(", ") + "]").join("; ")
           : mods.length + " modules checked, all clean. THIS IS THE CHECK THAT DID NOT EXIST, WHICH IS WHY THE BUG SHIPPED. A CHECK NOT IN THE GATE IS NOT BEING RUN -- and this one found TWO MORE beyond the rig's: bz/net/bzfsClient.mjs:407 (IDENTICAL top-level bug, never crashed because NOBODY HAS OPENED THAT PAGE YET) and brain/bench.mjs:27 (which already checked for Deno AND MADE NODE THE FALLBACK -- A BROWSER IS NOT NODE).");
}

// ---- 2. AND THE SABOTAGE PROOF: THE GATE MUST SEE THE ORIGINAL BUG ------------------------------------------------
{
    const tmp = path.join(ROOT, "brain", "bench", "__gatecheck.mjs");
    fs.writeFileSync(tmp, 'export const x = 1;\nif (process.argv[1]) { console.log("boom"); }\n');
    const seen = nodeGlobalsIn("brain/bench/__gatecheck.mjs");
    fs.unlinkSync(tmp);
    ok("...and it RECOGNISES the exact shape of the original bug", seen.length === 1 && seen[0].includes("process"),
       "a synthetic file with `if (process.argv[1])` is caught: " + JSON.stringify(seen) +
       ". A GATE THAT HAS NEVER SEEN THE BUG IT CLAIMS TO CATCH IS A PROMISE, NOT A CHECK.");
    const guarded = path.join(ROOT, "brain", "bench", "__gatecheck2.mjs");
    fs.writeFileSync(guarded, 'const IS_NODE = typeof process !== "undefined";\nif (IS_NODE && process.argv[1]) { console.log("ok"); }\n');
    const clean = nodeGlobalsIn("brain/bench/__gatecheck2.mjs");
    fs.unlinkSync(guarded);
    ok("...and it does NOT flag a correctly guarded use", clean.length === 0,
       "`typeof process !== 'undefined'` IS the fix, so a gate that flagged it would force everyone to delete their CLIs. A GATE THAT CANNOT BE SATISFIED GETS SWITCHED OFF.");
}

// ---- 3. THE LIVE GATE: LOAD THE ACTUAL PAGE IN AN ACTUAL BROWSER -------------------------------------------------
//
// "Browser-path tests are rig-only" has been true for this engine's whole life BECAUSE THE SERVER WILL NOT BOOT
// HERE. But the server was never the requirement -- SERVING WAS. Playwright can intercept every request and
// hand back the file, so ES modules resolve and the page runs. SEVENTH EXPIRED BLOCKER.
{
    const SHELL = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
    // *** v3940 -- THE SKIP NAMED A CAUSE THAT WAS NOT TRUE. *** It printed "no chromium at <SHELL>" whenever
    // EITHER half was missing, and on this machine SHELL EXISTS while the playwright module does not -- so the
    // one line anybody reads to find out why the live gate did not run pointed at a file sitting right there.
    // SKIPPING WITH A REASON IS ONLY BETTER THAN PASSING QUIETLY IF THE REASON IS THE REASON. The require path
    // was also a single hardcoded absolute from one sandbox; it is now a list, tried in order, so a checkout
    // with playwright installed anywhere normal runs the gate instead of skipping past it.
    let chromium = null;
    const PW = ["playwright", "playwright-core",
                "/home/claude/.npm-global/lib/node_modules/playwright/index.js",
                "/usr/local/lib/node_modules/playwright/index.js"];
    let pwFrom = "";
    for (const m of PW) { try { ({ chromium } = require(m)); pwFrom = m; break; } catch { /* next */ } }

    if (!chromium || !fs.existsSync(SHELL)) {
        const why = !chromium && !fs.existsSync(SHELL) ? "neither playwright (tried: " + PW.join(", ") + ") nor a headless shell at " + SHELL
                  : !chromium                          ? "playwright is not installed here -- tried: " + PW.join(", ") + " (the headless shell at " + SHELL + " IS present)"
                  :                                      "playwright resolved from " + pwFrom + " but there is no headless shell at " + SHELL;
        console.log("  SKIP  the live page load   " + why + " -- SKIPPING WITH A REASON RATHER THAN PASSING QUIETLY.");
    } else {
        const b = await chromium.launch({ executablePath: SHELL });
        try {
            const page = await b.newPage();
            await page.route("**/*", (route) => {
                const u = new URL(route.request().url());
                const p = path.join(ROOT, decodeURIComponent(u.pathname));
                if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                    const ext = path.extname(p);
                    const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
                        : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "text/plain";
                    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
                }
                return route.fulfill({ status: 404, body: "" });
            });
            const errs = [];
            page.on("pageerror", (e) => errs.push(e.message));
            await page.goto("http://swek.local/paramecium.html", { waitUntil: "networkidle" }).catch(() => {});
            await page.waitForTimeout(1200);
            ok("!! A REAL CHROMIUM LOADS paramecium.html WITH NO PAGE ERRORS", errs.length === 0,
               errs.length ? errs.slice(0, 2).join(" | ") : "the rig reported `bandit.mjs:208 Uncaught ReferenceError: process is not defined`. IT IS FIXED, IN A BROWSER, NOT IN THEORY. AND THIS IS THE FIRST TIME THIS ENGINE HAS EVER LOADED ONE OF ITS OWN PAGES IN A GATE.");
            const canvas = await page.evaluate(() => {
                const c = document.querySelector("canvas");
                if (!c) return null;
                return { w: c.width, h: c.height, ctx: !!(c.getContext("webgl2") || c.getContext("2d")) };
            }).catch(() => null);
            ok("...and the canvas exists with a context", canvas && canvas.w > 0 && canvas.ctx,
               canvas ? canvas.w + "x" + canvas.h + ", context ok. THAT WAS A RIG-ONLY QUESTION ON THE LIST -- '/paramecium.html: does the canvas draw?' -- AND IT NO LONGER NEEDS GALAXINA TO ANSWER THE FIRST HALF OF IT. (Whether it draws the RIGHT THING still needs eyes. A CONTEXT IS NOT A PICTURE.)" : "no canvas");
        } finally { await b.close(); }
    }
}

console.log(fails ? "\nbrowserSafety-selfcheck: " + fails + " FAILED" : "\nbrowserSafety-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
