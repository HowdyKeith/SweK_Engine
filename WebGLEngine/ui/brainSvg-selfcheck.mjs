// ui/brainSvg-selfcheck.mjs
//
// Run: node ui/brainSvg-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The SVG representation of the GPU Brain in action, checked as a solved flow field. The brain's job is to steer enemies
// toward a goal and away from threat, so the field must actually point toward the goal on average, the threat heat must
// stay a real weight in (0,1], and the flow vectors must be unit directions, not raw magnitudes. The SVG it renders has
// to be well-formed for both the active and idle states. The sabotage removes the toward-goal term, so the flow stops
// aiming at the goal -- which is the whole point of a solved field, and the alignment check catches it.
import { flowField, makeBrainSvg } from "./brainSvg.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const field = flowField(8, 0);
const align = () => { let s = 0; for (const c of field.cells) { const gx = field.goal[0] - c.x, gy = field.goal[1] - c.y, gd = Math.hypot(gx, gy) || 1; s += c.fx * (gx / gd) + c.fy * (gy / gd); } return s / field.cells.length; };

// ---- 1. DETERMINISTIC -------------------------------------------------------------------------------
{
    ok("!! the solved field is deterministic", JSON.stringify(flowField(8, 0)) === JSON.stringify(flowField(8, 0)) && field.cells.length === 64,
       "the same grid solves to the same 64-cell field every call -- the mind is reproducible, so the drawing does not shimmer randomly.");
}

// ---- 2. THE FLOW POINTS TOWARD THE GOAL ------------------------------------------------------------
{
    ok("!! the flow field actually steers toward the goal", align() > 0.5,
       "averaged over the grid the flow aligns " + align().toFixed(2) + " with the direction to the goal -- a solved field, not noise. That is what makes it a picture of the brain thinking rather than decoration.");
}

// ---- 3. THREAT HEAT IS A REAL WEIGHT IN (0,1] ------------------------------------------------------
{
    const ts = field.cells.map((c) => c.threat), lo = Math.min(...ts), hi = Math.max(...ts);
    ok("!! threat heat is a bounded weight in (0,1]", lo > 0 && hi <= 1 && hi - lo > 0.3,
       "threat ranges [" + lo.toFixed(2) + ", " + hi.toFixed(2) + "] -- hottest near the danger blob, cool far from it, always a real fraction the colour can map.");
}

// ---- 4. FLOW VECTORS ARE UNIT DIRECTIONS -----------------------------------------------------------
{
    const bad = field.cells.filter((c) => Math.abs(Math.hypot(c.fx, c.fy) - 1) > 1e-6).length;
    ok("!! every flow vector is a unit direction", bad === 0,
       "all 64 arrows are normalised -- they show which way, not how far, so the arrow lengths on screen are honest.");
}

// ---- 5. THE SVG IS WELL-FORMED FOR ACTIVE AND IDLE -------------------------------------------------
{
    const a = makeBrainSvg({ active: true, solveMs: 12.3, samples: 44 }, 0.5), i = makeBrainSvg({ active: false }, 0);
    const wellFormed = (s) => s.startsWith("<svg") && s.endsWith("</svg>") && (s.match(/</g).length === s.match(/>/g).length);
    ok("!! the brain renders valid SVG in both the solving and idle states", wellFormed(a) && wellFormed(i) && a.includes("solving") && i.includes("idle") && a.includes("#33ccff"),
       "active shows cyan flow arrows and reads 'solving'; idle dims and reads 'idle' -- a live mind or a resting one, both well-formed for the dock.");
}

console.log(fails ? "\nbrainSvg-selfcheck: " + fails + " FAILED" : "\nbrainSvg-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
