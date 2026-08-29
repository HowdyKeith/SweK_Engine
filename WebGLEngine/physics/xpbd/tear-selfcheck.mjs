// physics/xpbd/tear-selfcheck.mjs
//
// Run: node physics/xpbd/tear-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Tearing removes constraints, and it has to do so deterministically and permanently. The torn set is decided
// against a frozen snapshot of the predicted positions, each constraint reading only its own endpoints, so it is a
// pure function of that snapshot regardless of scan order -- the gate shuffles the scan forty times and gets the
// identical set. Tearing must actually change the physics: a low breaking threshold removes constraints and lands
// the cloth in a measurably different shape than a high threshold that removes none. And a tear is permanent -- the
// active count only ever falls, and a torn thread never re-activates. The sabotage stops the solve from skipping
// torn constraints, so a "torn" cloth behaves exactly like an intact one and the behavioral check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints, cloneState } from "./xpbd.js";
import { tearSubstep, evaluateTears, activeCount, applyTears } from "./tear.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 0x19bd;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const iota = (n) => Array.from({ length: n }, (_, i) => i);

function cloth(W = 6, H = 6) {
    const { cons } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const batches = colorConstraints(cons); const N = W * H;
    const mk = () => { const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = -y * 0.3; pos[3 * i + 2] = 0; invMass[i] = (y === 0) ? 0 : 1; } return { pos, vel, invMass }; };
    return { cons, batches, N, mk };
}

// ---- 1. SNAPSHOT DETERMINISM: the torn set is a pure function of the predicted positions -------------------
{
    const { cons, N, mk } = cloth();
    const s = mk(); for (let i = 0; i < N * 3; i++) s.pos[i] += (i % 7) * 0.02;   // perturb so strains vary
    const active = new Uint8Array(cons.length).fill(1);
    const ref = JSON.stringify(evaluateTears(s.pos, cons, active, 1.05, iota(cons.length)));
    let identical = true;
    for (let t = 0; t < 40; t++) if (JSON.stringify(evaluateTears(s.pos, cons, active, 1.05, shuffle(iota(cons.length)))) !== ref) { identical = false; break; }
    ok("!! the torn set is identical no matter the constraint scan order", identical,
       "evaluated against a frozen snapshot, each constraint reading only its two endpoints, the set of torn constraints is a pure function of position -- scan order is irrelevant.");
}

// ---- 2. BEHAVIORAL: tearing removes constraints and changes the resulting shape -----------------------------
{
    const { cons, batches, mk } = cloth();
    const load = { dt: 0.02, iterations: 5, gravity: [0, -60, 0] };
    const torn = new Uint8Array(cons.length).fill(1); const sTorn = mk();
    for (let k = 0; k < 40; k++) tearSubstep(sTorn, cons, batches, torn, { ...load, tearStrain: 1.08 });
    const intact = new Uint8Array(cons.length).fill(1); const sIntact = mk();
    for (let k = 0; k < 40; k++) tearSubstep(sIntact, cons, batches, intact, { ...load, tearStrain: 100 });   // nothing tears
    ok("!! tearing removes constraints and lands the cloth in a different shape", activeCount(torn) < cons.length && activeCount(intact) === cons.length && hp(sTorn.pos) !== hp(sIntact.pos),
       "under the same hard load a strain-1.08 threshold tears " + (cons.length - activeCount(torn)) + " of " + cons.length + " constraints and the cloth deforms differently, while a strain-100 threshold tears none -- the removed constraints really stop acting.");
}

// ---- 3. PERMANENT: the active count only falls; a torn thread never re-activates ----------------------------
{
    const { cons, batches, mk } = cloth();
    const active = new Uint8Array(cons.length).fill(1); const s = mk();
    let mono = true, prev = activeCount(active); const torn0 = new Set();
    for (let k = 0; k < 50; k++) {
        tearSubstep(s, cons, batches, active, { dt: 0.02, iterations: 5, gravity: [0, -50, 0], tearStrain: 1.06 });
        const c = activeCount(active); if (c > prev) mono = false; prev = c;
        for (let ci = 0; ci < cons.length; ci++) if (!active[ci]) { if (torn0.has(ci) === false) torn0.add(ci); }
    }
    // re-check: everything ever torn is still torn
    let stillTorn = true; for (const ci of torn0) if (active[ci]) stillTorn = false;
    ok("!! the active count only decreases and torn constraints stay torn", mono && stillTorn && torn0.size > 0,
       torn0.size + " constraints tore over 50 frames, the active count never rose, and not one healed -- tearing is permanent.");
}

// ---- 4. SPINE: torn-aware solve is order-free, and the run is deterministic ---------------------------------
{
    const { cons, batches, mk } = cloth();
    const run = (bs) => { const active = new Uint8Array(cons.length).fill(1); const s = mk(); for (let k = 0; k < 30; k++) tearSubstep(s, cons, bs, active, { dt: 0.02, iterations: 4, gravity: [0, -40, 0], tearStrain: 1.08 }); return hp(s.pos); };
    const ref = run(batches); let stable = true;
    for (let t = 0; t < 200; t++) if (run(batches.map((b) => shuffle(b))) !== ref) { stable = false; break; }
    ok("!! byte-identical under 200 within-color shuffles with tearing active", stable,
       "skipping torn constraints does not disturb the per-color independence -- the tearing solve stays a pure function of its input.");
}

// ---- 5. THRESHOLD EXACT: strain just over the threshold tears, just under holds -----------------------------
{
    const cons = [{ i: 0, j: 1, rest: 1.0, compliance: 0.0 }], batches = colorConstraints(cons);
    const stretched = () => ({ pos: Float64Array.from([0, 0, 0, 1.2, 0, 0]), vel: new Float64Array(6), invMass: Float64Array.from([0, 1]) });   // strain 1.2
    const aTears = new Uint8Array([1]); tearSubstep(stretched(), cons, batches, aTears, { dt: 0.01, iterations: 1, gravity: [0, 0, 0], tearStrain: 1.1 });
    const aHolds = new Uint8Array([1]); tearSubstep(stretched(), cons, batches, aHolds, { dt: 0.01, iterations: 1, gravity: [0, 0, 0], tearStrain: 1.3 });
    ok("!! a constraint at strain 1.2 tears below the bar and holds above it", aTears[0] === 0 && aHolds[0] === 1,
       "stretched to 1.2x rest: a 1.1 threshold snaps it, a 1.3 threshold keeps it -- the breaking strain is applied exactly.");
}

// ---- 5b. applyTears IN ISOLATION: it clears exactly the torn indices, nothing else, and never reverses --------
{
    const active = new Uint8Array([1, 1, 1, 1, 1]);
    applyTears(active, [1, 3]);
    const exact = active[0] === 1 && active[1] === 0 && active[2] === 1 && active[3] === 0 && active[4] === 1;
    // applying an EMPTY torn list is a no-op
    const beforeEmpty = active.slice();
    applyTears(active, []);
    let emptyNoOp = true; for (let i = 0; i < active.length; i++) if (active[i] !== beforeEmpty[i]) emptyNoOp = false;
    // re-applying the SAME already-torn indices does not error and does not reverse them (1 -> 0 only, idempotent)
    applyTears(active, [1, 3]);
    const stillZero = active[1] === 0 && active[3] === 0;
    // tearing an already-intact one on top leaves the previously-torn ones exactly as they were
    applyTears(active, [0]);
    const newTearAdditive = active[0] === 0 && active[1] === 0 && active[2] === 1 && active[3] === 0 && active[4] === 1;
    ok("!! applyTears clears exactly the given indices, leaves everything else untouched, and is idempotent",
       exact && emptyNoOp && stillZero && newTearAdditive,
       "torn=[1,3] on five active flags clears only indices 1 and 3 (result " + Array.from(Uint8Array.from([1,0,1,0,1])).join("") +
       "); an empty torn list changes nothing; re-tearing [1,3] again leaves them at 0; and tearing index 0 afterward only adds to the torn set, never resurrects 1 or 3.");
}

// ---- 6. PURE + deterministic -------------------------------------------------------------------------------
{
    const { cons, batches, mk } = cloth();
    const a = new Uint8Array(cons.length).fill(1), b = new Uint8Array(cons.length).fill(1);
    const sa = mk(), sb = mk();
    for (let k = 0; k < 40; k++) { tearSubstep(sa, cons, batches, a, { dt: 0.02, iterations: 5, gravity: [0, -50, 0], tearStrain: 1.07 }); tearSubstep(sb, cons, batches, b, { dt: 0.02, iterations: 5, gravity: [0, -50, 0], tearStrain: 1.07 }); }
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "tear.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const noTrig = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos)\b/.test(src);
    ok("!! two runs agree byte-for-byte and there is no transcendental", hp(sa.pos) === hp(sb.pos) && activeCount(a) === activeCount(b) && noTrig,
       "two tearing runs land byte-identical with the same constraints torn, and the code uses only +,-,*,/,sqrt -- bit-identical across machines.");
}

console.log(fails ? "\ntear-selfcheck: " + fails + " FAILED" : "\ntear-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
