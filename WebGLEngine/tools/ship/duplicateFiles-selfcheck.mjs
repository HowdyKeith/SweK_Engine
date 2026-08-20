// WebGLEngine/tools/ship/duplicateFiles-selfcheck.mjs -- v3506
//
// Run: node tools/ship/duplicateFiles-selfcheck.mjs
//
// *** THE RATCHET: A GROUP OF FILES THAT ARE BYTE-IDENTICAL TODAY MUST NOT QUIETLY STOP BEING SO. *** Editing
// every copy together PASSES -- that is the behaviour this encourages. Editing ONE fails. Deleting one is
// reported APART, because a drifted copy is a defect and a removed copy is a decision.
//
// Re-freeze with SWEK_FREEZE_DUPLICATE_FILES=1 after a deliberate change.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDuplicateGroups, checkGroups, readFrom, ROOT } from "./duplicateFiles.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(HERE, "duplicate-files-baseline.json");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE CHECKER IS PROVEN ON A FIXTURE WHOSE ANSWER IS KNOWN, BEFORE IT IS POINTED AT THE TREE ***
 * --------------------------------------------------------------------------------------------------------- */
{
    // A reader over an in-memory filesystem, so all four outcomes can be forced. No temp files, nothing to
    // clean up, and NOTHING THAT COULD TOUCH THE REAL TREE while proving a checker that reads the real tree.
    const files = { "a.js": "same", "b.js": "same", "c.js": "same",
                    "d.js": "pair", "e.js": "pair",
                    "f.js": "x",    "g.js": "DRIFTED",
                    "h.js": "gone-partner" };
    const read = (rel) => (rel in files ? Buffer.from(files[rel]) : null);
    const r = checkGroups([["a.js", "b.js", "c.js"], ["d.js", "e.js"], ["f.js", "g.js"], ["h.js", "missing.js"]], read);

    say(`fixture: ${r.intact.length} intact, ${r.drifted.length} drifted, ${r.missing.length} with a missing member`);
    ok("!! *** ALL FOUR OUTCOMES FORCED AND EACH LANDS IN ITS OWN BUCKET ***",
       r.intact.length === 2 && r.drifted.length === 1 && r.missing.length === 1 &&
       r.drifted[0].odd.length === 1 && r.drifted[0].odd[0] === "g.js" && r.missing[0].gone[0] === "missing.js",
       "*** A CHECKER NOBODY CHECKED MAKES EVERY VERDICT BELOW IT MEANINGLESS -- v3450's rule, and v3494 used exactly this shape for the GLSL extractor. Worked out before the code ran: a/b/c match, d/e match, f and g DIFFER so g is the odd one, and missing.js is ABSENT rather than different. ***");

    ok("!! ...and DRIFT and DELETION never land in the same bucket",
       !r.drifted.some((x) => x.group.includes("missing.js")) && !r.missing.some((x) => x.group.includes("g.js")),
       "*** A GROUP THAT LOST A MEMBER BECAUSE SOMEBODY EDITED ONE COPY IS A DEFECT. A GROUP THAT LOST ONE BECAUSE SOMEBODY DELETED IT IS A DECISION. One count covering both would make the second read as the first, which is this tree's most-repeated shape wearing a new hat. ***");

    const three = checkGroups([["a.js", "b.js", "c.js"]], (rel) => (rel === "c.js" ? Buffer.from("nope") : read(rel)));
    ok("...and in a group of three, only the odd one out is named",
       three.drifted.length === 1 && three.drifted[0].odd.length === 1 && three.drifted[0].odd[0] === "c.js",
       "strictMath.mjs and strictTrig.mjs each live in THREE places, so 'which of them moved' is a question that will actually be asked.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE SET IS DERIVED BY HASHING AND THE BASELINE STORES THE PATHS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const found = findDuplicateGroups(ROOT);
    const key = (g) => g.join("|");
    if (process.env.SWEK_FREEZE_DUPLICATE_FILES === "1") {
        fs.writeFileSync(BASE, JSON.stringify({ groups: found }, null, 1));
        console.log("  ----  FROZE " + found.length + " groups into duplicate-files-baseline.json");
    }
    const baseline = JSON.parse(fs.readFileSync(BASE, "utf8")).groups;
    say(`${found.length} groups found by hashing the tree; ${baseline.length} in the baseline`);
    for (const g of baseline) say(`  x${g.length}  ${g.join("  =  ")}`);

    ok("!! *** THE GROUPS ARE DERIVED BY HASHING, NEVER TYPED, SO A SEVENTH COPY JOINS AUTOMATICALLY ***",
       baseline.length > 8 && baseline.every((g) => g.length > 1),
       "*** A HAND-WRITTEN LIST WOULD BE A SECOND DECLARATION ABOUT SECOND DECLARATIONS, and it would go stale the first time somebody added a copy -- which is precisely the failure it exists to catch. ***");

    const r = checkGroups(baseline, readFrom(ROOT));
    for (const d of r.drifted) say(`  DRIFTED: ${d.odd.join(", ")} no longer matches ${d.group.filter((x) => !d.odd.includes(x)).join(", ")}`);
    for (const m of r.missing) say(`  MISSING: ${m.gone.join(", ")} (group ${m.group.join(" = ")})`);
    ok("!! *** EVERY BASELINED GROUP IS STILL BYTE-IDENTICAL TO ITSELF ***",
       r.drifted.length === 0,
       "*** THE BASELINE STORES THE **PATHS**, NOT THE HASH. Storing the hash would fire every time somebody correctly updated all the copies together -- THE ONE BEHAVIOUR THIS IS TRYING TO ENCOURAGE. Storing the paths asks the only question that matters: DO THESE FILES STILL MATCH EACH OTHER. Re-freeze with SWEK_FREEZE_DUPLICATE_FILES=1 after a deliberate change. ***");

    ok("...and no baselined file has vanished",
       r.missing.length === 0,
       "Reported separately from drift and asserted separately, so a deliberate deletion reads as one line to remove from the baseline rather than as a defect to hunt.");

    const news = found.filter((g) => !baseline.some((b) => key(b) === key(g)));
    say(news.length ? `NEW groups not in the baseline: ${news.map((g) => g.join(" = ")).join(" ; ")}` : "no new groups since the freeze");
    ok("!! a NEW duplicate group is REPORTED and does not fail the build",
       true,
       "*** SOMEBODY COPYING A FILE IS INFORMATION, NOT A DEFECT -- a vendored copy or a published package folder is a perfectly good reason to have two. THE RATCHET RUNS ONE WAY, like gradedCoverage's: what must not happen is a group SILENTLY CEASING to be one. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** WHAT THE SCAN ACTUALLY FOUND, AND MY OWN COUNT WAS WRONG ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const found = findDuplicateGroups(ROOT);
    const flat = found.flat();
    const libm = found.filter((g) => g.some((p) => /strict-libm/.test(p)));
    say(`${found.length} groups covering ${flat.length} files; ${libm.length} of them are the strict-libm package published twice`);
    ok("!! *** I REPORTED SIX GROUPS AT v3500 AND THERE ARE TWELVE ***",
       found.length > 10,
       "*** THE v3500 NUMBER CAME FROM A DIFFERENT FILTER -- the whole tree including the VBA folders that have since been split out, against watched source extensions now. NEITHER COUNT WAS WRONG FOR ITS OWN QUESTION AND I QUOTED ONE AS IF IT ANSWERED THE OTHER. CHECK THE TREE, NOT THE NOTES: this file's own header would have said six. ***");

    const shader = found.find((g) => g.some((p) => /voxel\.vert/.test(p)));
    ok("!! ...and the most interesting one is a SHADER SHIPPED UNDER TWO EXTENSIONS",
       !!shader && shader.length === 2,
       shader ? `${shader.join(" = ")} -- the same GLSL as a .glsl and as a .js, which is exactly the two-declarations shape and the kind nobody greps for because the names look deliberate.` : "");

    ok("...and the strict-libm package is the bulk of the list, which is a REASON rather than a defect",
       libm.length >= 6,
       "A published package folder mirroring the source it was cut from is a normal thing to have. IT STILL NEEDS THE RATCHET, because 'normal to have two' and 'safe for them to disagree' are different claims -- and the second one is false here.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE FRONT DOOR
 * --------------------------------------------------------------------------------------------------------- */
{
    const reg = fs.readFileSync(path.join(HERE, "reportingTools.mjs"), "utf8");
    ok("!! the register is reachable from tools.html rather than only from a console",
       /tools\/ship\/duplicateFiles\.mjs/.test(reg),
       "*** A REPORTING TOOL MUST PRINT AND EXIT ZERO and this one does; the GATE is what exits nonzero. Keith's standing rule -- EVERY TOOL NEEDS A FRONT DOOR -- and v3416's lesson that a report printing nothing and exiting 0 is indistinguishable from a clean bill. ***");
}

console.log(fails ? "\nduplicateFiles-selfcheck: " + fails + " FAILED" : "\nduplicateFiles-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
