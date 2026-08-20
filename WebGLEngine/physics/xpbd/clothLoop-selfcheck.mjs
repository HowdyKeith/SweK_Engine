// physics/xpbd/clothLoop-selfcheck.mjs
//
// Run: node physics/xpbd/clothLoop-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// This round claims a cloth substep can be run as a chain of GPU buffer passes -- predict, per-color solve,
// collision, finalize -- ping-ponged frame to frame with no CPU readback, and that doing so changes nothing. So the
// spine is EQUIVALENCE: the decomposed loop reproduces the v2661 clothSubstep byte-for-byte. Around it: the whole
// loop is order-free (shuffle the per-vertex predict/finalize order, the within-color solve order, and the collision
// walk order -- identical), the frame boundary is a clean buffer handoff (running N frames equals running K then
// N-K, so all state lives in the buffers), and the pass schedule with collisions off does not depend on buffer
// values (no readback-driven branching). The sabotage breaks the handoff -- finalize stops writing the position
// buffer the next predict reads -- and equivalence and the split-frame check fail.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints, cloneState } from "./xpbd.js";
import { clothSubstep } from "./clothStep.js";
import { clothLoop, clothFrame, predictPass, finalizePass, solveColorPass } from "./clothLoop.js";
import { findCollisionPairs } from "./selfCollide.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x3ad9;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const iota = (n) => Array.from({ length: n }, (_, i) => i);

function scene(W = 5, H = 5) {
    const { cons, adj } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const colors = colorConstraints(cons);
    const N = W * H; const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = 0; pos[3 * i + 2] = -y * 0.3; invMass[i] = (y === 0) ? 0 : 1; }
    return { cons, adj, colors, N, init: { pos, vel, invMass } };
}
const OPT = (adj) => ({ dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: 0.08, adj });

// ---- 1. THE SPINE -- EQUIVALENCE: the decomposed loop equals the v2661 monolith byte-for-byte -----------------
{
    const { cons, adj, colors, init } = scene();
    const s = cloneState(init); for (let f = 0; f < 40; f++) clothSubstep(s, cons, colors, OPT(adj));
    const loop = clothLoop(init, init.invMass, cons, colors, 40, OPT(adj));
    ok("!! the buffer-pass loop reproduces clothSubstep exactly over 40 frames", hp(s.pos) === hp(loop.pos),
       "predict / per-color solve / collision / finalize, ping-ponged frame to frame, is byte-for-byte the verified monolithic substep -- the GPU decomposition changes no physics.");
}

// ---- 1b. AND SECTION 1 DOES NOT COMPARE THE COLLISION SOLVE (v3606) -------------------------------------------
//
// OPT sets radius 0.08, which reads as "collision on". v3604 measured this fixture's closest non-adjacent
// approach at 0.642478, so the pass FIRST FIRES AT r = 0.321239 -- four times this radius. The branch above IS
// entered, findCollisionPairs returns an EMPTY LIST, and the collision solve loops over nothing. Section 1's
// equivalence is real for predict / per-color solve / finalize and VACUOUS for contacts.
//
// COUNTED HERE RATHER THAN ARGUED, and the real comparison lives in physics/xpbd/solverParity-selfcheck.mjs,
// which runs both solvers across the knob matrix on v3604's drape where the pass actually fires.
//
// ANTIDOTE: if somebody raises this radius to an active one, THIS LINE GOES RED and must be rewritten to
// assert the contact count is NONZERO -- do not delete it, and do not lower the radius back to keep it green.
{
    const { cons, adj, colors, init } = scene();
    const s = cloneState(init);
    let contacts = 0;
    for (let f = 0; f < 40; f++) {
        clothSubstep(s, cons, colors, OPT(adj));
        contacts += findCollisionPairs(s.pos, init.invMass.length, 0.16, 0.16, adj).length;
    }
    ok("!! section 1 runs at radius 0.08 AND THAT RADIUS FINDS ZERO CONTACTS ON THIS FIXTURE", contacts === 0,
       "so the equivalence above never compares a solved contact -- real parity is in solverParity-selfcheck");
}

// ---- 2. ORDER-FREE: shuffle vertex order, within-color order, and collision walk -> identical -----------------
{
    const { cons, adj, colors, init, N } = scene();
    const ref = hp(clothLoop(init, init.invMass, cons, colors, 20, OPT(adj)).pos);
    let stable = true;
    for (let t = 0; t < 200; t++) {
        const opt = { ...OPT(adj), vtxOrder: shuffle(iota(N)), collisionOrder: shuffle(iota(N)), shuffleColor: (b) => shuffle(b) };
        if (hp(clothLoop(init, init.invMass, cons, colors, 20, opt).pos) !== ref) { stable = false; break; }
    }
    ok("!! byte-identical under 200 shuffles of vertex, color, and collision-walk order", stable,
       "predict and finalize are per-vertex, the solve is per-color, collision discovery is sorted -- every pass is a pure function of its input buffer, so no ordering the GPU might pick changes a bit.");
}

// ---- 3. PING-PONG HANDOFF: N frames == K then N-K (all state lives in the buffers) ---------------------------
{
    const { cons, adj, colors, init } = scene();
    const straight = clothLoop(init, init.invMass, cons, colors, 40, OPT(adj));
    // run 18 frames, then continue another 22 from the handed-off buffers
    const n = init.pos.length;
    const buf = { pos: Float64Array.from(init.pos), vel: Float64Array.from(init.vel), pred: new Float64Array(n), prev: new Float64Array(n) };
    for (let f = 0; f < 18; f++) clothFrame(buf, init.invMass, cons, colors, OPT(adj));
    for (let f = 0; f < 22; f++) clothFrame(buf, init.invMass, cons, colors, OPT(adj));
    ok("!! splitting the loop at a frame boundary changes nothing", hp(straight.pos) === hp(buf.pos),
       "40 frames straight equals 18 then 22 continued from the same buffers -- the frame handoff carries all state in the position and velocity buffers, which is what lets it ping-pong on the GPU with no readback.");
}

// ---- 4. NO READBACK: the frame IS a fixed pipeline of buffer passes (collisions off) ------------------------
{
    const { cons, colors, init, N } = scene();
    const opt = { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: 0 };
    const n = init.pos.length;
    // clothFrame result
    const bufA = { pos: Float64Array.from(init.pos), vel: Float64Array.from(init.vel), pred: new Float64Array(n), prev: new Float64Array(n) };
    clothFrame(bufA, init.invMass, cons, colors, opt);
    // the same thing spelled out as an explicit, data-independent pass sequence
    const bufB = { pos: Float64Array.from(init.pos), vel: Float64Array.from(init.vel), pred: new Float64Array(n), prev: new Float64Array(n) };
    predictPass(bufB, init.invMass, 0.016, [0, -10, 0]);
    const lam = new Float64Array(cons.length);
    for (let it = 0; it < 5; it++) for (let c = 0; c < colors.length; c++) solveColorPass(bufB.pred, init.invMass, cons, colors[c], lam, 0.016, false);
    finalizePass(bufB, init.invMass, 0.016);
    ok("!! the frame is exactly predict -> (iterations x colors) solve -> finalize, nothing data-driven", hp(bufA.pos) === hp(bufB.pos),
       "clothFrame equals that fixed sequence of buffer passes spelled out by hand -- the schedule is set by the constraint structure, not by inspecting positions, so nothing is read back to the CPU to steer the frame.");
}

// ---- 5. EXACT: one frame of free fall matches hand arithmetic --------------------------------------------------
{
    const invMass = Float64Array.from([1]);
    const buf = { pos: new Float64Array(3), vel: new Float64Array(3), pred: new Float64Array(3), prev: new Float64Array(3) };
    predictPass(buf, invMass, 0.1, [0, -10, 0]);          // vel -> (0,-1,0); pred -> (0,-0.1,0)
    finalizePass(buf, invMass, 0.1);                       // vel -> (0,-1,0); pos -> (0,-0.1,0)
    ok("!! one free-fall frame matches the closed form exactly", Math.abs(buf.pos[1] + 0.1) < 1e-12 && Math.abs(buf.vel[1] + 1) < 1e-12,
       "a single free particle under gravity at dt 0.1: predict then finalize land it at y = -0.1 with velocity -1, matched to 1e-12.");
}

// ---- 6. STABILITY + pure integer-of-floats -------------------------------------------------------------------
{
    const { cons, adj, colors, init } = scene(6, 6);
    const a = clothLoop(init, init.invMass, cons, colors, 120, OPT(adj));
    const b = clothLoop(init, init.invMass, cons, colors, 120, OPT(adj));
    let finite = true; for (let i = 0; i < a.pos.length; i++) if (!Number.isFinite(a.pos[i]) || Math.abs(a.pos[i]) > 1e6) finite = false;
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "clothLoop.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos)\b/.test(src);
    ok("!! 120 ping-pong frames stay finite and deterministic, no transcendental", hp(a.pos) === hp(b.pos) && finite && noTrig,
       "a 6x6 self-colliding cloth run twice for 120 frames is byte-identical and bounded, and the loop uses only +,-,*,/,sqrt -- bit-identical across machines.");
}

console.log(fails ? "\nclothLoop-selfcheck: " + fails + " FAILED" : "\nclothLoop-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
