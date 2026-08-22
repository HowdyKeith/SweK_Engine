// WebGLEngine/tools/render-qa/rigOwed.mjs -- v3342
//
// *** WHICH RIG JOBS HAVE ACTUALLY REPORTED? UNTIL NOW NOTHING RECORDED IT. ***
//
// rigJobs-selfcheck is thorough and every check in it grades the DESCRIPTION: the entry says what it unblocks,
// it says how, the script it names exists, the page it links to exists, the settled one carries its numbers.
// NOT ONE OF THEM ASKS WHETHER THE JOB EVER RAN. A job that is beautifully described and a job that has produced
// a measurement look identical in that register, and they are not the same claim.
//
// THE INSTANCE THAT MADE THIS OBVIOUS: `settle` -- run tools/shedding-settle.mjs, the FOURTH attempt at
// f_drag = 2 f_lift -- has sat in the list since v2844. That is roughly five hundred versions. Nothing in the
// tree says whether it was ever started, and the question it exists to answer is still open in the changelog.
// Meanwhile v3341 found that twoFExperiment's frequencies had been NaN that entire time, so the ONE thing that
// would have settled the argument was a job nobody could tell had been skipped.
//
// *** THE PRECEDENT IS ONE PATCH OLD AND IS DELIBERATELY REUSED RATHER THAN REINVENTED. *** v3339's
// tools/render-qa/deviceOwed.mjs drew exactly this distinction for BENCH PAGES: RENDERED / VERDICT-OWED /
// VERDICT-IN, with the middle state unreachable by rendering harder. Rig jobs have the same shape and had no
// such register. Same three states, named for this subsystem.
//
// *** AND THE REGISTER ALREADY HAD THE DISTINCTION, BY HAND, IN EXACTLY ONE ENTRY. *** `seam` is titled
// "SETTLED -- the RLE seam question is answered" and carries the numbers that settled it. That is the SETTLED
// state written as ENGLISH INSIDE A TITLE STRING, where no check can read it -- the same prose-as-data shape the
// install catalog had before `requires` at v3334. One entry proves the third state is real and reachable; the
// rest have no way to say it.
//
// WHAT THIS DOES NOT DO, AND THE RESTRAINT IS THE POINT: it does not guess. A job with no declared settler is
// UNDECLARED, which is NOT the same as unrun -- exactly the third state the ARDY row needed at v3336. Marking
// every undeclared job "not run" would be inventing a fact about Keith's machine from this side of the network.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

/**
 * WHAT SETTLES EACH JOB. The value is the EVIDENCE that would close it, named specifically enough that
 * "has this been done" is answered by LOOKING rather than by remembering.
 *
 *   { settles: "<what must arrive>" }   -> OWED until that arrives
 *   { settled: "<the evidence, on file>" } -> SETTLED, and the evidence travels with the claim
 *   absent                              -> UNDECLARED. Nobody has said what would close it.
 *
 * Only `seam` is SETTLED, and it is settled because the register ALREADY said so in prose with its numbers --
 * this moves that into data rather than asserting anything new. Everything else is OWED or UNDECLARED, and
 * NONE of it is marked run, because nothing here can see Keith's rig.
 */
export const SETTLERS = {
    seam: {
        settled: "render-QA ran all four world variants: nonBlackFrac 0.6906 / 0.6913 / 0.6910 / 0.6906, " +
            "uniqueColors 232 on every one. The RLE mesher draws the SAME WORLD as greedy.",
        since: "v2794 opened it; the rig answered it.",
    },
    settle: {
        settles: "the printed settling curve from tools/shedding-settle.mjs -- specifically whether Re STOPS " +
            "MOVING, and whether the six rake probes then agree with each other and with the lift",
        note: "OPEN SINCE v2844. A NEGATIVE IS A RESULT HERE and the entry says so: if Re settles and the " +
            "probes still disagree, settling was not the answer either, and that is worth knowing rather than " +
            "trying a sixth thing. v3341 raises the stakes -- twoFExperiment's frequencies were NaN from v2862 " +
            "until then, so this job was the only route to the answer for five hundred versions.",
    },
    budget: {
        settles: "frame-budget's split on Galaxina -- and specifically whether the isosurface exceeds 40%, " +
            "which is the threshold the entry pre-registers",
    },
    wasmstats: {
        settles: "report.json from render-qa --only wasm-gen-stats, PLUS a human sentence on whether it " +
            "stuttered -- the entry states outright that a scripted flight has no opinion about smoothness",
    },
    modelbench: {
        settles: "the models.html matrix with REFUSED and MALFORMED in separate columns, because they have " +
            "opposite fixes",
    },
};

export function rigJobIds() {
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "rigRunner.js"), "utf8");
    const ids = [];
    const re = /^\s*id:\s*"([a-z0-9-]+)"/gim;
    let m;
    while ((m = re.exec(src))) ids.push(m[1]);
    return ids;
}

export function rigOwed() {
    const ids = rigJobIds();
    const settled = [], owed = [], undeclared = [];
    for (const id of ids) {
        const s = SETTLERS[id];
        if (!s) undeclared.push(id);
        else if (s.settled) settled.push({ id, evidence: s.settled, since: s.since || null });
        else owed.push({ id, needs: s.settles, note: s.note || null });
    }
    return { ids, settled, owed, undeclared };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    const r = rigOwed();
    console.log("");
    console.log("[rigOwed] which rig jobs have reported -- tools/render-qa/rigOwed.mjs");
    console.log("  RIG JOBS: " + r.ids.length + " registered -- " + r.settled.length + " SETTLED, " +
        r.owed.length + " OWED, " + r.undeclared.length + " UNDECLARED");
    console.log("");
    console.log("  SETTLED (the evidence is on file, and it travels with the claim):");
    for (const s of r.settled) console.log("    " + s.id + " -- " + s.evidence);
    console.log("");
    console.log("  OWED (somebody has said what would close these, and it has not arrived):");
    for (const o of r.owed) console.log("    " + o.id + "  needs: " + o.needs);
    console.log("");
    console.log("  UNDECLARED (nobody has said what would close these -- NOT the same as 'not run'):");
    console.log("    " + r.undeclared.join(", "));
    console.log("");
    console.log("  Nothing here can see the rig. NO JOB IS MARKED RUN, because this side of the network cannot");
    console.log("  know that -- OWED means the evidence has not been recorded HERE, not that Keith did not do it.");
    console.log("");
    process.exit(0);
}
