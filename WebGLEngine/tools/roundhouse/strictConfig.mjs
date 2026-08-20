// tools/roundhouse/strictConfig.mjs
//
// v3366 -- THE FAILURE MODE THAT COST THIS SESSION MORE THAN ANY OTHER.
//
// SEVEN TIMES a config key was passed to something that did not have it, was SILENTLY IGNORED, and the run
// completed with plausible numbers that looked like a physics result:
//
//   swapRule    for accept        tempering  -- correct and planted runs returned IDENTICAL marginals
//   sigmaWRONG  for sigmaLik      inference  -- the overconfidence case never fired
//   stepFn      for step          langevin   -- three planted errors all "undetected"
//   workFn      for workInc       langevin   -- same run, same silence
//   msdFn       for wrapMSD       diffusion  -- the wrapped-MSD bug appeared to be caught by nothing
//   n           for count         rmt        -- rectangleLevels built an empty spectrum
//   mu          for m1/m2         twobody    -- and this one nearly caused a CORRECT tool to be discarded,
//                                              because the bad measurement looked like a refutation of it
//
// Every one produced a null result wearing the costume of a finding. The last is the worst: a working
// perturbation filter was one step from being thrown away on the strength of a measurement that never ran.
//
// THE FIX IS CHEAP BECAUSE THE DEVICES ALREADY DECLARE THEIR KNOBS. 44 of 54 devices return a config from
// defaults(), so an unknown key is decidable by comparison -- no new bookkeeping, just checking what is already
// written down.
//
// WHY IT REPORTS RATHER THAN THROWS BY DEFAULT: some devices legitimately accept keys their defaults do not
// list -- `planted` for a planted-error switch, `stations` for a route, `soundSpeed` for a Tait run. Those are
// real and a hard rejection would break them, so unknown keys are RETURNED and the caller decides. strictBuild
// is the opt-in that turns the report into an error, and it is what a measurement script should use.

import { getDevice } from "./devices.mjs";

/**
 * Keys a device accepts that its defaults() does not list. Registered rather than guessed, so adding one is a
 * visible decision instead of a silent widening of what counts as valid.
 */
export const EXTRA_KEYS = {
    planted: "the planted-error switch, deliberately absent from defaults so a default run is never planted",
    stations: "a route or tour's list of radii -- a list, not a scalar knob",
    soundSpeed: "hydrostatic's Tait sound speed, varied per run rather than defaulted",
    coupling: "an injectable coupling function for planted-error runs",
    step: "an injectable integrator for planted-error runs",
    workInc: "an injectable work accumulator for planted-error runs",
    accept: "an injectable swap rule for planted-error runs",
    sigmaLik: "inference's likelihood sigma, set per run to create the overconfidence case",
    runIndex: "which recorded run of a replayed experiment to use",
    D: "an injectable device parameter used by several modes",
};

/** Config keys a device would silently ignore. Empty means every key given is one it declares or accepts. */
export async function unknownKeys(deviceName, mode, config = {}) {
    let d; try { d = await getDevice(deviceName); } catch { return { error: "no such device: " + deviceName }; }
    const def = d.defaults ? d.defaults({ mode }) : null;
    const declared = new Set(Object.keys((def && def.config) || {}));
    if (!declared.size) return { undeclarable: true, keys: [] };
    const keys = Object.keys(config).filter((k) => !declared.has(k) && !EXTRA_KEYS[k]);
    return { undeclarable: false, keys, declared: [...declared] };
}

/**
 * Build a device and REFUSE a config key it does not declare.
 *
 * This is the call a measurement script should make. Every one of the seven silent failures above would have
 * thrown here instead of returning a plausible number, and the one that mattered most -- `mu` on twobody --
 * would have been a one-line error instead of a near-discarded tool.
 */
export async function strictBuild(deviceName, mode, config = {}) {
    const u = await unknownKeys(deviceName, mode, config);
    if (u.error) throw new Error(u.error);
    if (!u.undeclarable && u.keys.length) {
        throw new Error(
            `${deviceName}/${mode}: config key(s) ${u.keys.join(", ")} are not declared by this device and would ` +
            `be SILENTLY IGNORED. Declared: ${u.declared.join(", ")}`);
    }
    const d = await getDevice(deviceName);
    return d.build({ mode, config });
}

/**
 * v3456 -- THE MIRROR DEFECT: READ BUT NOT DECLARED.
 *
 * unknownKeys compares a passed config against a device's DECLARED defaults, so it catches a key the device
 * would silently IGNORE. It cannot catch the opposite -- a key the device READS and never advertises -- and that
 * direction bites harder, because this lab's own guard then blocks a working input.
 *
 *   blackhole/neutronstar read `cfg.nsMass || 1.4` with nsMass absent from its defaults. strictBuild THREW on a
 *   parameter the device supports, and the sensitivity scan never tried it, leaving seven derived observables
 *   sitting inert and looking like hardcoded constants.
 *
 *   lens/deflectSweep read `(h.config && h.config.bSweep) || 60`. It moves impactParameter and all three
 *   deflection error fractions, and strictBuild refused it.
 *
 * BOTH DIRECTIONS ARE ONE MISMATCH between what a device declares and what it reads, and the sensitivity matrix
 * surfaced both from opposite ends:
 *   DECLARED AND NOT READ  nuclear listed A and Z and hardcoded fissionQ(238, 92) -- a DEAD KNOB
 *   READ AND NOT DECLARED  blackhole and lens -- INERT OBSERVABLES, and a rejected key
 *
 * This finds the second kind by reading the bind source for cfg.X / config.X references no defaults() lists. It
 * is a TEXT SCAN and says so: a key read through a destructure or a computed property never appears as cfg.X, so
 * the count is a lower bound rather than a total.
 */
export const ENABLING_FLAGS = {
    planted: "the planted-error switch -- a default run must never be planted",
    dynamicIsco: "switches kerr to a numeric ISCO search in place of the closed form, which is the default key",
};

export function readButNotDeclared(bindSource, declaredKeys, extra = EXTRA_KEYS) {
    const read = new Set();
    for (const m of bindSource.matchAll(/\b(?:cfg|config|c)\.([A-Za-z_$][\w$]*)/g)) read.add(m[1]);
    return [...read].filter((k) =>
        !declaredKeys.includes(k) && !extra[k] && !ENABLING_FLAGS[k] && k !== "mode" && k !== "length");
}

/** Run the mirror check across every bind that declares a config. */
export async function mirrorAudit(deviceNames, getDevice, readFile) {
    const rows = [];
    for (const n of deviceNames) {
        let d; try { d = await getDevice(n); } catch { continue; }
        const def = d.defaults ? d.defaults({}) : null;
        const keys = Object.keys((def && def.config) || {});
        if (!keys.length) continue;
        for (const cand of [n, n[0].toUpperCase() + n.slice(1)]) {
            const src = readFile(`tools/roundhouse/${cand}Bind.mjs`);
            if (src == null) continue;
            rows.push({ device: n, declared: keys.length, undeclaredReads: readButNotDeclared(src, keys) });
            break;
        }
    }
    return { scanned: rows.length, offenders: rows.filter((r) => r.undeclaredReads.length), rows };
}

/** Which devices can be checked at all -- the ones that declare a config. */
export async function checkableDevices(names) {
    const out = { checkable: [], undeclarable: [] };
    for (const n of names) {
        let d; try { d = await getDevice(n); } catch { continue; }
        const def = d.defaults ? d.defaults({}) : null;
        (def && def.config && Object.keys(def.config).length ? out.checkable : out.undeclarable).push(n);
    }
    return out;
}
