// tools/roundhouse/modeDistinct.mjs -- v4190
//
// *** THE RULE THIS TREE STATES MOST OFTEN AND HAS NEVER CHECKED ACROSS THE LAB. ***
//
// Every device that declares modes says some version of the same sentence: "each was verified to produce a
// DISTINCT answer before being declared -- A BRANCH THAT CHANGED NOTHING WOULD BE A MODE IN NAME ONLY"
// (v3194). Individual selfchecks do check their own. NOTHING CHECKED IT REGISTRY-WIDE, and the reason is
// structural rather than an oversight: deviceModes.mjs, the mode census, NEVER CALLS build(). It reads
// declarations. A declaration cannot tell you whether two names run the same experiment.
//
// WHAT A DUPLICATE PAIR COSTS, and it is not correctness -- in every case found at v4190 the numbers are
// right, because the device computes all its observables in one run and hands the same bag to several names:
//   - the mode count overstates how many distinct experiments the lab has, which is the number v3174 cared
//     about and the number deviceModes-selfcheck reports;
//   - the census builds redundant arms, paying for readings it already has;
//   - and the dangerous case, which is why this is a gate rather than a report: IF A PLANT MODE EVER READS
//     IDENTICAL TO ITS BASELINE, THE PLANT APPEARS TO FIRE AND CHANGES NOTHING. That is v3806's flip2d
//     lesson exactly -- a validator silently reverted the plant, both arms read the same number, and the
//     plant fired at nothing. No such pair exists today and this gate is what keeps it that way.
//
// *** WHAT THIS CANNOT SEE, STATED SO A CLEAN RESULT IS NOT READ AS MORE THAN IT IS. *** Two modes may differ
// in something that is not in the output bag. freeSurfaceBind's `vessels` and `depth` return byte-identical
// observables and are NOT duplicates: its defaults() gives them DIFFERENT CLAIMS (gapEnvelope against
// depthErrFrac), so the mode selects which observable is adjudicated rather than what is computed. A pair
// like that is legitimate and is baselined with that reason rather than counted as a fault.
//
// Honest arm, default config. Comparison is on the OBSERVABLE CONTENT with `kind` and `mode` dropped, because
// a device that echoes its own mode name back would otherwise look distinct while computing nothing new --
// the echo problem knobLiveness had to solve at v4031, in a new place.

/** JSON of one build's observables, with the device's own mode echo removed. */
function shapeOf(out) {
    if (!out || typeof out !== "object") return null;
    const { kind, mode, ...rest } = out;
    return JSON.stringify(rest);
}

/**
 * Every pair of declared modes that returns identical observables.
 *
 * *** BUDGETED, AND WHAT IT COULD NOT AFFORD IS REPORTED RATHER THAN SKIPPED IN SILENCE. *** Some devices are
 * expensive -- twof is 92.5s PER BUILD, measured -- so a sweep that simply omitted them would report "no
 * duplicates" over a set it never opened. A ZERO MEANS "NONE FOUND IN WHAT WAS OPENED", NEVER "NONE"
 * (knobLiveness v4042's rule), so `unreached` is a first-class result and the gate asserts on it.
 *
 * @returns {{ pairs, checked, unreached, threw }}
 */
export async function duplicateModes(D, { budgetMs = 8000, only = null } = {}) {
    const pairs = [], checked = [], unreached = [], threw = [];

    for (const name of D.DEVICE_NAMES) {
        if (only && !only.includes(name)) continue;
        let dev;
        try { dev = await D.getDevice(name); } catch { continue; }
        if (!dev || !Array.isArray(dev.modes) || dev.modes.length < 2) continue;

        const deadline = Date.now() + budgetMs;
        const shapes = new Map();
        let ranOut = false;
        for (const mode of dev.modes) {
            if (Date.now() > deadline) { ranOut = true; break; }
            let out;
            try { out = await dev.build({ mode }); }
            catch { threw.push(`${name}:${mode}`); continue; }
            const s = shapeOf(out);
            if (s !== null) shapes.set(mode, s);
        }
        // A device whose modes were not all built cannot be said to have no duplicates among them.
        if (ranOut || shapes.size < dev.modes.length) { unreached.push(name); continue; }

        checked.push(name);
        const ms = [...shapes.keys()];
        for (let i = 0; i < ms.length; i++) {
            for (let j = i + 1; j < ms.length; j++) {
                if (shapes.get(ms[i]) === shapes.get(ms[j])) {
                    pairs.push({ device: name, a: ms[i], b: ms[j],
                                 involvesPlant: dev.plantMode === ms[i] || dev.plantMode === ms[j] });
                }
            }
        }
    }
    return { pairs, checked, unreached, threw };
}

/** "device:a==b", the stable key the baseline is written in. */
export const pairKey = (p) => `${p.device}:${p.a}==${p.b}`;
