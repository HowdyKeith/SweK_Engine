// WebGLEngine/physics/xpbd/solverParity-selfcheck.mjs -- v3606
//
// Run: node physics/xpbd/solverParity-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/xpbd/solverParity.mjs, and the clothStep edit it exists to justify.
//
// THE CHECK THIS FILE EXISTS FOR is section 3: "the two solvers agree across the knob matrix" is an EQUALITY,
// and an equality that has never been shown failing is indistinguishable from a comparison that stopped
// running. THE PLANT IS A PARAMETER (v3603's idiom) -- strip the two keys from the monolith's options and the
// v3603-to-v3605 state is reproduced LIVE, diverging on five of six rows, with no source edited.
//
// AND SECTION 1 IS THE ROUND: a gate can drive a whole PASS without ever exercising it. The claim is not
// argued from the radius; the contacts are COUNTED.
import { clothSubstep } from "./clothStep.js";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints } from "./xpbd.js";
import { SPACING, coherenceCeiling, closestApproach, hang } from "./clothSoak.mjs";
import {
    gateScene, contactCensus, parity, parityMatrix, KNOB_MATRIX, V3605_DEFAULT_PATH, MEASURED_V3606, reportLines,
} from "./solverParity.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hashOf = (a) => crypto.createHash("sha256").update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest("hex").slice(0, 16);

// ---- 1. THE EQUIVALENCE GATE'S COLLISION COMPARISON IS VACUOUS, COUNTED RATHER THAN ARGUED --------------------------
{
    const census = contactCensus();
    const at008 = census.find((c) => c.radius === 0.08);
    ok("!! clothLoop-selfcheck DRIVES radius 0.08 AND THAT RADIUS FINDS ZERO CONTACTS",
       at008.total === 0 && at008.framesWith === 0,
       at008.framesWith + "/" + at008.frames + " frames, " + at008.total + " pairs -- the branch is entered and the pair list is empty");
    const gateSrc = fs.readFileSync(path.join(HERE, "clothLoop-selfcheck.mjs"), "utf8");
    ok("...and that IS the radius it drives, read from the gate rather than remembered",
       /radius:\s*0\.08/.test(gateSrc), "so this is a fact about the shipped gate, not about a fixture I built");
    ok("POSITIVE CONTROL: the census is not a dead counter -- a larger radius finds plenty",
       census.some((c) => c.total > 100), census.map((c) => c.radius + ":" + c.total).join("  "));
    const floor = closestApproach(hang(), 400).floor;
    ok("!! ...and the activation floor is DERIVED here, not quoted from v3604", floor > 0.3 && 0.08 < floor,
       "closest non-adjacent approach / 2 = " + floor.toFixed(6) + ", four times the radius that gate uses");
    ok("...so the two facts that make this a defect sat one file apart", MEASURED_V3606.gateRadiusIsVacuous.source === "v3604",
       "v3479 chose 0.08 before anything measured the floor; v3604 measured the floor while asking a different question");
}

// ---- 2. THE DEFAULT PATH DID NOT MOVE, AND THE PROOF IS NOT A SOURCE READ ---------------------------------------------
//
// A check reading `?? 1` out of the source would pass on a knob exposed and then quietly re-defaulted. The hash
// was captured from the PRISTINE v3605 EXTRACT BEFORE the edit.
{
    const sc = gateScene();
    const st = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel), invMass: sc.init.invMass };
    for (let f = 0; f < 40; f++) clothSubstep(st, sc.cons, sc.colors, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: 0.08, adj: sc.adj });
    ok("!! clothSubstep's DEFAULT path is bit-identical to pristine v3605", hashOf(st.pos) === V3605_DEFAULT_PATH.pos,
       "pos " + hashOf(st.pos) + " -- captured BEFORE the edit, over 40 frames");
    ok("...velocities too", hashOf(st.vel) === V3605_DEFAULT_PATH.vel, "vel " + hashOf(st.vel));
    const explicit = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel), invMass: sc.init.invMass };
    for (let f = 0; f < 40; f++) clothSubstep(explicit, sc.cons, sc.colors,
        { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: 0.08, adj: sc.adj, collisionIterations: 1, collisionCompliance: 0 });
    ok("!! passing the defaults EXPLICITLY is bit-identical to passing nothing", hashOf(explicit.pos) === V3605_DEFAULT_PATH.pos,
       "otherwise the ?? fallback and the documented default have become two declarations of one number");
}

// ---- 3. THE CHECK THIS FILE EXISTS FOR: PARITY ACROSS THE KNOB MATRIX, WITH THE PLANT AS A PARAMETER -------------------
{
    const clean = parityMatrix();
    const planted = parityMatrix({ plant: true });
    ok("the parity fixture actually collides -- otherwise this whole section is vacuous too",
       clean.every((r) => r.contacts > 0), "contacts per row: " + clean.map((r) => r.contacts).join(", ") +
       " on v3604's honest drape at r = h/2 = " + coherenceCeiling().toFixed(3));
    ok("!! THE TWO SOLVERS ARE BIT-IDENTICAL AT EVERY KNOB SETTING", clean.every((r) => r.identical),
       clean.length + " of " + clean.length + " rows, maxDiff exactly 0");
    const divergent = planted.filter((r) => !r.identical);
    ok("!! PLANT (the v3603-v3605 state, driven not quoted): strip the knobs from the monolith and they DIVERGE",
       divergent.length === KNOB_MATRIX.length - 1,
       divergent.length + " of " + planted.length + " rows -- every non-default one");
    ok("...and the defaults still agree under the plant, which is WHY nobody noticed for three rounds",
       planted[0].identical, "a comparison that only ever runs at the defaults cannot see a parameter one side gained");
    const worst = Math.max(...divergent.map((r) => r.maxDiff));
    ok("!! ...by an amount that is not round-off: worst divergence against the MESH SPACING",
       worst > SPACING / 100, worst.toExponential(3) + " against a spacing of " + SPACING +
       " = " + (100 * worst / SPACING).toFixed(1) + "% -- a different cloth, not a different last bit");
    ok("...and the plant is a PARAMETER, so the tree is never edited to produce it", planted[0].plant === true,
       "v3603's idiom -- a sabotage that needs a source edit cannot run inside the gate that reports it");
}

// ---- 4. WHAT IS NOT CLAIMED ------------------------------------------------------------------------------------------
//
// ANTIDOTE: if either solver gains a THIRD parameter, section 3 goes red on the plant row and KNOB_MATRIX must
// be extended -- do NOT scope the matrix back to what still agrees, and do NOT delete the plant. And if
// clothLoop-selfcheck's radius is ever raised to an active one, section 1 goes red: rewrite it to assert the
// contact count is NONZERO there, which is the state this round is asking for.
{
    ok("this is a PARITY instrument and says nothing about which solver is right",
       (MEASURED_V3606.notClaimed || "").includes("AGREE, not that either is right"));
    ok("NO DEFAULT MOVED", (MEASURED_V3606.notClaimed || "").includes("NO DEFAULT MOVED"),
       "which setting ships is v3604's soak and Keith's rig");
    const rep = reportLines();
    ok("the report renders and names the vacuity in its own output", rep.length > 15 && rep.join("\n").includes("NO CONTACTS AT ALL"),
       rep.length + " lines");
}

console.log(fails ? "\nsolverParity-selfcheck: " + fails + " FAILED" : "\nsolverParity-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
