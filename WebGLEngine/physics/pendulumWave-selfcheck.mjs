// physics/pendulumWave-selfcheck.mjs
//
// Run: node physics/pendulumWave-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A pendulum wave lives or dies on re-synchronisation: the row starts in step, scrambles through a travelling wave and
// finer patterns, and at the cycle time snaps back into step because every pendulum has completed a whole number of
// swings at once. The gate proves exactly that -- the angles are spread wide at half a cycle and back to nearly zero
// spread at a full cycle -- and the details that make it real: at half a cycle the pendulums have split into two groups
// at plus and minus the amplitude; each pendulum holds its amplitude (the exact-rotation step conserves its energy);
// and the frequencies climb one swing at a time down the row. The sabotage detunes the frequencies off their whole
// numbers, and the re-sync smears -- the spread at the full cycle is no longer small, because pendulums that do not
// complete whole swings together never come back into step.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { makePendulumWave, pendulumStep, angleSpread, maxAngle } from "./pendulumWave.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (a) => { const b = Buffer.alloc(a.length * 8); for (let i = 0; i < a.length; i++) b.writeDoubleLE(a[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const AMP = 0.3, CYCLE = 60, DT = 1 / 60, SPC = Math.round(CYCLE / DT);
function at(fraction) { const st = makePendulumWave({ N: 15, k: 20, cycle: CYCLE, amp: AMP, dt: DT }); const n = Math.round(SPC * fraction); for (let i = 0; i < n; i++) pendulumStep(st); return st; }

// ---- 1. RE-SYNC: scrambled at half a cycle, back in step at a full cycle ----------------------------------
{
    const half = angleSpread(at(0.5)), full = angleSpread(at(1.0));
    ok("!! the row scrambles by half a cycle and snaps back into step at a full cycle", half > 0.5 && full < half * 0.05,
       "the angle spread is " + half.toFixed(3) + " at half a cycle and " + full.toFixed(4) + " at the full cycle -- the pendulums fan out and then re-synchronise, which is the whole phenomenon.");
}

// ---- 2. TWO GROUPS at half a cycle: every pendulum sits at plus or minus the amplitude --------------------
{
    const st = at(0.5); let allAtAmp = true;
    for (const p of st.pend) if (Math.abs(Math.abs(p.theta) - AMP) > 0.02) allAtAmp = false;
    ok("!! at half a cycle the row splits into two groups at plus and minus the amplitude", allAtAmp,
       "every pendulum sits within a hair of +/-" + AMP + " at half a cycle -- the even and odd swing counts land the row in two clusters, a signature pattern of the wave.");
}

// ---- 3. AMPLITUDE HELD: the exact rotation conserves each pendulum's energy -------------------------------
{
    const st = at(0.37); let worst = 0;
    for (const p of st.pend) { const ampN = Math.sqrt(p.theta * p.theta + (p.v / p.w) * (p.v / p.w)); worst = Math.max(worst, Math.abs(ampN - AMP)); }
    ok("!! each pendulum holds its amplitude -- the step conserves energy", worst < 1e-9,
       "mid-cycle every pendulum's amplitude sqrt(theta^2 + (v/omega)^2) is still " + AMP + " to within " + worst.toExponential(1) + " -- the exact harmonic rotation neither pumps nor damps, unlike an Euler step.");
}

// ---- 4. FREQUENCY STAGGER: each pendulum swings one step faster than the last -----------------------------
{
    const st = makePendulumWave({ N: 15, k: 20, cycle: CYCLE, amp: AMP, dt: DT });
    let climbing = true; for (let i = 1; i < st.pend.length; i++) if (!(st.pend[i].w > st.pend[i - 1].w)) climbing = false;
    const ratio = st.pend[st.pend.length - 1].w / st.pend[0].w;
    ok("!! the frequencies climb one swing at a time down the row", climbing && Math.abs(ratio - 34 / 20) < 1e-9,
       "each pendulum's frequency is higher than the last, the fastest running " + ratio.toFixed(3) + "x the slowest (34 swings to 20) -- the tuning that makes the wave.");
}

// ---- 5. DETERMINISTIC + arithmetic loop (strict trig only at setup) ---------------------------------------
{
    const a = at(0.6).pend.map((p) => p.theta), b = at(0.6).pend.map((p) => p.theta);
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "pendulumWave.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the wave is deterministic and its step is pure arithmetic", hp(a) === hp(b) && clean,
       "the run reproduces byte-for-byte and the per-step loop is only +,-,*,/ -- the cos and sin are taken once from the strict-trig core at setup, so the wave is bit-identical across machines and joins the fingerprint.");
}

console.log(fails ? "\npendulumWave-selfcheck: " + fails + " FAILED" : "\npendulumWave-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
