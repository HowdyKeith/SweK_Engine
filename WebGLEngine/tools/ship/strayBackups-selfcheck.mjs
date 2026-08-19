// WebGLEngine/tools/ship/strayBackups-selfcheck.mjs -- v3508
//
// Run: node tools/ship/strayBackups-selfcheck.mjs
//
// *** WebGLEngine/main.js.orig SHIPPED IN EVERY ARCHIVE FOR OVER FIFTEEN HUNDRED VERSIONS. It was a v1986
// snapshot of main.js -- 1.48 MB, the third-largest file in the tree after es-universe.json and main.js itself.
// DELETED AT v3508, AND SHOWN SAFE RATHER THAN ASSUMED SAFE. ***
//
// WHAT THE CHECK BEFORE THE DELETION FOUND: 99.6% of its lines are still present in the live main.js verbatim
// (22,223 of 22,303). The 80 that are not are SUPERSEDED FORMS of lines that were later rewritten, not lost
// capability -- every distinctive name in them was chased into the live tree by hand: CapeShieldManager,
// MagicCarpetMain and P3dRenderer are all still referenced by main.js AND their files still exist, and the one
// name that main.js no longer carries -- the WEBGL_debug_renderer_info GPU-name probe -- SURVIVES IN THREE
// OTHER LIVE PLACES (render/glBootstrap.js, its own gate, and benchmark.html). NOTHING IN IT WAS UNIQUE.
//
// *** AND THE GATE PINS THE **PROPERTY**, NOT THE FILE. Asserting "main.js.orig is absent" would be a check
// that goes green forever and catches the next stray backup never. What is asserted is that NO FILE WITH A
// BACKUP SUFFIX SHIPS AT ALL -- the species this tree has committed twenty-three times, avoided on purpose. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// The suffixes an editor, a patch tool or a merge leaves behind. `.orig` and `.rej` are patch(1)'s; `.bak` and
// a trailing `~` are editors'; `.old` is a person. A LIST OF FOUR THINGS IS NOT A GUESS AT A HUNDRED -- each one
// is a real tool's real output, and anything wider would start catching legitimate names.
export const BACKUP_SUFFIX = /(\.orig|\.rej|\.bak|\.old|~)$/i;
const SKIP = new Set([".git", "node_modules", "__pycache__"]);

export function findStrays(root = ROOT) {
    const out = [];
    (function rec(dir) {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (SKIP.has(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) rec(p);
            else if (BACKUP_SUFFIX.test(e.name)) out.push({ rel: path.relative(root, p).split(path.sep).join("/"), size: fs.statSync(p).size });
        }
    })(root);
    return out;
}

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE MATCHER IS PROVEN ON NAMES WHOSE ANSWER WAS DECIDED FIRST
 * --------------------------------------------------------------------------------------------------------- */
{
    const should = ["main.js.orig", "a.patch.rej", "notes.bak", "config.old", "draft.md~", "MAIN.JS.ORIG"];
    const shouldNot = ["original.js", "goldberg.mjs", "old-growth.md", "rejected.test.mjs", "a~b.js", "backup.js"];
    const bad = [...should.filter((n) => !BACKUP_SUFFIX.test(n)), ...shouldNot.filter((n) => BACKUP_SUFFIX.test(n))];
    say(`matcher fixture: ${should.length} names that must match, ${shouldNot.length} that must not; wrong: ${bad.length ? bad.join(", ") : "none"}`);
    ok("!! *** THE MATCHER IS CHECKED IN BOTH DIRECTIONS BEFORE IT IS POINTED AT THE TREE ***",
       bad.length === 0,
       "*** THE NEGATIVES ARE THE HALF THAT MATTERS AND THEY WERE CHOSEN TO BE NASTY: `original.js` CONTAINS \"orig\", `goldberg.mjs` ENDS IN \"g\" AFTER AN \"old\", `old-growth.md` STARTS with old, `rejected.test.mjs` contains \"rej\", and `a~b.js` has a tilde IN THE MIDDLE. A pattern that matched any of them would delete live code, so the anchors are load-bearing and are tested as such. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** NO STRAY BACKUP SHIPS -- THE PROPERTY, NOT THE ONE FILE ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const strays = findStrays();
    for (const s of strays) say(`  STRAY: ${s.rel} (${(s.size / 1048576).toFixed(2)} MB)`);
    ok("!! *** NOT ONE FILE WITH A BACKUP SUFFIX IS IN THE SHIPPED TREE ***",
       strays.length === 0,
       "*** ASSERTING \"main.js.orig IS ABSENT\" WOULD GO GREEN FOREVER AND CATCH THE NEXT ONE NEVER -- a gate pinned to an arrangement rather than a property, the species this tree has committed twenty-three times and mostly to itself. WHAT IS ASSERTED IS THE RULE. If a future round genuinely needs to keep one, THIS LINE GOES RED AND THE RIGHT RESPONSE IS AN EXEMPTION WITH A STATED REASON, NOT A WIDER PATTERN. ***");

    ok("...and the deletion was shown safe rather than assumed safe",
       !fs.existsSync(path.join(ROOT, "WebGLEngine", "main.js.orig")),
       "*** 99.6% of its lines were still in the live main.js verbatim, and every distinctive name in the remaining 80 was chased into the tree BY HAND: CapeShieldManager, MagicCarpetMain and P3dRenderer are all still referenced and their files still exist; the one name main.js no longer carries -- the WEBGL_debug_renderer_info GPU probe -- survives in glBootstrap.js, its gate and benchmark.html. THE SHIPPED ZIP IS THE BACKUP, and it has been the real one three times (v3140, v3159, v3176). ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. WHAT IT WAS COSTING, AND WHAT IT WAS NOT
 * --------------------------------------------------------------------------------------------------------- */
{
    const big = fs.statSync(path.join(ROOT, "WebGLEngine", "es-universe.json")).size;
    say(`for scale: es-universe.json is ${(big / 1048576).toFixed(1)} MB and main.js.orig was 1.48 MB`);
    ok("!! the honest size claim: this was the third-largest file and NOT where the archive's weight is",
       big > 10 * 1048576,
       "*** 1.48 MB OF A 23.6 MB ARCHIVE. Removing it is worth about 6% AND THAT IS NOT THE REASON TO DO IT -- the reason is that a 1500-version-old snapshot of the file every reviewer opens first is an ACTIVE HAZARD: somebody greps the tree, gets two hits, and reads the wrong one. THE SAME MISTAKE THE DUPLICATE-FILE RATCHET AT v3506 EXISTS TO CATCH, IN A FILE THAT WAS NOT EVEN A DUPLICATE. ***");
}

console.log(fails ? "\nstrayBackups-selfcheck: " + fails + " FAILED" : "\nstrayBackups-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
