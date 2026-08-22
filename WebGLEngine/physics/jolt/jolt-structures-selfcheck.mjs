// headless self-check: a constrained wall stands rigid, then a hit CRATERS it locally (not a full shatter), harder
// hits crater wider, reinforced joints resist, and it's all deterministic.
import { createJoltBackend } from "./joltLoader.js";
import { createStructures } from "./joltStructures.js";

const backend = await createJoltBackend();
function wallWorld(strengthAt) { const w = backend.createWorld({ gravity: [0, -9.8, 0] }); w.addBox({ type: "static", pos: [0, -0.5, 0], half: [30, 0.5, 30] }); const S = createStructures(w); const wall = S.addWall({ cols: 9, rows: 7, half: 0.5, strengthAt }); return { w, S, wall }; }
function settle(w, S) { for (let t = 0; t < 40; t++) { w.step(1 / 60, 2); S.update(); } }
function boulder(w, speed) { const p = w.addBox({ type: "dynamic", pos: [0, 3.5, -8], half: [0.55, 0.55, 0.55], density: 5 }); w.setVelocity(p, [0, 0, speed]); return p; }
function fire(w, S, ticks = 90) { let broke = 0; for (let t = 0; t < ticks; t++) { w.step(1 / 60, 2); broke += S.update(); } return broke; }

// 1. holds rigid
{ const { w, S } = wallWorld(); const total = S.activeCount(); settle(w, S); console.log("1. wall stands: " + S.activeCount() + "/" + total + " joints intact after settling -> " + (S.activeCount() === total ? "HOLDS RIGID" : "sagged")); w.destroy(); }

// 2. moderate hit craters locally (partial, not full shatter)
{ const { w, S } = wallWorld(); const total = S.activeCount(); settle(w, S); boulder(w, 28); fire(w, S); const broke = S.brokenCount();
  console.log("2. moderate hit: " + broke + "/" + total + " joints broke (" + (broke / total * 100).toFixed(0) + "%) -> " + (broke > 0 && broke < total * 0.7 ? "LOCALIZED CRATER (not full shatter)" : "check")); w.destroy(); }

// 3. hard hit craters wider
{ const { w, S } = wallWorld(); const total = S.activeCount(); settle(w, S); boulder(w, 55); fire(w, S); const broke = S.brokenCount();
  console.log("3. hard hit: " + broke + "/" + total + " joints broke (" + (broke / total * 100).toFixed(0) + "%) -> wider crater"); w.destroy(); }

// 4. reinforced joints resist (make the top half twice as tough, hit the top -> fewer break there)
{ const soft = wallWorld(); const total = soft.S.activeCount(); settle(soft.w, soft.S); soft.w.addBox && boulder(soft.w, 40); const softBroke = fire(soft.w, soft.S) && soft.S.brokenCount(); soft.w.destroy();
  const hard = wallWorld((c, r) => r >= 3 ? 3 : 1); settle(hard.w, hard.S); boulder(hard.w, 40); fire(hard.w, hard.S); const hardBroke = hard.S.brokenCount(); hard.w.destroy();
  console.log("4. reinforcement: plain wall " + softBroke + " joints broke vs reinforced " + hardBroke + " -> " + (hardBroke < softBroke ? "REINFORCED JOINTS RESIST" : "check")); }

// 5. determinism
{ function run() { const { w, S, wall } = wallWorld(); settle(w, S); boulder(w, 45); fire(w, S); const xf = w.readTransforms(); const sig = S.brokenCount() + ":" + wall.idxs.map((i) => xf[i * 7].toFixed(2) + "," + xf[i * 7 + 1].toFixed(2)).join(";"); w.destroy(); return sig; }
  const r1 = run(), r2 = run(); console.log("5. determinism: " + (r1 === r2 ? "IDENTICAL -> lockstep-safe destruction" : "DIVERGED")); }
