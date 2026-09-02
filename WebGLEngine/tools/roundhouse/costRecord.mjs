// tools/roundhouse/costRecord.mjs -- v4080
//
// *** WHAT EACH BUILD ACTUALLY COST, MEASURED AND KEPT, BECAUSE A RAW-CALL COUNT IS NOT A COST MODEL. ***
//
// corroborationCensus.mjs's decline logic (v4037) already asks a device what it costs before starting it, via
// the OPTIONAL `costHint` a device may declare -- but as of v4038a only one device in the lab (twof) declares
// one, so the decline check does nothing for the other 128. The obvious next move is to derive a hint from a
// number the census already counts for every device: `rawCalls`, the libm-call tripwire corroborationCensus.mjs
// carries for a completely different reason (portability). It was proposed, measured, and refused. MEASURED ON
// THIS MACHINE, one build of each device's named mode, timed directly (not read from a census log -- see the
// contention warning below for why that distinction matters):
//
//     kuramoto.curve       19396 ms   353,976,576 calls      54.8 ms/Mcall
//     twof.inlet           92078 ms   108,192,309 calls     851.1 ms/Mcall
//     stability.response   16355 ms     3,430,000 calls    4768.2 ms/Mcall
//
// kuramoto makes 3.3x MORE libm calls than twof and costs 4.75x LESS wall time -- and stability, with the
// FEWEST calls of the three by two orders of magnitude, is the MOST expensive per build. Not a weak predictor
// -- an ANTI-predictor at the extremes: ms-per-Mcall spans 87x between kuramoto and stability alone in this
// sample (4768.2 / 54.8), and a scheduler that ranked these three by rawCalls would put kuramoto LAST when it
// is in fact the cheapest of the three by a wide margin. A call counter cannot price the work a build does
// BETWEEN calls -- SPH neighbour search and an energy-conservation sweep (stability), an LBM lattice update
// (twof) -- which is exactly what those two devices spend most of their time on and kuramoto barely touches.
// rawCalls is blind to that by construction, so a fitted proxy built on it would be precise and wrong.
//
// *** SO THE RECORD IS THE MEASUREMENT ITSELF, WHICH IS THE THING A FITTED PROXY WAS ONLY EVER APPROXIMATING.
// *** corroborationCensus already produces (device, mode, ms) for every build a complete run makes. Keeping
// that costs nothing extra and is strictly better than any model of it: it needs no coefficients, it cannot be
// wrong about a device whose cost is unlike its neighbours', and it improves automatically every time the
// census is re-frozen.
//
// THREE THINGS IT IS NOT, STATED SO IT IS NOT MISTAKEN FOR THEM:
//
//   NOT PHYSICS. Nothing here can change a reported number. A cost record is consulted to decide whether to
//   ATTEMPT a build, never to decide what one means, and every consumer must behave identically with the file
//   absent -- which is the state of a fresh checkout on a machine nobody has frozen it on.
//
//   NOT PORTABLE. These are milliseconds on whoever ran the freeze, and kuramoto once read 1044 s in a
//   contended census log against 28 s measured directly, so `frozenOn` records the conditions and a reader is
//   entitled to distrust them.
//
//   *** AND THE DOMINANT VARIANCE IS NOT OTHER PROCESSES, WHICH TOOK A MEASUREMENT TO SEE. *** twof.inlet, at
//   one unchanging config, timed 115.7 s and 117.0 s and then 205.0, 207.7 and 212.5 s. The split is not
//   instrumented against bare -- 115.7 and 212.5 are BOTH instrumented -- and the freeze that produced 212.5
//   ran alone on an idle machine. The split is FIRST HEAVY BUILD IN A FRESH PROCESS against everything after
//   it: the eighty devices the census builds beforehand leave a heap that makes an LBM run take almost twice
//   as long.
//
//   *** THAT MAKES THIS A RECORD OF COST IN CENSUS POSITION, AND THAT IS THE RIGHT QUANTITY. *** A budget
//   needs to know what a device will cost WHEN THE SWEEP REACHES IT, not what it costs alone in a fresh
//   process. So the 212.5 s here is the useful number and the isolated 115.7 s is the misleading one -- which
//   is the opposite of the conclusion the isolated measurement invited, and the reason this paragraph exists.
//
//   *** AND THE REPEATABILITY WAS MEASURED TOO, BECAUSE "DISTRUST THEM" IS NOT A NUMBER. *** The paragraphs
//   above are all about how far a cost can move, and they are worth little without the other bound: how far
//   it moves when nothing changes. quantum's sweep cost was frozen at 100481 ms and then re-measured, alone
//   and in the same position, at 100264 ms -- 0.2 % apart. SO THE NOISE FLOOR AT FIXED POSITION IS TENTHS OF
//   A PERCENT AND EVERY LARGE DISCREPANCY IN THIS FILE'S HISTORY WAS POSITION OR CONTENTION, NEVER JITTER.
//   That is what makes the 1.9x and 15x readings above diagnosable instead of just noisy: a lab whose
//   repeat measurements disagreed by 50 % could not have told any of those stories.
//
//   AND ACROSS MACHINES THE RELATIVE ORDER IS STILL GOOD (main's v4080 note, kept because the
//   paragraphs above only bound the ABSOLUTE numbers): a reader is entitled to distrust the
//   milliseconds while still trusting which device is dearer than which, and a scheduling
//   decline needs nothing more than that order.
//
//   NOT A RATCHET. corroboration-reach-baseline.json exists to catch a number FALLING and says so. This one
//   carries no assertion at all: a device getting slower is news about the device, not a regression in the
//   record, and pinning costs with === would fire on every machine that is not the one that froze it.

// v4173 -- the host scale, imported rather than re-estimated. See scaledCostFor below.
import { hostScale } from "../ship/hostScale.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const COST_BASELINE = path.join(HERE, "device-cost-baseline.json");

/** The whole record, or an empty one. A MISSING FILE IS NORMAL and never an error. */
export function readCostRecord(file = COST_BASELINE) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return { frozenOn: null, costs: {} }; }
}

/**
 * Measured milliseconds for one device/mode at its DEFAULT config, or null.
 * *** null MEANS UNKNOWN AND NEVER MEANS FREE. *** A caller that treated a missing entry as zero would
 * schedule the most expensive unmeasured device first, which is precisely backwards.
 */
export function costFor(device, mode, rec = null) {
    const r = rec || readCostRecord();
    const v = r && r.costs && r.costs[device + "." + mode];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * *** THE SAME COST, IN THE UNITS OF THE MACHINE THAT IS ABOUT TO SPEND THE TIME. ***
 *
 * v4173. This file's own header has said since v4038a that a frozen cost is "milliseconds on the machine that
 * froze it", and corroborationCensus compares that number against a deadline being consumed on WHATEVER BOX
 * IS RUNNING. Those are different clocks, and nothing was converting between them.
 *
 * *** AND THE EVIDENCE I FIRST GAVE FOR THIS WAS A COINCIDENCE, WHICH MEASURING IT PROPERLY EXPOSED. ***
 * The record prices twof's three modes at 458.9 s; Keith's run took 943.1 s; 943.1/458.9 = 2.055, and the
 * measured host scale for his box is 2.05. That looked like proof. It was not. Running the census here TO
 * COMPLETION for the first time measured twof at 712.7 s ON THE MACHINE THAT FROZE THE RECORD -- so the
 * record is STALE BY 1.55x locally, and Keith's box is 1.32x slower than this one for that device. 1.55 x
 * 1.32 = 2.05. TWO ERRORS COMPOUNDING LANDED EXACTLY ON THE HOST FACTOR BY LUCK.
 *
 * So the conversion below is still right -- a frozen cost and a live deadline genuinely are different clocks
 * -- but the number that seemed to prove it was measuring something else. THE BIGGER DEFECT IS THAT THE
 * RECORD IS STALE, and no scaling fixes a hint that was wrong about its own machine before it travelled.
 *
 * hostScale() is already the tree's answer to "how much slower is this machine", and it has been sitting one
 * directory away being used by the budget system and by nothing else. A SECOND ESTIMATE OF HOST SPEED WOULD
 * HAVE BEEN THE WRONG FIX: this reads the one that exists.
 *
 * Falls back to the unscaled cost if the scale cannot be read, because a missing scale is 1.0 by that
 * module's own definition and an unscaled hint is exactly what the caller had before.
 */
export function scaledCostFor(device, mode, rec = null, scale = null) {
    const base = costFor(device, mode, rec);
    if (base === null) return null;
    let s = scale;
    if (!Number.isFinite(s)) { try { s = hostScale().scale; } catch { s = 1; } }
    return base * (Number.isFinite(s) && s > 0 ? s : 1);
}

/**
 * Freeze a set of { device, mode, ms } observations. WRITTEN ONLY FROM AN EXPLICIT FREEZE, following
 * corroborationReach's convention (SWEK_FREEZE_CORROBORATION_REACH=1): a gate reads by default and records
 * only when asked, so it stays a gate rather than becoming a gate and a report at once (capabilityCard-
 * selfcheck's rule). This file's own convention is SWEK_FREEZE_DEVICE_COST=1, checked in
 * corroborationCensus-selfcheck.mjs beside the sweep that already produces the numbers to freeze.
 */
export function writeCostRecord(pairs, { file = COST_BASELINE, note = "" } = {}) {
    const costs = {};
    for (const p of pairs) {
        if (!p || typeof p.ms !== "number" || !Number.isFinite(p.ms)) continue;
        costs[p.device + "." + p.mode] = p.ms;
    }
    const body = {
        frozenOn: new Date().toISOString(),
        note: note || "milliseconds per build at DEFAULT config, on the machine that froze this. Scheduling only.",
        entries: Object.keys(costs).length,
        costs,
    };
    fs.writeFileSync(file, JSON.stringify(body, null, 1));
    return body;
}

/**
 * *** v4049 -- AND THE COST OF SWEEPING A DEVICE IS NOT DERIVABLE FROM THE COST OF BUILDING IT. ***
 *
 * The exhaustive sweep budgets each device by formula: sum(modeCosts) x 2 x (1 + 3K), being plant states, a
 * base build, and three ladder rungs per knob. v4048's echo confirmation broke that. Proving a TRUE echo
 * costs up to K-1 extra builds, so the worst case becomes 1 + 3K^2 -- for K=10 that is 31 -> 301, tenfold --
 * but only echo-heavy devices pay anything at all, and a FALSE echo usually breaks on the first knob tried.
 *
 * MEASURED, five devices with K between 6 and 9, as a multiple of sum(modeCosts):
 *
 *     invariants  K=7    2.5x        seismic     K=8    6.7x
 *     thermostat  K=6   19.5x        acoustics   K=7   23.1x
 *     centrifuge  K=9   82.3x
 *
 * *** A 33x SPREAD ACROSS NEARLY IDENTICAL KNOB COUNTS. *** The formula yields 38-56x over that range, so it
 * OVER-budgets invariants by fifteenfold and UNDER-budgets centrifuge by half -- wrong in both directions at
 * once, and the second direction is what produced 142 unanswered rows. What varies is how echo-heavy a device
 * is, which is exactly the thing a coefficient cannot know in advance.
 *
 * So sweep cost is MEASURED and kept, on the same terms as build cost and for the same reason v4040 refused
 * to model cost from rawCalls: when a proxy spans two orders of magnitude, the measurement is the model.
 */
export function sweepCostFor(device, rec = null) {
    const r = rec || readCostRecord();
    const v = r && r.sweepCosts && r.sweepCosts[device];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * *** THE MEASURED STALENESS OF THIS RECORD, WHICH IS ONE DEVICE'S AND IS SAID SO. ***
 *
 * v4173 re-ran the census to completion on the machine that froze the record and measured twof at 712.7 s
 * against the 458.9 s stored for it: the record is stale by 1.553x locally, and no host scaling fixes a hint
 * that was already wrong about its own machine. That is the ONLY measured staleness figure the tree has, from
 * ONE device, and applying it lab-wide is an assumption rather than a measurement. It is stated here rather
 * than folded silently into a margin so a later round can measure the other 115 and replace it.
 */
export const RECORD_STALENESS = 712.7 / 458.9;

/**
 * *** A BUDGET FOR SWEEPING NAMED DEVICES, READ FROM THE RECORD INSTEAD OF TYPED. ***
 *
 * v4352, backlog #40. The sweep half of this file was ORPHANED AT BOTH ENDS. sweepCostFor() has been exported
 * and documented since v4051 -- "when a proxy spans two orders of magnitude, the measurement is the model" --
 * with ZERO call sites anywhere in the tree; writeSweepCosts() likewise, so there was no path to refresh what
 * 4.79 hours of measurement bought. And where the BUILD half got scaledCostFor at v4173 because "a frozen
 * cost and a live deadline are different clocks", the sweep half never got the conversion.
 *
 * Meanwhile the gate that runs the sweeps carried NINE HAND-TYPED ROUND NUMBERS. Measured against the record
 * they are inconsistent by three orders of magnitude -- and the interesting one is not the waste:
 *
 *     compose      200 s budget,   0.3 s measured   729.9x over
 *     galaxy       120 s budget,   0.4 s measured   322.6x over
 *     blackhole    200 s budget,  29.5 s measured     6.8x over
 *     quantum      120 s budget, 100.6 s measured     1.2x over   <-- 19% headroom
 *
 * One device was given seven hundred times what it needs and another nineteen percent. A round number cannot
 * be wrong in a way anybody notices, which is the whole argument for reading the record instead.
 *
 * *** WHAT THIS BUYS IS NOT SPEED. *** An over-provisioned budget costs no wall time when the sweep finishes
 * early -- it caps, it does not spend. What it costs is the ability to NOTICE: a 730x budget cannot tell that
 * a device became a hundred times slower, so the cut that would have said so never happens. A derived budget
 * is a claim about that device, and a claim can be falsified.
 *
 * *** AND IT FAILS CLOSED. *** A device with no sweep record returns ms: null and names itself in `unmeasured`
 * rather than falling back to a number. A silent guess is exactly what the typed budgets already were, and
 * replacing nine of them with one would not be progress. The caller decides what to do about an unknown
 * device; this reports that it is unknown.
 *
 * @param devices  one device name or a list of them -- the budget is per-device in knobLiveness, so a list
 *                 returns the largest rather than the sum: the loop guards each device against `budgetMs`
 *                 separately, and summing would hand the dearest device the whole group's allowance.
 * @returns { ms, measured, unmeasured, worst, scale, headroom, why }
 */
export function sweepBudgetFor(devices, { rec = null, scale = null, headroom = RECORD_STALENESS * 1.3 } = {}) {
    const names = (Array.isArray(devices) ? devices : [devices]).map((d) => String(d || ""));
    const r = rec || readCostRecord();
    let s = scale;
    if (!Number.isFinite(s)) { try { s = hostScale().scale; } catch { s = 1; } }
    if (!(Number.isFinite(s) && s > 0)) s = 1;
    const measured = [], unmeasured = [];
    for (const n of names) {
        const v = sweepCostFor(n, r);
        if (v == null) unmeasured.push(n); else measured.push({ device: n, ms: v });
    }
    // THE LARGEST, NOT THE SUM -- see @param devices. knobLiveness resets its per-device stopwatch inside the
    // loop (v4044's "THE BUDGET IS CUMULATIVE PER DEVICE"), so the number it wants is what the dearest of the
    // group needs, and a sum would be the right answer to a question nobody is asking.
    const worst = measured.length ? measured.reduce((a, b) => (a.ms >= b.ms ? a : b)) : null;
    const ms = worst ? Math.round(worst.ms * s * headroom) : null;
    return {
        ms, measured, unmeasured, worst, scale: s, headroom,
        why: !worst
            ? `no sweep cost on record for ${names.join(", ")} -- freeze one before budgeting it`
            : `${worst.device} measured ${(worst.ms / 1000).toFixed(1)} s, x${s} host, x${headroom.toFixed(2)} ` +
              `headroom (${RECORD_STALENESS.toFixed(3)} measured staleness, 1.3 slack)`,
    };
}

/**
 * The same, for a caller that must have a number: the derived budget where the record has one, and an
 * explicitly-passed floor where it does not. Separate from sweepBudgetFor so that "I accepted a fallback" is
 * a thing the CALLER wrote down rather than something the record quietly did on its behalf.
 */
export function sweepBudgetOr(devices, floorMs, opts = {}) {
    const b = sweepBudgetFor(devices, opts);
    if (b.ms != null && b.ms >= floorMs) return { ...b, ms: b.ms, floored: false };
    return { ...b, ms: floorMs, floored: true,
             why: b.ms == null ? b.why + `; caller's floor of ${floorMs} ms used`
                               : b.why + `; below the caller's floor of ${floorMs} ms, floored` };
}

/**
 * Freeze measured exhaustive-sweep costs. Separate from writeCostRecord because they are measured by a
 * different run -- build cost comes from corroborationCensus, sweep cost from knobLiveness --- and merging
 * them into one freeze would mean neither could be refreshed without paying for both.
 *
 * `atLeast` marks a device that did NOT complete inside the budget it was given: its true cost is unknown and
 * above this figure, which is a bound and must never be read as a measurement.
 */
export function writeSweepCosts(entries, { file = COST_BASELINE } = {}) {
    const rec = readCostRecord(file);
    rec.sweepCosts = rec.sweepCosts || {};
    rec.sweepAtLeast = rec.sweepAtLeast || {};
    for (const e of entries) {
        if (!e || typeof e.ms !== "number" || !Number.isFinite(e.ms)) continue;
        if (e.complete) { rec.sweepCosts[e.device] = e.ms; delete rec.sweepAtLeast[e.device]; }
        else { rec.sweepAtLeast[e.device] = e.ms; delete rec.sweepCosts[e.device]; }
    }
    rec.sweepFrozenOn = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(rec, null, 1));
    return rec;
}

/** The devices worth knowing about: the ones a budget will trip over. */
export function dearest(rec = null, n = 10) {
    const r = rec || readCostRecord();
    return Object.entries((r && r.costs) || {})
        .sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([k, ms]) => k + " " + (ms / 1000).toFixed(1) + " s");
}
