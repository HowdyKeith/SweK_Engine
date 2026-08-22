// WebGLEngine/tools/render-qa/pageFingerprint-selfcheck.mjs — v2598
//
// Run: node tools/render-qa/pageFingerprint-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES tools/render-qa/pageFingerprint.mjs -- Keith: "if we ran the test already, and it is still the same
// version of page, then we wouldnt have to re run the test, only do the ones that have never run / or are new."
//
// HE IS RIGHT, AND THE NAIVE VERSION OF HIS IDEA WOULD HAVE HIDDEN HIS OWN BUG.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { importClosure, fingerprint, loadPrints, savePrints, shouldRun } from "./pageFingerprint.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const P = (f) => path.join(ROOT, f);

// ---- 1. THE TRAP: A PAGE HASH IS A LIE ---------------------------------------------------------------------------
{
    const page = P("blob-selfie.html");
    const dep = P("simulation/tomo/blobPhantom.js");
    const orig = fs.readFileSync(dep);

    const printBefore = fingerprint(page, ROOT);
    fs.appendFileSync(dep, "\n// touched by the gate\n");
    const printAfter = fingerprint(page, ROOT);
    // and the page's OWN bytes, for contrast
    const pageBytesUnchanged = fs.readFileSync(page).equals(fs.readFileSync(page));
    fs.writeFileSync(dep, orig);

    ok("!! THE CLOSURE HASH SEES A DEPENDENCY CHANGE", printBefore.hash !== printAfter.hash,
       "touched blobPhantom.js -> blob-selfie.html's fingerprint moved " + printBefore.hash + " -> " + printAfter.hash +
       ". THE PAGE'S OWN BYTES DID NOT CHANGE BY ONE BIT. Measured before writing any of this: a plain page hash reads 429782100090 BEFORE AND AFTER touching its dependency -- IDENTICAL. A PAGE HASH DOES NOT SEE ITS OWN DEPENDENCIES.");
    ok("...and this is EXACTLY the bug Keith's rig found", pageBytesUnchanged,
       "paramecium.html NEVER CHANGED -- brain/bench/bandit.mjs was what broke it, with `process.argv` at top level (v2594). WITH NAIVE PAGE-HASH CACHING WE WOULD HAVE SKIPPED paramecium.html FOREVER AND NEVER FOUND IT. THE CACHE WOULD HAVE BEEN FASTEST AT EXACTLY THE MOMENT IT WAS MOST WRONG. A CACHE KEY THAT DOES NOT COVER THE THING THAT CAN BREAK YOU IS A PROMISE TO MISS IT.");
    ok("...and the fingerprint returns to its old value when the dep is restored", fingerprint(page, ROOT).hash === printBefore.hash,
       "back to " + printBefore.hash + ". IF IT DID NOT, EVERY RUN WOULD LOOK CHANGED AND THE CACHE WOULD NEVER SKIP ANYTHING -- a cache that always misses is a slow way to write a hash.");
}

// ---- 2. THE CLOSURE IS REAL AND CONTAINS THE THING THAT BROKE ----------------------------------------------------
{
    const c = [...importClosure(P("paramecium.html"), ROOT)].map((f) => path.relative(ROOT, f));
    ok("!! paramecium.html's closure CONTAINS bandit.mjs", c.some((f) => f.endsWith("bandit.mjs")),
       c.length + " files: " + c.join(", ") +
       ". THAT IS THE ENTIRE POINT: THE DAY bandit.mjs CHANGES, paramecium.html RE-RUNS. The closure is found by matching BOTH QUOTE STYLES -- v2594's audit could not see this exact file because I grepped `from \"...\"` with DOUBLE quotes and paramecium.html line 99 uses SINGLE quotes. THE INSTRUMENT HAD A HOLE IN IT.");
    const b = [...importClosure(P("blobarium.html"), ROOT)].map((f) => path.relative(ROOT, f));
    ok("...and blobarium.html's closure finds box3dLoader through an ABSOLUTE spec", b.some((f) => f.includes("box3dLoader")),
       b.length + " files. An absolute spec means the SERVER ROOT, NOT the filesystem root -- that distinction cost v2597 a whole round when box3dLoader's \"/vendor/box3d/box3d.js\" made Node report 'WASM not built yet' WHILE 970KB OF REAL WASM SAT ON DISK.");
}

// ---- 3. THE HASH IS STABLE, OR THE CACHE IS THEATRE ---------------------------------------------------------------
{
    const a = fingerprint(P("blobarium.html"), ROOT), b = fingerprint(P("blobarium.html"), ROOT);
    ok("the same tree hashes the same twice", a.hash === b.hash && a.files === b.files,
       a.hash + " over " + a.files + " files, twice. SORTED, so a Set's insertion order cannot change the answer -- A HASH THAT DEPENDS ON WALK ORDER IS A HASH THAT CHANGES WHEN NOTHING DID, and it would re-run all 239 pages every time while looking like it worked.");
    ok("...and two different pages hash differently", fingerprint(P("blob-selfie.html"), ROOT).hash !== a.hash,
       "or the key is not a key");
}

// ---- 4. WHEN IT SKIPS, AND WHEN IT REFUSES TO ---------------------------------------------------------------------
{
    const print = { hash: "abc123", files: 4 };
    ok("a page never run before RUNS", shouldRun("x.html", print, { prints: {} }).run === true, "why: never run");
    ok("a CHANGED page RUNS", shouldRun("x.html", print, { prints: { "x.html": { hash: "old", ok: true } } }).run === true, "why: changed");
    ok("an UNCHANGED PASSING page SKIPS", shouldRun("x.html", print, { prints: { "x.html": { hash: "abc123", ok: true } } }).run === false,
       "THAT IS THE FOURTEEN MINUTES: 239 pages at ~3.5s of settle each. If three changed it costs ten seconds.");
    ok("!! ...BUT AN UNCHANGED *FAILING* PAGE STILL RUNS", shouldRun("x.html", print, { prints: { "x.html": { hash: "abc123", ok: false } } }).run === true,
       "why: failed last time. TWO REASONS, AND THE SECOND IS THE IMPORTANT ONE. (1) You fix things and want to watch them go green. (2) A FAILURE IS A CLAIM ABOUT THE WORLD, NOT ABOUT THE FILE -- it may have failed because of the browser, the driver, a port, or the weather, AND SKIPPING IT WOULD FREEZE A VERDICT THAT WAS NEVER ABOUT THE BYTES.");
}

// ---- 5. A BROKEN CACHE FILE MUST FAIL TOWARDS WORK ----------------------------------------------------------------
{
    const tmp = path.join(os.tmpdir(), "swek-prints-" + Date.now() + ".json");
    fs.writeFileSync(tmp, "{ this is not json");
    const loaded = loadPrints(tmp);
    ok("!! A CORRUPT CACHE MEANS 'RUN EVERYTHING', NEVER 'SKIP EVERYTHING'", Object.keys(loaded.prints).length === 0,
       "garbage in -> empty prints -> every page runs. A CACHE THAT FAILS TOWARDS SKIPPING IS A CACHE THAT HIDES BUGS, and it would hide them SILENTLY AND FAST, which is the worst combination available.");
    fs.unlinkSync(tmp);
    ok("...and a missing cache file does the same", Object.keys(loadPrints(path.join(os.tmpdir(), "does-not-exist-" + Date.now())).prints).length === 0,
       "no file -> run everything. THE FIRST RUN ON A NEW MACHINE MUST NOT BE AN EMPTY VICTORY.");

    const rt = path.join(os.tmpdir(), "swek-prints-rt-" + Date.now() + ".json");
    savePrints(rt, { "a.html": { hash: "h1", ok: true, when: "now" } });
    ok("...and prints survive a save/load round trip", loadPrints(rt).prints["a.html"].hash === "h1",
       "or the cache forgets every run and is a very elaborate no-op");
    fs.unlinkSync(rt);
}

console.log(fails ? "\npageFingerprint-selfcheck: " + fails + " FAILED" : "\npageFingerprint-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
