// face/skinnedFit-selfcheck.mjs -- v3786
//
// *** NOTHING IN THIS SANDBOX CAN RUN WebGL, SO THIS GATE GRADES THE DIAGNOSTIC RATHER THAN THE RENDER.
// Keith's RobotExpressive.html still printed "height 0.03u / scale 0.01x" after the v3779 skinned-fit patch
// shipped -- and READING THE SOURCE COULD NOT TELL WHICH OF FIVE PRECONDITIONS FAILED, because every one of
// them returned null silently and left the RAW box in place. THE SYMPTOM WAS IDENTICAL whether the
// measurement was skipped, refused, or never reached. ***
//
// *** THAT IS THE SAME SHAPE AS "EXIT 0 WITH NO OUTPUT READS AS A CLEAN BILL" AND AS THE WebGPU MESSAGE THAT
// NAMED NO CAUSE: A FAILURE THAT LOOKS LIKE A VALUE IS WORSE THAN AN ERROR. This gate pins that each early
// return names itself, and that the reason reaches the page. ***

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "../tools/ship/sourceScan.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const dir = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(dir, "robotFaceAvatar.js"), "utf8");
const PAGE = readFileSync(path.join(dir, "..", "RobotExpressive.html"), "utf8");
const code = codeOnly(SRC);

console.log("1. EVERY EARLY RETURN NAMES ITSELF");
{
    // Count the bare `return null` inside _measureModelSkinned. Structure, not message text -- codeOnly strips
    // string contents (learned at v3785, where a check grepped for text that lived inside a string literal).
    const body = code.split("function _measureModelSkinned")[1].split("\nfunction ")[0];
    // *** THIS CHECK WAS TOO LOOSE FIRST AND THE PLANT PROVED IT: `named >= bareNulls` counted assignments
    // ANYWHERE in the function against returns anywhere, so the SUCCESS-path assignment padded the total and
    // a silenced return still read 8 >= 7. A COUNT COMPARISON IS NOT A CORRESPONDENCE. Now every `return null`
    // must carry its reason ON ITS OWN LINE, which is the thing actually being claimed. ***
    const lines = body.split("\n");
    const nulls = lines.filter((l) => /return null;/.test(l));
    const silent = nulls.filter((l) => !/_skinnedFitReason/.test(l));
    ok("!! *** NO SILENT `return null` LEFT IN THE SKINNED MEASUREMENT ***",
        nulls.length > 0 && silent.length === 0,
        nulls.length + " null returns, " + silent.length + " of them silent. *** A SILENT null LEAVES THE RAW " +
        "BOX IN PLACE AND SAYS NOTHING, so 0.03u prints whether the measurement was skipped, refused or never " +
        "reached -- THREE DIFFERENT BUGS WEARING ONE NUMBER ***");
    ok("!! the vertex-match failure carries its COUNT and RANGE, not just a label",
        /vertices matched a joint/.test(SRC) && /njoints/.test(SRC),
        "\"0 of N vertices matched a joint (njoints M)\" distinguishes A PARSE MISMATCH from an empty model. " +
        "That is the likeliest failure for a RIGID-PARENTED rig and it was the quietest of the five");
    ok("!! and the success path is named too, so `ok` is distinguishable from `not attempted`",
        /_skinnedFitReason = "ok/.test(SRC),
        "an absent reason and a successful one must not read the same -- the initial value is \"not attempted\"");
}

console.log("\n2. A FAILED ATTEMPT MUST NOT LATCH");
{
    ok("!! *** _skinnedFitDone IS RELEASED WHEN THE MEASUREMENT RETURNS NOTHING ***",
        /_skinnedFitDone = false;/.test(code.split("_measureModelSkinned()")[1] || ""),
        "*** THE GUARD SET _skinnedFitDone = true BEFORE KNOWING WHETHER THE MEASUREMENT SUCCEEDED. The " +
        "animator may not be ready on the very first frame that clears the guard, and latching would make ONE " +
        "EARLY FRAME PERMANENT -- a race whose symptom is exactly the one being chased. Found while adding the " +
        "diagnostic, not by looking for it ***");
}

console.log("\n3. THE REASON REACHES THE PAGE");
{
    ok("!! the module exposes it",
        /window\.robotAvatar\.skinnedFitReason = /.test(code));
    ok("!! and the readout shows it, but only when it is not a success",
        /skinnedFitReason\(\)/.test(PAGE) && /fit: /.test(PAGE),
        "a diagnostic that prints on every healthy frame is noise; one that prints ONLY on failure is a signal");
}

report("*** WHAT THIS GATE CANNOT DO, AND IT IS THE IMPORTANT HALF ***",
    "IT CANNOT TELL WHETHER THE SKINNED FIT NOW WORKS. There is no WebGL here, no animator, and no GLB parse -- " +
    "so `_measureModelSkinned` is never executed by this file. What is graded is that WHEN it fails, the " +
    "failure has a NAME. THE ANSWER COMES FROM KEITH'S SCREEN: if the readout now reads `fit: 0 of N vertices " +
    "matched a joint`, the parse and the animator disagree about joint indices; if it reads `fit: no " +
    "joints/weights`, the parse path changed; and IF THE `fit:` LINE IS ABSENT WHILE THE HEIGHT IS STILL " +
    "0.03u, then the measurement SUCCEEDED and something downstream is overwriting it -- which would be a " +
    "different bug from the one everybody has been assuming.");

report("WHY THE READOUT AND THE FIX WERE LOOKING AT DIFFERENT NUMBERS",
    "metrics().modelHeight is derived from _rawBBox. The v3779 patch REPLACES _rawBBox with the skinned box " +
    "and updates modelHeight in the same block -- so the readout is correct to trust it. The 0.03u therefore " +
    "means THAT BLOCK DID NOT RUN, which is precisely what the reason string now reports. THE READOUT WAS " +
    "NEVER THE BUG.");

console.log("\nskinnedFit-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
