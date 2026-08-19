// brain/tf/tf-selfcheck.mjs
//
// Run: node brain/tf/tf-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Transform feedback runs the vertices in an undefined, parallel order, so the only way the result is well-defined
// is if each agent's new state is a pure function of the PREVIOUS frame -- read the source buffer, write a separate
// destination buffer, swap. This gate pins that: the step never touches its source (pure function), the result is
// byte-identical under 200 shuffles of agent order (undefined GPU order cannot matter), and it equals a frozen-
// snapshot gather (every write reads only pre-step values). The contrast is the same integrator writing in place --
// which drifts under shuffle, the read-after-write race the double-buffer exists to avoid. The sabotage makes the
// coupling read the DESTINATION buffer instead of the source, and the order-invariance and gather checks both fail.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { tfStep, tfStepInPlace, tfRun, swirl } from "./tfStep.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

let seed = 0x7f13;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hashPos = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

// a ring of agents on a small lattice, literal init (no trig), given some spin
function agents(N = 24) {
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N);
    for (let a = 0; a < N; a++) { pos[3 * a] = (a % 5) - 2; pos[3 * a + 1] = ((a * 3) % 7) - 3; pos[3 * a + 2] = ((a * 2) % 3) - 1; vel[3 * a] = 0.1 * (((a * 11) % 5) - 2); }
    return { pos, vel };
}
const order0 = (N) => { const a = new Array(N); for (let i = 0; i < N; i++) a[i] = i; return a; };

// ---- 1. PURE FUNCTION: tfStep reads its source but never mutates it ------------------------------------------
{
    const src = agents(); const before = hashPos(src.pos), beforeV = hashPos(src.vel);
    tfStep(src, { dt: 0.02, coupling: 0.6 });
    ok("!! the ping-pong step never mutates its source buffer", hashPos(src.pos) === before && hashPos(src.vel) === beforeV,
       "tfStep returns a fresh destination and leaves the source untouched -- read one buffer, write the other, the shape a transform-feedback pass requires.");
}

// ---- 2. THE SPINE: agent processing order does not change the result (200 shuffles) --------------------------
{
    const src = agents(); const N = src.pos.length / 3;
    const ref = hashPos(tfStep(src, { dt: 0.02, coupling: 0.6, order: order0(N) }).pos);
    let stable = true;
    for (let t = 0; t < 200; t++) { if (hashPos(tfStep(src, { dt: 0.02, coupling: 0.6, order: shuffle(order0(N)) }).pos) !== ref) { stable = false; break; } }
    ok("!! byte-identical under 200 shuffles of agent order", stable,
       "the GPU runs vertices in an undefined order; because each agent's new state is a pure function of the previous frame, that order cannot change the answer. Bit-identical.");
}

// ---- 3. THE CONTRAST: the same integrator writing IN PLACE drifts under shuffling ----------------------------
{
    const base = agents(); const N = base.pos.length / 3;
    const run = (order) => { const buf = { pos: Float64Array.from(base.pos), vel: Float64Array.from(base.vel) }; tfStepInPlace(buf, { dt: 0.02, coupling: 0.6, order }); return hashPos(buf.pos); };
    const ref = run(order0(N));
    let moved = false;
    for (let t = 0; t < 50; t++) { if (run(shuffle(order0(N))) !== ref) { moved = true; break; } }
    ok("!! writing in place (no double-buffer) DOES drift under shuffling (so test 2 is not vacuous)", moved,
       "read and write the same buffer and an agent's neighbour may already be updated -- the read-after-write race transform feedback's separate output buffer removes.");
}

// ---- 4. EXACT: one step matches hand arithmetic (pins the field + semi-implicit Euler) -----------------------
{
    const src = { pos: Float64Array.from([1, 0, 0, 0, 2, 0]), vel: new Float64Array(6) };
    const d = tfStep(src, { dt: 0.1, coupling: 0.5 });
    // agent0: swirl(1,0,0)=[0,-0.5,0.3]; coupling 0.5*(-1,2,0)=(-0.5,1,0); f=(-0.5,0.5,0.3); v=f*0.1; pos=(1,0,0)+v*0.1
    ok("!! one step matches the closed-form value exactly", Math.abs(d.vel[0] + 0.05) < 1e-12 && Math.abs(d.vel[1] - 0.05) < 1e-12 && Math.abs(d.pos[0] - 0.995) < 1e-12 && Math.abs(d.pos[1] - 0.005) < 1e-12 && Math.abs(d.pos[2] - 0.003) < 1e-12,
       "swirl field plus ring coupling, semi-implicit Euler at dt 0.1: agent 0 lands at (0.995, 0.005, 0.003) with velocity (-0.05, 0.05, 0.03), matched to 1e-12.");
}

// ---- 5. GATHER EQUIVALENCE: every write reads only pre-step (source) values ----------------------------------
{
    const src = agents(); const N = src.pos.length / 3, dt = 0.02, k = 0.6;
    // independent gather reference: compute each agent purely from a frozen snapshot of src
    const gather = { pos: new Float64Array(src.pos.length), vel: new Float64Array(src.vel.length) };
    for (let a = 0; a < N; a++) {
        const o = 3 * a, no = 3 * ((a + 1) % N); const px = src.pos[o], py = src.pos[o + 1], pz = src.pos[o + 2]; const [sx, sy, sz] = swirl(px, py, pz);
        const fx = sx + k * (src.pos[no] - px), fy = sy + k * (src.pos[no + 1] - py), fz = sz + k * (src.pos[no + 2] - pz);
        gather.vel[o] = src.vel[o] + fx * dt; gather.vel[o + 1] = src.vel[o + 1] + fy * dt; gather.vel[o + 2] = src.vel[o + 2] + fz * dt;
        gather.pos[o] = px + gather.vel[o] * dt; gather.pos[o + 1] = py + gather.vel[o + 1] * dt; gather.pos[o + 2] = pz + gather.vel[o + 2] * dt;
    }
    const step = tfStep(src, { dt, coupling: k, order: shuffle(order0(N)) });
    ok("!! the step equals a frozen-snapshot gather, in any order", hashPos(step.pos) === hashPos(gather.pos) && hashPos(step.vel) === hashPos(gather.vel),
       "computed independently from a frozen copy of the previous frame, the gather and the (shuffled) ping-pong step are byte-identical -- proof no write ever reads a value from this same step.");
}

// ---- 6. PING-PONG STABILITY over many frames + pure integer-of-floats ----------------------------------------
{
    const init = agents(48);
    const a = tfRun(init, 300, { dt: 0.02, coupling: 0.6 }), b = tfRun(init, 300, { dt: 0.02, coupling: 0.6 });
    let finite = true; for (let i = 0; i < a.pos.length; i++) if (!Number.isFinite(a.pos[i]) || Math.abs(a.pos[i]) > 1e6) finite = false;
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "tfStep.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random)\b/.test(src);
    ok("!! 300 ping-pong frames are deterministic, finite, and transcendental-free", hashPos(a.pos) === hashPos(b.pos) && finite && noTrig,
       "the frame-to-frame buffer handoff run twice is byte-identical and stays bounded, and the stepper uses only +,-,*,/, so the whole loop is bit-identical across machines.");
}

console.log(fails ? "\ntf-selfcheck: " + fails + " FAILED" : "\ntf-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
