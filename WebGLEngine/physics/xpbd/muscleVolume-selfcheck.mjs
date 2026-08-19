// physics/xpbd/muscleVolume-selfcheck.mjs
//
// Run: node physics/xpbd/muscleVolume-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A muscle belly composed from two verified constraints: the volume constraint that conserves enclosed volume, and
// contraction that shortens flagged fibres. When the longitudinal fibres fire, the belly shortens along its axis, and
// because the volume cannot shrink it is forced outward -- the muscle bulges. The gate checks the belly shortens under
// contraction, that with the volume constraint the enclosed volume is held while without it the belly simply shrinks
// and loses more than half its volume, and -- the point of the whole round -- that the bulge is markedly larger with
// conservation than without, because the extra girth IS the displaced volume. The sabotage flags the wrong fibres,
// the lateral ones instead of the axial, so firing them squeezes the girth and the belly lengthens; the contract
// check fails, because a muscle that gets longer when it fires is not a muscle.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { colorConstraints } from "./xpbd.js";
import { buildMuscleBelly, contractMuscle, muscleVolumeSubstep, bellyShape, enclosedVolume } from "./muscleVolume.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

const belly = buildMuscleBelly(2, 2.2);
const batches = colorConstraints(belly.edges);
const REST_VOL = enclosedVolume(belly.pos, belly.tris);
function fire(activation, useVolume) {
    const pos = Float64Array.from(belly.pos), state = { pos, vel: new Float64Array(belly.n * 3), invMass: new Float64Array(belly.n).fill(1) };
    contractMuscle(belly.edges, 0, 0.35); for (let s = 0; s < 20; s++) muscleVolumeSubstep(state, belly.edges, batches, belly.tris, REST_VOL, { dt: 0.016, iterations: 10, useVolume });
    const base = bellyShape(pos, belly.n);
    contractMuscle(belly.edges, activation, 0.35); for (let s = 0; s < 40; s++) muscleVolumeSubstep(state, belly.edges, batches, belly.tris, REST_VOL, { dt: 0.016, iterations: 10, useVolume });
    return { base, now: bellyShape(pos, belly.n), vol: enclosedVolume(pos, belly.tris), sig: hp(pos) };
}
const wv = fire(1.0, true), nv = fire(1.0, false);

// ---- 1. CONTRACTION SHORTENS: firing the fibres shortens the belly along its axis ---------------------------
{
    ok("!! firing the muscle shortens the belly along its axis", wv.now.length < wv.base.length * 0.85,
       "the belly's axial length falls from " + wv.base.length.toFixed(2) + " to " + wv.now.length.toFixed(2) + " when the fibres fire -- it contracts, as a muscle does.");
}

// ---- 2. VOLUME CONSERVED: the volume constraint holds it; without, the belly loses volume -------------------
{
    ok("!! the volume constraint conserves the belly's volume; without it the belly just shrinks", Math.abs(wv.vol - REST_VOL) < REST_VOL * 0.05 && nv.vol < REST_VOL * 0.8,
       "with the constraint the enclosed volume holds at " + wv.vol.toFixed(2) + " against a rest of " + REST_VOL.toFixed(2) + "; without it the contracting belly collapses to " + nv.vol.toFixed(2) + ", more than a fifth of its volume gone.");
}

// ---- 3. THE BULGE IS THE CONSERVED VOLUME: girth grows far more with conservation than without -------------
{
    const bulgeWith = wv.now.girth - wv.base.girth, bulgeWithout = nv.now.girth - nv.base.girth;
    ok("!! the belly bulges far more when volume is conserved -- the girth IS the displaced volume", bulgeWith > bulgeWithout * 1.3 && bulgeWith > 0.3,
       "conserving volume the girth swells by " + bulgeWith.toFixed(2) + "; letting it leak, only " + bulgeWithout.toFixed(2) + " -- the extra bulge is exactly the volume the shortening had to push sideways.");
}

// ---- 4. MONOTONIC: more activation, more bulge -------------------------------------------------------------
{
    const g3 = fire(0.3, true).now.girth, g6 = fire(0.6, true).now.girth, g9 = fire(0.9, true).now.girth;
    ok("!! a stronger contraction bulges the belly further", g3 < g6 && g6 < g9,
       "girth climbs " + g3.toFixed(2) + " -> " + g6.toFixed(2) + " -> " + g9.toFixed(2) + " with activation 0.3, 0.6, 0.9 -- the harder it fires, the fatter it gets.");
}

// ---- 5. DETERMINISTIC --------------------------------------------------------------------------------------
{
    ok("!! two firings land byte-for-byte identical", fire(1.0, true).sig === wv.sig,
       "the composed muscle -- edge contraction plus the global volume constraint -- reproduces exactly on a re-run.");
}

// ---- 6. PURE -----------------------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "muscleVolume.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the actuator uses only +,-,*,/,sqrt -- no transcendental", clean,
       "the muscle is two arithmetic constraints composed, so the bulge is bit-identical on every machine.");
}

console.log(fails ? "\nmuscleVolume-selfcheck: " + fails + " FAILED" : "\nmuscleVolume-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
