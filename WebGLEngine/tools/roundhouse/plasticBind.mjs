// WebGLEngine/tools/roundhouse/plasticBind.mjs -- v3211
//
// PLASTICITY, WHOSE KEYS ARE THE TWO PARAMETERS THEMSELVES, RECOVERED FROM BEHAVIOUR.
//
// v3200 read all seventeen xpbd gates and found only four modules claiming anything checkable OUTSIDE the code:
// friction, volume, muscle and plastic. friction was graded at v3200; volume at v3201; MUSCLE WAS REFUSED because
// its key turned out to be a MIRROR. This is the last of the four.
//
// *** THE RULE THAT KILLED MUSCLE IS THE RULE THIS DEVICE HAS TO SATISFY: a key is EXTERNAL when the route that
// MEASURES the value is INDEPENDENT of the route that SET it. *** A declared parameter read back through the map
// that declared it is a mirror and grades nothing. So nothing here reads opts back. Every number below is
// recovered from what the material DOES:
//
//   "yield"     *** THE KEY IS yieldStrain, RECOVERED BY BISECTION. *** Stretch one constraint to a strain s and
//               ask only whether a permanent set appeared. Bisect on that yes/no and the boundary IS the declared
//               yield -- recovered to 2.8e-16 across yield = 0.02 to 0.35, in TENSION AND IN COMPRESSION.
//               *** AND THERE IS NO MOVING THRESHOLD HERE, WHICH IS THE DIFFERENCE FROM friction. *** friction's
//               bisection needed a 1e-3 "is it moving" line because a stuck particle still creeps 6e-19 of float
//               noise. Below yield a constraint's permanent set is EXACTLY ZERO -- not small, zero, because the
//               yield test is a BRANCH and not an accumulation. The bifurcation is told apart by KIND rather than
//               by SIZE, which is the volume device's lesson arriving from the other direction.
//   "creep"     THE SECOND KEY, BY REGRESSION. Only the excess beyond yield flows to permanent strain, at a rate
//               creep. Regressing the recovered set against the excess over six strains returns creep to 1.9e-16 --
//               and a SLOPE cannot be satisfied by getting one point right, which is what a single-strain check
//               would have asked for.
//   "cap"      THE CAP IS ATTAINED, NOT MERELY RESPECTED. plastic-selfcheck section 3 asserts the permanent strain
//               never EXCEEDS maxStrain -- a one-sided bound that a module which never yielded at all would pass
//               vacuously. Sustained overload here SATURATES on exactly maxStrain, bit-exact at 0.25, 0.5 and 1.0,
//               and stays there: the cap is measured against restOrig, so it cannot ratchet off its own output.
//   "creepFree" *** THE LOAD-BEARING NEGATIVE, AND IT IS md's alphaFree pointed at a different question. *** creep
//               decides HOW MUCH flows once the material yields. It must not decide WHETHER it yields. So the
//               onset is re-bisected across a creep sweep and the recovered yield must NOT MOVE. If it did, the
//               two parameters would be entangled, and the yield key above would be measuring a mixture of them
//               while still landing on a plausible number.
//
// THE SABOTAGE, WHERE THERE IS ONE, IS APPLIED HERE AND NEVER IN THE MODULE BEING GRADED. plastic.js is imported
// unchanged; creepFree varies a legitimate, exported parameter rather than editing anything.

import { applyPlasticity } from "../../physics/xpbd/plastic.js";

export const PLASTIC_OBSERVABLES = [
    "yieldKey", "yieldTension", "yieldCompression", "yieldWorstErrAbs", "yieldWorstBudgetUsed", "belowYieldExactlyZero",
    "creepKey", "creepRegressed", "creepErrAbs", "creepPoints",
    "capKey", "capAttained", "capErrAbs", "capRatchets",
    "creepFreeSpread", "creepFreeWorstBudgetUsed", "creepFreeFallsWithCreep", "creepFreeSamples",
];

/**
 * THE BUDGET IS DERIVED, NOT CHOSEN -- and it is the finding of this device.
 *
 * *** THE BISECTION CANNOT RECOVER THE YIELD EXACTLY, AND THE AMOUNT BY WHICH IT CANNOT IS PREDICTABLE. *** The
 * yield BRANCH fires at exactly yieldStrain, but what the bisection can SEE is a rest length that changed, and
 * rest0*(1 + creep*excess) is still exactly rest0 until creep*excess clears half an ULP. So the recovered onset
 * sits above the true yield by about eps/(2*creep) -- MEASURED at 98.8, 28.8 and 8.8 ULP for creep 0.05, 0.2 and
 * 0.5, which is that law to the accuracy the ULP floor allows.
 *
 * The extra 8 ULP is the handful of roundings that produce the strain itself (a sqrt, a subtract, a divide). It is
 * an allowance, not a fudge factor: worst observed usage of the whole budget is 0.96, so it is snug rather than
 * padded, and it is safe to be snug BECAUSE this module is +,-,*,/ and sqrt only -- every operation IEEE-exact,
 * the same bits on every machine, which plastic-selfcheck section 6 asserts directly.
 */
function resolutionBudget(yieldStrain, creep) {
    const ulp = Math.abs(yieldStrain) * Number.EPSILON;
    return Number.EPSILON / (2 * creep) + 8 * ulp;
}

const DEF = { yieldStrain: 0.1, creep: 0.5, maxStrain: 0.5 };
export const PLASTIC_MODES = ["yield", "creep", "cap", "creepFree", "tensiononly"];

export function plasticDefaults(cfg = {}) {
    const want = cfg && cfg.mode;
    return {
        mode: PLASTIC_MODES.includes(want) ? want : "yield",
        yieldStrain: (cfg && cfg.yieldStrain) || DEF.yieldStrain,
        creep: (cfg && cfg.creep) || DEF.creep,
        maxStrain: (cfg && cfg.maxStrain) || DEF.maxStrain,
    };
}

/**
 * Permanent strain left in ONE constraint of rest 1 after a single plasticity pass at elastic strain s.
 *
 * A FRESH CONSTRAINT EVERY TIME, deliberately: plasticity is history-dependent, so reusing one would make the
 * answer depend on the order the bisection happened to probe in, and the bisection would be measuring itself.
 */
function permanentSet(s, opts) {
    const c = [{ i: 0, j: 1, rest: 1, compliance: 0 }];
    const pred = Float64Array.from([0, 0, 0, 1 + s, 0, 0]);
    applyPlasticity(pred, c, opts);
    return (c[0].rest0 - c[0].restOrig) / c[0].restOrig;
}

/**
 * Bisect for the strain at which a permanent set first appears. sign = +1 tension, -1 compression.
 *
 * THE DISCRIMINANT IS `!== 0`, NOT `> tolerance`. Below yield the branch never runs and the set is identically
 * zero in a float, so there is no noise floor to clear and no threshold for anybody to have chosen. Bisecting
 * against a tolerance would have made the recovered value depend on the tolerance.
 */
function onsetStrain(opts, sign = 1) {
    let lo = 0, hi = sign;              // lo: no set. hi: a set, at a strain of magnitude 1
    for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (permanentSet(mid, opts) !== 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
}

const NONE = {
    yieldKey: -1, yieldTension: -1, yieldCompression: -1, yieldWorstErrAbs: -1, yieldWorstBudgetUsed: -1,
    belowYieldExactlyZero: -1,
    creepKey: -1, creepRegressed: -1, creepErrAbs: -1, creepPoints: -1,
    capKey: -1, capAttained: -1, capErrAbs: -1, capRatchets: -1,
    creepFreeSpread: -1, creepFreeWorstBudgetUsed: -1, creepFreeFallsWithCreep: -1, creepFreeSamples: -1,
};

export async function buildPlastic(args = {}) {
    const cfg = args.config || {};
    const d = plasticDefaults(cfg);
    const mode = args.mode || d.mode;
    const base = { yieldStrain: d.yieldStrain, creep: d.creep, maxStrain: d.maxStrain };

    if (mode === "creep") {
        // A SLOPE, NOT A POINT. Six strains above yield, regressed against the excess. Getting one strain right
        // is arithmetic; getting the slope right is the rule that only the EXCESS flows.
        // The cap lifted so it cannot clip the line being fitted: a cap inside the fitted range would flatten
        // the top of the line and the regression would return a creep smaller than the declared one, for a
        // reason that has nothing to do with creep.
        //
        // *** AND THIS SENTENCE IS ON ITS OWN LINE FOR A MEASURED REASON. *** It was a TRAILING comment, and
        // the gate hunting it through prose() could never match: prose() collects lines matching ^\s*// and a
        // trailing comment on a code line is invisible to it. A GATE THAT HUNTS A TRAILING COMMENT THROUGH
        // prose() IS A CONTROL THAT CANNOT FAIL -- the shape v3177 named.
        //
        // *** SETTLED IN v3298. *** That round did two things. prose() now reads TRAILING comments (string- and
        // regex-aware, so a `//` inside "http://x" or /a\/\/b/ is still not a comment), which closes the blind
        // spot that forced this sentence onto its own line -- 10591 characters of previously invisible prose
        // across 163 files. And tools/ship/proseAudit.mjs answers the open question: every prose assertion in
        // the tree is audited for TRIVIAL / INVISIBLE / MISDIRECTED / UNMATCHED, gated at zero.
        //
        // THE ANSWER WAS SMALLER THAN THIS NOTE FEARED, and that is worth saying plainly: all 37 prose
        // assertions are POSITIVE, so a blind spot made them FAIL loudly rather than pass silently. Nothing was
        // vacuous. The shape was one `!` away from a silent pass, which is why the audit exists rather than a
        // one-line fix -- and the audit promptly caught the same failure in its OWN gate, which had begun by
        // hunting a phrase that lived only in a string literal.
        const opts = { ...base, maxStrain: 50 };
        const xs = [], ys = [];
        for (const s of [0.15, 0.2, 0.25, 0.3, 0.35, 0.4]) { xs.push(s - opts.yieldStrain); ys.push(permanentSet(s, opts)); }
        const n = xs.length;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
        const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        return { ...NONE, creepKey: opts.creep, creepRegressed: slope, creepErrAbs: Math.abs(slope - opts.creep), creepPoints: n };
    }

    if (mode === "cap") {
        // ATTAINED AND HELD. 500 passes at a strain far past yield: the permanent strain must land ON the cap and
        // stay there. A cap taken against the CURRENT base rather than the original would grow by (1+cap) every
        // pass and never settle -- so "does it stop moving" is the observable, not "is it under the line".
        // *** THE CONFIGURED CAP WAS NOT IN THIS SWEEP AND THE MODE IGNORED ITS OWN KNOB. *** The list was a
        // hardcoded [0.25, 0.5, 1.0] and capAttained returned out[1] -- the 0.5 run -- so config.maxStrain of
        // 0.3, 0.75 or anything else reported 0.5 and an error of 0. A KNOB THAT DOES NOT MOVE THE ANSWER is a
        // mode in name only (v3194) and it makes lab-export's config column a lie: a record re-run from itself
        // would return numbers the config did not produce. FOUND BY GOING TO JUSTIFY THIS MODE'S EXACT ZERO ON
        // THE EXACT_OK REGISTER, which only came back to life when the MODES repair let census-selfcheck run.
        const out = [];
        let ratchets = 0;
        for (const mx of [...new Set([base.maxStrain, 0.25, 0.5, 1.0])]) {
            const opts = { ...base, maxStrain: mx };
            const c = [{ i: 0, j: 1, rest: 1, compliance: 0 }];
            let last = 0;
            for (let k = 0; k < 500; k++) {
                const pred = Float64Array.from([0, 0, 0, 10, 0, 0]);
                applyPlasticity(pred, c, opts);
                const tp = (c[0].rest0 - c[0].restOrig) / c[0].restOrig;
                if (k > 5 && tp !== last) ratchets++;      // after the first few passes it must be BIT-STILL
                last = tp;
            }
            out.push({ mx, tp: last });
        }
        const worst = Math.max(...out.map((o) => Math.abs(o.tp - o.mx)));
        const mine = out.find((o) => o.mx === base.maxStrain);
        return { ...NONE, capKey: base.maxStrain, capAttained: mine.tp, capErrAbs: worst, capRatchets: ratchets };
    }

    if (mode === "creepFree") {
        // THE LOAD-BEARING NEGATIVE. creep must not move the yield. Same shape as md's alphaFree: vary the
        // parameter that has no business affecting the answer, and demand the answer not move.
        //
        // *** BUT IT DOES MOVE, AND THAT IS THE BETTER RESULT. *** The offset FALLS AS 1/creep, which is the
        // signature of a float RESOLUTION limit and not of an entanglement: a creep that genuinely fed the yield
        // DECISION would move the onset in a way that grew, or wandered, and certainly would not shrink as the
        // parameter grew. So the negative is graded two ways -- inside a budget DERIVED from eps, and FALLING.
        const cs = [0.05, 0.2, 0.5, 0.9, 2.0];
        const found = cs.map((cr) => onsetStrain({ ...base, creep: cr }));
        const offs = found.map((f) => Math.abs(f - base.yieldStrain));
        const used = offs.map((o, i) => o / resolutionBudget(base.yieldStrain, cs[i]));
        let falling = 1;
        for (let i = 1; i < offs.length; i++) if (offs[i] > offs[i - 1]) falling = 0;
        return { ...NONE, yieldKey: base.yieldStrain, yieldTension: found[2],
                 creepFreeSpread: Math.max(...found) - Math.min(...found),
                 creepFreeWorstBudgetUsed: Math.max(...used),
                 creepFreeFallsWithCreep: falling, creepFreeSamples: cs.length };
    }

    // "yield" -- THE BIFURCATION, RECOVERED IN BOTH DIRECTIONS ACROSS A SWEEP.
    // The module's own gate exercises TENSION only (one constraint stretched to strain 0.3). The compression
    // branch is a separate `sign` path in the same function and nothing had ever run it.
    // *** v3902 -- `tensiononly` IS THE PLANT, AND IT IS THE BLIND SPOT THIS MODE WAS BUILT TO CLOSE. ***
    // The comment directly above records it: the module's own gate stretches ONE constraint in tension, "the
    // compression branch is a separate `sign` path in the same function and NOTHING HAD EVER RUN IT". The
    // plant puts the lab back in that state -- it probes the compression onset with sign = +1, so the device
    // measures tension twice and calls one of them compression.
    //
    // A `reader` plant: applyPlasticity is untouched, the bisection is untouched, and the material still
    // yields at exactly the strain it should in both directions. WHAT IS CORRUPTED IS WHICH DIRECTION GETS
    // LOOKED AT -- and the recovered compression onset comes back at +y instead of -y, so the sweep's worst
    // |c + y| becomes 2y rather than ~1e-16.
    const sweep = [0.02, 0.05, 0.1, 0.2, 0.35];
    const compressionSign = mode === "tensiononly" ? 1 : -1;
    let worst = 0, tension = 0, compression = 0;
    for (const y of sweep) {
        const opts = { ...base, yieldStrain: y };
        const t = onsetStrain(opts, 1), c = onsetStrain(opts, compressionSign);
        worst = Math.max(worst, Math.abs(t - y), Math.abs(c + y));
        if (y === base.yieldStrain) { tension = t; compression = c; }
    }
    if (!tension) { const o = { ...base }; tension = onsetStrain(o, 1); compression = onsetStrain(o, compressionSign); }
    // EXACTLY ZERO, right up to the boundary -- including one ULP short of it, where a leaky yield would show.
    let allZero = 1;
    for (const s of [0, 0.01, 0.05, 0.099, base.yieldStrain * (1 - Number.EPSILON)]) if (permanentSet(s, base) !== 0) allZero = 0;
    return { ...NONE, yieldKey: base.yieldStrain, yieldTension: tension, yieldCompression: compression,
             yieldWorstErrAbs: worst, belowYieldExactlyZero: allZero };
}

export const plasticDevice = {
    name: "xpbd-plastic-yield",
    modes: PLASTIC_MODES,
    observables: PLASTIC_OBSERVABLES,
    build: buildPlastic,
    defaults: plasticDefaults,
    // `yieldWorstErrAbs` -- the only observable of this mode that is a finite number in BOTH arms and means the
    // same thing in each. `yieldTension` is bit-identical under the plant (the tension path is untouched) and
    // `belowYieldExactlyZero` is a boolean, which the census reports as DECLARED BUT DEAD.
    // *** THE OTHER THREE MODES COULD NOT CARRY THIS. *** creep, cap and creepFree report their findings in
    // observables that read -1 -- the NONE sentinel -- in every other mode, so a cross-mode comparison against
    // them measures a sentinel turning into a number, which is not an observable getting worse.
    // v4128 -- RELABELED. plantMode/plantFlips are both declared and plantMode is in this device's own modes
    // list, so plantedCoverage.mjs's declaredPlantMode()/probeModePlant() path takes this device BEFORE the
    // reader path ever runs and grades it as a mode-plant regardless of the label here -- MEASURED,
    // yieldWorstErrAbs 2.78e-16 -> 0.70 under mode "tensiononly". "reader" was the label for a mechanism this
    // device does not use.
    plantMode: "tensiononly", plantFlips: "yieldWorstErrAbs", plantKind: "mode",
};
