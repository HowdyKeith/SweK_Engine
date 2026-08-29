// physics/xpbd/volume-selfcheck.mjs
//
// Run: node physics/xpbd/volume-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The pressure constraint drives a closed mesh's enclosed volume to a target: inflate above rest, deflate below, and
// at rest conserve -- squash it under load and the total volume holds while the shape gives. Two determinism guards
// come with it. The closed mesh is a subdivided octahedron, integer base vertices and square-root-normalised
// midpoints, so there is no sin/cos and the initial positions are the same bits on every machine; a UV sphere would
// have seeded everything with libm trig. And enclosed volume is a sum over triangles in a fixed order, because
// floating-point addition is not associative. The sabotage flips the sign of the position correction, so the
// constraint pushes the wrong way and inflation deflates -- the inflation check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { colorConstraints } from "./xpbd.js";
import { generateIcosphere, buildEdges, enclosedVolume, volumeSubstep, solveVolume } from "./volume.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

function balloon(subdiv = 2) {
    const s = generateIcosphere(subdiv);
    const edges = buildEdges(s.pos, s.tris, 0.0002), batches = colorConstraints(edges);
    const restVol = enclosedVolume(s.pos, s.tris);
    const mk = () => ({ pos: Float64Array.from(s.pos), vel: new Float64Array(s.n * 3), invMass: new Float64Array(s.n).fill(1) });
    return { s, edges, batches, restVol, mk };
}

// ---- 1. INFLATION / DEFLATION: pressure drives the enclosed volume to its target -----------------------------
{
    const B = balloon();
    const inf = B.mk(); for (let k = 0; k < 80; k++) volumeSubstep(inf, B.edges, B.batches, B.s.tris, B.restVol, { dt: 0.016, iterations: 8, inflation: 1.8 });
    const def = B.mk(); for (let k = 0; k < 80; k++) volumeSubstep(def, B.edges, B.batches, B.s.tris, B.restVol, { dt: 0.016, iterations: 8, inflation: 0.5 });
    const vi = enclosedVolume(inf.pos, B.s.tris), vd = enclosedVolume(def.pos, B.s.tris);
    ok("!! pressure inflates the mesh above rest volume and deflates it below", vi > B.restVol * 1.3 && vd < B.restVol * 0.7 && Math.abs(vi - B.restVol * 1.8) < B.restVol * 0.05,
       "at inflation 1.8 the volume reached " + vi.toFixed(3) + " (target " + (B.restVol * 1.8).toFixed(3) + "); at 0.5 it fell to " + vd.toFixed(3) + " -- the single global constraint hit its target.");
}

// ---- 2. CONSERVATION: at rest inflation the volume holds under a squashing load ------------------------------
{
    const B = balloon();
    const s = B.mk();
    for (let k = 0; k < 100; k++) volumeSubstep(s, B.edges, B.batches, B.s.tris, B.restVol, { dt: 0.016, iterations: 8, inflation: 1.0, gravity: [0, -4, 0] });
    const v = enclosedVolume(s.pos, B.s.tris);
    ok("!! at rest inflation the enclosed volume holds under a squashing load", Math.abs(v - B.restVol) < B.restVol * 0.05,
       "under gravity the mesh deforms but its enclosed volume stays at " + v.toFixed(3) + " against a rest of " + B.restVol.toFixed(3) + " -- squash one side and it bulges another, the total conserved.");
}

// ---- 3. DETERMINISTIC: the fixed-order volume sum and substep reproduce byte-for-byte ------------------------
{
    const run = () => { const B = balloon(); const s = B.mk(); for (let k = 0; k < 60; k++) volumeSubstep(s, B.edges, B.batches, B.s.tris, B.restVol, { dt: 0.016, iterations: 6, inflation: 1.5, gravity: [0, -3, 0] }); return hp(s.pos); };
    ok("!! two inflation runs land byte-for-byte identical", run() === run(),
       "the enclosed volume is summed over the triangles in a fixed order and every vertex is moved from one multiplier, so the whole inflation reproduces to the last bit.");
}

// ---- 4. EXACT: the octahedron's enclosed volume matches its closed form ---------------------------------------
{
    const oct = generateIcosphere(0);
    const v = enclosedVolume(oct.pos, oct.tris);
    ok("!! the base octahedron's enclosed volume matches 4/3 exactly", Math.abs(v - 4 / 3) < 1e-12,
       "the unit-axis octahedron encloses exactly 4/3, matched to 1e-12 -- the signed-tetrahedron sum and the outward winding are correct.");
}

// ---- 5. TRIG-FREE: the generator and solver use no sin/cos, so initial positions are bit-identical ----------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "volume.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the closed-mesh generator and volume solver use no transcendental", clean,
       "the sphere is a subdivided octahedron with square-root-normalised midpoints -- no sin/cos anywhere, so a Mac and a PC start from the identical vertices.");
}

// ---- 5b. solveVolume IN ISOLATION: a body already at rest volume is untouched, and one call always shrinks ----
//         the constraint violation -- never grows it, whether inflating or deflating.
{
    const s = generateIcosphere(1);
    const invMass = new Float64Array(s.n).fill(1);
    const restVol = enclosedVolume(s.pos, s.tris);

    // At rest inflation (target == current volume, compliance 0): C is exactly zero, so dLambda is exactly zero
    // and the solve must leave every position byte-identical.
    const atRest = Float64Array.from(s.pos);
    const lamAfter = solveVolume(atRest, invMass, s.tris, restVol, 1.0, 0, 0.016, 0);
    let untouched = true; for (let i = 0; i < atRest.length; i++) if (atRest[i] !== s.pos[i]) untouched = false;
    const atRestVolume = restVol;

    // Inflate: scale the sphere up uniformly first (a real over-volume body), then one solveVolume call toward
    // the SAME restVol must move the enclosed volume STRICTLY closer to target than before -- shrink, not grow,
    // the constraint violation |C|.
    const inflatedPred = Float64Array.from(s.pos.map((v) => v * 1.4));
    const cBefore = enclosedVolume(inflatedPred, s.tris) - restVol;
    solveVolume(inflatedPred, invMass, s.tris, restVol, 1.0, 0, 0.016, 0);
    const cAfterInflate = enclosedVolume(inflatedPred, s.tris) - restVol;

    // Deflate: scale down instead -- an under-volume body -- and confirm the same reduction-of-violation holds
    // in the OTHER direction, so the check is not merely "shrinking always wins by coincidence".
    const deflatedPred = Float64Array.from(s.pos.map((v) => v * 0.7));
    const cBeforeDeflate = enclosedVolume(deflatedPred, s.tris) - restVol;
    solveVolume(deflatedPred, invMass, s.tris, restVol, 1.0, 0, 0.016, 0);
    const cAfterDeflate = enclosedVolume(deflatedPred, s.tris) - restVol;

    ok("!! a body already at rest volume is left byte-identical, and a single call always shrinks |C| toward target, over- or under-volume alike",
       untouched && lamAfter === 0 &&
       Math.abs(cAfterInflate) < Math.abs(cBefore) && Math.abs(cAfterDeflate) < Math.abs(cBeforeDeflate),
       "at rest (V=" + atRestVolume.toFixed(4) + ") the solve changes nothing and returns lambda 0; scaled up 1.4x the violation fell from " +
       cBefore.toFixed(4) + " to " + cAfterInflate.toFixed(4) + ", and scaled down 0.7x it fell from " + cBeforeDeflate.toFixed(4) +
       " to " + cAfterDeflate.toFixed(4) + " -- a single global constraint pulling toward target from either side, in one call.");
}

// ---- 6. STABILITY: strong inflation and deflation stay finite ------------------------------------------------
{
    const B = balloon();
    const a = B.mk(); for (let k = 0; k < 150; k++) volumeSubstep(a, B.edges, B.batches, B.s.tris, B.restVol, { dt: 0.02, iterations: 8, inflation: 3.0 });
    let finite = true; for (let i = 0; i < a.pos.length; i++) if (!Number.isFinite(a.pos[i]) || Math.abs(a.pos[i]) > 1e4) finite = false;
    ok("!! strong inflation over many steps stays finite", finite,
       "inflated to three times its rest volume over 150 steps the mesh stays bounded -- the pressure solve does not blow up.");
}

console.log(fails ? "\nvolume-selfcheck: " + fails + " FAILED" : "\nvolume-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
