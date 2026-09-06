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
//
// ---- *** v4484 -- AND THEN THIS FILE DID THE SAME THING, ONE EXPORT DOWN. *** ---------------------------------
//
// PLAYWRIGHT_PATHS is a LIST TRIED IN ORDER, because a single guess went stale. `HEADLESS_SHELL` was ONE
// HARDCODED PATH, on the line below it -- the exact shape this header calls "mpmGpuPage'S SINGLE HARDCODED
// GUESS" three paragraphs up. It named a Linux root, a Linux directory layout, and a PINNED BUILD NUMBER
// (1194), so it could not be true on a Windows or macOS box, and it stops being true on THIS box the day
// playwright ships build 1195.
//
// *** 96 GATES DEPEND ON IT. *** Every one reports "no headless shell" and counts the skip as a failure --
// on the one machine in this project that has a real GPU, which is the machine those gates exist to be run
// on. The device half of this tree has never been runnable there.
//
// AND FOUR GATES RE-SPELL THE PATH BY HAND rather than importing it -- ui/stageInfo-selfcheck.mjs,
// physics/blobarium-selfcheck.mjs, render/blobRecorder-selfcheck.mjs, render/holoAgree-selfcheck.mjs. That is
// "a fourth gate that copies the list instead of importing it", written in this header as a warning, having
// already happened four times underneath it. The gate beside this file counts them, so a fifth is a red.
//
// The shell is resolved the way playwright already was: roots tried in order (PLAYWRIGHT_BROWSERS_PATH first,
// which headlessGpu.mjs was ALREADY honouring for the Vulkan ICD in the same tree while this line did not),
// any build number rather than a pinned one, and the three platforms' directory layouts.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

/** Where a playwright install puts its browsers, most specific first. */
export function shellRoots(env = process.env, home = os.homedir()) {
    const out = [];
    if (env.PLAYWRIGHT_BROWSERS_PATH) out.push(env.PLAYWRIGHT_BROWSERS_PATH);
    out.push("/opt/pw-browsers");
    if (env.LOCALAPPDATA) out.push(path.join(env.LOCALAPPDATA, "ms-playwright"));
    if (home) {
        out.push(path.join(home, ".cache", "ms-playwright"));
        out.push(path.join(home, "Library", "Caches", "ms-playwright"));
        out.push(path.join(home, "AppData", "Local", "ms-playwright"));
    }
    return out;
}

/**
 * The executable inside a browser directory, per platform layout. The headless shell is preferred over the
 * full browser because that is what every caller was launching; both are listed because an install may carry
 * only one.
 */
export const SHELL_LEAVES = Object.freeze([
    path.join("chrome-linux", "headless_shell"),
    path.join("chrome-win", "headless_shell.exe"),
    path.join("chrome-mac", "headless_shell"),
    path.join("chrome-linux", "chrome"),
    path.join("chrome-win", "chrome.exe"),
    path.join("chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
]);

/** A browser directory, with NO build number pinned -- 1194 was, and that is a date stamp on a constant. */
export const SHELL_DIR = /^chromium(_headless_shell)?-\d+$/;

/**
 * Try every root, every chromium build in it, every platform leaf, and return the first that exists plus
 * WHERE it came from -- the "plus where" is the same rule resolvePlaywright follows, and for the same reason:
 * a gate that cannot say where it got chromium cannot be re-diagnosed when the next box moves the install.
 */
export function resolveHeadlessShell({ env = process.env, home = os.homedir(), exists = fs.existsSync,
                                       readdir = fs.readdirSync } = {}) {
    const tried = [];
    for (const root of shellRoots(env, home)) {
        let dirs = [];
        try { dirs = readdir(root).filter((d) => SHELL_DIR.test(d)); } catch { continue; }
        // headless shells before full browsers, newest build first
        dirs.sort((a, b) => (a.startsWith("chromium_headless_shell") ? 0 : 1) - (b.startsWith("chromium_headless_shell") ? 0 : 1)
                          || (parseInt(b.split("-").pop(), 10) - parseInt(a.split("-").pop(), 10)));
        for (const d of dirs) for (const leaf of SHELL_LEAVES) {
            const p = path.join(root, d, leaf);
            tried.push(p);
            if (exists(p)) return { shell: p, from: root, tried };
        }
    }
    return { shell: "", from: "", tried };
}

const RESOLVED = resolveHeadlessShell();
/**
 * The shell this box actually has, or "" when it has none. It is a RESOLUTION and no longer a claim: every
 * caller passes it to browserSkipReason first, which refuses on "" -- so an empty value can never reach a
 * launch.
 */
export const HEADLESS_SHELL = RESOLVED.shell;
export const HEADLESS_SHELL_TRIED = Object.freeze(RESOLVED.tried);

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
    const shellThere = !!shell && fs.existsSync(shell);
    // *** v4484: the shell half now names WHAT WAS TRIED rather than one path. *** A message naming a single
    // Linux path on a Windows box reads as "that file is missing" when the truth is "this box was never
    // looked at", and those are different things to go and fix.
    const where = HEADLESS_SHELL_TRIED.length
        ? HEADLESS_SHELL_TRIED.length + " candidate(s) under " + shellRoots().join(", ")
        : "no browser directory under " + shellRoots().join(", ");
    if (!chromium && !shellThere) return "neither playwright (tried: " + PLAYWRIGHT_PATHS.join(", ") + ") nor a headless shell (" + where + ")";
    if (!chromium) return "playwright is not installed here -- tried: " + PLAYWRIGHT_PATHS.join(", ") + " (a headless shell at " + shell + " IS present)";
    if (!shellThere) return "playwright resolved from " + pwFrom + " but no headless shell was found (" + where + ")";
    return "";
}
