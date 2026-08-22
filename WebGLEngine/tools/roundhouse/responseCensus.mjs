// tools/roundhouse/responseCensus.mjs
//
// v2910 -- WHICH NUMBERS ACTUALLY DEPEND ON ANYTHING.
//
// Open item 2 has read "planted-error floors for the other 19 devices" since v2893, which measured 5 and found
// one broken observable. One in five is a high enough hit rate that leaving nineteen unmeasured is the largest
// remaining unknown about this lab. The obstacle was always that planting an error means knowing each device's
// physics, and there are 24 of them.
//
// THE WAY ROUND IT. Every device exposes defaults() -> { mode, config } with a config of numeric knobs. That is
// a uniform, per-device statement of what the device believes its own inputs are. So the error can be planted
// generically: perturb ONE config key by a known relative amount, rebuild, and see which observables move. No
// physics knowledge required, and the device itself supplies the list of things that ought to matter.
//
// WHAT THE SWEEP IS LOOKING FOR, IN TWO DIRECTIONS:
//
//   INERT OBSERVABLES -- a number that moves for NO config key. It cannot be a measurement of this system,
//   because nothing you can tell the system changes it. Some are legitimately constants (a theoretical value the
//   device prints for comparison, like Onsager's Tc) and those must be registered as such; anything else that
//   comes back inert is a finding.
//
//   DEAD KNOBS -- a config key that moves NO observable. The device advertises an input it does not use. That is
//   the v2906 liveness problem again, arriving from the other side: there, an unwired knob faked a perfect
//   invariance; here it fakes a configurable device.
//
// WHY 1e-3 AND NOT SOMETHING SMALLER. v2908 found that optics.rayleighFactor is quantised to its sampling grid,
// so perturbations below the grid spacing move nothing at all. A floor sweep run at 1e-12 would have reported
// half the lab inert and been measuring its own step size. 1e-3 is large enough to clear plausible quantisation
// and small enough to stay in the linear regime of most physics. It is a choice, it is stated, and the sweep
// records the step it used so a later round can vary it rather than inherit it.

import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { deviceModeTable } from "./deviceModes.mjs";   // v3211: DERIVED. MODES never existed here -- see deviceModes.mjs
import { preRegister } from "./corroborate.mjs";

export const STEP = 1e-3;

/**
 * Observables that are SUPPOSED to be inert: theoretical constants the device reports for comparison. Registered
 * explicitly, with the reason, exactly as EXACT_OK registers legitimate exact zeros -- so that "inert" can be a
 * finding rather than a category everyone has learned to ignore.
 */
export const INERT_OK = {
    onsagerTc: "the exact Onsager critical temperature 2/ln(1+sqrt2); a constant printed for comparison",
    slopeTheory: "Kepler's third-law exponent 3/2, the analytic value the measured slope is graded against",
    escapeTheory: "the analytic escape velocity sqrt(2GM/r), the answer key for escapeV",
    deltaTheory: "Feigenbaum's constant 4.6692016, an answer key",
    exact: "a closed-form value carried alongside its numerical estimate",
};

const isNum = (x) => typeof x === "number" && Number.isFinite(x);

function perturbed(value) {
    // Relative step where it is meaningful, absolute where the value is zero. Integers are stepped by at least 1
    // so that a grid count or an iteration budget actually changes -- a 0.1% change to `steps: 200` truncates
    // back to 200 and would have looked like a dead knob.
    if (value === 0) return STEP;
    const p = value * (1 + STEP);
    if (Number.isInteger(value)) return value + Math.max(1, Math.round(Math.abs(value) * STEP));
    return p;
}

export async function responseCensus({ modes = null, verbose = false } = {}) {
    // v3211 -- BUILT, NOT LISTED, AND IT REFUSES AN EMPTY TABLE. A caller may still pass its own.
    if (!modes) modes = await deviceModeTable();
    const rows = [];
    for (const name of DEVICE_NAMES) {
        const ms = modes[name];
        if (!ms) continue;
        let dev;
        try { dev = await getDevice(name); } catch { continue; }

        for (const mode of ms) {
            let base, cfg;
            try {
                const def = dev.defaults ? dev.defaults({ mode }) : null;
                cfg = (def && def.config) ? def.config : {};
                base = await dev.build({ mode });
            } catch { continue; }
            if (!base || typeof base !== "object") continue;

            const keys = Object.entries(cfg).filter(([, v]) => isNum(v)).map(([k]) => k);
            const obsKeys = Object.entries(base).filter(([, v]) => isNum(v)).map(([k]) => k);
            // respondsTo[observable] = [config keys that move it]
            const respondsTo = Object.fromEntries(obsKeys.map((k) => [k, []]));
            const movedBy = Object.fromEntries(keys.map((k) => [k, []]));

            for (const key of keys) {
                let pert;
                try { pert = await dev.build({ mode, config: { ...cfg, [key]: perturbed(cfg[key]) } }); }
                catch { continue; }
                if (!pert) continue;
                for (const o of obsKeys) {
                    const a = base[o], b = pert[o];
                    if (!isNum(b) || !Object.is(a, b)) { respondsTo[o].push(key); movedBy[key].push(o); }
                }
            }

            const inert = obsKeys.filter((o) => respondsTo[o].length === 0);
            const deadKnobs = keys.filter((k) => movedBy[k].length === 0);
            rows.push({
                device: name, mode, keys, obsKeys, respondsTo, movedBy,
                inert, deadKnobs,
                inertUnregistered: inert.filter((o) => !INERT_OK[o]),
            });
            if (verbose) console.log(`    ${name}.${mode}: ${inert.length}/${obsKeys.length} inert, ${deadKnobs.length}/${keys.length} dead knobs`);
        }
    }

    const all = rows.flatMap((r) => r.obsKeys.map((o) => ({ device: r.device, mode: r.mode, field: o, n: r.respondsTo[o].length })));
    return {
        rows, step: STEP,
        summary: {
            deviceModes: rows.length,
            observables: all.length,
            inert: all.filter((x) => x.n === 0).length,
            inertUnregistered: rows.reduce((a, r) => a + r.inertUnregistered.length, 0),
            knobs: rows.reduce((a, r) => a + r.keys.length, 0),
            deadKnobs: rows.reduce((a, r) => a + r.deadKnobs.length, 0),
        },
    };
}

/**
 * PRE-REGISTERED before the sweep ran.
 *
 * Prediction A: at least 5% of numeric observables come back inert. Reasoning: v2905 counted 417 observables of
 * which many are echoed configuration, flags and theoretical constants, and v2908 showed at least one graded
 * quantity is quantised coarsely enough to ignore small inputs.
 *
 * Prediction B, the specific one: optics.airy's rayleighFactor does NOT respond to a 1e-3 perturbation of
 * lambda. v2908 established it is a function of which sample index wins, and lambda scales the sampling window
 * along with the pattern, so the winning index should not move. If it DOES respond, my v2908 account of that
 * observable was wrong and the quantisation reading needs revisiting.
 */
export const RESPONSE_REGISTRATION = preRegister({
    quantity: "inert-observable fraction across the lab, and rayleighFactor's response to lambda",
    claim: { inertFraction: 0.05, rayleighRespondsToLambda: false },
    rationale: "v2908 showed rayleighFactor is quantised to the sampling grid and bit-identical across " +
        "wavelength; a 1e-3 lambda step rescales window and pattern together and should not move the winning " +
        "index. The 5% figure is a floor, not an estimate -- registering a number I would be embarrassed to " +
        "miss rather than one I am confident of.",
});

export function responseLines(c) {
    const s = c.summary;
    return [
        `response census -- ${s.deviceModes} device/modes, step ${c.step}`,
        `  observables: ${s.observables}, of which ${s.inert} respond to NO config key`,
        `  of those, ${s.inertUnregistered} are NOT registered as legitimate constants`,
        `  config knobs: ${s.knobs}, of which ${s.deadKnobs} move nothing the device reports`,
    ];
}
