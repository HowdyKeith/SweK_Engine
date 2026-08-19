// physics/xpbd/attach-selfcheck.mjs
//
// Run: node physics/xpbd/attach-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Attachments pin cloth to world anchors as XPBD point constraints. A hard attachment (compliance 0) must place the
// particle exactly on its anchor in one solve, since the correction is exactly -(x - target); a soft one must pull
// toward the anchor without overshooting to nonsense. A moving anchor must drag its particle deterministically and
// the particle must actually track it. And attachments to distinct particles are independent, so their order cannot
// matter. The sabotage drops the length normalization in the point-constraint correction, so the hard pin no longer
// lands on the target and both the snap check and the exact check fail.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints, cloneState } from "./xpbd.js";
import { solveAttachments, attachSubstep } from "./attach.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x2f6b;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const iota = (n) => Array.from({ length: n }, (_, i) => i);

function cloth(W = 5, H = 5) {
    const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const batches = colorConstraints(cons); const N = W * H;
    const mk = () => { const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N).fill(1); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = 0; pos[3 * i + 2] = -y * 0.3; } return { pos, vel, invMass }; };
    return { cons, batches, N, mk };
}

// ---- 1. HARD PIN SNAPS: a compliance-0 attachment places the particle exactly on the anchor ------------------
{
    const pred = Float64Array.from([5, 3, -2]);
    solveAttachments(pred, Float64Array.from([1]), [{ p: 0, tx: 1, ty: 1, tz: 1, compliance: 0 }], new Float64Array(1), 0.016);
    ok("!! a hard attachment snaps the particle onto its anchor in one solve", Math.abs(pred[0] - 1) < 1e-12 && Math.abs(pred[1] - 1) < 1e-12 && Math.abs(pred[2] - 1) < 1e-12,
       "from (5,3,-2) with a compliance-0 anchor at (1,1,1), the correction is exactly -(x - target) and lands on (1,1,1) to 1e-12.");
}

// ---- 2. SOFT ATTACH CONVERGES: positive compliance pulls toward the anchor, monotonically -------------------
{
    const pred = Float64Array.from([5, 0, 0]); const lam = new Float64Array(1);
    const d0 = Math.abs(pred[0] - 1); let mono = true, prev = d0;
    for (let it = 0; it < 40; it++) { solveAttachments(pred, Float64Array.from([1]), [{ p: 0, tx: 1, ty: 0, tz: 0, compliance: 0.000005 }], lam, 0.016); const d = Math.abs(pred[0] - 1); if (d > prev + 1e-15) mono = false; prev = d; }
    const dN = Math.abs(pred[0] - 1);
    ok("!! a soft attachment pulls the particle toward the anchor without overshoot", mono && dN < d0 * 0.05,
       "distance to the anchor fell monotonically from " + d0.toFixed(3) + " to " + dN.toFixed(4) + " over 40 iterations, never once increasing -- a stable spring, no overshoot.");
}

// ---- 3. MOVING ANCHOR: an animated target drags its particle deterministically, and it tracks ---------------
{
    const { cons, batches, mk } = cloth();
    const run = () => { const s = mk(); for (let k = 0; k < 60; k++) { const t = k * 0.01; attachSubstep(s, cons, batches, [{ p: 0, tx: 0.3 * t, ty: 0, tz: 0, compliance: 0 }], { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); } return s.pos; };
    const a = run(), b = run();
    const targetX = 0.3 * 0.59;
    ok("!! a moving anchor drags its particle deterministically and the particle tracks it", hp(a) === hp(b) && Math.abs(a[0] - targetX) < 1e-9,
       "the corner follows its anchor to x = " + a[0].toFixed(3) + " (target " + targetX.toFixed(3) + ") and two runs are byte-identical -- the moving pin is fully reproducible.");
}

// ---- 4. ORDER-FREE: attachments to distinct particles are independent ---------------------------------------
{
    const { cons, batches, N, mk } = cloth();
    const anchors = [0, 4, 20, 24].map((p) => ({ p, tx: 0, ty: 0.5, tz: 0, compliance: 0.001 }));
    const run = (ord) => { const s = mk(); for (let k = 0; k < 30; k++) attachSubstep(s, cons, batches, anchors, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], attachOrder: ord }); return hp(s.pos); };
    const ref = run(iota(anchors.length)); let stable = true;
    for (let t = 0; t < 200; t++) if (run(shuffle(iota(anchors.length))) !== ref) { stable = false; break; }
    ok("!! byte-identical under 200 shuffles of attachment order", stable,
       "each attachment touches one particle, so attachments to distinct particles are independent -- the order they are solved in cannot change a bit.");
}

// ---- 5. EXACT: one soft step matches the closed-form point-constraint value ---------------------------------
{
    const pred = Float64Array.from([3, 0, 0]); const w = 1, compliance = 0.001, dt = 0.01;
    solveAttachments(pred, Float64Array.from([w]), [{ p: 0, tx: 0, ty: 0, tz: 0, compliance }], new Float64Array(1), dt);
    const len = 3, C = len, aTilde = compliance / (dt * dt), dL = (-C - aTilde * 0) / (w + aTilde), expect = 3 + w * (dL / len) * 3;
    ok("!! one soft attachment step matches the closed-form value to 1e-12", Math.abs(pred[0] - expect) < 1e-12,
       "the XPBD point-constraint update lands the particle at the exact Eq 18 position for one step -- x = " + pred[0].toFixed(6) + ".");
}

// ---- 6. PURE + deterministic -------------------------------------------------------------------------------
{
    const { cons, batches, mk } = cloth();
    const anchors = [0, 24].map((p) => ({ p, tx: 0.1, ty: 0.6, tz: -0.4, compliance: 0.0008 }));
    const a = mk(), b = mk();
    for (let k = 0; k < 60; k++) { attachSubstep(a, cons, batches, anchors, { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); attachSubstep(b, cons, batches, anchors, { dt: 0.016, iterations: 5, gravity: [0, -10, 0] }); }
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "attach.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos)\b/.test(src);
    ok("!! two runs agree byte-for-byte and there is no transcendental", hp(a.pos) === hp(b.pos) && noTrig,
       "a cloth hung from two anchors, run twice, is byte-identical, and the attachment solver uses only +,-,*,/,sqrt -- bit-identical across machines.");
}

console.log(fails ? "\nattach-selfcheck: " + fails + " FAILED" : "\nattach-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
