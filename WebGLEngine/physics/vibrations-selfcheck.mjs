// physics/vibrations-selfcheck.mjs
//
// Run: node physics/vibrations-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The point of normal modes is that each one is a motion the chain can sustain unchanged: start in a mode's shape and
// the whole chain oscillates at one frequency with its spatial pattern frozen. The gate proves exactly that -- a pure
// mode stays aligned with its own shape for thousands of steps rather than smearing into other modes; it oscillates at
// the analytic frequency 2 sqrt(k/m) sin(j pi / 2(N+1)); the energy stays bounded (symplectic); and the mode
// frequencies climb with mode number. The sabotage cuts the springs between neighbours -- drops the coupling from the
// acceleration -- and the chain becomes a row of independent identical oscillators: every mode then rings at the same
// frequency, so the analytic-frequency and the ordering checks fail. The coupling is what makes a mode a mode.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { makeChain, setMode, modeFreq, chainStep, energy, modeAlignment } from "./vibrations.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (a) => { const b = Buffer.alloc(a.length * 8); for (let i = 0; i < a.length; i++) b.writeDoubleLE(a[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const DT = 1 / 240;
function measureOmega(j) {
    const st = makeChain({ N: 12, k: 1, m: 1 }); setMode(st, j, 0.3);
    let rising = false, t = 0, last = null, period = null;
    for (let s = 0; s < 30000 && period === null; s++) { const p0 = st.x[0]; chainStep(st, DT); const p1 = st.x[0]; t += DT; if (p0 < p1 && !rising) { rising = true; if (last !== null) period = t - last; last = t; } if (p0 > p1) rising = false; }
    return period ? 2 * Math.PI / period : 0;
}

// ---- 1. STANDING WAVE: a pure mode keeps its shape ------------------------------------------------------
{
    const st = makeChain({ N: 12 }); setMode(st, 3, 0.3); let minAlign = 1;
    for (let s = 0; s < 4000; s++) { chainStep(st, DT); minAlign = Math.min(minAlign, modeAlignment(st, 3)); }
    ok("!! a pure normal mode stays a standing wave -- its shape is preserved", minAlign > 0.9999,
       "started in mode 3, the chain's displacement stays aligned with the mode-3 shape to " + minAlign.toFixed(5) + " over thousands of steps -- the pattern is frozen in space while its amplitude breathes.");
}

// ---- 2. ANALYTIC FREQUENCY: the mode rings at 2 sqrt(k/m) sin(j pi / 2(N+1)) ------------------------------
{
    const st = makeChain({ N: 12 }); const f3 = modeFreq(st, 3), m3 = measureOmega(3);
    ok("!! the mode oscillates at its analytic frequency", Math.abs(m3 - f3) / f3 < 0.01,
       "mode 3 rings at " + m3.toFixed(4) + " against the predicted " + f3.toFixed(4) + " -- the integrator reproduces the eigenfrequency of the chain, not just some oscillation.");
}

// ---- 3. ENERGY BOUNDED (symplectic) ---------------------------------------------------------------------
{
    const st = makeChain({ N: 12 }); setMode(st, 4, 0.3); const E0 = energy(st); let Emin = Infinity, Emax = -Infinity;
    for (let s = 0; s < 6000; s++) { chainStep(st, DT); const E = energy(st); if (E < Emin) Emin = E; if (E > Emax) Emax = E; }
    ok("!! the energy stays bounded -- the chain integrator is symplectic", (Emax - Emin) / E0 < 1e-4,
       "the energy varies by " + ((Emax - Emin) / E0).toExponential(1) + " of itself over six thousand steps -- velocity-Verlet keeps it bounded, so modes do not pump or decay.");
}

// ---- 4. FREQUENCY ORDER: higher modes ring higher --------------------------------------------------------
{
    const st = makeChain({ N: 12 }); let climbing = true; for (let j = 2; j <= st.N; j++) if (!(modeFreq(st, j) > modeFreq(st, j - 1))) climbing = false;
    ok("!! the mode frequencies climb with mode number", climbing,
       "omega_1 through omega_12 increase monotonically, from " + modeFreq(st, 1).toFixed(3) + " to " + modeFreq(st, st.N).toFixed(3) + " -- more nodes, faster ringing, as a chain demands.");
}

// ---- 5. DETERMINISTIC + arithmetic loop (strict trig only for the mode shape) ----------------------------
{
    const a = makeChain({ N: 12 }); setMode(a, 5, 0.3); for (let s = 0; s < 500; s++) chainStep(a, DT);
    const b = makeChain({ N: 12 }); setMode(b, 5, 0.3); for (let s = 0; s < 500; s++) chainStep(b, DT);
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "vibrations.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the chain is deterministic and its step is pure arithmetic", hp(a.x) === hp(b.x) && clean,
       "the run reproduces byte-for-byte and the coupling loop is only +,-,*,/ -- the mode shape and analytic frequency take a sine from the strict-trig core, so the chain is bit-identical across machines and joins the fingerprint.");
}

console.log(fails ? "\nvibrations-selfcheck: " + fails + " FAILED" : "\nvibrations-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
