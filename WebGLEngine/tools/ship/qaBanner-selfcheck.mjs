// WebGLEngine/tools/ship/qaBanner-selfcheck.mjs -- v2857
//
// Run: node tools/ship/qaBanner-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// KEITH FOUND THIS BY LOOKING AT THE QA REPORT, not from a failing check -- which is the tell that nothing was
// watching. ui/assetsFolder.js shows a first-run "Assets folder not set" banner suppressed ONLY by
// localStorage["swek.assetsFolderPrompt"] === "done". A fresh Playwright context has empty localStorage, so the
// banner mounted on EVERY page of EVERY render-QA run and sat in EVERY screenshot.
//
// WHY THIS IS A MEASUREMENT BUG AND NOT A COSMETIC ONE. The banner is position:fixed, ~560px wide, brightly
// bordered, z-index 99998. It paints genuine non-black pixels and genuine unique colours into the frame. Pages in
// this harness are graded on thresholds like nonBlackFrac >= 0.01 and a uniqueColors floor. A page that rendered
// NOTHING AT ALL could clear both on the banner alone -- so the failure mode is a FALSE PASS, which is the
// direction that actually costs something: a false fail wastes an hour, a false pass ships a black page.
//
// THE DRIFT THIS GATE REALLY EXISTS FOR: the fix is a magic string duplicated across two files that never import
// each other -- the harness writes the key, the shipping module reads it. Rename it on either side and NOTHING
// BREAKS LOUDLY. The banner simply comes back, the screenshots quietly re-inflate, and the next person reads
// thresholds that no longer measure the page. So this asserts the two agree on the literal.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const qa = fs.readFileSync(path.join(ENG, "tools", "render-qa", "render-qa.mjs"), "utf8");
const mod = fs.readFileSync(path.join(ENG, "ui", "assetsFolder.js"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. THE KEYS AGREE -- read BOTH literals out of the source rather than hard-coding one here, so this gate
//    cannot itself drift into agreeing with a stale copy of the answer.
{
    const KEY = /["']swek\.assetsFolderPrompt["']/;
    const inQa = KEY.test(qa), inMod = KEY.test(mod);
    ok("the shipping module still gates the banner on that key", inMod);
    ok("the QA harness writes THE SAME key", inQa);
    ok("!! HARNESS AND MODULE AGREE ON THE LITERAL", inQa && inMod,
       "two files, no import between them -- a rename on either side silently restores the banner");
    // The value matters as much as the key: the module compares === "done".
    ok("the module compares against \"done\"", /assetsFolderPrompt["']\)\s*===\s*["']done["']/.test(mod));
    ok("...and the harness writes exactly \"done\"", /setItem\(["']swek\.assetsFolderPrompt["'],\s*["']done["']\)/.test(qa));
}

// 2. IT MUST RUN BEFORE THE PAGE DOES. Setting localStorage after goto() is too late -- the banner would already
//    have mounted and been photographed.
{
    ok("suppression uses addInitScript (runs before any page script)", /addInitScript\(/.test(qa));
    const initAt = qa.indexOf("addInitScript");
    const gotoAt = qa.indexOf("page.goto");
    ok("!! and it is installed BEFORE the first navigation", initAt > 0 && gotoAt > 0 && initAt < gotoAt,
       "addInitScript@" + initAt + " goto@" + gotoAt);
    // It must be on the CONTEXT, not a single page, or only the first page of a run is protected.
    ok("installed on the context, so every page in the run is covered", /ctx\.addInitScript\(/.test(qa));
}

// 3. NO SHIPPING CODE PATH WAS ADDED. The alternative fix was a ?param on the pages themselves; this deliberately
//    is not that, because a new production branch is a new thing that can break in production.
{
    ok("the shipping module gained NO qa/test escape hatch", !/[?&]qa=|__QA__|isRenderQA|HelloPop/i.test(mod),
       "the harness adapts to the page; the page does not learn about the harness");
}

// 4. THE BANNER STILL WORKS FOR REAL USERS -- suppressing it in QA must not delete the feature.
{
    ok("the first-run prompt still exists and still mounts a banner", /maybeFirstRunPrompt/.test(mod) && /appendChild\(banner\)/.test(mod));
    ok("...and still offers both choices", /Choose folder/.test(mod) && /Use built-in assets/.test(mod));
}

// 5. SUPPRESSING THE BANNER MUST NOT DELETE THE DIAGNOSIS.
//
//    The banner said "Assets folder not set" -- which is the ROOT CAUSE of the GPU_Assets/*.glb 404s that failed
//    ~20 pages in one run. The models are not missing from the tree; since v978 they live in an EXTERNAL assets
//    dir and the in-tree GPU_Assets/ subfolders hold only README placeholders. I read the banner as clutter and
//    concluded the assets were gone. Keith corrected it.
//
//    So the banner comes out of the SHOT (it inflates the pixel stats) and the FACT goes into the REPORT. This
//    gate exists so a later tidy-up cannot quietly remove the second half and leave only the silencing.
{
    ok("!! the harness REPORTS the assets-folder state", /config\/assets-dir/.test(qa),
       "the banner is hidden from the screenshot; the fact it carried must survive in the output");
    ok("...and names the in-tree placeholder fallback explicitly", /README placeholders/.test(qa));
    ok("...and says the 404s are ONE cause, not one bug per page", /ONE cause/.test(qa),
       "20 failures with one root cause must not read as 20 problems");
    ok("...and tells the operator how to fix it", /VOXEL_ASSETS_DIR/.test(qa));
}

// 6. MISSING CONTENT IS EXCUSED; MISSING CODE IS NOT. The line has to be in the gate, because the tempting fix
//    for "20 pages failed on a 404" is a blanket 404 excuse -- which would also have swallowed indexPlus's three
//    missing engine scripts, the aholo-viewer lib, terrain_wasm.js, and the /codemap route bug. Those are the
//    only real defects in that report, so a blanket excuse would have hidden 100% of the signal to remove 100%
//    of the noise.
{
    const BENIGN_SRC = qa.slice(qa.indexOf("const BENIGN"), qa.indexOf("const pageIgnore"));
    const pats = [...BENIGN_SRC.matchAll(/\/(404 [^\n]*?)\/i,/g)].map((m) => new RegExp(m[1], "i"));
    ok("the content-vs-code patterns are present", pats.length >= 2, pats.length + " content patterns");
    const benign = (s) => pats.some((r) => r.test(s));
    const cases = [
        ["404 http://h/GPU_Assets/RobotExpressive.glb", true],
        ["404 http://h/GPU_Assets/ships/avatar.glb", true],
        ["404 http://h/dedication.jpg", true],
        ["404 http://h/engine.bootstrap.js", false],
        ["404 http://h/vendor/aholo-viewer/index.js", false],
        ["404 http://h/world/wasm/terrain_wasm.js", false],
        ["404 http://h/codemap", false],
    ];
    let bad = 0;
    for (const [s, want] of cases) if (benign(s) !== want) bad++;
    ok("!! optional CONTENT is excused and CODE is never excused", bad === 0,
       bad ? bad + " misclassified" : "models/pictures benign; .js, .wasm and route 404s still fail");
    ok("...and .js can never be swallowed by the content patterns", !benign("404 http://h/anything.js"),
       "a blanket 404 excuse would have hidden every real defect in the report that prompted this");
}

console.log(fails ? "\nqaBanner-selfcheck: " + fails + " FAILED" : "\nqaBanner-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
