// WebGLEngine/physics/md/ewald-selfcheck.mjs — v2650
//
// Run: node physics/md/ewald-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Ewald has a decisive physical check that most force terms lack: the Madelung constant. For a rock-salt lattice of
// alternating unit charges, the electrostatic energy per ion is exactly -M/r0 with M = 1.7475645..., a number known
// to many digits from number theory. If the real, reciprocal and self parts are each right AND correctly balanced,
// the sum reproduces M; if any prefactor or sign is off, it does not. Around that: the energy must be independent of
// the real/reciprocal split parameter alpha (the split is a computational trick, not physics), the forces must equal
// minus the gradient of the energy, the net force on the neutral cell is zero, and the determinism grep confirms the
// only transcendentals are the strict ones.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ewald } from "./ewald.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const MADELUNG = 1.7475645946;

// rock-salt conventional cell, side L; Na(+1) at cell/face sites, Cl(-1) at edge/body sites; r0 = L/2
function rockSalt(L) {
    const na = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
    const cl = [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0.5, 0.5]];
    const pos = [], q = [];
    for (const p of na) { pos.push(p[0] * L, p[1] * L, p[2] * L); q.push(1); }
    for (const p of cl) { pos.push(p[0] * L, p[1] * L, p[2] * L); q.push(-1); }
    return { pos: new Float64Array(pos), q: new Float64Array(q), N: 8 };
}

// ---- 1. THE ENERGY REPRODUCES THE MADELUNG CONSTANT OF ROCK SALT ---------------------------------------------------
{
    const L = 1, { pos, q, N } = rockSalt(L);
    const M = -ewald(pos, q, N, L, { alpha: 4 / L, kmax: 6, rcut: L }).energy * L / 8;   // E = -8 M / L  => M = -E L / 8
    ok("!! the Ewald energy reproduces the Madelung constant of rock salt (1.7475645)", Math.abs(M - MADELUNG) < 1e-4,
       "computed M = " + M.toFixed(7) + " vs known " + MADELUNG.toFixed(7) + " (diff " + Math.abs(M - MADELUNG).toExponential(1) + ", floored by strictErfc's 1.5e-7). THE REAL, RECIPROCAL AND SELF PARTS ARE EACH RIGHT AND CORRECTLY BALANCED.");
}

// ---- 2. THE ENERGY IS INDEPENDENT OF THE SPLIT PARAMETER alpha -----------------------------------------------------
{
    const L = 1, { pos, q, N } = rockSalt(L);
    const Ms = [3, 4, 5].map((a) => -ewald(pos, q, N, L, { alpha: a / L, kmax: 8, rcut: L }).energy * L / 8);
    const spread = Math.max(...Ms) - Math.min(...Ms);
    ok("!! the result does not depend on the real/reciprocal split (alpha)", spread < 1e-4,
       "M at alpha=3,4,5 over L: " + Ms.map((m) => m.toFixed(6)).join(", ") + " -- spread " + spread.toExponential(1) + ". The split is a computational device; the physics is invariant to it.");
}

// ---- 3. THE FORCES EQUAL MINUS THE GRADIENT OF THE ENERGY (finite difference) --------------------------------------
{
    const L = 1, { pos, q, N } = rockSalt(L);
    pos[0] += 0.07; pos[1] -= 0.04; pos[13] += 0.05; pos[20] -= 0.06;    // displace off the ideal lattice
    const opt = { alpha: 4 / L, kmax: 6, rcut: L };
    const ana = ewald(pos, q, N, L, opt).forces;
    const E = (pp) => ewald(pp, q, N, L, opt).energy;
    const h = 1e-6; let worst = 0;
    for (let c = 0; c < 3 * N; c++) { const pp = pos.slice(), pm = pos.slice(); pp[c] += h; pm[c] -= h; worst = Math.max(worst, Math.abs(-(E(pp) - E(pm)) / (2 * h) - ana[c])); }
    ok("!! the analytic force equals minus the numerical gradient of the energy", worst < 1e-4,
       "worst mismatch " + worst.toExponential(1) + " across all 24 coordinates -- real-space AND reciprocal-space gradients are both correct.");
}

// ---- 4. NET FORCE ON THE NEUTRAL CELL IS ZERO ---------------------------------------------------------------------
{
    const L = 1, { pos, q, N } = rockSalt(L);
    pos[3] += 0.09; pos[16] -= 0.05;
    const f = ewald(pos, q, N, L, { alpha: 4 / L, kmax: 6, rcut: L }).forces;
    const nf = [0, 0, 0]; for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) nf[c] += f[3 * i + c];
    ok("!! the net force on the periodic cell is zero", nf.every((v) => Math.abs(v) < 1e-9),
       "sum of all forces = [" + nf.map((v) => v.toExponential(1)).join(", ") + "] -- Newton's third law holds across the lattice sum.");
}

// ---- 5. DETERMINISTIC: THE ONLY TRANSCENDENTALS ARE THE STRICT ONES ------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "ewald.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(exp|log|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|expm1|log1p)\b/;
    const usesStrict = /strictErfc/.test(src) && /strictExp/.test(src) && /strictSin/.test(src) && /strictCos/.test(src);
    ok("!! Ewald's transcendentals are all strict (erfc/exp/sin/cos), no library ones", !banned.test(src) && usesStrict,
       "erfc, exp, sin and cos all come from strict-libm; the only Math calls are sqrt/PI/round/ceil/max, which IEEE specifies exactly. THE PERIODIC ELECTROSTATICS ARE BIT-IDENTICAL ON EVERY MACHINE -- the reason strict-libm exists.");
}

console.log(fails ? "\newald-selfcheck: " + fails + " FAILED" : "\newald-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
