// tools/roundhouse/seedSpread.mjs
//
// v3534 -- THE INSTRUMENT WAS A FUNCTION INSIDE A GATE, HARDCODED TO ONE DEVICE, ONE MODE, ONE FIELD AND ONE
// SEED LIST -- WHICH IS WHY NOBODY COULD ASK IT OF ANYTHING ELSE.
//
// v3513 built `relSpread` inside seedSpread-selfcheck.mjs to test a sealed pre-registration about ising, and it
// worked: the claim passed by 3.4x more than it asked for while its stated MECHANISM was refuted by the same
// instrument. Then it stayed in the gate. SIX OTHER DEVICES IN THIS LAB ARE STOCHASTIC -- hmc, langevin,
// tempering, wolff, percolation, inference -- AND NONE OF THEM HAS EVER BEEN ASKED THE QUESTION, because the
// only thing that could ask it was welded to ising/order/magnetisation.
//
// *** AND THE EXTRACTION IS NOT TIDYING. IT IS WHAT LET v3534 MEASURE THE THING THAT CLOSED ising. *** The
// register's recorded fix for a stochastic device -- "the test is that the SEED SPREAD shrinks as 1/sqrt(N),
// not that the value settles" -- had never been run. Run, it holds away from Tc and FAILS AT Tc, which is the
// only place ising's knob lives. An instrument nobody can point at a second subject is an instrument that
// cannot refute its own prescription.
//
// EVERYTHING IS A PARAMETER: device, mode, field, seeds, and the config sweep. Nothing here knows what ising
// is. THE CALLER SAYS WHAT TO VARY AND WHAT TO WATCH, which is what makes the same call answer the question
// for six devices that have never been asked.
import { getDevice } from "./devices.mjs";

/** A DECLARED seed set rather than a magic list. Widened from v3513's six because six seeds put the noise floor
 *  on a spread estimate at roughly 1.8x, and a finding that has to clear its own noise wants room above it. */
export const DEFAULT_SEEDS = [12345, 777, 31337, 9, 20260724, 4242, 101, 55555, 8675309, 271828, 1618, 31415];

/**
 * Relative spread of one observable across seeds: sd / |mean|.
 *
 * RELATIVE AND NOT ABSOLUTE, because the quantity being watched may be any magnitude and the question is
 * always "how much does the answer wander compared to the answer", never "how many units".
 */
export async function relSpread(deviceName, { mode, field, config = {}, seeds = DEFAULT_SEEDS } = {}) {
    const dev = await getDevice(deviceName);
    const vals = [];
    for (const seed of seeds) {
        const out = await dev.build({ mode, config: { ...config, seed } });
        const v = out ? out[field] : undefined;
        if (typeof v !== "number" || !Number.isFinite(v)) {
            throw new Error(`${deviceName}/${mode}.${field} is not a finite number at seed ${seed} -- ` +
                            `a spread over a field the device does not report would be a confident zero`);
        }
        vals.push(v);
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    return { mean, sd, rel: Math.abs(mean) > 0 ? sd / Math.abs(mean) : Infinity, values: vals, seeds: seeds.length };
}

/**
 * Does the spread shrink as 1/sqrt(N)?
 *
 * *** THE STATISTIC IS rel * sqrt(N), AND IT IS FLAT IF THE CLAIM HOLDS. *** Comparing consecutive ratios
 * against sqrt(2) invites reading noise as a trend; a quantity that should be CONSTANT is read at a glance and
 * its drift is a single number. THE CLAIM IS A SHAPE, NOT A PAIR OF POINTS.
 *
 * `sweepKey` is the config field carrying N -- named by the caller, because which knob means "more sampling"
 * is a fact about the device and guessing it is how a census ends up measuring the wrong parameter.
 */
export async function sqrtNScaling(deviceName, { mode, field, sweepKey, values, config = {}, seeds = DEFAULT_SEEDS } = {}) {
    const rows = [];
    for (const n of values) {
        const r = await relSpread(deviceName, { mode, field, seeds, config: { ...config, [sweepKey]: n } });
        rows.push({ n, rel: r.rel, stat: r.rel * Math.sqrt(n), mean: r.mean });
    }
    const stats = rows.map((r) => r.stat);
    const lo = Math.min(...stats), hi = Math.max(...stats);
    return {
        rows,
        // THE SPAN IS THE VERDICT AND THE TREND IS THE DIAGNOSIS: a flat-but-noisy statistic and one that
        // climbs are different findings, and only the second says the sampling is making things WORSE.
        span: lo > 0 ? hi / lo : Infinity,
        firstToLast: stats[0] > 0 ? stats[stats.length - 1] / stats[0] : Infinity,
        stats,
    };
}

/** Which devices could even be asked -- a device whose build ignores `seed` has no spread to measure. */
export async function respondsToSeed(deviceName, { mode, field, config = {}, a = 1, b = 2 } = {}) {
    const dev = await getDevice(deviceName);
    const x = (await dev.build({ mode, config: { ...config, seed: a } }))?.[field];
    const y = (await dev.build({ mode, config: { ...config, seed: b } }))?.[field];
    // A DEVICE THAT IGNORES THE SEED RETURNS A SPREAD OF EXACTLY ZERO, and zero spread reads as a perfect
    // result rather than as a question nobody asked -- v3177's shape, a check that passes because nothing
    // happens. This is the guard that tells the two apart.
    return { a: x, b: y, responds: Number.isFinite(x) && Number.isFinite(y) && !Object.is(x, y) };
}
