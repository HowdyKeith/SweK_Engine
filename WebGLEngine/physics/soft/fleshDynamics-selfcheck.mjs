// WebGLEngine/physics/soft/fleshDynamics-selfcheck.mjs — v2526
//
// Run: node physics/soft/fleshDynamics-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A spring integrated at 60Hz is exactly the kind of thing that looks fine in a demo and detonates on a hard hit.
// These assert the four ways it fails, and the one property everything else here depends on.
import { FleshDynamics } from "./fleshDynamics.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const bone = (x) => [{ a: [x, 0, 0], b: [x + 1, 0, 0], r: 0.1 }];

// ---- 1. the flesh starts ON the bone ------------------------------------------------------------------------
// Frame 1 is where this detonates if the offsets start anywhere but zero.
{
    const d = new FleshDynamics(1);
    const out = d.step(bone(0));
    ok("first tick returns the bones untouched", out[0].a[0] === 0 && out[0].b[0] === 1);
    ok("and no lag exists yet", d.peakLag() === 0);
}

// ---- 2. it LAGS, then SETTLES -------------------------------------------------------------------------------
// The whole point: move the bone and the flesh must fall behind, then catch up. If it never lags there is no
// jiggle and we are paying for nothing; if it never settles the figure never stops wobbling.
{
    const d = new FleshDynamics(1);
    d.step(bone(0));
    d.step(bone(0.5));                       // a sudden move
    const lagged = d.peakLag();
    ok("moving the bone makes the flesh fall behind", lagged > 0.01, "peak lag " + lagged.toFixed(4) + "m");
    for (let i = 0; i < 400; i++) d.step(bone(0.5));   // hold still
    const settled = d.peakLag();
    ok("holding still, the flesh settles back onto the bone", settled < 1e-3, "after 400 ticks: " + settled.toExponential(2) + "m");
}

// ---- 3. IT MUST NOT EXPLODE ---------------------------------------------------------------------------------
// The real risk. Explicit Euler at this stiffness diverges; semi-implicit does not. A NaN here is a figure that
// vanishes, and a large finite number is a figure turned inside out — which looks like a LIGHTING bug, not a
// physics one, and would cost hours.
{
    const d = new FleshDynamics(1, { stiffness: 600, damping: 0.15 });
    d.step(bone(0));
    for (let i = 0; i < 600; i++) d.step(bone(Math.sin(i * 0.7) * 3));   // shake it hard, every tick
    const p = d.peakLag();
    ok("a hard shake stays finite (no NaN, no divergence)", Number.isFinite(p), "peak lag " + p.toFixed(4) + "m");
    ok("and stays inside maxLag", p <= 0.09 + 1e-9, p.toFixed(4) + " <= 0.09");
}

// ---- 4. the clamp does not store energy ---------------------------------------------------------------------
// Clamping the offset without killing the velocity that pushed past it leaves flesh pinned at the limit with an
// ever-growing velocity, waiting to snap the instant the bone stops. Drive it into the wall and let go.
{
    const d = new FleshDynamics(1, { maxLag: 0.05 });
    d.step(bone(0));
    for (let i = 0; i < 60; i++) d.step(bone(i * 0.5));   // accelerate away, hard, for a second
    const pinned = d.peakLag();
    let x = 30;
    let worst = 0;
    for (let i = 0; i < 200; i++) { const o = d.step(bone(x)); worst = Math.max(worst, Math.abs(o[0].a[0] - x)); }
    ok("released from the clamp, it does not snap past where it was pinned",
       worst <= pinned + 1e-6, "pinned at " + pinned.toFixed(4) + ", worst after release " + worst.toFixed(4));
    ok("and it comes to rest", d.peakLag() < 1e-3, d.peakLag().toExponential(2) + "m");
}

// ---- 5. DETERMINISM -----------------------------------------------------------------------------------------
// The reason this layer exists at all rather than living inside boneField. State is fine; state driven by the
// WALL CLOCK is not. Same tick sequence -> same state, bit for bit.
{
    const seq = Array.from({ length: 150 }, (_, i) => Math.sin(i * 0.31) * 2);
    const run = () => {
        const d = new FleshDynamics(1);
        const out = [];
        for (const x of seq) out.push(d.step(bone(x))[0].a[0]);
        return out;
    };
    const r1 = run(), r2 = run();
    ok("same tick sequence -> bit-identical output", JSON.stringify(r1) === JSON.stringify(r2), seq.length + " ticks");

    // and reset() must actually return it to the start, or a page's Reset button is decoration
    const d = new FleshDynamics(1);
    for (const x of seq) d.step(bone(x));
    d.reset();
    const after = [];
    for (const x of seq) after.push(d.step(bone(x))[0].a[0]);
    ok("reset() truly rewinds (the page's Reset is not decoration)", JSON.stringify(after) === JSON.stringify(r1));
}

// ---- 6. a changed bone count must not pair bone 4's history with bone 7's body -------------------------------
{
    const d = new FleshDynamics(1);
    d.step(bone(0)); d.step(bone(1));
    const two = d.step([{ a: [0,0,0], b: [1,0,0], r: 0.1 }, { a: [2,0,0], b: [3,0,0], r: 0.1 }]);
    ok("a changed bone count starts clean instead of mixing histories", two.length === 2 && two.every(b => b.a.every(Number.isFinite)));
}

console.log(fails ? "\nfleshDynamics-selfcheck: " + fails + " FAILED" : "\nfleshDynamics-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
