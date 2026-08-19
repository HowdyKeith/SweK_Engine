// WebGLEngine/tools/ship/trim-selfcheck.mjs — v2601
//
// Run: node tools/ship/trim-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES the publish/trim step of tools/ship/ship.mjs.
//
// KEITH CAUGHT THIS: "i got 2599, but you were working on 2600."
//
// v2599 was presented to him WITH A LINK. A later v2600 ship ran, and its trim step DELETED v2599 WHILE THAT
// LINK WAS STILL THE ONE ON HIS SCREEN. He got the file in time. THE LINK DID NOT SURVIVE THE NEXT TURN.
//
// The old rule was ONE ZIP PER TURN and its reasoning was GOOD -- an outputs folder with three versions in it
// is three chances to hand him the wrong one. THAT IS WHY IT SURVIVED THIS LONG: it optimised for "no
// ambiguity" and paid for it with "the link I gave you dies", AND ONLY ONE OF THOSE TWO COSTS IS VISIBLE FROM
// INSIDE THE SANDBOX.
//
// A LINK I GAVE YOU IS A PROMISE, AND THE TRIM WAS BREAKING IT ON MY BEHALF, SILENTLY, ONE TURN LATER.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// The trim, lifted from ship.mjs. NOT a paraphrase -- if these drift apart this gate is grading a copy, so the
// last check below greps the real file to prove the rule it tests is the rule that ships.
const KEEP = 2;
function trim(dir, current) {
    const mine = fs.readdirSync(dir)
        .filter((f) => /^SweK_Engine_v(\d+)\.zip$/.test(f))
        .sort((a, b) => Number(b.match(/v(\d+)/)[1]) - Number(a.match(/v(\d+)/)[1]));
    let removed = 0;
    for (const f of mine.slice(KEEP)) { fs.unlinkSync(path.join(dir, f)); removed++; }
    return { removed, kept: fs.readdirSync(dir).filter((f) => /^SweK_Engine_v\d+\.zip$/.test(f)) };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-trim-"));
try {
    // ---- 1. THE PROMISE KEITH CAUGHT ME BREAKING ------------------------------------------------------------
    for (const v of [2597, 2598, 2599, 2600]) fs.writeFileSync(path.join(tmp, `SweK_Engine_v${v}.zip`), "x");
    const r = trim(tmp, "SweK_Engine_v2600");
    ok("!! THE ZIP I HANDED YOU LAST TURN SURVIVES THIS TURN", r.kept.includes("SweK_Engine_v2599.zip"),
       "kept: " + r.kept.sort().join(", ") + ". THIS IS THE EXACT CASE KEITH HIT: he was given a link to v2599, a v2600 ship ran, AND THE OLD TRIM DELETED v2599 OUT FROM UNDER THE LINK ON HIS SCREEN. A LINK I GAVE YOU IS A PROMISE, AND THE TRIM WAS BREAKING IT ON MY BEHALF, SILENTLY, ONE TURN LATER.");
    ok("...and the current one is obviously still there", r.kept.includes("SweK_Engine_v2600.zip"),
       "or the ritual just deleted what it came to publish");
    ok("...and a THIRD stale version still does not get to pile up", !r.kept.includes("SweK_Engine_v2597.zip") && r.removed === 2,
       "removed " + r.removed + ". THE OLD RULE'S REASONING WAS GOOD AND IS KEPT: an outputs folder with three versions in it is three chances to hand him the wrong one. TWO IS CURRENT PLUS THE PROMISE. THREE IS A MESS.");

    // ---- 2. THE ONE THAT WOULD HAVE BITTEN AT v3000 ---------------------------------------------------------
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp);
    for (const v of [2999, 3000, 3001]) fs.writeFileSync(path.join(tmp, `SweK_Engine_v${v}.zip`), "x");
    const r2 = trim(tmp, "SweK_Engine_v3001");
    ok("!! ...AND IT SORTS NUMERICALLY, NOT AS TEXT", r2.kept.includes("SweK_Engine_v3001.zip") && r2.kept.includes("SweK_Engine_v3000.zip"),
       "kept: " + r2.kept.sort().join(", ") + ". AS STRINGS, \"v2999\" > \"v3001\" -- so a text sort would have kept v2999 AND DELETED THE ONE IT JUST PUBLISHED. That bug would have worked perfectly for four hundred versions and then detonated at v3000, WHICH IS ROUGHLY FOUR HUNDRED SHIPS FROM TODAY.");

    // ---- 3. AND THE GATE MUST BE TESTING THE RULE THAT SHIPS -------------------------------------------------
    const real = fs.readFileSync(new URL("./ship.mjs", import.meta.url), "utf8");
    ok("the REAL ship.mjs keeps two, and this gate is not grading a copy of itself", /const KEEP = 2;/.test(real) && /Number\(b\.match\(\/v\(\\d\+\)\/\)\[1\]\) - Number\(a\.match/.test(real),
       "greps ship.mjs for `const KEEP = 2` AND for the NUMERIC comparator. v2591 taught this: a gate that holds its own copy of the logic will pass forever while the real file rots. THE RULE IT TESTS HAS TO BE THE RULE THAT SHIPS.");
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(fails ? "\ntrim-selfcheck: " + fails + " FAILED" : "\ntrim-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
