// tools/ship/rigidSuite.mjs -- the rigid-body physics has to agree with mathematics too.
//
// The fluids have been checked against exact analytic answers on every ship since v2455. The rigid-body physics --
// which is what the ES flight substrate, the ram/wreckage combat and cross-peer lockstep all actually run on -- has
// never been checked against anything except "it did not explode and nothing fell through the floor". That is a
// filter, not a measurement. It is exactly where the fluids were before the physics gate existed.
//
// WHAT THIS FOUND. Every dynamic body in this engine carries 0.05-per-second linear damping, straight out of Jolt's
// defaults, and nothing in the codebase had ever written that down. Three tests "failed" before that surfaced -- a
// free fall 1.25% short of Galileo, 11.75% of momentum vanishing through a collision, a box apparently sinking into
// the floor -- and all three were the test being wrong, not the engine. The box was an indexing bug of mine
// (readTransforms is SEVEN floats per body, not three). The other two were me comparing a damped world to a vacuum.
//
// The discipline that got there is worth stating, because "assume it is my test" would have been the wrong lesson:
// each explanation was TESTED. Damping was suspected, so a lone body was coasted with nothing to hit -- it decayed,
// so the drag was real. The free-fall error was suspected of being integrator error, so dt was halved four times --
// and the error GREW toward a limit instead of shrinking, which RULED OUT the integrator and pointed straight at a
// continuous physical effect. Then the damping constant was measured (0.05000, exactly the documented default) and
// used to predict the fall, which matched Jolt to 1.5e-5 m. That is what an explanation looks like when it is
// finished: it predicts the number you were confused by.
"use strict";

const G = 9.81;
const DAMP = 0.05;            // Jolt's default linear damping -- measured from a coasting body, not read from a doc
const DT = 1 / 240;

// The exact discrete trajectory of a damped body under gravity, written out here rather than imported from anything.
// v <- (v - g dt)(1 - c dt) ;  z <- z + v dt
function exactDampedDrop(z0, steps, dt = DT, g = G, c = DAMP) {
    let v = 0, z = z0;
    for (let s = 0; s < steps; s++) { v = (v - g * dt) * (1 - c * dt); z = z + v * dt; }
    return z;
}

import { massProperties, looseFragments, carveSphere } from "../../physics/voxel/fracture.js";
import { createLockstepNet } from "../../physics/box3dLockstepNet.js";

const CHECKS = [
    {
        name: "lockstep refuses a pair of different engines",
        exact: "jolt + box3d must halt before stepping; jolt + jolt must not; silence must not halt anything",
        // v2470 measured that mixed-backend lockstep is IMPOSSIBLE, not broken: the two engines differ in the last
        // bit and collisions amplify that ~90,000x in 2.5s, which is a metre. box3dSyncCompare can name that as the
        // cause AFTER a desync -- but naming it afterwards means someone already lost the afternoon. The transport
        // must refuse the pair. Silence is NOT a mismatch: an older peer that never announces must not break a
        // working session, because "unknown" and "different" are not the same claim.
        tol: 0,
        async run() {
            const mkSession = () => { let tick = 0;
                return { get tick() { return tick; }, submitInputs() {}, checkPeerHash() {}, ready() { return true; },
                         tryStep() { return { tick: tick++, hash: "h" }; }, localHash() { return "h"; }, desync() { return null; } }; };
            const mk = (id, backend, bus) => createLockstepNet({ session: mkSession(), selfId: id, backendId: backend,
                inputFn: () => [], send: (m) => bus.push({ from: id, m }) });
            const run = (bA, bB) => {
                const bus = [];
                const a = mk("A", bA, bus), b = mk("B", bB, bus);
                a.pump(); b.pump();
                for (const { from, m } of bus) { if (from !== "A") a.receive(m); if (from !== "B") b.receive(m); }
                return { a, steps: a.pump() };
            };
            const same = run("jolt", "jolt");
            const mixed = run("jolt", "box3d");
            const silent = mk("A", "jolt", []);
            silent.pump(); silent.receive({ t: "lsi", tick: 0, peer: "OLD", inputs: [] });
            const ok = same.a.halted() === null && same.steps > 0
                    && mixed.a.halted() !== null && mixed.steps === 0
                    && silent.halted() === null;
            return { got: ok ? 0 : 1, unit: "",
                     detail: ok ? "same engine steps, mixed pair halts before stepping, silence tolerated"
                                : "same=" + (same.a.halted() ? "HALTED" : same.steps) + " mixed=" + (mixed.a.halted() ? "halted" : "STEPPED " + mixed.steps) + " silent=" + (silent.halted() ? "HALTED" : "ok") };
        },
    },
    {
        name: "voxels earn the exact inertia tensor of the box they form",
        exact: "I = m/12 * diag(b^2+c^2, a^2+c^2, a^2+b^2) -- analytic, for a 1x2x3 solid",
        // The number that decides how every fragment tumbles, and where a voxel engine fudges. EXACT at every
        // resolution, not merely convergent -- but only because each voxel cube's OWN inertia is included alongside
        // the parallel-axis term. Drop it and this reads 3.85% low at cell 0.5, shrinking as cell^2: small, always
        // the same direction, indistinguishable from "needs tuning" forever.
        // Adjudicated once against JOLT's own shape-derived tensor -- two independent computations, neither having
        // seen the other -- agreeing to 3.5e-11%. See the ungated list.
        tol: 1e-9,
        async run() {
            const n = 8, cell = 1 / n, a = 1, b = 2, c = 3;
            const nx = a*n, ny = b*n, nz = c*n;
            const labels = new Int32Array(nx*ny*nz).fill(1);
            const r = massProperties(labels, 1, nx, ny, nz, cell, 1);
            const M = a*b*c;
            const e = [M/12*(b*b+c*c), M/12*(a*a+c*c), M/12*(a*a+b*b)];
            let worst = 0;
            for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(r.I[i]-e[i])/e[i]);
            return { got: worst, unit: "worst relative", detail: r.I[0].toFixed(4) + " vs " + e[0].toFixed(4) };
        },
    },
    {
        name: "the flood fill finds exactly what came loose",
        exact: "a pillar shot through the middle: 2 pieces, 1 anchored, 1 falling, and the faller is the TOP half",
        tol: 0,
        async run() {
            const n = 20;
            const grid = new Uint8Array(n*n*n);
            const at = (x, y, z) => (z*n + y)*n + x;
            for (let y = 0; y < n; y++) for (let z = 8; z < 12; z++) for (let x = 8; x < 12; x++) grid[at(x,y,z)] = 1;
            carveSphere(grid, n, n, n, 10, 10, 10, 3.2);
            const f = looseFragments(grid, n, n, n);
            const loose = f.loose.map((l) => massProperties(f.labels, l, n, n, n, 0.1, 1));
            const ok = f.count === 2 && f.anchored.length === 1 && f.loose.length === 1 && loose[0].com[1] > 1.0;
            return { got: ok ? 0 : 1, unit: "", detail: ok ? "2 pieces, the top half loose, its centre of mass at y=" + loose[0].com[1].toFixed(2) : "WRONG: " + f.count + " pieces, " + f.loose.length + " loose" };
        },
    },
    {
        name: "a dropped body follows the exact damped trajectory",
        exact: "v <- (v - g dt)(1 - c dt), z <- z + v dt, with g = 9.81 and c = 0.05",
        tol: 1e-3,
        async run(mk) {
            const b = await mk();
            const w = b.createWorld({ gravity: [0, -G, 0] });
            w.addBox({ type: "dynamic", pos: [0, 100, 0], half: [0.5, 0.5, 0.5] });
            for (let s = 0; s < 240; s++) w.step(DT, 1);
            const z = w.readTransforms()[1];
            w.destroy();
            const want = exactDampedDrop(100, 240);
            return { got: Math.abs(z - want), unit: "m", detail: z.toFixed(5) + " vs " + want.toFixed(5) };
        },
    },
    {
        name: "the damping default has not silently changed",
        exact: "c = 0.05 per second -- measured from a coasting body, not read from a document",
        tol: 1e-4,
        async run(mk) {
            const b = await mk();
            const w = b.createWorld({ gravity: [0, 0, 0] });
            const i = w.addBox({ type: "dynamic", pos: [0, 0, 0], half: [0.5, 0.5, 0.5] });
            w.setVelocity(i, [4, 0, 0]);
            for (let s = 0; s < 240; s++) w.step(DT, 1);
            const v = w.readVelocities()[0];
            w.destroy();
            const c = (1 - Math.pow(v / 4, 1 / 240)) / DT;
            return { got: Math.abs(c - DAMP), unit: "per second", detail: c.toFixed(5) + " vs " + DAMP };
        },
    },
    {
        name: "a resting box does not sink, drift or jitter",
        exact: "it starts at y = 0.5 on a floor whose top is y = 0, and it stays there",
        tol: 2e-3,
        async run(mk) {
            const b = await mk();
            const w = b.createWorld({ gravity: [0, -G, 0] });
            w.addBox({ type: "static", pos: [0, -1, 0], half: [50, 1, 50] });
            w.addBox({ type: "dynamic", pos: [0, 0.5, 0], half: [0.5, 0.5, 0.5] });
            for (let s = 0; s < 2400; s++) w.step(DT, 1);
            const t = w.readTransforms();          // SEVEN floats per body: the box is body 1, so y is index 8
            w.destroy();
            return { got: Math.abs(t[8] - 0.5), unit: "m over 10 seconds", detail: t[8].toFixed(6) };
        },
    },
    {
        name: "two identical worlds stay bit-identical",
        exact: "determinism -- cross-peer lockstep is built on this and nothing checked it",
        tol: 0,
        async run(mk) {
            const b = await mk();
            const build = () => {
                const w = b.createWorld({ gravity: [0, -G, 0] });
                w.addBox({ type: "static", pos: [0, -1, 0], half: [50, 1, 50] });
                for (let n = 0; n < 6; n++) w.addBox({ type: "dynamic", pos: [n * 0.31 - 1, 3 + n * 1.7, n * 0.17], half: [0.5, 0.5, 0.5] });
                return w;
            };
            const w1 = build(), w2 = build();
            for (let s = 0; s < 600; s++) { w1.step(DT, 1); w2.step(DT, 1); }
            const a = w1.readTransforms(), c = w2.readTransforms();
            let worst = 0;
            for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - c[i]));
            w1.destroy(); w2.destroy();
            return { got: worst, unit: "absolute (must be exactly 0)", detail: worst === 0 ? "bit-identical" : worst.toExponential(2) };
        },
    },
];

// A CORRECTION, recorded because it was nearly shipped as fact: while writing this I claimed vendor/jolt/ held only a
// LICENSE and that the vendored library "never existed". That was false. It exists, it ships inside the zip, and it is
// what the loader actually uses -- which is why this suite passes with node_modules deleted. The claim came from
// reading `ls -la vendor/jolt/ | head -4`, whose first three lines are "total", "." and "..", so exactly one real
// filename was visible and I read a truncated listing as an absence. Confidence from an output that was cut off is
// still confidence from nothing.
//
// RIG-ONLY, and stated rather than hidden: box3d cannot be judged here. It needs a WASM built from source with emsdk
// (physics/box3d/build-box3d-wasm.sh) and reaches for localStorage, so it does not exist in this sandbox. That leaves
// a real gap with a sharp edge: backendParity.mjs proves the two backends expose the same METHODS, and NOTHING has
// ever proved they agree on the same PHYSICS. Cross-peer lockstep runs on either one. If Jolt and box3d disagree
// about damping -- or about anything -- two peers replaying identical inputs would drift apart silently, and the
// lockstep comparator would report a divergence with no cause to point at.
const UNGATED = [
    "our voxel inertia tensor vs JOLT's own shape-derived tensor for the same 1x2x3 box: agree to 3.5e-11% -- two independent computations, neither having seen the other. Needs Jolt's GetMassProperties, and each Mat44 column must be consumed IMMEDIATELY (emscripten reuses the scratch pointer: holding three columns and reading later gives two zeros and one real answer).",
    "box3d vs Jolt physics parity -- box3d needs a WASM built with emsdk and cannot run in the sandbox. backendParity checks their METHODS match; their PHYSICS has never been compared. Cross-peer lockstep runs on either backend.",
];

async function runRigidSuite(mk) {
    const rows = [];
    for (const c of CHECKS) {
        const t0 = Date.now();
        let r = null, err = null;
        try { r = await c.run(mk); } catch (e) { err = e.message; }
        rows.push({ name: c.name, exact: c.exact, tol: c.tol, ms: Date.now() - t0, err,
            got: r ? r.got : NaN, unit: r ? r.unit : "", detail: r ? r.detail : "",
            pass: !err && r.got <= c.tol });
    }
    return { rows, ungated: UNGATED, allPass: rows.every(r => r.pass), ms: rows.reduce((a, r) => a + r.ms, 0) };
}
export { runRigidSuite, CHECKS, UNGATED, exactDampedDrop, DAMP, G };
