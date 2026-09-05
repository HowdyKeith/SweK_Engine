// tools/roundhouse/zeroRangeSweep.mjs
//
// v2912 -- HUNTING EXACT ZEROS WHERE v2898 COULD NOT LOOK.
//
// v2898 swept the registry for suspicious exact zeros and found none unexplained: 92 error-like observables
// across 86 device/modes, every exact zero either absent or on the register with a reason. That result is true
// and it is narrower than it sounds, because the census builds every device AT ITS DEFAULTS.
//
// v2911 found what that misses. optics.airy grades rayleighFactor against the literal 1.22 while the true first
// ring is j(1,1)/pi = 1.21966989, and the ring position is quantised to the sampling grid. At the DEFAULT
// nSamples of 900 the error reads 7.11e-4 and looks perfectly healthy. Push nSamples to its clamp of 2001 and
// the grid spacing becomes exactly 0.002 in units of lambda/D, sample 610 lands exactly on 1.22, and the device
// reports airyRingErrFrac = 0. EXACTLY zero. Perfect agreement with a constant wrong in the fourth digit,
// invisible to a census that only ever asks the default question.
//
// So the zero was not absent. It was out of frame. This sweep moves the frame: for every live config knob, build
// the device across a range of values and check the error-like observables for exact zeros at EVERY point, not
// just the middle one.
//
// WHY THIS IS A DIFFERENT QUESTION FROM v2910'S. The response census asked "does this observable move at all?"
// and used one small step. This asks "does this observable ever hit exactly zero anywhere it can be driven?" and
// needs a RANGE. A quantity can respond healthily to its knob and still have a coincidental exact zero somewhere
// in that response -- airyRingErrFrac does exactly that, which is why v2910 did not catch it either.
//
// WHAT AN EXACT ZERO MEANS AND DOES NOT MEAN. It is not automatically a bug: eighteen entries on the register are
// legitimate, mostly exact rational arithmetic on dyadic values. What it means is that a number claiming to
// measure disagreement has found none WHATSOEVER, and in floating point that almost always indicates the two
// sides of the comparison share an origin. Every hit is a question, and the answer is either a sentence on the
// register or a defect.

import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { sweepDevice } from "./sweepDevice.mjs";   // v3313 -- the general sweep; this file used to carry its own
import { deviceModeTable } from "./deviceModes.mjs";   // v3211: DERIVED. MODES never existed here -- see deviceModes.mjs
import { EXACT_OK } from "./exactZeroRegister.mjs";
import { preRegister } from "./corroborate.mjs";

const ERRORLIKE = /err|error|residual|delta|deviation/i;
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * Values to try for one knob. Multiplicative, spanning two decades around the default, because a device's clamp
 * usually sits within that and the interesting coincidences happen AT the clamp -- which is exactly where the
 * airy zero lives. Integers are rounded and de-duplicated so a knob like `count: 5` does not get swept as 5,5,5.
 */
export function knobRange(value) {
    if (!isNum(value) || value === 0) return [0, 1e-3, 1];
    const factors = [0.1, 0.25, 0.5, 1, 2, 4, 10];
    const out = factors.map((f) => (Number.isInteger(value) ? Math.max(1, Math.round(value * f)) : value * f));
    return [...new Set(out)];
}

/**
 * v4477 -- TWO CHANGES, BOTH IN SERVICE OF THE POSITIVE CONTROL THIS SWEEP HAS LACKED SINCE v3313.
 *
 * `ranges` lets a caller replace the knob values for one device.mode.knob, keyed "device.mode.knob". It exists so
 * the control can run THIS FUNCTION over a sigma range containing no dyadic value and watch the hit disappear.
 * Without it the negative arm would have to re-implement the zero-detection, and a control made of a different
 * object than the instrument it certifies is not a control.
 *
 * Every hit now carries `effective` -- the value the device used -- beside `value`, the value it was asked for.
 * These differ at 5612 of the 17759 points this sweep visits. A hit reported "at sigma=2" against a clamp of 1
 * is a true statement about a build that never happened.
 */
export async function zeroRangeSweep({ modes = null, ranges = {}, knobs = null, verbose = false } = {}) {
    // v3211 -- BUILT, NOT LISTED, AND IT REFUSES AN EMPTY TABLE. A caller may still pass its own.
    if (!modes) modes = await deviceModeTable();
    const hits = [];
    let builds = 0, checked = 0;
    const coercion = { points: 0, answerable: 0, coerced: 0, collapsedRanges: 0, pointsLostToCollapse: 0 };

    for (const name of DEVICE_NAMES) {
        const ms = modes[name];
        if (!ms) continue;
        let dev;
        try { dev = await getDevice(name); } catch { continue; }

        for (const mode of ms) {
            let cfg;
            try {
                const def = dev.defaults ? dev.defaults({ mode }) : null;
                cfg = (def && def.config) ? def.config : {};
            } catch { continue; }
            let keys = Object.entries(cfg).filter(([, v]) => isNum(v)).map(([k]) => k);
            // v4477 -- `knobs` narrows which knobs are swept. The control needs to move sigma AND NOTHING ELSE:
            // isoRollDeviation reaches exactly zero through z and through f as well, so a run that sweeps every
            // knob cannot be read as a statement about sigma. Narrowing is the caller's, not this file's default.
            if (knobs) keys = keys.filter((k) => knobs.includes(k));

            // v3313 -- THE SWEEP LOOP IS NOW sweepDevice's, NOT THIS FILE'S. v3304 built the general instrument
            // that this file, shedOnset, defaultPlacementSweep and floorAtlas were each a hand-written instance
            // of; a general tool that nothing has replaced is a claim. This is one of the four cashed in.
            //
            // WHAT WAS DELETED HERE: a nested build loop with its own per-point try/catch. What is kept is the
            // part that is actually this file's question -- which fields are error-like, and which exact zeros
            // are on the register. The tool sweeps; the file still decides what a hit means.
            for (const key of keys) {
                const values = ranges[`${name}.${mode}.${key}`] || knobRange(cfg[key]);
                let sw;
                try { sw = await sweepDevice(name, mode, { knob: key, values, config: cfg }); } catch { continue; }
                // Totalled from the sweeps themselves, not recomputed from a second copy of the clamps.
                coercion.points += sw.coercion.points;
                coercion.answerable += sw.coercion.answerable;
                coercion.coerced += sw.coercion.coerced;
                if (sw.coercion.distinctEffective !== null && sw.coercion.distinctEffective < sw.coercion.distinctRequested) {
                    coercion.collapsedRanges++;
                    coercion.pointsLostToCollapse += sw.coercion.distinctRequested - sw.coercion.distinctEffective;
                }
                for (const pt of sw.points) {
                    const obs = pt.out;
                    if (pt.error || !obs || typeof obs !== "object") continue;
                    builds++;
                    for (const [f, val] of Object.entries(obs)) {
                        if (!ERRORLIKE.test(f) || !isNum(val)) continue;
                        checked++;
                        if (val !== 0) continue;
                        const regKey = `${name}.${mode}.${f}`;
                        hits.push({
                            device: name, mode, field: f, knob: key, value: pt[key],
                            // v4477 -- the value the DEVICE used. `value` is what it was asked for.
                            effective: pt.sweptAt.effective, coerced: pt.sweptAt.coerced,
                            registered: !!EXACT_OK[regKey],
                            reason: EXACT_OK[regKey] || null,
                        });
                    }
                }
            }
            if (verbose) console.log(`    ${name}.${mode}: ${builds} builds so far, ${hits.length} zeros`);
        }
    }

    // collapse: one row per device.mode.field, recording which knob values produced the zero
    const byField = new Map();
    for (const h of hits) {
        const k = `${h.device}.${h.mode}.${h.field}`;
        if (!byField.has(k)) byField.set(k, { ...h, at: [] });
        // A coerced point is written "requested->effective" so nothing reading this line can mistake the
        // label for the configuration. Before v4477 it printed the label alone.
        byField.get(k).at.push(h.coerced ? `${h.knob}=${h.value}->${h.effective}` : `${h.knob}=${h.value}`);
    }
    const rows = [...byField.values()];
    return {
        rows, builds, checked, coercion,
        unregistered: rows.filter((r) => !r.registered),
        summary: {
            builds, checked, coercion,
            zeroFields: rows.length,
            unregistered: rows.filter((r) => !r.registered).length,
            registerSize: Object.keys(EXACT_OK).length,
        },
    };
}

/**
 * PRE-REGISTERED before the sweep ran.
 *
 * Prediction A -- POSITIVE CONTROL. The sweep must find optics.airy.airyRingErrFrac = 0. v2911 established it
 * exists at the nSamples clamp of 2001, and knobRange takes nSamples up to 9000, which clamps there. If the
 * sweep misses a zero known to be present, it is not measuring what it claims and nothing else it reports counts.
 *
 * Prediction B -- THE ACTUAL BET. The sweep finds at least one FURTHER unregistered exact zero, somewhere other
 * than optics.airy. Reasoning: the mechanism behind the airy zero is not exotic. A rounded answer key plus a
 * quantised estimator plus a clamp is three ordinary things, and this lab has 92 error-like observables, many of
 * them located on grids. If B fails, the airy case was a genuine one-off and the census's default-only frame is
 * cheaper than I think.
 */
export const ZERO_RANGE_REGISTRATION = preRegister({
    quantity: "unregistered exact zeros found by sweeping knob ranges rather than defaults",
    claim: { findsAiryZero: true, additionalUnregisteredZeros: 1 },
    rationale: "v2911 found airyRingErrFrac = 0 exactly at the nSamples clamp, invisible at the default. The " +
        "mechanism -- rounded key, grid-quantised estimator, clamp landing on a round number -- is made of " +
        "ordinary parts, so predicting at least one more elsewhere. The airy zero itself is the positive " +
        "control: a sweep that misses a zero already known to exist is measuring nothing.",
});

export function zeroLines(z) {
    const L = [`zero range sweep -- ${z.summary.builds} builds, ${z.summary.checked} error-field readings`];
    L.push(`  exact zeros: ${z.summary.zeroFields} field(s), ${z.summary.unregistered} NOT on the register (${z.summary.registerSize} entries)`);
    for (const r of z.rows) {
        L.push(`  ${r.registered ? "ok " : "!! "}${r.device}.${r.mode}.${r.field}  at ${r.at.slice(0, 4).join(", ")}${r.at.length > 4 ? " ..." : ""}`);
        if (r.reason) L.push(`        registered: ${r.reason}`);
    }
    return L;
}
