// shedOnset.mjs
// Roundhouse question #1 -- "For the confined cylinder-in-channel geometry,
// vortex shedding first appears at Re_c = ___."
//
// Reduces the claim to a bisection over a body-force knob g, terminated by a
// hard numeric bracket-close on the MEASURED critical Reynolds number.
// No consensus exit -- the sim adjudicates.
//
// tau is held fixed (fixes nu). g is the only knob; raising g raises U hence Re.
// Re is measured from the field, never assumed from nominal params.

// ============================================================================
// RIG-BIND -- the five seams to the real simulation/lbm/lbm2d.js.
// These are the ONLY places that touch the engine API. Bind them, verify each
// against the real module, then the rest is correct-by-construction.
// ============================================================================

// 1. viscosity from tau. Known exact: nu = (tau - 0.5) / 3.
export const nuOf = (tau) => (tau - 0.5) / 3;

// 2. build a run. `force` shape is RIG-BIND: confirm whether lbm2d.js wants
//    a scalar gx, {x,y}, or {gx,gy}. Adjust the one line inside.
export function buildRun(makeLBM, cfg) {
  const solidAt = cylinderSolid(cfg.cylinder);
  return makeLBM({
    nx: cfg.nx,
    ny: cfg.ny,
    tau: cfg.tau,
    force: [cfg.g, 0],        // BOUND: lbm2d.js wants force[0],force[1]
    channel: true,             // RIG-BIND: confirm the no-slip-walls flag name
    solidAt,
  });
}

// 3. read transverse velocity uy at the probe cell. RIG-BIND: confirm the
//    macro accessor (lbm.uy(i,j)? lbm.macro[...]? lbm.u(i,j).y?).
export function probeUy(lbm, px, py) {
  return lbm.uy[lbm.idx(px, py)]; // BOUND: uy is a Float64Array indexed by idx
}

// 4. read a characteristic velocity U for the Reynolds number. Centerline
//    speed just UPSTREAM of the cylinder is the honest choice (undisturbed
//    inflow). RIG-BIND the accessor as in (3).
export function measureU(lbm, cfg) {
  const xUp = Math.max(1, cfg.cylinder.cx - 4 * cfg.cylinder.D);
  const yMid = Math.floor(cfg.ny / 2);
  return Math.abs(lbm.ux[lbm.idx(xUp, yMid)]); // BOUND
}

// 5. read total mass for the conservation health check. RIG-BIND.
export function measureMass(lbm) {
  return lbm.mass(); // BOUND: lbm2d.js exposes mass()
}

// cylinder as a solid predicate. offset defaults to 0.5 cells -- a perfectly
// centered cylinder sits on the numerical knife-edge and never sheds, per the
// lab's own finding, so we nudge it deliberately.
function cylinderSolid({ cx, cy, D, offset = 0.5 }) {
  const r = D / 2;
  const yc = cy + offset;
  return (x, y) => {
    const dx = x - cx, dy = y - yc;
    return dx * dx + dy * dy <= r * r;
  };
}

// ============================================================================
// RUN-CONFIG CONTRACT -- what the BUILDER feeds one simulation run.
// ============================================================================
export function defaultConfig(overrides = {}) {
  return {
    nx: 220,
    ny: 58,
    tau: 0.56,              // fixed; nu = 0.02
    g: 3e-5,               // the bisection knob (body force)
    cylinder: { cx: 60, cy: 29, D: 12, offset: 0.5 },
    probe: { px: 96, py: 22 }, // ~3D downstream, OFF centerline (shedding is antisymmetric)
    warmupSteps: 6000,     // discard the startup transient
    windowSteps: 4000,     // sample window after warmup
    maxSteps: 30000,       // hard cap
    shedThresholdPct: 1.0, // wobble% above which we call it shedding
    sustainTol: 0.85,      // 2nd-half amp must be >= this * 1st-half amp to count as a limit cycle
    ...overrides,
  };
}

// ============================================================================
// OBSERVABLE STRUCT -- what the EVALUATOR reads back from one run.
// Everything the critic scores against lives here. No opinions, just numbers.
// ============================================================================
export function runOnce(makeLBM, cfg) {
  const lbm = buildRun(makeLBM, cfg);
  const mass0 = measureMass(lbm);

  for (let s = 0; s < cfg.warmupSteps; s++) lbm.step();

  const uy = [];
  let uSum = 0, uN = 0;
  const total = Math.min(cfg.windowSteps, cfg.maxSteps - cfg.warmupSteps);
  for (let s = 0; s < total; s++) {
    lbm.step();
    uy.push(probeUy(lbm, cfg.probe.px, cfg.probe.py));
    uSum += measureU(lbm, cfg); uN++;
  }

  const U = uSum / Math.max(1, uN);
  const nu = nuOf(cfg.tau);
  const reMeasured = (U * cfg.cylinder.D) / nu;

  // split the window: a sustained limit cycle has 2nd-half amplitude >= 1st-half.
  // a decaying transient does not. this is what stops the loop mistaking a dying
  // wobble for onset.
  const half = uy.length >> 1;
  const amp1 = peakToPeak(uy.slice(0, half));
  const amp2 = peakToPeak(uy.slice(half));
  const wobblePct = (amp2 / Math.max(1e-12, U)) * 100;
  const sustained = amp2 >= cfg.sustainTol * amp1 && wobblePct > cfg.shedThresholdPct;

  const { crossings, strouhal } = frequency(uy.slice(half), U, cfg.cylinder.D);

  return {
    reMeasured,          // U_meas * D / nu -- measured, not nominal
    uMeasured: U,
    nu,
    D: cfg.cylinder.D,
    g: cfg.g,
    sheds: sustained,    // the verdict the bisection reads
    sustained,
    wobblePct,
    strouhal: sustained ? strouhal : null,
    oscillations: sustained ? crossings >> 1 : 0,
    massDrift: Math.abs(measureMass(lbm) - mass0),
    steps: cfg.warmupSteps + uy.length,
  };
}

function peakToPeak(a) {
  let lo = Infinity, hi = -Infinity;
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return hi - lo;
}

// zero-crossing count -> oscillation frequency -> Strouhal f*D/U.
function frequency(a, U, D) {
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  let crossings = 0;
  for (let i = 1; i < a.length; i++) {
    if ((a[i - 1] - mean) < 0 && (a[i] - mean) >= 0) crossings++;
  }
  const cyclesPerStep = crossings / a.length; // full cycles = up-crossings
  const strouhal = (cyclesPerStep * D) / Math.max(1e-12, U);
  return { crossings: crossings * 2, strouhal };
}

// ============================================================================
// BISECTION DRIVER -- the roundhouse for #1.
// PROPOSER supplies [gLo, gHi]. CRITIC validates the bracket before trusting
// it (lo must be steady, hi must shed) -- an invalid bracket kicks back rather
// than converging on garbage. Then hard numeric bisection on measured Re.
// ============================================================================
export function findOnset(makeLBM, { gLo, gHi, reTol = 1.0, maxRounds = 12, base = {} } = {}) {
  const run = (g) => runOnce(makeLBM, defaultConfig({ ...base, g }));

  const lo = run(gLo), hi = run(gHi);
  if (lo.sheds) return { ok: false, reason: "bracket-low-already-sheds -- lower gLo", lo };
  if (!hi.sheds) return { ok: false, reason: "bracket-high-does-not-shed -- raise gHi", hi };

  let a = gLo, b = gHi, aRes = lo, bRes = hi;
  const trace = [lo, hi];

  for (let r = 0; r < maxRounds; r++) {
    if (Math.abs(bRes.reMeasured - aRes.reMeasured) < reTol) break;
    const g = 0.5 * (a + b);
    const res = run(g);
    trace.push(res);
    if (res.sheds) { b = g; bRes = res; } else { a = g; aRes = res; }
  }

  // Re_c sits in the bracket; report the boundary and its width as the error bar.
  return {
    ok: true,
    reCritical: 0.5 * (aRes.reMeasured + bRes.reMeasured),
    reBracket: [aRes.reMeasured, bRes.reMeasured],
    strouhalAtOnset: bRes.strouhal,
    rounds: trace.length - 2,
    maxMassDrift: Math.max(...trace.map((t) => t.massDrift)),
    trace,
  };
}

// ============================================================================
// AUTO-BRACKET -- hand findOnset a VALIDATED [gLo, gHi] so the proposer never
// guesses. Scan g upward geometrically from a steady start until the first run
// sheds; keep the last-steady g as gLo and the first-shedding g as gHi.
//
// Fails HONESTLY rather than lying: if the flow crosses the lattice-Mach
// ceiling before it sheds, the "shedding" would be compressibility error, not
// physics -- so we refuse the bracket instead of feeding garbage to findOnset.
// ============================================================================
export function autoBracket(makeLBM, {
  gStart = 5e-6,   // low enough to sit steady
  growth = 1.6,    // geometric step per scan
  gMax = 2e-3,     // hard cap on the force knob
  uMax = 0.1,      // lattice-Mach guard: U above this (Ma ~0.17) is untrustworthy
  maxScans = 20,
  base = {},
} = {}) {
  const run = (g) => runOnce(makeLBM, defaultConfig({ ...base, g }));

  const first = run(gStart);
  if (first.sheds)
    return { ok: false, reason: "gStart-already-sheds -- lower gStart", first };
  if (first.uMeasured > uMax)
    return { ok: false, reason: "gStart-already-past-Mach-ceiling -- lower gStart or check units", first };

  let gLo = gStart, loRes = first, g = gStart;
  const trace = [first];

  for (let i = 0; i < maxScans; i++) {
    g *= growth;
    if (g > gMax)
      return { ok: false, reason: "hit-gMax-without-shedding -- geometry may not shed at this tau/grid", trace };

    const res = run(g);
    trace.push(res);

    if (res.uMeasured > uMax)
      return { ok: false, reason: "flow-crossed-Mach-ceiling-before-shedding -- raise tau or refine grid", trace };
    if (res.sheds)
      return { ok: true, gLo, gHi: g, reLo: loRes.reMeasured, reHi: res.reMeasured, scans: trace.length, trace };

    gLo = g; loRes = res; // still steady -- advance the low edge
  }
  return { ok: false, reason: "maxScans-exhausted-without-shedding", trace };
}
