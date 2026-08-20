// WebGLEngine/tools/render-qa/pageFingerprint.mjs — v2598
//
// KEITH'S OPTIMISATION, AND THE TRAP INSIDE IT.
//
// "if we ran the test already, and it is still the same version of page, then we wouldnt have to re run the
// test, only do the ones that have never run / or are new."
//
// He is right and it is worth real time: 239 pages at ~3.5s of settle each is about fourteen minutes. If three
// pages changed it should cost ten seconds.
//
// ---- BUT A PAGE HASH IS A LIE ------------------------------------------------------------------------------------
//
// Measured, before writing any of this:
//
//     blob-selfie.html hash BEFORE touching blobPhantom.js:  429782100090
//     blob-selfie.html hash AFTER  touching blobPhantom.js:  429782100090
//
// IDENTICAL. THE PAGE HASH DOES NOT SEE ITS OWN DEPENDENCIES. blob-selfie.html imports blobPhantom.js; break
// the phantom and the page's bytes do not move one bit.
//
// AND THAT IS EXACTLY THE BUG KEITH'S RIG FOUND. paramecium.html NEVER CHANGED -- brain/bench/bandit.mjs was
// what broke it, with `process.argv` at top level (v2594). WITH NAIVE PAGE-HASH CACHING WE WOULD HAVE SKIPPED
// paramecium.html FOREVER AND NEVER FOUND IT. The cache would have been fastest at exactly the moment it was
// most wrong.
//
// A CACHE KEY THAT DOES NOT COVER THE THING THAT CAN BREAK YOU IS A PROMISE TO MISS IT.
//
// ---- SO THE KEY IS THE CLOSURE -----------------------------------------------------------------------------------
//
// Hash the page AND every module it transitively imports. Measured closures:
//
//     blob-selfie.html    8 files
//     blobarium.html      6 files   (blobPhantom, blobBodies, blobThermal, blobCut, box3dLoader)
//     paramecium.html     4 files   (paramecium.js, bandit.mjs, freeSpaceWorld.js)
//     voxel-viewer.html   3 files
//
// Small, real, and cheap to hash. paramecium.html's closure CONTAINS bandit.mjs -- so the day bandit.mjs
// changes, paramecium.html re-runs, WHICH IS THE ENTIRE POINT.
//
// ---- WHAT THIS STILL CANNOT SEE, SAID PLAINLY --------------------------------------------------------------------
//
// A closure hash covers STATIC IMPORTS. It does NOT cover: a page that fetches JSON at runtime, a shader
// pulled from a string in another file via a name it builds at runtime, an <img> or a .wasm, a change in the
// BROWSER, or a change in the GPU DRIVER. THOSE ARE REAL AND THIS DOES NOT CATCH THEM, which is why --all
// exists and why the fingerprint is ADVISORY, NOT AUTHORITATIVE. A CACHE THAT CANNOT BE OVERRIDDEN IS A BUG
// THAT CANNOT BE FIXED.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Every file a page transitively imports, including itself.
 *
 * BOTH QUOTE STYLES. v2594's audit missed the file the rig crashed on because I grepped `from "..."` with
 * double quotes and paramecium.html line 99 uses single quotes. THE INSTRUMENT HAD A HOLE IN IT.
 */
export function importClosure(entry, root = ".", seen = new Set()) {
    const abs = path.normalize(entry);
    if (seen.has(abs) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return seen;
    seen.add(abs);
    const src = fs.readFileSync(abs, "utf8");
    const dir = path.dirname(abs);
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+\.m?js)['"]/g)) {
        const spec = m[1];
        // an absolute spec means the SERVER ROOT, not the filesystem root -- that distinction cost v2597 an
        // entire round when box3dLoader's "/vendor/box3d/box3d.js" made Node report "WASM not built yet"
        // while 970KB of real wasm sat on disk.
        const p = spec.startsWith("/") ? path.join(root, spec) : path.join(dir, spec);
        importClosure(p, root, seen);
    }
    return seen;
}

/**
 * The cache key: the page plus everything it imports. Sorted, so a Set's insertion order cannot change the
 * answer -- A HASH THAT DEPENDS ON WALK ORDER IS A HASH THAT CHANGES WHEN NOTHING DID.
 */
export function fingerprint(entry, root = ".") {
    const files = [...importClosure(entry, root)].sort();
    const h = crypto.createHash("sha256");
    for (const f of files) {
        h.update(f);          // the PATH matters: moving a file is a change even if its bytes are not
        h.update(fs.readFileSync(f));
    }
    return { hash: h.digest("hex").slice(0, 16), files: files.length };
}

/** Load the previous run's fingerprints. A missing or corrupt file means "run everything", never "skip everything". */
export function loadPrints(file) {
    try {
        const j = JSON.parse(fs.readFileSync(file, "utf8"));
        return (j && typeof j === "object" && j.prints) ? j : { prints: {} };
    } catch {
        return { prints: {} };   // FAIL TOWARDS WORK. A cache that fails towards skipping is a cache that hides bugs.
    }
}

export function savePrints(file, prints) {
    fs.writeFileSync(file, JSON.stringify({ when: new Date().toISOString(), prints }, null, 1));
}

/**
 * Should this page be re-run?
 *
 * ONLY skips when: the fingerprint matches AND the last result was a PASS.
 *
 * A FAILING PAGE IS ALWAYS RE-RUN, even unchanged. Two reasons, and the second is the important one. (1) You
 * fix things and want to see them go green. (2) A FAILURE IS A CLAIM ABOUT THE WORLD, NOT ABOUT THE FILE -- it
 * may have failed because of the browser, the driver, a port, or the weather, and skipping it would freeze a
 * verdict that was never about the bytes.
 */
export function shouldRun(name, print, prev) {
    const p = prev.prints[name];
    if (!p) return { run: true, why: "never run" };
    if (p.hash !== print.hash) return { run: true, why: "changed" };
    if (!p.ok) return { run: true, why: "failed last time" };
    return { run: false, why: "unchanged since " + (p.when || "last run") };
}
