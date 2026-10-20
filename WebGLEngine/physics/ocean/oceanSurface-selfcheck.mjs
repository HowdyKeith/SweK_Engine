// physics/ocean/oceanSurface-selfcheck.mjs -- grades the CPU sea the physics stands on (slice 1 of ocean-optin-surface).
//
// WHAT THIS GRADES. That oceanSurface.mjs is the surface it says it is: a trochoidal (Gerstner) sea that is a pure function of
// (x, z, t, seed), whose height at a WORLD point is the height of the particle that sits there, whose normal is the real normal of that
// surface, and which refuses a spectrum that would fold over itself. Every number below is a closed form or a re-derivation, none is a
// recorded reading, so there is no frozen record to go stale.
//
// WHAT IT DOES NOT GRADE, said plainly: that the sea looks like anything. The module is not a fitted sea state; the cheap default water
// (slice 2) and the opt-in GPU sea (slice 4) are other rounds. And "bit-identical on every machine" is NOT proven here -- one engine,
// one machine. What is proven is that nothing in the module reads a clock, a random source or a global, so a second machine has no
// way to differ except through the engine's own Math.sin/cos.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as S from "./oceanSurface.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// a small fixed list of probe points, spread over a few hundred metres and an hour, from the seeded generator the module itself exports
const probe = (n, seed = 99) => { const r = S.rng(seed); return Array.from({ length: n }, () => [(r() - 0.5) * 400, (r() - 0.5) * 400, r() * 3600]); };
const PTS = probe(300);

console.log("\n1. A SINGLE WAVE WITHOUT STEEPNESS IS A SINE, AND TRAVELS AT THE DEEP-WATER SPEED");
{
    const c = S.component({ wavelength: 20, heading: 0.7, slope: 0.15, phase: 1.1, q: 0 });
    const sea = S.createSurface({ components: [c] });
    let worst = 0;
    for (const [x, z, t] of PTS) worst = Math.max(worst, Math.abs(sea.height(x, z, t) - c.A * Math.sin(c.k * (c.dx * x + c.dz * z) - c.omega * t + c.phase)));
    ok("with Q = 0 the height is exactly A sin(k D.x - omega t + phi) at 300 points over an hour", worst < 1e-12, `worst ${worst.toExponential(2)} m`);
    ok("omega^2 = g k for every component of the default sea (deep-water dispersion), not a typed frequency",
        S.defaultSurface(1).components.every((q) => Math.abs(q.omega * q.omega - S.G * q.k) < 1e-12), `g = ${S.G}`);
    // a crest at (x, t) is at x + c dt at t + dt, along the wave's own heading
    const dt = 2.5, sp = sea.phaseSpeed(0);
    let drift = 0;
    for (const [x, z, t] of PTS.slice(0, 100)) drift = Math.max(drift, Math.abs(sea.height(x + c.dx * sp * dt, z + c.dz * sp * dt, t + dt) - sea.height(x, z, t)));
    ok("a point moved along the heading at omega/k keeps its height, so the wave travels at the dispersion speed", drift < 1e-11, `worst ${drift.toExponential(2)} m over ${dt} s`);
    const T = 2 * Math.PI / c.omega;
    let per = 0;
    for (const [x, z, t] of PTS.slice(0, 100)) per = Math.max(per, Math.abs(sea.height(x, z, t + T) - sea.height(x, z, t)));
    ok("one period later the same point reads the same height", per < 1e-10, `T = ${T.toFixed(4)} s, worst ${per.toExponential(2)} m`);
    ok("CONTROL: a quarter period later it does NOT, so the rows above can tell a moving sea from a still one",
        Math.abs(sea.height(3, 4, 10 + T / 4) - sea.height(3, 4, 10)) > 0.01);
}

console.log("\n2. THE HEIGHT AT A WORLD POINT IS THE HEIGHT OF THE PARTICLE THAT SITS THERE");
{
    const sea = S.defaultSurface(1);
    let worst = 0, moved = 0;
    const r = S.rng(7);
    for (let i = 0; i < 400; i++) {
        const X1 = (r() - 0.5) * 300, X2 = (r() - 0.5) * 300, t = r() * 600;
        const [px, py, pz] = sea.particle(X1, X2, t);
        worst = Math.max(worst, Math.abs(sea.sample(px, pz, t).h - py));
        moved = Math.max(moved, Math.hypot(px - X1, pz - X2));
    }
    ok("sampling at a particle's world position returns that particle's height, over 400 particles", worst < 1e-9, `worst ${worst.toExponential(2)} m`);
    ok("...and the particles really are displaced horizontally, so this is not the Q = 0 sine checked twice", moved > 0.2, `largest horizontal displacement ${moved.toFixed(3)} m`);
    let maxIt = 0, maxRes = 0;
    for (const [x, z, t] of PTS) { const s = sea.sample(x, z, t); maxIt = Math.max(maxIt, s.iterations); maxRes = Math.max(maxRes, s.residual); }
    ok("the inversion converges to the tolerance well inside its iteration cap at every probe point",
        maxRes <= S.TOLERANCE && maxIt < S.MAX_ITERATIONS, `worst residual ${maxRes.toExponential(2)} m, most iterations ${maxIt} of ${S.MAX_ITERATIONS}`);
}

console.log("\n3. THE NORMAL IS THE SURFACE'S OWN, AND IS A UNIT VECTOR");
{
    const sea = S.defaultSurface(3);
    let unit = 0, fd = 0, up = Infinity;
    const e = 1e-5;
    for (const [x, z, t] of PTS.slice(0, 150)) {
        const s = sea.sample(x, z, t);
        unit = Math.max(unit, Math.abs(Math.hypot(s.nx, s.ny, s.nz) - 1));
        up = Math.min(up, s.ny);
        const hx = (sea.height(x + e, z, t) - sea.height(x - e, z, t)) / (2 * e), hz = (sea.height(x, z + e, t) - sea.height(x, z - e, t)) / (2 * e);
        const l = Math.hypot(hx, 1, hz);
        fd = Math.max(fd, Math.hypot(-hx / l - s.nx, 1 / l - s.ny, -hz / l - s.nz));
    }
    ok("the normal has unit length", unit < 1e-12, `worst ${unit.toExponential(2)}`);
    ok("the normal matches the gradient of the HEIGHT FIELD by central differences (a second route to the same vector)", fd < 1e-6, `worst ${fd.toExponential(2)}`);
    ok("it points up everywhere a sea of this steepness can be probed", up > 0.5, `smallest ny ${up.toFixed(3)}`);
}

console.log("\n4. WHAT A TROCHOID DOES THAT A SINE DOES NOT, AND THE BOUNDS");
{
    const mk = (q) => S.createSurface({ components: [S.component({ wavelength: 30, heading: 0, slope: 0.6, q })] });
    const curv = (sea, x, h = 0.02) => (sea.height(x + h, 0, 0) - 2 * sea.height(x, 0, 0) + sea.height(x - h, 0, 0)) / (h * h);
    // find the crest and the trough along x at t = 0 by scanning
    const scan = (sea) => { let hi = [-Infinity, 0], lo = [Infinity, 0]; for (let x = -15; x < 15; x += 0.01) { const v = sea.height(x, 0, 0); if (v > hi[0]) hi = [v, x]; if (v < lo[0]) lo = [v, x]; } return { hi, lo }; };
    const a = scan(mk(1)), b = scan(mk(0));
    const cc = Math.abs(curv(mk(1), a.hi[1])), ct = Math.abs(curv(mk(1), a.lo[1]));
    ok("with Q = 1 the crest is SHARPER than the trough (|curvature| at the crest exceeds the trough's)", cc > ct * 1.5, `crest ${cc.toFixed(4)} /m, trough ${ct.toFixed(4)} /m`);
    ok("CONTROL: with Q = 0 the same wave is symmetric, so the sharpening is the model and not the probe", Math.abs(Math.abs(curv(mk(0), b.hi[1])) - Math.abs(curv(mk(0), b.lo[1]))) < 1e-3 * cc);
    ok("the crest still reaches the amplitude A and the trough -A: steepness moves the particles, not the heights",
        Math.abs(a.hi[0] - mk(1).components[0].A) < 1e-3 && Math.abs(a.lo[0] + mk(1).components[0].A) < 1e-3, `A = ${mk(1).components[0].A.toFixed(4)}, crest ${a.hi[0].toFixed(4)}, trough ${a.lo[0].toFixed(4)}`);
    const sea = S.defaultSurface(5);
    let worst = 0;
    for (const [x, z, t] of PTS) worst = Math.max(worst, Math.abs(sea.height(x, z, t)));
    ok("no height exceeds the sum of the amplitudes", worst <= sea.maxHeight + 1e-9, `largest ${worst.toFixed(4)} m of ${sea.maxHeight.toFixed(4)} m`);
    const raised = S.createSurface({ components: sea.components, level: 3 });
    ok("a level offset moves the whole surface by exactly that offset", Math.abs(raised.height(12, -9, 40) - sea.height(12, -9, 40) - 3) < 1e-12);
    const h = sea.height(5, 5, 5);
    ok("submergence is positive under the surface, negative above it, and the surface itself reads zero",
        Math.abs(sea.submergence(5, h - 1, 5, 5) - 1) < 1e-12 && Math.abs(sea.submergence(5, h + 1, 5, 5) + 1) < 1e-12 && Math.abs(sea.submergence(5, h, 5, 5)) < 1e-12);
}

console.log("\n5. A SEED NAMES A SEA, AND A SPECTRUM THAT FOLDS IS REFUSED");
{
    const a = S.defaultSurface(11), b = S.defaultSurface(11), c = S.defaultSurface(12);
    let same = true, differs = false;
    for (const [x, z, t] of PTS.slice(0, 100)) {
        if (!Object.is(a.height(x, z, t), b.height(x, z, t))) same = false;
        if (Math.abs(a.height(x, z, t) - c.height(x, z, t)) > 1e-3) differs = true;
    }
    ok("the same seed gives bit-identical heights from two separately built surfaces", same);
    ok("CONTROL: a different seed gives a different sea", differs);
    const wide = (slope) => () => S.createSurface({ components: S.defaultComponents(1, { totalSlope: slope }) });
    let refused = null;
    try { wide(1.2)(); } catch (e) { refused = e; }
    ok("a steepness sum above the limit is refused with a RangeError, not built and left to produce loops", refused instanceof RangeError && /fold/.test(refused.message), refused ? refused.message.slice(0, 80) : "built");
    ok("CONTROL: just under the limit is accepted, so the refusal is the threshold and not a blanket no", wide(S.MAX_STEEPNESS - 0.02)().steepness < S.MAX_STEEPNESS);
    // a golden: not a recorded record, a re-derivable value, held loosely because the engine's own sin/cos is the only thing that could move it
    const g = S.defaultSurface(1).sample(0, 0, 0).h;
    ok("the seed-1 sea at the origin at t = 0 is the value the module's own report prints", Math.abs(g - (-0.065143)) < 5e-7, `${g.toFixed(6)} m`);
}

console.log("\n6. THE MODULE READS NOTHING IT SHOULD NOT");
{
    const src = fs.readFileSync(path.join(HERE, "oceanSurface.mjs"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const bad = ["Date.now", "performance.now", "Math.random", "new Date", "process.", "window", "document", "navigator", "require("].filter((t) => src.includes(t));
    ok("no clock, random source, global or environment is read: the output can depend on (x, z, t, seed) only", bad.length === 0, bad.length ? "found: " + bad.join(", ") : "scanned the code with comments stripped");
    ok("its report prints the same closed forms this gate derived", S.reportLines().some((l) => /A = 0\.500000/.test(l)) && S.reportLines().some((l) => /-0\.500000/.test(l)));
}

say("UNCHECKED, said plainly: that these heights look like a sea; bit-equality across machines or engines (one box, one engine here); that anything in the engine reads this yet (slice 2 and later).");
console.log("oceanSurface-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
