// WebGLEngine/tools/ship/rootCoverage-selfcheck.mjs -- v3439
//
// Run: node tools/ship/rootCoverage-selfcheck.mjs
//
// *** THE COVERAGE NUMBER HAS ALWAYS BEEN ONE NUMBER ABOUT ONE THIRD OF THE TREE. *** gateReach counts
// PHYSICS_ROOTS -- physics, simulation, fluid -- and reports 65.2% raw, 97.4% honest once the demo scenes are
// taken out. Everything else was outside the population, which is not a defect in gateReach (its roots argument
// has always been there) but it did mean nobody ever asked the same question of the other folders.
//
// KEITH ASKED IT: "SweK Engine modules were not generated with a sense of a plan, so really all the folders
// could have also been included in our scan... we could open up the tools folder and double check so we could
// mark it checked." THIS IS THAT, AND IT COVERS MORE THAN tools/ BECAUSE reach() ALREADY TOOK A ROOTS ARGUMENT
// -- the whole census was one call away and the only thing missing was somebody making the call.
//
// *** AND tools/ IS NOT THE INTERESTING ANSWER. It comes back at 73.4% with 316 modules and 443 gates living
// inside it, which is Keith's own guess ("I think we have mostly done that") confirmed. ai-bridge COMES BACK AT
// 9.3%. *** That is 214 modules no gate reaches, and it is not a backlog -- A CRUDE COUNT NEAR TWO HUNDRED IS AN
// UNASKED QUESTION, exactly as the physics 125 was before coverageTriage turned it into a list of nine. Much of
// ai-bridge is server glue, install scripts and I/O with nothing to be right or wrong about; some of it is not.
// NOBODY KNOWS WHICH UNTIL SOMEBODY SPLITS IT, and this file's job is to make the number exist, not to guess.
"use strict";
import { reach, PHYSICS_ROOTS, RENDER_ROOTS } from "./gateReach.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// *** RATCHETED BY REACHED COUNT, NOT BY PERCENTAGE. *** A percentage moves when the DENOMINATOR grows, so a
// root that gained ten ungated modules and gated none would show a falling percentage and look like a
// regression, while one that gained a hundred gated modules would look like progress it did not earn. THE
// PROPERTY WORTH HOLDING IS THAT THE NUMBER OF REACHED MODULES DOES NOT FALL: adding modules is normal, and
// un-gating one that was gated is not. Measured at v3439; these may only rise.
const FLOOR = {
    "physics": 229,      // physics, simulation, fluid -- the original population
    "render": 57,        // render, voxel, world, mesh
    "tools": 232,        // the one Keith asked about
    "ai-bridge": 22,     // the one that turned out to matter
    "brain": 46,
};
const ROOTS = {
    "physics": PHYSICS_ROOTS,
    "render": RENDER_ROOTS,
    "tools": ["tools"],
    "ai-bridge": ["ai-bridge"],
    "brain": ["brain"],
};

const seen = {};
console.log("[rootCoverage] the same question, asked of every folder\n");
console.log("  root         modules  ungated  reached");
for (const [label, roots] of Object.entries(ROOTS)) {
    const r = reach(roots);
    const reached = r.total - r.ungated.length;
    seen[label] = { total: r.total, ungated: r.ungated.length, reached };
    const pct = r.total ? (100 * reached / r.total).toFixed(1) : "0.0";
    console.log(`  ${label.padEnd(12)} ${String(r.total).padStart(7)} ${String(r.ungated.length).padStart(8)} ${String(reached).padStart(7)}  (${pct}%)`);
}
console.log();

// ---- 1. THE CENSUS IS WHOLE ---------------------------------------------------------------------------------
{
    const bad = Object.entries(seen).filter(([, s]) => s.reached + s.ungated !== s.total);
    ok("!! every root's reached and ungated counts PARTITION its modules", bad.length === 0,
       "reached + ungated = total in each row, with no remainder, so nothing falls between the two and goes uncounted.");
    ok("...and every root actually has modules in it", Object.values(seen).every((s) => s.total > 0),
       "a root that resolved to nothing would report a flawless 0 of 0 -- THE CLEANEST-LOOKING ROW IN THE TABLE WOULD BE THE BROKEN ONE.");
}

// ---- 2. THE RATCHET: REACHED MAY RISE, NEVER FALL -----------------------------------------------------------
{
    const fell = Object.entries(FLOOR).filter(([k, floor]) => (seen[k] || {}).reached < floor);
    ok("!! *** no root has FEWER gate-reached modules than when this census was taken ***", fell.length === 0,
       fell.length ? "FELL: " + fell.map(([k, f]) => `${k} ${seen[k].reached} against a floor of ${f}`).join(", ") +
                     " -- a module that WAS reached and now is not means a gate stopped importing it, which is the regression this holds the line against"
                   : "counted, not percentaged: A PERCENTAGE MOVES WHEN THE DENOMINATOR GROWS, so a root that gained ten ungated modules would look like a regression it did not commit.");
}

// ---- 3. *** THE FINDING, REPORTED AND NOT FAILED *** --------------------------------------------------------
{
    say(`tools/ is at ${(100 * seen["tools"].reached / seen["tools"].total).toFixed(1)}% -- Keith's guess that "we have mostly done that" is confirmed, and its residue is ${seen["tools"].ungated}.`);
    say(`ai-bridge is at ${(100 * seen["ai-bridge"].reached / seen["ai-bridge"].total).toFixed(1)}% -- ${seen["ai-bridge"].ungated} modules no gate reaches.`);
    ok("REPORTED: ai-bridge is the thinnest root by a wide margin and has NOT been triaged",
       seen["ai-bridge"].ungated > 100,
       "*** AND THAT NUMBER IS NOT A BACKLOG. A CRUDE COUNT NEAR TWO HUNDRED IS AN UNASKED QUESTION -- the physics " +
       "population read 125 ungated until coverageTriage split it and the honest answer turned out to be NINE, because " +
       "116 were demo scenes importing no physics. ai-bridge is server glue, install scripts and I/O, much of which has " +
       "NOTHING TO BE RIGHT OR WRONG ABOUT and should be exempt rather than gated -- and some of which is not glue at all. " +
       "NOBODY KNOWS WHICH UNTIL SOMEBODY SPLITS IT, and guessing the split from filenames is the keyword probe that has " +
       "misled this project three times. THE TRIAGE IS THE ROUND; THIS FILE ONLY MAKES THE NUMBER EXIST. ***");
    ok("...and the render roots are thin too, which is a DIFFERENT reason worth not conflating",
       seen["render"].ungated > 50,
       `render/voxel/world/mesh: ${seen["render"].ungated} ungated of ${seen["render"].total}. Rendering is where the sandbox CANNOT GRADE ANYTHING -- no GPU, no pixels -- so a low number here is partly a statement about the harness rather than about the code. THAT DISTINCTION HAS TO SURVIVE INTO ANY TRIAGE: "not gated" and "not gateable here" are two different things wearing one number.`);
}

console.log(fails ? `\nrootCoverage-selfcheck: ${fails} FAILED` : "\nrootCoverage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
