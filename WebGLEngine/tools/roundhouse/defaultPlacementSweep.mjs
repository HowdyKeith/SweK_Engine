// tools/roundhouse/defaultPlacementSweep.mjs
//
// v2918 -- IS THE DEFAULT WHERE THE ANSWER LOOKS BEST?
//
// This lab has now found four separate numbers whose impressive agreement came from where a parameter sits
// rather than from the physics:
//
//   v2911  optics.airy   -- the sampling grid lands on the rounded 1.22 at the nSamples clamp, and the graded
//                           error reads EXACTLY ZERO against a constant wrong in the fourth digit.
//   v2913  optics.slit   -- the same grid lands on the exact analytic 1 whenever (nSamples-1) divides by 4.
//   v2914  optics.edge   -- the peak search grid contains the rounded textbook 1.2172 exactly.
//   v2917  blackhole     -- escapeV rises monotonically with escRFar and CROSSES the theory value; the graded
//                           error is therefore minimised at the crossing, and the default sits on it.
//
// The first three are discretisation grids. The fourth is a PHYSICAL parameter, which is what makes it worth a
// census: the pattern is not a property of sampling, and twenty devices have never been looked at.
//
// THE SIGNATURE, STATED PRECISELY. Take a graded error field and a config knob. Move the knob down and up from
// its default. Three shapes are possible and only one is suspicious:
//
//   CONVERGING   the error falls as the knob refines and keeps falling. Normal, healthy, expected of any
//                resolution knob. The minimum sits at the extreme of the range, not at the default.
//   FLAT         the error does not move. The knob is irrelevant to this field (v2910 measured a lot of this,
//                and most of it is correct mode-scoping).
//   BASIN        the error is LOWEST AT THE DEFAULT and rises in both directions. That is the escRFar shape.
//                It means the reported agreement is a property of the parameter's placement, and refining in
//                either direction makes it worse.
//
// WHY A BASIN IS NOT AUTOMATICALLY A DEFECT, AND WHY THIS FILE REPORTS RATHER THAN ACCUSES. A basin can be
// legitimate: many numerical schemes have an optimal step where truncation error and rounding error trade off,
// and choosing that step is good engineering rather than fiddling. What makes escRFar different is that the
// underlying quantity is MONOTONE in the knob -- it crosses the answer rather than approaching it -- so there is
// no limit to converge to and no defensible reason to prefer 800. A census cannot tell those apart automatically.
// It can find the basins; a human has to read each one.

import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { deviceModeTable } from "./deviceModes.mjs";   // v3211: DERIVED. MODES never existed here -- see deviceModes.mjs
import { KEYED_RE } from "./corroborationCensus.mjs";
import { preRegister } from "./corroborate.mjs";

const isNum = (x) => typeof x === "number" && Number.isFinite(x);

/** Down and up from the default. Multiplicative, with integers kept integral. */
export function bracket(value) {
    if (!isNum(value) || value === 0) return null;
    const mk = (f) => (Number.isInteger(value) ? Math.max(1, Math.round(value * f)) : value * f);
    const lo = mk(0.5), hi = mk(2);
    if (lo === value || hi === value) return null;      // too small to bracket, e.g. an integer 1
    return { lo, hi };
}

/**
 * Classify one (mode, knob, errorField) triple from three measurements.
 *
 * Deliberately three points and not seven. A basin needs only "lower here than either side", the sweep has to
 * cross the whole lab, and v2912's seven-value range sweep did not finish in twenty minutes. Anything this flags
 * gets swept properly by hand -- that is what happened to escRFar.
 */
export function classifyPlacement(lo, mid, hi, { rel = 0.05 } = {}) {
    if (![lo, mid, hi].every(isNum)) return { verdict: "NON-FINITE" };
    const scale = Math.max(Math.abs(lo), Math.abs(mid), Math.abs(hi));
    if (scale === 0) return { verdict: "ALL-ZERO" };
    const spread = (Math.max(lo, mid, hi) - Math.min(lo, mid, hi)) / scale;
    if (spread < 1e-12) return { verdict: "FLAT" };
    // a basin: strictly lower in the middle, and by a margin worth reporting on both sides
    const dLo = (lo - mid) / scale, dHi = (hi - mid) / scale;
    if (dLo > rel && dHi > rel) {
        return { verdict: "BASIN", lo, mid, hi, riseLo: lo / mid, riseHi: hi / mid, spread };
    }
    if (mid < lo && hi < mid) return { verdict: "CONVERGING", lo, mid, hi, spread };
    if (mid > lo && hi > mid) return { verdict: "CONVERGING-DOWNWARD", lo, mid, hi, spread };
    return { verdict: "MONOTONE-OR-NOISY", lo, mid, hi, spread };
}

export async function defaultPlacementSweep({ modes = null, skip = {}, verbose = false } = {}) {
    // v3211 -- BUILT, NOT LISTED, AND IT REFUSES AN EMPTY TABLE. A caller may still pass its own.
    if (!modes) modes = await deviceModeTable();
    const rows = [];
    let builds = 0;

    for (const name of DEVICE_NAMES) {
        const ms = modes[name];
        if (!ms) continue;
        let dev;
        try { dev = await getDevice(name); } catch { continue; }

        for (const mode of ms) {
            if (skip[name] && skip[name].includes(mode)) continue;
            let base, cfg;
            try {
                const def = dev.defaults ? dev.defaults({ mode }) : null;
                cfg = (def && def.config) ? def.config : {};
                base = await dev.build({ mode }); builds++;
            } catch { continue; }
            if (!base) continue;

            // only graded errors matter: the signature is about a number that is COMPARED to something
            const errFields = Object.keys(base).filter((k) => isNum(base[k]) && KEYED_RE.test(k));
            if (!errFields.length) continue;

            for (const [knob, v] of Object.entries(cfg)) {
                if (!isNum(v)) continue;
                const br = bracket(v);
                if (!br) continue;
                let lo, hi;
                try {
                    lo = await dev.build({ mode, config: { ...cfg, [knob]: br.lo } }); builds++;
                    hi = await dev.build({ mode, config: { ...cfg, [knob]: br.hi } }); builds++;
                } catch { continue; }
                if (!lo || !hi) continue;

                for (const f of errFields) {
                    const c = classifyPlacement(Math.abs(lo[f]), Math.abs(base[f]), Math.abs(hi[f]));
                    if (c.verdict === "BASIN") {
                        rows.push({ device: name, mode, knob, field: f, defaultValue: v, ...c });
                        if (verbose) console.log(`    BASIN ${name}.${mode} ${f} vs ${knob}=${v}`);
                    }
                }
            }
        }
    }
    return { rows, builds };
}

/**
 * PRE-REGISTERED before the sweep ran.
 *
 * blackhole.escape/escRFar/escapeErrFrac is the known case and must be re-found -- it is the positive control,
 * and a sweep that misses a basin already demonstrated by hand is measuring nothing.
 *
 * The bet: AT LEAST ONE further basin, on a device outside optics and blackhole. Four instances have been found
 * by hand while looking at something else, in three devices out of twenty-four. Either the pattern is confined
 * to the two devices that happen to have been examined closely -- which would be a surprising coincidence given
 * how differently they were found -- or it is ordinary and the census will turn up more. Registering the second,
 * because the first is the comfortable answer and I have no evidence for it.
 */
// v2932 RESOLUTION (annotation only -- a frozen prediction is not mutated): refindsEscRFar was TRUE when this
// was registered (v2918), and the escRFar basin was re-found by the sweep exactly as predicted. v2932 then
// ADOPTED the escapeBudget fix (raised escSteps to the converged plateau), which DISSOLVED that basin along with
// the dt and escSteps basins -- they were all artefacts of the unconverged default. So the prediction was
// confirmed and then the underlying problem was fixed; the selfcheck now verifies the basin is GONE, which is
// the successor state to the prediction, not a contradiction of it.
export const PLACEMENT_REGISTRATION = preRegister({
    quantity: "graded errors minimised at their device default, lab-wide",
    claim: { refindsEscRFar: true, additionalBasinsOutsideOpticsAndBlackhole: 1 },
    rationale: "four parameter-placement agreements found by hand in three devices (v2911, v2913, v2914, v2917), " +
        "three of them discretisation grids and one physical. If the pattern is ordinary rather than a property " +
        "of the two devices examined closely, a three-point bracket around every default should find more. " +
        "Predicting at least one outside the devices already known to have it",
});

export function placementLines(s) {
    const L = [`default-placement sweep -- ${s.builds} builds, ${s.rows.length} basin(s)`];
    for (const r of s.rows) {
        L.push(`  BASIN ${r.device}.${r.mode}  ${r.field}  vs  ${r.knob} (default ${r.defaultValue})`);
        L.push(`      error rises ${r.riseLo.toFixed(1)}x below and ${r.riseHi.toFixed(1)}x above the default`);
    }
    return L;
}
