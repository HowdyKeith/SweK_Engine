// WebGLEngine/tools/roundhouse/galaxyDevice-selfcheck.mjs -- v3382
// *** THE MAP'S OWN GATE GRADES A SEARCH WITH A SEARCH. THIS GRADES IT WITH LINEAR ALGEBRA, IN EXACT INTEGERS. ***
import * as G from "./galaxyBind.mjs";
import { makeGalaxy, buildAdj, bfsDistances, components } from "../../physics/galaxy/cosmicMap.js";
import { codeHas } from "../ship/sourceScan.mjs";
import fs from "node:fs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// ---- 1. TRACE IDENTITIES: EXACT INTEGERS, NO TOLERANCE ANYWHERE -------------------------------------------
const t = G.build({ mode: "traces" });
say("tr(A) = " + t.trA + ", tr(A^2) = " + t.trA2 + " against " + t.linkCount + " directed links, tr(A^3) = " +
    t.trA3 + " against 6 x " + t.triangles + " triangles = " + (6 * t.triangles));
ok("!! *** tr(A^k) counts closed walks of length k, and all three land EXACTLY ***",
    t.trA === 0 && t.trA2 === t.linkCount && t.triangleErr === 0,
    "no system links to itself (tr A = 0); every two-step closed walk is a link and its reverse; every " +
    "three-step one is a triangle traversed from three starts in two directions. THE TRIANGLES ARE COUNTED BY " +
    "A TRIPLE LOOP THAT FORMS NO MATRIX, so tr(A^3)/6 has something independent to be checked against");
ok("...and the module never builds an adjacency matrix at all",
    !codeHas(fs.readFileSync(new URL("../../physics/galaxy/cosmicMap.js", import.meta.url), "utf8"), /Float64Array|Array\(\s*n\s*\*\s*n\s*\)/),
    "cosmicMap.js works in adjacency LISTS and Sets. The matrix is this device's route, not the module's. " +
    "Matched through codeOnly() so a COMMENT mentioning a matrix cannot fail a check about what the code builds");

// ---- 2. THE SPECTRUM AGREES WITH THE TRAVERSAL, AND THEY SHARE NO CODE ------------------------------------
const s = G.build({ mode: "spectrum" });
say("Laplacian zero-multiplicity " + s.zeroMultiplicity + " vs components() " + s.componentCount +
    "; Fiedler value " + s.fiedler.toExponential(6));
ok("!! *** the number of pieces equals the multiplicity of the zero Laplacian eigenvalue ***",
    s.spectralAgrees && s.zeroMultiplicity === 1,
    "a theorem of spectral graph theory, reached through a Householder tridiagonalisation and a QL sweep -- " +
    "which know nothing about queues, frontiers or visited flags. The module's own gate answers the same " +
    "question by breadth-first traversal");
ok("...and the algebraic connectivity is strictly positive, which is the same claim as a number",
    s.fiedler > 1e-6 && s.connected === true, "lambda2 = " + s.fiedler.toExponential(6) +
    " -- a connected map has a positive Fiedler value and a split one has zero, so this is a MEASUREMENT " +
    "where the component count is a verdict");
ok("the eigensolver is IMPORTED, not re-derived -- one symmetric eigensolver in this tree, not two",
    codeHas(fs.readFileSync(new URL("./galaxyBind.mjs", import.meta.url), "utf8"), /symEigenvalues/) &&
    /physics\/quantum\/rmt\.js/.test(fs.readFileSync(new URL("./galaxyBind.mjs", import.meta.url), "utf8")),
    "the beam device (v3380) established this; a second implementation is a second declaration");

// ---- 3. WALK POWERS REPRODUCE EVERY BREADTH-FIRST DISTANCE ------------------------------------------------
const w = G.build({ mode: "walks" });
say("all " + w.pairs + " ordered pairs: " + w.mismatches + " mismatches, diameter " + w.eccentricity + " hops");
ok("!! *** the fewest jumps from i to j is the smallest L with (A^L)_ij > 0, on EVERY pair ***",
    w.mismatches === 0 && w.pairs === 3600 && w.agreementFrac === 1,
    "an INTEGER answer per pair, so there is nothing to be within. Matrix powers count walks; breadth-first " +
    "search grows a frontier. They agree 3600 times");
ok("...and the map is deep enough for the claim to mean something",
    w.eccentricity >= 6, "diameter " + w.eccentricity +
    " -- on a graph of diameter 2 the walk-power test would pass on almost any wiring");

// ---- 4. MAROONING A SYSTEM MOVES BOTH ROUTES TOGETHER -----------------------------------------------------
const i = G.build({ mode: "island" });
say("marooned: multiplicity " + i.multiplicityBefore + " -> " + i.multiplicityAfter + ", Fiedler " +
    i.fiedlerBefore.toExponential(4) + " -> " + i.fiedlerAfter.toExponential(4) +
    ", components() " + i.bfsBefore + " -> " + i.bfsAfter);
ok("!! *** cutting a system off drives the Fiedler value to EXACTLY zero and both counts to 2 ***",
    i.bothNoticed && i.fiedlerAfter === 0 && i.multiplicityAfter === 2 && i.bfsAfter === 2,
    "not a small number -- zero, because a disconnected Laplacian has a second null vector by construction. " +
    "TWO ENTIRELY DIFFERENT MATHEMATICS MOVING IN LOCKSTEP is the evidence; either alone is one opinion");

// ---- 5. THE LOAD-BEARING NEGATIVE: tr(A^2) COUNTS ONLY LINKS THAT COME BACK -------------------------------
const o = G.build({ mode: "oneway" });
say("two-way map: " + o.linksClean + " links, gap " + o.gapClean + "; one direction removed: " +
    o.linksBroken + " links, gap " + o.gapBroken);
ok("!! *** the gap between the link count and tr(A^2) IS the number of one-way links, exactly ***",
    o.gapClean === 0 && o.gapBroken === 1 && o.traceMatchesSet,
    "a closed walk of length two must leave AND return, so a one-way link contributes nothing to tr(A^2) " +
    "while still counting as a link. NOTHING HERE ASKS WHETHER A REVERSE EDGE EXISTS -- the module's gate " +
    "answers the same question by looking it up in a Set, and the two answers match at " +
    o.setCountClean + " and " + o.setCountBroken);
ok("...and no threshold was tuned to make that happen",
    Number.isInteger(o.gapBroken) && Number.isInteger(o.gapClean),
    "both quantities are integer counts. A tolerance would have nothing to do here");

// ---- 6. THE DEVICE DOES NOT RESTATE THE MODULE'S OWN GATE -------------------------------------------------
{
    const n = 60, Gg = makeGalaxy(42, n, 3), adj = buildAdj(n, Gg.links);
    const bfsSaysConnected = components(n, adj).count === 1;
    const bfsDepth = Math.max(...bfsDistances(adj, 0).filter(Number.isFinite));
    ok("the module's own answers are reproduced, which is the point of an INDEPENDENT route",
        bfsSaysConnected === s.connected && bfsDepth > 0,
        "agreement is the result. THE DEVICE EARNS ITS PLACE BY REACHING IT DIFFERENTLY, not by disagreeing -- " +
        "v3201's trap is an import that moves the coverage count and grades nothing, and the test of that is " +
        "whether the second route could have failed. Sections 4 and 5 show it failing on cue");
}

// ---- 7. EVERY DECLARED MODE PRODUCES A DISTINCT ANSWER AND AN UNDECLARED ONE IS REFUSED -------------------
{
    const keys = G.MODES.map((m) => Object.keys(G.build({ mode: m })).sort().join(","));
    ok("all five modes return different observable sets -- a branch that changed nothing would be a mode in name only",
        new Set(keys).size === G.MODES.length, G.MODES.join(" / "));
    let refused = false;
    try { G.build({ mode: "no-such-mode-will-ever-be-declared" }); } catch { refused = true; }
    ok("an undeclared mode is REFUSED rather than silently defaulted", refused && G.defaults({ mode: "nope" }) === null);
    const declared = new Set(G.GALAXY_OBSERVABLES);
    const emitted = new Set(G.MODES.flatMap((m) => Object.keys(G.build({ mode: m }))));
    ok("!! every key any mode returns is in the declared observable list",
        [...emitted].every((k) => declared.has(k) || k === "rows"),
        "so the registry cannot advertise one thing and measure another: " + emitted.size + " emitted, " +
        declared.size + " declared");
}

console.log(failed ? "\n[galaxyDevice-selfcheck] FAILED " + failed : "\n[galaxyDevice-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
