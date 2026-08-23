// WebGLEngine/tools/ship/playwrightResolve.mjs -- v3941
//
// ONE PLACE THAT KNOWS WHERE PLAYWRIGHT AND A HEADLESS SHELL LIVE ON A SANDBOX, because three gates each grew
// their own guess and two of the three guesses went stale on the same box.
//
// browserSafety-selfcheck.mjs's own header already fixed this once: "It printed 'no chromium at <SHELL>'
// whenever EITHER half was missing, and on this machine SHELL EXISTS while the playwright module does not --
// so the one line anybody reads to find out why the live gate did not run pointed at a file sitting right
// there." That fix was a LIST tried in order rather than one path, in that one file. It did not travel.
//
// *** MEASURED AT v3941, AUDITING githubPanelLive-selfcheck: this box's playwright resolves from
// /opt/node22/lib/node_modules/playwright -- A PATH IN NEITHER browserSafety'S LIST NOR mpmGpuPage'S SINGLE
// HARDCODED GUESS. *** browserSafety was silently skipping its live-page check here; mpmGpuPage was skipping
// too, and doing it with the EXACT MISATTRIBUTED MESSAGE its neighbour already named as the failure mode --
// "no chromium at SHELL" when the shell was present and only playwright was missing. Two more instances of a
// bug the tree had already caught once, because catching it once wrote a fix instead of a fact.
//
// THIS FILE IS THE FACT. Extend PLAYWRIGHT_PATHS here and every caller gets it; a fourth gate that copies the
// list instead of importing it is the same defect happening a fourth time.
import fs from "node:fs";
import { createRequire } from "node:module";

export const HEADLESS_SHELL = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

export const PLAYWRIGHT_PATHS = [
    "playwright",
    "playwright-core",
    "/opt/node22/lib/node_modules/playwright/index.js",
    "/home/claude/.npm-global/lib/node_modules/playwright/index.js",
    "/usr/local/lib/node_modules/playwright/index.js",
];

/**
 * Try every known path IN ORDER and return the first that resolves, plus which one it was -- the "plus which
 * one" is not decoration: a gate that cannot say where it got chromium from cannot be re-diagnosed when the
 * NEXT box moves the install again.
 * @param {NodeRequire|((m:string)=>any)} [requireFn] pass createRequire(import.meta.url) from an ESM caller
 */
export function resolvePlaywright(requireFn) {
    const req = requireFn || createRequire(import.meta.url);
    for (const m of PLAYWRIGHT_PATHS) {
        try { return { chromium: req(m).chromium, from: m }; } catch { /* next */ }
    }
    return { chromium: null, from: "" };
}

/**
 * *** THE DIAGNOSIS THAT DOES NOT MISATTRIBUTE, BECAUSE THIS IS THE BUG THE TREE HAS ALREADY PAID FOR TWICE.
 * *** Two independent facts -- "chromium is on disk" and "playwright resolves" -- are reported on their own
 * evidence rather than collapsed into one guess about which is missing.
 */
export function browserSkipReason(chromium, pwFrom, shell = HEADLESS_SHELL) {
    const shellThere = fs.existsSync(shell);
    if (!chromium && !shellThere) return "neither playwright (tried: " + PLAYWRIGHT_PATHS.join(", ") + ") nor a headless shell at " + shell;
    if (!chromium) return "playwright is not installed here -- tried: " + PLAYWRIGHT_PATHS.join(", ") + " (the headless shell at " + shell + " IS present)";
    if (!shellThere) return "playwright resolved from " + pwFrom + " but there is no headless shell at " + shell;
    return "";
}
