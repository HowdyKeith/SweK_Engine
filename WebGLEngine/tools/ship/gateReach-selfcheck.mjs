// WebGLEngine/tools/ship/gateReach-selfcheck.mjs — v3318
//
// Run: node tools/ship/gateReach-selfcheck.mjs   (~5.8s — MEASURED v3941, was ~20s; it builds the import graph)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// gradedCoverage reports "50 of 124 physics modules WITH A SELFCHECK are reachable from a device bind". True,
// useful, and its denominator is SELF-SELECTING: a module with no sibling selfcheck cannot appear as uncovered,
// because it is not counted at all. This measures the population that one cannot see.
//
// AND A SIBLING FILE IS NOT THE CRITERION. simulation/em/fdtd1d.js has no sibling selfcheck and is thoroughly
// gated -- by physicsSuite, three directories away. A filename heuristic would have called it ungated and been
// wrong, which is why this walks the import graph instead.

import fs from "node:fs";
import { RENDER_ROOTS, reach, reachLines, physicsModules, PHYSICS_ROOTS } from "./gateReach.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const r = reach();

// ---- 1. THE DENOMINATOR IS THE WHOLE POPULATION -----------------------------------------------------------------
{
    ok("!! the population counted is EVERY physics module, not only those with a sibling gate",
       r.total > 300,
       r.total + " modules across " + PHYSICS_ROOTS.join(", ") + " — gradedCoverage's 124 counts only those with a sibling selfcheck, which cannot show what it excludes");
    ok("!! reachability is read from the IMPORT GRAPH, so a gate three directories away still counts",
       r.gated > 150 && r.fraction > 0.4,
       r.gated + " of " + r.total + " (" + (r.fraction * 100).toFixed(1) + "%) reachable from at least one of " + r.gates + " gates");
}

// ---- 2. THE CASE THAT PROVES THE FILENAME HEURISTIC WRONG -----------------------------------------------------------
{
    const mods = physicsModules();
    ok("simulation/em/fdtd1d.js is in the population",
       mods.includes("simulation/em/fdtd1d.js"));
    ok("!! ...and it counts as GATED despite having no sibling selfcheck (physicsSuite imports it)",
       !r.ungated.includes("simulation/em/fdtd1d.js"),
       "a sibling-file test would have called this ungated and been wrong — it is one of the best-gated modules in the tree");
}

// ---- 3. THE NUMBER IS REPORTED AS A DENOMINATOR, NOT AS A VERDICT ------------------------------------------------------
{
    ok("!! the ungated count is stated WITHOUT claiming they are defects",
       r.ungated.length > 0 && reachLines(r).some((l) => /DENOMINATOR, NOT A VERDICT/.test(l)),
       r.ungated.length + " modules reach no gate. Many are loaders, meshers and glue, and a solver needs " +
       "self-consistency rather than an answer key — gradedCoverage says the same of its own number and it is " +
       "just as true here. What this buys is knowing the size of the unexamined population");
    ok("...and the two measurements are not confused for each other",
       r.total !== 124,
       "'we grade 50 of 124' and 'we grade " + r.gated + " of " + r.total + ", and " + r.ungated.length +
       " have never been looked at' are both true and read very differently");
}

// ---- 4. IT DOES NOT SILENTLY DRIFT ------------------------------------------------------------------------------------
{
    // a floor, not a target: if coverage collapses, this fires. Deliberately loose -- the point is to notice a
    // cliff, not to ratchet a percentage that nobody chose.
    ok("physics coverage has not collapsed (floor at 40%, currently " + (r.fraction * 100).toFixed(1) + "%)",
       r.fraction > 0.4,
       "a floor to catch a cliff, not a ratchet toward a number nobody chose — a coverage target would invite " +
       "gating loaders to move it");
}

for (const l of reachLines(r)) console.log("        " + l);
// ---- v3350: THE RENDER POPULATION -------------------------------------------------------------------------
// Added because a question about render/rasterProbe.js had no tool: this file's subject knew the right method
// and its population stopped at physics/.
{
    const RAYMARCH_ARC = ["voxel/voxelDDA.js", "render/voxelRaymarchShader.js", "render/voxelRaymarchPass.js",
                          "render/voxelVolumeStream.js", "render/depthProject.js", "render/rasterProbe.js",
                          "render/parallaxOcclusion.js"];
    const r = reach(RENDER_ROOTS), p = reach();
    console.log("  ----  render/voxel/world/mesh: " + r.gated + " of " + r.total + " reachable from a gate (" +
        (r.fraction * 100).toFixed(1) + "%), against physics " + (p.fraction * 100).toFixed(1) + "%");

    // *** THE NUMBER IS SINGLE-SOURCED, AND IT WAS NOT. *** The check compared against 345 while the message
    // read "expected 341" -- the figure was hardcoded into the string when the pin was first written and never
    // moved with it. So the gate would fire correctly and then TELL YOU THE WRONG EXPECTED VALUE, which is a
    // worse failure than the one it exists to catch: it sends the reader looking for six phantom modules. One
    // constant now, used by both.
    //
    //   328 -> pinned at some earlier round
    //   338 -> found on arrival at v3406, unexplained, gate red and had been for a while
    //   341 -> v3410: plus hall.js, waveguide.js, buckling.js
    //   342 -> arrived at v3425 with one module added upstream
    //   345 -> v3426: plus beerLambert.js, oscillation.js, halo.js
    //   347 -> v3428: plus lensing.js, friedmann.js
    //   348 -> Keith's patch: plus jeans.js
    //   349 -> v3431: AND physics/mechanics/poisson.mjs, which that patch could not know about because its base
    //          was v3428. *** THE PATCH SAID 348 AND THE TREE SAYS 349, AND THAT GAP IS THE VERSION COLLISION
    //          SHOWING UP AS A NUMBER: two rounds both called v3429, each counting a population the other had
    //          already grown. THE RATCHET CAUGHT IT, which is the whole point of a count that must be
    //          ACCOUNTED FOR rather than merely updated. ***
    //   351 -> v3432: plus physics/mesh/csg.mjs and physics/mesh/dualContour.mjs
    //   383 -> v3552: found RED ON ARRIVAL in the shipped v3551, 32 modules above the pin. Not from this round --
    //          no physics module was added by it. The population now sits at 383 across physics/xpbd 34,
    //          simulation/lbm 18, simulation/tomo 13, physics/sph 12, physics/blackhole 11, physics/md 11.
    //
    // *** AND THIS IS THE SECOND TIME IT HAS ARRIVED RED, WHICH IS THE MORE USEFUL FACT. *** It was red on arrival
    // at v3406 too (338 against a pinned 328). v3410 improved the MESSAGE -- it now names the command and asks for
    // the reason -- and single-sourcing at v3528 stopped it reporting a stale expected value. Neither change
    // touched the underlying dynamic: THE PIN STILL REQUIRES A HUMAN TO NOTICE, and between rounds nobody does.
    // A better mechanism would record the population automatically at ship time and diff it, so the number moves
    // with the tree and only an UNEXPLAINED move is a failure. That is a real round and it is not this one; what
    // is recorded here is that improving the wording of an ignored signal did not make it less ignored.
    // *** RETIRED AT v3553. THIS PIN IS NOW A DERIVED VALUE, NOT A TYPED ONE. ***
    // It went RED ON ARRIVAL twice -- 338 against 328 at v3406, 383 against 351 at v3551 -- because it needed a
    // human to remember a number between rounds. v3410 improved its message and v3528 single-sourced it, and
    // neither changed that. tools/ship/populationCensus.mjs now RECORDS the population at ship time and diffs it,
    // so the number moves with the tree and only an UNEXPLAINED move fails.
    // The check is kept here rather than deleted, because gateReach's ROOTS still must not change silently -- but
    // the count comes from the record now, so this can no longer go stale on its own.
    const rec = (() => { try { return JSON.parse(fs.readFileSync("tools/ship/population-census.json", "utf8")); } catch { return null; } })();
    const EXPECTED_POPULATION = rec ? rec.total : null;

    // *** THIS PIN WAS RED ON ARRIVAL AT v3406, AND HAD BEEN FOR A WHILE. *** It expected 328 and the tree
    // contained 338: ten physics modules had been added since somebody last looked, and the gate said so on
    // every run without anybody reading it. The check is not wrong -- catching a silently changed population is
    // exactly its job, and the population HAD silently changed -- but a pin that goes red and stays red stops
    // being a signal and becomes wallpaper.
    //
    // So the number is updated WITH ITS HISTORY, and the failure message now says what to do about it. It is
    // expected to move whenever a physics module is added; what it must not do is move without anyone noticing.
    //   328 -> pinned at some earlier round
    //   338 -> found on arrival at v3406, unexplained, gate red
    //   341 -> v3410: plus hall.js, waveguide.js, buckling.js from this session's rounds
    //   342 -> arrived at v3425 with one module added upstream, unexplained here but ACCOUNTED: the pin was
    //          still reading 341, so it was one round from going stale again.
    //   345 -> v3426: plus beerLambert.js, oscillation.js, halo.js. Counted by diffing the population
    //          against the shipped tree rather than by raising the number until it passed.
    //   418 -> pinned at some round between v3426 and v3904, history not recorded here
    //   464 -> v3927. RED SINCE BEFORE v3904 AND NOBODY SAW IT, because this gate had never been timed and so
    //          nothing in the ritual ran it (v3924 found nineteen in that state). Counted the way this comment
    //          demands rather than raised until it passed: populationCensus.compare() reports GREW, 46 added,
    //          0 REMOVED, reconciles:true, every one named -- physics +2, em +9, md +2, mechanics +2, mesh +8,
    //          sph +1, statmech +1, thermal +7, fluid +1, mpm +13. A population that only grew, in areas that
    //          are obviously live work, is the case this pin is designed to WAVE THROUGH ONCE COUNTED; a
    //          removal or a failure to reconcile would have been the other kind and is what the check is for.
    //   471 -> v4000. Counted the same way, and the answer is the small clean one: populationCensus.compare()
    //          reports GREW, 7 ADDED, 0 REMOVED, reconciles:true. Every one named, and every one a module a
    //          recent round built -- physics/control/cartPole.mjs (v3995, LQR), physics/ecology/
    //          lotkaVolterra.mjs (v3994, predator-prey), physics/nuclear/{kinetics,reactorControl,xenon}.mjs,
    //          physics/quantum/bell.mjs, physics/stellar/laneEmden.mjs. A population that ONLY GREW, in areas
    //          that are obviously live work, is what this pin exists to wave through once somebody has looked.
    //          THE RECORD IS NOT EDITED UNTIL IT PASSES: population-census.json was RE-RECORDED with
    //          writeCensus() after compare() had been read, and the diff is reproducible by anyone who doubts
    //          this line. The number lives in data rather than in source precisely so that updating it is an
    //          act somebody has to perform on purpose.
    ok("!! the default population is ACCOUNTED FOR -- it may grow, but not silently",
        p.roots.join(",") === "physics,simulation,fluid" && p.total === EXPECTED_POPULATION,
        "expected " + EXPECTED_POPULATION + " (from the recorded census) and found " + p.total + ". A tool that silently changed what it counts would make every " +
        "earlier figure incomparable -- so when this fires, count what was added and update the pin WITH THE " +
        "REASON, rather than raising the number until it passes");

    ok("!! *** every module in the ray-march arc is gated, and TWO OF THEM HAVE NO SIBLING SELFCHECK ***",
        RAYMARCH_ARC.every((m) => !r.ungated.includes(m)),
        "rasterProbe is graded by compositeDepth-selfcheck and voxelVolumeStream by rleRegionVolume-selfcheck, " +
        "neither of which carries its name. I SEARCHED BY FILENAME AND REPORTED BOTH UNGATED -- the exact error " +
        "this file's subject documents at v3318: a sibling file is not the criterion, the import graph is");

    ok("...and the render population is a DENOMINATOR, not a verdict",
        r.ungated.length > 0 && r.total > r.gated,
        r.ungated.length + " unreached. Renderers, loaders and glue are legitimately ungatable from a module " +
        "graph, exactly as the physics figure says of solvers. What it buys is knowing the size of the " +
        "unexamined population, which for render/ nobody could state before");
}

console.log(fails ? ("[gateReach-selfcheck] FAILED " + fails) : "[gateReach-selfcheck] all passed");
process.exit(fails ? 1 : 0);
