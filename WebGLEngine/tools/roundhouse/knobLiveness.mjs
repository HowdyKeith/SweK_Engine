// WebGLEngine/tools/roundhouse/knobLiveness.mjs
//
// A DECLARED KNOB AND A KNOB THAT DOES SOMETHING ARE NOT THE SAME THING, AND NOTHING WAS CHECKING THE SECOND.
//
// v3129's knobGate settled the first half of this question and settled it well: knobs are DERIVED from
// device.defaults({}) rather than typed, so a device declares its own dial by construction, and a knob the
// agent invents is NAMED back at it instead of silently kept. Its own header states the finding that made it
// necessary -- "AN UNDECLARED KNOB IS KEPT AND IGNORED ... THE AGENT IS NEVER TOLD ITS INSTRUCTION DID
// NOTHING."
//
// *** THE SAME SENTENCE IS TRUE OF A DECLARED KNOB THAT MOVES NOTHING, AND knobGate CANNOT SEE IT. *** A knob
// in the register is a knob the agent is invited to turn. If turning it changes no observable, the agent gets
// a clean run, a number, and a causal story about a change that did not happen -- which is knobGate's exact
// fault with the declaration the other way round. Being in the register is what makes it worse than an
// invented knob, not better: the invented one gets named.
//
// ================================================================================================================
// A KNOB DEAD IN ONE MODE IS NOT A DEAD KNOB, AND THE FIRST DRAFT OF THIS FILE GOT THAT WRONG
// ================================================================================================================
//
// defaults() returns ONE flat config for a device that may declare several modes, so a knob belonging to mode B
// is present in the register while mode A runs -- and probing only the default mode reports it dead. The first
// version of this probe did exactly that and reported EIGHT dead knobs on `quantum`. Every one was live:
// E and V0 in `tunnel`, omega in `osc`, steps and dt in `norm`, kpV0 and bandGridN in `bands`. THE NUMBER WAS
// NOT SLIGHTLY WRONG, IT WAS ENTIRELY AN ARTEFACT OF THE QUESTION, and it was believable enough to act on.
//
// So liveness is asked PER MODE and a knob is dead only when NO mode reads it. The per-mode detail is kept and
// reported rather than collapsed, because "live in bands and stencil, dead in the other five" is the shape a
// reader needs to know which run a knob applies to.
//
// *** AND THE SAME MISTAKE HAPPENED A SECOND TIME, ONE AXIS ALONG: THE PLANT. *** The corrected per-mode probe
// still built only the HONEST config, so a knob read solely on the planted branch read as dead. inspiral's
// `plantedPower` is exactly that -- `const ratePower = c.planted ? c.plantedPower : 3` -- and moving it under
// the honest build moves nothing BY CONSTRUCTION, while under the plant it moves eight observables. Reporting
// that as a dead knob would have been reporting a healthy plant as a defect, and the obvious "fix" would have
// been to delete the knob that makes the plant adjustable.
//
// Twice now the reading was entirely an artefact of the question. Liveness is therefore asked across
// (mode x plant state), and the axes are named in the row so a future third axis is a visible omission rather
// than a silent one.
//
// ================================================================================================================
// THREE THINGS THIS REPORTS SEPARATELY, BECAUSE COLLAPSING THEM WOULD LOSE THE ANSWER
// ================================================================================================================
//
//   LIVE       some observable moved. The knob is a cause.
//   REFUSED    the build threw. *** THIS IS LIVE. *** A knob that rejects a value is read by the code -- a
//              refusal is a response, and counting it as dead would mark the best-behaved knobs in the lab.
//   MOVES NOTHING   no observable moved at any probed value, in any probed mode or plant state -- INCLUDING a
//                   wide ladder of 1e-6x to 1e6x, run only for knobs the near ladder left still.
//
// *** THE WIDE LADDER EXISTS BECAUSE "FLAT NEARBY" AND "READ BY NOBODY" ARE NOT THE SAME CLAIM, AND THE NEAR
// LADDER CANNOT TELL THEM APART. *** galaxy.zeroTol feeds `Math.abs(v) < zeroTol` over a spectrum whose zero
// modes sit at 1e-16 and whose next eigenvalue is order 1: moving the tolerance by 50% cannot change the count
// and SHOULD NOT -- that gap is the same property structureFactor's absences are graded on, where any threshold
// between 1e-14 and 1 gives the identical verdict. A knob flat across fifteen orders of magnitude of margin is
// evidence the answer does not depend on it, which is the opposite of a defect. galaxy.maxHops (a loop bound
// past the graph's diameter) and box3d.hashTicks (a step count past settling) are the same shape.
//
// So a knob is reported still only when it survives BOTH ladders, and the report says which one it survived --
// because "insensitive over a measured margin" is a finding worth keeping and "moves nothing anywhere" is a
// different one.
//
// AND THE THIRD IS A MEASUREMENT, NEVER A DIAGNOSIS. Dead, saturated at an asymptote, and quantised below the
// step are three different conditions with the same reading, and this file reports the reading. xenon.highFlux
// was all three questions at once: it IS read (peakAfterScram(c.highFlux).hours), the peak time reaches its
// asymptote by phi ~ 5e17, and the search's own dt = 2 s grid quantises every flux above that onto the
// identical float. Calling that "dead" would have been wrong in a way that got the fix wrong too.
//
// *** THE MODE LIST IS A LOWER BOUND AND THAT LIMIT IS INHERITED. *** deviceModes probes a candidate list for
// devices that do not export `modes`, so a mode nobody guessed is a mode this census never enters -- and a knob
// live only there reads as moving nothing. The row carries modeSource so the reader can tell a device whose
// modes were READ from one whose modes were GUESSED. A census that hid that distinction would be claiming
// coverage it does not have.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEVICE_NAMES, getDevice } from "./devices.mjs";
import { deviceModeTable } from "./deviceModes.mjs";
import { costFor } from "./costRecord.mjs";

/**
 * The values tried for one knob. A knob is live as soon as ONE of them moves something -- the rest are skipped.
 *
 * *** v4033 -- A DEVICE MAY DECLARE ALTERNATIVES FOR A KNOB THAT HAS NO ORDERING. ***
 *
 * A string or a list has nothing to scale, and this census has always refused to invent an ordering for one --
 * correctly, because a made-up value tests the device's error handling instead of the knob. But refusing to
 * GUESS is not the same as being unable to ASK, and `compose` is the case that makes the difference plain: all
 * six of its knobs are strings, so the census could say nothing whatever about the one device in the lab that
 * consumes other devices. Its knobs are NAMES -- devA ranges over the registry, modeA over that device's
 * declared modes, keyA over its observables -- and that is a perfectly good set to perturb within. What was
 * missing was somewhere to write it down.
 *
 * So a device may export `knobChoices`, and the census uses it INSTEAD of the scaled ladder. Declared, never
 * inferred: the same move this lab already made for `modes` (v3191 -- probing a candidate list reported lbm as
 * a 29-mode device, because checkMode answers ok to any string when there is nothing to ask) and for
 * PLANT_STATES. A device that declares nothing stays unprobed and is still REPORTED as unprobed, because an
 * admission is not a measurement.
 */
export function probeValues(v, choices = null) {
    // Declared alternatives win outright -- including for numbers, where a device may know its own range
    // better than a blind 1.5x does. The current value is dropped: probing a knob at what it already is
    // measures nothing and would read as dead.
    //
    // *** v4035 -- THE DROP IS BY VALUE, NOT BY REFERENCE. *** `Object.is` compares arrays by identity, so a
    // declared choice written out with the same contents as the default is a DIFFERENT object and survived
    // the filter. That rung then moves nothing, and for a knob whose list holds one entry it is the only
    // rung -- a knob declared live reading dead, off a comparison that never looked at the numbers.
    if (Array.isArray(choices) && choices.length) {
        return choices.filter((x) => !sameValue(x, v));
    }
    if (typeof v === "boolean") return [!v];

    // *** v4035 -- AN ARRAY OF NUMBERS HAS A SCALING, AND SCALING IT IS NOT INVENTING AN ORDERING. ***
    // This census refuses to make up a value for a knob with no ordering, and that refusal was written for
    // STRINGS: there is no "1.5x" of "fcc". A list of numbers is not that case -- betas, temps, angles,
    // queries and levels are sample points, and multiplying them is exactly as principled as multiplying a
    // scalar. Eight of the lab's fifteen array knobs are sweep lists of this kind and every one of them read
    // "not probed" purely because the ladder had never been taught to step elementwise.
    //
    // *** AND FOR THE OTHER SEVEN THIS LADDER IS THE WRONG QUESTION, WHICH IS WHY knobChoices OUTRANKS IT
    // ABOVE. *** A rotation axis, a probability distribution and a normalised weight vector are all
    // SCALE-INVARIANT BY CONSTRUCTION: [1,2,3] and [1.5,3,4.5] are the same axis, and Shannon entropy does
    // not move when every frequency is multiplied by the same number. A blind elementwise ladder reports
    // those as dead, and it would be wrong in the exact shape this file has been wrong in four times already
    // -- the reading would be an artefact of the question. Such a device declares its own alternatives.
    if (Array.isArray(v)) {
        if (!v.length || !v.every((x) => typeof x === "number" && Number.isFinite(x))) return [];
        // *** AN ALL-ZERO ARRAY SCALES TO ITSELF, EXACTLY AS A ZERO SCALAR DOES. *** The scalar branch below
        // has carried `if (v === 0) return [1, 0.5, -1]` for that reason since this file was written, and the
        // array case is the same fact one dimension up: strokeMorph's `lineA` is the endpoint [0,0], and a
        // scaled ladder probes it at [0,0] three times and calls it dead. Offset instead.
        if (v.every((x) => x === 0)) return [v.map(() => 1), v.map(() => 0.5), v.map(() => -1)];
        return [v.map((x) => x * 1.5), v.map((x) => x * 0.5), v.map((x) => x * 8)];
    }

    if (typeof v !== "number" || !Number.isFinite(v)) return [];
    if (v === 0) return [1, 0.5, -1];
    // Scaled rather than replaced, so an integer knob stays in its own range and a physical one keeps its units.
    // 8x is included because a knob can be flat locally and bite further out -- xenon.highFlux is flat over
    // EVERY multiplier, which is what makes it a finding rather than a badly chosen step.
    return [v * 1.5, v * 0.5, v * 8];
}

/**
 * Liveness of one knob in one mode.
 * @returns { state: "live" | "refused" | "still", moved: string[] }
 *   `refused` IS live -- see the header. `moved` names the observables that changed, because a knob that moves
 *   one observable and a knob that moves twenty are different facts about the same yes.
 */
export async function probeKnob(device, mode, cfg, knob, base, extra = {}, deadline = Infinity) {
    const def = cfg[knob];
    let sawEcho = false, echoUnconfirmed = false;
    for (const alt of probeValues(def, choicesFor(device, knob))) {
        // *** v4032 -- THE DEADLINE IS CHECKED BEFORE EVERY BUILD, NOT ONLY BETWEEN KNOBS. ***
        // knobLiveness's budget guard sat in the knob loop, so ONE knob's ladder -- three full builds -- ran
        // unbounded once entered. optics is what showed it: its `converge` mode costs 7200/F Simpson
        // evaluations, the shipped default is already 3.5 s, and the near ladder's 8x rung on lambda is 1.85e9
        // evaluations. Three of those per plant state per mode is why optics NEVER PRODUCED A COMPLETED ROW in
        // any sweep this session -- it was not hanging, it was finishing, at a cost the survey had no way to
        // see coming.
        //
        // *** AND ONE BUILD IS STILL UNBOUNDED, WHICH IS STATED RATHER THAN PRETENDED AWAY. *** A build is
        // synchronous work; nothing here can interrupt one that has started. This turns 3N unbounded builds
        // per knob into at most one, which is what is actually achievable, and the row is marked so the
        // difference between "measured still" and "ran out of time" survives into the report.
        if (Date.now() > deadline) return { state: "budget-cut", moved: [] };
        let out;
        try { out = await device.build({ mode, config: { ...cfg, ...extra, [knob]: alt } }); }
        catch { return { state: "refused", moved: [] }; }
        // *** v4031 -- AN OBSERVABLE THAT IS THE KNOB HANDED BACK IS AN ECHO, NOT A RESPONSE. ***
        // Several binds publish their own config among their observables -- mpmstep does it with `steps` and
        // `dt`, and this round nearly added `nx` and `ny` to the same list before the census obligingly
        // reported nx as "live in freefall [1 observables]". The one observable was nx. A knob that reads
        // live off its own echo is worse than one that reads dead: dead invites a look and live closes the
        // question, so this census would have certified as answered the exact knob it had just been wrong
        // about. The rule is narrow on purpose -- an observable counts as an echo ONLY if it equalled the
        // default before AND equals the probe value after, which is the signature of a pass-through and of
        // nothing else. A real observable that merely happens to land on the probe value at one rung still
        // moves at the others.
        const echo = (o) => sameValue(base[o], def) && sameValue(out[o], alt);
        // *** v4048 -- AN ECHO IS CONFIRMED AGAINST A SECOND KNOB, BECAUSE "EQUALS THE INPUT" IS NOT THE SAME
        // AS "IS THE INPUT". ***
        //
        // v4031's rule discards an observable that equalled the default before and equals the probe value
        // after -- the signature of a pass-through. It is ALSO the signature of a computation whose
        // coefficient happens to be one. box3d/impulse reports speedAfter and speedIdeal, both j/m, and the
        // default mass IS 1 -- so both numerically equal j, both were discarded, and box3d.j read STILL in
        // the mode that applies it. THE RULE WRITTEN TO PREVENT FALSE LIVENESS WAS PRODUCING FALSE STILLNESS,
        // which is the worse of the two: a dead reading invites a look and this one hid a working knob.
        //
        // The discriminator is exact. A TRUE ECHO EQUALS THE KNOB WHATEVER ELSE CHANGES -- out.viscosity =
        // c.visc regardless of tau, T or dt. A computation that merely coincides diverges the moment another
        // knob moves: j/m stops equalling j as soon as density does anything. So a candidate echo costs ONE
        // extra build with a different knob perturbed, and only when an echo was seen at all.
        //
        // With no second knob to move, the candidate stays an echo -- the old behaviour, for a device that
        // cannot be asked the question.
        // A knob still in a mode is USUALLY INNOCENT: quantum's `bands` has no use for omega and never
        // mentions it. A DEAF knob is different in a way the output shows -- stability's `deafknob` reports
        // `viscosity: c.visc` while handing the solver the shipped value, so THE MODE ACKNOWLEDGES THE INPUT
        // AND THEN IGNORES IT. That is "a control that does nothing" exactly, and it is separable from "a
        // control this screen does not have". MEASURED: deafknob's output carries `viscosity`; quantum/bands
        // carries none of omega, E or V0.
        let echoKeys = Object.keys(base).filter(echo);
        if (echoKeys.length) {
            // *** EVERY OTHER KNOB IS TRIED, NOT THE FIRST ONE, AND THE FIRST DRAFT PICKED THE FIRST. ***
            // The confirming knob has to REACH the observable. box3d's config begins with `g`, and gravity
            // does not affect the speed a body has after an impulse -- only `density` does, by changing the
            // mass in j/m, and it is sixth in the list. One arbitrary knob proved nothing and box3d.j stayed
            // wrongly still. Which knob reaches which observable is not knowable in advance, so they are
            // tried in turn and the loop STOPS AT THE FIRST ONE THAT BREAKS THE IDENTITY.
            //
            // Cost is bounded and lands where it should: a FALSE echo usually breaks on an early knob, while
            // a TRUE echo pays the full O(K) to prove no knob can break it -- which is the right way round,
            // because proving a pass-through is a stronger claim than disproving one.
            const others = Object.keys(cfg).filter((k) => k !== knob && typeof cfg[k] === "number"
                && Number.isFinite(cfg[k]) && cfg[k] !== 0);
            let tried = 0;
            for (const other of others) {
                if (!echoKeys.length) break;
                // *** AND A CONFIRMATION CUT SHORT BY THE BUDGET IS RECORDED, NOT PASSED OFF AS A FINISHED
                // ONE. *** The loop respects the deadline, so under budget pressure echoKeys can keep entries
                // no knob was ever tried against -- which would reinstate exactly the false stillness this
                // change removes, silently and only when the sweep is rushed. Keeping them as echoes is the
                // right default by this file's own preference ("a knob that reads live off its own echo is
                // worse than one that reads dead: dead invites a look and live closes the question"), but an
                // UNCONFIRMED echo is a third state and the caller is told which it got.
                if (Date.now() > deadline) { echoUnconfirmed = tried < others.length; break; }
                tried++;
                let out2 = null;
                try { out2 = await device.build({ mode, config: { ...cfg, ...extra, [knob]: alt, [other]: cfg[other] * 1.5 } }); }
                catch { continue; }
                // survives as an echo only while it STILL equals the probe value with another knob moved
                echoKeys = echoKeys.filter((o) => sameValue(out2[o], alt));
            }
        }
        if (echoKeys.length) sawEcho = true;
        const isEcho = (o) => echoKeys.includes(o);
        const moved = Object.keys(base).filter((o) => !sameValue(base[o], out[o]) && !isEcho(o));
        if (moved.length) return { state: "live", moved, echoed: sawEcho, echoUnconfirmed };
    }
    return { state: "still", moved: [], echoed: sawEcho, echoUnconfirmed };
}

/**
 * Value equality, used both for dropping a probe rung that is not a change and for deciding whether an
 * observable MOVED.
 *
 * *** v4042 -- IT IS RECURSIVE NOW, AND SHALLOWNESS WAS CAUSING FALSE LIVENESS ACROSS THE LAB. *** probeKnob
 * compared observables with Object.is, which is REFERENCE equality for arrays and objects -- so a device that
 * reports one is rebuilt fresh on every call and compares unequal to itself. EVERY knob on such a device read
 * live, whatever it did.
 *
 * stability is where it surfaced: it reports `ratioLadder`, an array of {visc, ratio}, so `visc` read LIVE
 * even in `deafknob`, the mode built specifically to ignore it. MEASURED -- by Object.is, visc moves
 * `viscosity` and `ratioLadder`; by value it moves only `viscosity`, which is its own echo and discarded.
 * The plant was invisible twice over: once because the sweep stopped at the first live mode, and once because
 * an array observable made the deaf mode look live anyway.
 *
 * Object.is at the leaves rather than ===, because NaN is a real physics observable and NaN === NaN is false
 * while Object.is(NaN, NaN) is true. JSON.stringify would have been shorter and wrong for the same reason:
 * it renders NaN and Infinity both as null, so a NaN that became an Infinity would compare EQUAL.
 */
export function sameValue(a, b, depth = 0) {
    if (Object.is(a, b)) return true;
    if (depth > 6 || a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
        return a.length === b.length && a.every((x, i) => sameValue(x, b[i], depth + 1));
    }
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k], depth + 1));
}

/**
 * A device's declared alternatives for one knob, or null. `knobChoices` may be an object or a function of the
 * mode, because compose's valid modeA depends on which devA is set -- a device that knows that can say so.
 * ANYTHING THAT THROWS RESOLVES TO null, which means "no ordering declared" and never "nothing to find".
 */
export function choicesFor(device, knob, mode) {
    try {
        const kc = device && device.knobChoices;
        const table = typeof kc === "function" ? kc({ mode }) : kc;
        const v = table && table[knob];
        return Array.isArray(v) && v.length ? v : null;
    } catch { return null; }
}

/** The axes liveness is asked along. Named rather than implicit, so adding a third is a visible change. */
export const PLANT_STATES = [{ label: "", extra: {} }, { label: "planted", extra: { planted: true } }];

/** Values far outside the working range, tried ONLY for a knob the near ladder left still. */
export function wideValues(v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return [];
    return [v * 1e6, v * 1e-6, -v];
}

/**
 * The whole register, one row per device/knob.
 * @returns rows of { device, knob, kind, modeSource, probed[], live[], still[], movedMost, note }
 */
export async function knobLiveness({ only = null, budgetMs = 20000, exhaustive = false } = {}) {
    const MODES = await deviceModeTable();
    const names = only && only.length ? only : DEVICE_NAMES;
    const rows = [], notes = [];

    for (const name of names) {
        const modes = MODES[name];
        // No declared modes is not "every mode" -- deviceModes' own v3191 finding. Nothing to probe, said so.
        if (!modes || !modes.length) { notes.push(name + ": no modes declared, not probed"); continue; }
        let dev; try { dev = await getDevice(name); } catch { notes.push(name + ": would not load"); continue; }
        if (typeof dev.defaults !== "function") { notes.push(name + ": no defaults(), declares no knobs"); continue; }
        const modeSource = (Array.isArray(dev.modes) && dev.modes.length) ? "exported" : "probed";

        const acc = new Map();     // knob -> { kind, probed[], live[], still[], movedMost }
        // *** THE BUDGET IS CUMULATIVE PER DEVICE, AND THE FIRST VERSION GUARDED THE WRONG THING. *** It timed
        // only the BASE build -- one build out of (modes x knobs x values + 1) -- so a device costing 20 s per
        // build passed the guard and then ran unbounded. The cost of a census is what the census DOES, not what
        // its first step costs.
        // *** v4031 -- WHICH MODES WERE ENTERED IS PART OF THE READING, NOT BOOKKEEPING. *** See the note
        // below: without this the census could not say WHERE its coverage stopped, only that it had.
        const devStart = Date.now();
        let overBudget = false;
        const entered = [], declared = new Set(), unaffordable = [];
        for (const mode of modes) {
            if (overBudget) break;
            let def; try { def = dev.defaults({ mode }); } catch { continue; }
            const cfg = (def && def.config) || {};
            const m = (def && def.mode) || mode;

            // *** v4044 -- A BUDGET SMALLER THAN ONE BUILD BUYS NOTHING, AND SPENDING IT PROVES THAT SLOWLY.
            // ***
            // A probe needs at least two builds -- a baseline and one rung -- so a budget that cannot afford
            // two is spent entirely on a base build whose result is then thrown away. MEASURED: a sweep gave
            // twof 240 s, one build of it is ~212 s, and the run reported "OVER BUDGET at 240000 ms -- probed
            // 0 OF 3 DECLARED KNOBS" after four minutes of work that answered nothing.
            //
            // *** AND "OVER BUDGET, PROBED 0 OF 3" READS LIKE A SLOW DEVICE RATHER THAN AN IMPOSSIBLE
            // REQUEST. *** The cost record knows the difference and can say which it is BEFORE the time is
            // spent, naming the budget that would actually work. That is the record earning its keep on the
            // question it was built for -- what a device costs when the sweep reaches it.
            //
            // With no record there is no estimate and the mode is attempted exactly as before: an unknown
            // cost is not an excuse to skip work.
            const known = costFor(name, m);
            if (known != null && known * 2 > budgetMs) {
                unaffordable.push(m + " (one build ~" + Math.round(known / 1000) + " s)");
                continue;
            }
            entered.push(mode);
            for (const k of Object.keys(cfg)) declared.add(k);
            for (const ps of PLANT_STATES) {
                if (overBudget) break;
                const where = ps.label ? m + "/" + ps.label : m;
                let base;
                try { base = await dev.build({ mode: m, config: { ...cfg, ...ps.extra } }); } catch { continue; }

                for (const knob of Object.keys(cfg)) {
                    if (Date.now() - devStart > budgetMs) { overBudget = true; break; }
                    const v = cfg[knob];
                    const kind = typeof v;
                    if (!acc.has(knob)) acc.set(knob, { kind, probed: [], live: [], still: [], movedMost: 0 });
                    const a = acc.get(knob);
                    // *** v4030 -- A KNOB WITH NO ORDERING TO PERTURB ALONG IS NAMED, NOT DROPPED. *** Strings
                    // and arrays were already skipped here and that is right -- inventing an ordering would test
                    // the device's error handling instead of the knob. But the row then carried an empty
                    // `probed`, so stillKnobs and insensitiveKnobs BOTH filtered it out and the knob vanished
                    // from every list the census prints. A null default is the case that matters: `cfg.x ??
                    // fallback` is a live, readable knob whose default means "compute it", and there are two in
                    // the lab (optics.spread and blackhole.onsetLo, the latter unnoticed since it was written).
                    // Reported as UNPROBED so the census names what it cannot answer rather than implying it did.
                    if (!probeValues(v, choicesFor(dev, knob, m)).length) {
                        a.kind = v === null || v === undefined ? "null-default" : (Array.isArray(v) ? "array" : kind);
                        a.unprobed = true;
                        continue;
                    }
                    // *** v4042 -- STOPPING AT THE FIRST YES ANSWERS ONE QUESTION AND HIDES ANOTHER. ***
                    // "Is this knob dead ANYWHERE" is settled by one live mode, so skipping the rest is right
                    // and cheap. But there is a second question it makes unaskable: IS THIS KNOB DEAF IN SOME
                    // MODE WHILE WORKING IN OTHERS -- and the lab contains a planted example built for exactly
                    // that defect. stability's `deafknob` mode hands every run the shipped viscosity whatever
                    // the caller asked for, and its own comment names the shape: "a control that does nothing
                    // ... nothing throws, every run completes, every number is finite, and the ONLY tell is
                    // that the answer stops depending on the input."
                    //
                    // MEASURED: the census reports `visc live in response` and never opens `deafknob`, which
                    // is LAST in that device's mode list. The plant is invisible to this tool and is caught
                    // only by stabilityBind's own plant contract -- per-device coverage every other multi-mode
                    // device would have to reimplement.
                    //
                    // Exhaustive is OPT-IN because it is not free: every mode and plant state for every knob,
                    // rather than stopping at the first yes.
                    if (!exhaustive && a.live.length) continue;         // already answered yes; the rest is cost
                    a.probed.push(where);
                    const r = await probeKnob(dev, m, cfg, knob, base, ps.extra, devStart + budgetMs);
                    if (r.state === "budget-cut") {
                        // Not a reading either way: the ladder was cut mid-climb. The knob is recorded as
                        // PROBED HERE and neither live nor still, which routes the row to incompleteKnobs --
                        // where a partial measurement belongs.
                        //
                        // *** THIS `probed` ENTRY IS NOT BOOKKEEPING AND MUST NOT BE POPPED. *** The first
                        // draft removed it, reasoning that a rung never tried should not count. But `probed`
                        // records the MODE AND PLANT STATE, not the rung, and that location WAS entered -- so
                        // popping it emptied the row, and stillKnobs, insensitiveKnobs, unprobedKnobs and
                        // incompleteKnobs all filter on a non-empty `probed`. The knob vanished from every
                        // list the census prints: exactly the defect v4030 fixed for null defaults,
                        // reintroduced one round later by a different route. Section 3c caught it.
                        overBudget = true; break;
                    }
                    if (r.state === "still") { a.still.push(where); if (r.echoed) (a.echoedStill ||= []).push(where); }
                    else { a.live.push(r.state === "refused" ? where + " (refused)" : where); a.movedMost = Math.max(a.movedMost, r.moved.length); }
                }
            }
        }
        // A device the budget cut short is REPORTED, never counted as clean. A census that silently dropped its
        // slowest members would report best-case coverage as coverage, and every knob it never reached would
        // read as "nothing dead here" -- the most expensive kind of quiet.
        // *** v4031 -- THE OVER-BUDGET NOTE UNDER-REPORTED ITS OWN DAMAGE TWICE, AND THE SECOND WAY WAS A
        // FALSE VERDICT, NOT A MISSING ONE. ***
        //
        // "probed N of M knobs" read M off `acc`, which only ever holds knobs the loop REACHED -- so a device
        // cut off after its first knob reported "probed 1 of 1", a perfect score, while four declared knobs
        // were never looked at. M is now the DECLARED count.
        //
        // Worse: the modes never entered were not named, and stillKnobs did not exclude an incomplete row. On
        // kuramoto that produced a sentence with no true reading behind it -- `pendN` was probed in `curve`
        // alone, went over budget there (rCurve sweeps 4096 oscillators, eight base builds), and appeared
        // under the census's own heading MOVES NOTHING ANYWHERE. It is read in `pendulum`, the mode the
        // census never entered, where it moves four observables. *** "ANYWHERE" IS A CLAIM ABOUT EVERY MODE
        // AND THIS ROW HAD SEEN ONE. *** The knob was live the whole time and the report said dead, which is
        // the one failure mode a census of dead knobs cannot have: it manufactures exactly the work it exists
        // to find. Incomplete rows now go in their own list, WITH THE MODES THAT WERE NEVER OPENED NAMED.
        if (unaffordable.length) {
            const need = Math.max(...unaffordable.map((u) => parseInt(u.replace(/.*~(\d+) s.*/, "$1"), 10) || 0));
            notes.push(name + ": " + unaffordable.length + " mode(s) NOT ATTEMPTED, the budget cannot afford "
                + "two builds -- " + unaffordable.join(", ") + " against a budget of "
                + Math.round(budgetMs / 1000) + " s. RAISE IT TO AT LEAST " + (need * 4) + " s FOR THIS DEVICE. "
                + "Skipped rather than spent: a budget under one build answers nothing and takes just as long.");
        }
        if (overBudget) notes.push(name + ": OVER BUDGET at " + budgetMs + " ms -- probed " +
            [...acc.values()].filter((a) => a.probed.length).length + " of " + declared.size + " declared knobs" +
            (entered.length < modes.length
                ? "; MODES NEVER ENTERED: " + modes.filter((m) => !entered.includes(m)).join(", ")
                : "") + ", INCOMPLETE");
        // *** A MODE SKIPPED FOR COST IS A MODE NOT ENTERED, AND THE ROW MUST SAY SO. *** The first draft of
        // the affordability skip used a bare `continue`, leaving `incomplete` false -- so twof, whose two
        // expensive modes were skipped and whose cheap `envelope` mode replays recorded numbers and reads no
        // knobs at all, reported THREE FALSE DEAD KNOBS under MOVES NOTHING ANYWHERE: record, runIndex,
        // settle. A saved four minutes bought a wrong answer, which is the worse trade, and it is the same
        // measurement-versus-admission line as v4030, v4031, v4042a and v4043 -- walked into one commit after
        // fixing the fourth instance of it.
        const cutForCost = unaffordable.length > 0;
        for (const [knob, a] of acc) rows.push({
            device: name, knob, modeSource, incomplete: overBudget || cutForCost,
            unenteredModes: modes.filter((m) => !entered.includes(m)), ...a,
        });
    }
    return { rows, notes };
}

/**
 * Second pass over the knobs the near ladder left still, at 1e-6x to 1e6x. A knob that wakes up out here is
 * INSENSITIVE over its working range rather than unread, and the margin is the finding.
 */
export async function widenStill(rows, { budgetMs = 20000 } = {}) {
    const MODES = await deviceModeTable();
    for (const r of rows) {
        if (!r.probed.length || r.live.length) continue;
        let dev; try { dev = await getDevice(r.device); } catch { continue; }
        const t0 = Date.now();
        for (const mode of (MODES[r.device] || [])) {
            if (Date.now() - t0 > budgetMs || r.wideLive) break;
            let def; try { def = dev.defaults({ mode }); } catch { continue; }
            const cfg = (def && def.config) || {};
            if (!(r.knob in cfg)) continue;
            const m = (def && def.mode) || mode;
            for (const ps of PLANT_STATES) {
                let base; try { base = await dev.build({ mode: m, config: { ...cfg, ...ps.extra } }); } catch { continue; }
                for (const alt of wideValues(cfg[r.knob])) {
                    let out;
                    try { out = await dev.build({ mode: m, config: { ...cfg, ...ps.extra, [r.knob]: alt } }); }
                    catch { r.wideLive = "refused at " + alt; break; }
                    if (Object.keys(base).some((o) => base[o] !== out[o])) { r.wideLive = "moves at " + alt; break; }
                }
                if (r.wideLive) break;
            }
        }
    }
    return rows;
}

/**
 * *** v4047 -- A FOURTH CONDITION THAT PRODUCES "STILL": TWO KNOBS THAT ONLY WORK TOGETHER. ***
 *
 * This file has always said its reading is not a diagnosis, and named three conditions behind it -- dead,
 * saturated at an asymptote, quantised below the search step. A lab-wide sweep produced a fourth.
 *
 * thermal.beta and thermal.gravity survived BOTH ladders across every mode and plant state: still at 1.5x,
 * 0.5x, 8x and still from 1e-6x to 1e6x and negated. The obvious reading was two dead knobs, and they would
 * have been the first unregistered ones in four sweeps. MEASURED INSTEAD:
 *
 *     beta = 1                    moved NOTHING
 *     gravity = 1e-3              moved NOTHING
 *     beta = 1 AND gravity = 1e-3 moved peakSpeed, kineticEnergy, convecting
 *
 * *** BOTH DEFAULT TO ZERO AND THEY MULTIPLY. *** Boussinesq buoyancy is beta * gravity * dT, so moving
 * either alone leaves the product at zero and nothing can happen. Neither knob is dead; the PAIR is the knob,
 * and a probe that moves one at a time cannot see it however far it moves that one.
 *
 * So still knobs whose default is zero are re-probed IN PAIRS. That is affordable precisely because the
 * population is small -- a knob has to be still after both ladders AND default to zero to qualify -- so this
 * is a handful of extra builds on a handful of devices, not the O(K^2) sweep that pairing every knob would be.
 *
 * *** IT IS STILL A READING. *** A pair that moves something together is jointly gated; a pair that does not
 * has been asked one more question and not answered. Nothing here promotes a knob to live on its own.
 */
export async function jointlyLive(rows, { budgetMs = 60000 } = {}) {
    const MODES = await deviceModeTable();
    const byDev = new Map();
    for (const r of rows) {
        if (r.live.length || r.wideLive || !r.probed.length) continue;
        if (!byDev.has(r.device)) byDev.set(r.device, []);
        byDev.get(r.device).push(r);
    }
    const found = [];
    for (const [name, rs] of byDev) {
        if (rs.length < 2) continue;
        let dev; try { dev = await getDevice(name); } catch { continue; }
        const t0 = Date.now();
        for (const mode of (MODES[name] || [])) {
            if (Date.now() - t0 > budgetMs) break;
            let def; try { def = dev.defaults({ mode }); } catch { continue; }
            const cfg = (def && def.config) || {};
            // ZERO-DEFAULT ONLY. A knob already at a working value multiplies to something; one at zero
            // cannot, and that asymmetry is the whole reason this pass is cheap enough to run.
            const zeros = rs.filter((r) => cfg[r.knob] === 0).map((r) => r.knob);
            if (zeros.length < 2) continue;
            let base; try { base = await dev.build({ mode, config: { ...cfg } }); } catch { continue; }
            for (let i = 0; i < zeros.length; i++) for (let j = i + 1; j < zeros.length; j++) {
                if (Date.now() - t0 > budgetMs) break;
                const pair = { [zeros[i]]: 1, [zeros[j]]: 1 };
                let out; try { out = await dev.build({ mode, config: { ...cfg, ...pair } }); } catch { continue; }
                const moved = Object.keys(base).filter((o) => !sameValue(base[o], out[o]));
                if (moved.length) {
                    found.push(name + "." + zeros[i] + " + " + name + "." + zeros[j]
                        + " -- neither moves anything alone; TOGETHER they move " + moved.join(", ")
                        + " in " + mode);
                }
            }
        }
    }
    return found;
}

/**
 * ================================================================================================================
 * *** v4045 -- WHAT EACH LIST CLAIMS, DECLARED ONCE, BECAUSE THE SAME MISTAKE HAS NOW BEEN MADE SIX TIMES. ***
 * ================================================================================================================
 *
 * Every list below partitions the same rows, and the only question that has ever gone wrong here is whether a
 * row from a device THAT DID NOT FINISH may appear in it. Six times a list has been written or changed without
 * asking, and six times it reported a device as answered when the census had simply not looked:
 *
 *   v4030  a null-default knob was filtered out of every list and vanished  -> unprobedKnobs
 *   v4031  stillKnobs printed "MOVES NOTHING ANYWHERE" off ONE mode         -> excluded incomplete
 *   v4042a partialDeafness returned 0 for "clean" and "never looked" alike  -> deafnessUnanswered
 *   v4043  insensitiveKnobs called eight LIVE quantum knobs insensitive     -> excluded incomplete
 *   v4044  a cost-skip left `incomplete` false and invented three dead knobs -> set the flag
 *   ...and v4043's own fix was argued against in a v4031 comment that said this list was fine as it was.
 *
 * EVERY FIX WAS LOCAL AND EVERY ONE WAS FOUND BY A WRONG ANSWER REACHING A REPORT. The rule was never written
 * down, so each new way of not-looking had to rediscover it. Here it is, once:
 *
 *   UNIVERSAL   the list's own heading makes a claim about EVERY mode -- "moves nothing ANYWHERE", "flat
 *               across its working range". A row whose device skipped a mode, FOR ANY REASON, cannot support
 *               that claim and MUST be excluded.
 *   PARTICULAR  the list names the modes it is talking about, so it claims nothing beyond them and may
 *               include an unfinished row. Its output MUST name that scope, or it is universal in disguise.
 *   ADMISSION   the list exists to say something was NOT measured. It MUST include unfinished rows -- that is
 *               its entire subject.
 *
 * *** THE TABLE IS THE RATCHET, NOT THE DOCUMENTATION. *** knobLiveness-selfcheck scans this file for
 * `export const X = (rows)` and FAILS IF ANY SUCH LIST IS MISSING FROM THIS TABLE, then checks each one
 * behaves as its class requires. A seventh list cannot be added without declaring what it claims, which is
 * the check none of the six previous rounds had.
 */
export const LIST_CLAIMS = {
    stillKnobs: "universal",          // "MOVES NOTHING ANYWHERE"
    insensitiveKnobs: "universal",    // "flat across its WORKING RANGE"
    partialDeafness: "particular",    // "live in A, B; ECHOED AND IGNORED in C" -- names its own scope
    unusedInMode: "particular",       // "unused in N of M" -- the innocent remainder, counted
    incompleteKnobs: "admission",     // the sweep ran out of budget
    deafnessUnanswered: "admission",  // the deafness question was never answered for this knob
    unprobedKnobs: "admission",       // no ordering exists to perturb the default along
};

/**
 * Knobs that moved nothing in any mode they were probed in. THE READING, not the diagnosis.
 *
 * *** v4031 -- AND ONLY FROM A DEVICE THE CENSUS FINISHED. *** The heading this list prints under is MOVES
 * NOTHING ANYWHERE, and "anywhere" is a claim about every mode. A row from an over-budget device has seen
 * some prefix of the mode list, so it cannot support that sentence -- kuramoto.pendN sat in this list having
 * been probed in `curve` alone, and is live in `pendulum`, four observables' worth. It goes to
 * incompleteKnobs instead, which says what it is: unfinished, not answered.
 */
export const stillKnobs = (rows) => rows.filter((r) => r.probed.length && !r.live.length && !r.wideLive && !r.incomplete)
    .map((r) => r.device + "." + r.knob).sort();

/**
 * *** v4042 -- KNOBS THAT WORK IN SOME MODES AND ARE IGNORED IN OTHERS. Requires exhaustive: true. ***
 *
 * *** AND THIS IS USUALLY INNOCENT, WHICH IS THE WHOLE DIFFICULTY. *** quantum.omega is read by `osc` and by
 * nothing else, so it is still in six modes of seven and that is the device being correct -- a mode that has
 * no use for a knob is not ignoring it. stability's `deafknob` looks IDENTICAL from out here: a knob live
 * elsewhere, moving nothing in this mode.
 *
 * So this is a READING and emphatically not a diagnosis, the same contract the rest of this file keeps. What
 * it buys is that the deafknob-class defect becomes VISIBLE AT ALL: a human can then ask the one question the
 * probe cannot, which is whether the mode claims to use the knob. A knob dead everywhere invites suspicion
 * the first time somebody turns it; a knob that demonstrably works in three modes and is quietly dropped in
 * the fourth is the shape that survives review, which is presumably why the tree bothered to plant one.
 *
 * *** IT IS ALSO ONLY DETECTABLE BECAUSE OF THE ECHO RULE. *** In `deafknob` the knob still reaches the
 * OUTPUT -- the bind copies it to out.viscosity -- so before v4031 discarded pass-throughs this read LIVE,
 * off the echo of the very knob being ignored. The rule written to stop mpmstep.nx reading live off itself is
 * what makes this plant findable.
 */
export const partialDeafness = (rows) => rows.filter((r) => r.live.length && r.echoedStill && r.echoedStill.length)
    .map((r) => r.device + "." + r.knob + " -- live in " + r.live.join(", ")
        + "; ECHOED AND IGNORED in " + r.echoedStill.join(", ")).sort();

/**
 * *** v4046 -- STILL IN A MODE THAT NEVER MENTIONS THE KNOB. THE INNOCENT MAJORITY, COUNTED NOT LISTED. ***
 *
 * The first draft of partialDeafness listed every knob live somewhere and still somewhere else, and a
 * lab-wide exhaustive sweep made the problem obvious before it finished: blackhole 14, em 10, xpbd 10,
 * seismic 8 -- HUNDREDS OF CANDIDATES, and a list nobody can act on is not a finding, it is a second haystack.
 *
 * Nearly all of it is a multi-mode device whose modes each use a subset of the knobs, which is a device being
 * organised rather than broken. What separates the real case is that the deaf mode ACKNOWLEDGES THE INPUT:
 * stability's deafknob reports `viscosity` and then hands the solver 0.1 regardless. So this list is the
 * remainder -- still, and not echoed -- kept as a COUNT so the split is visible and the innocent majority is
 * not passed off as a finding.
 */
export const unusedInMode = (rows) => rows.filter((r) => r.live.length && r.still.length
        && !(r.echoedStill && r.echoedStill.length))
    .map((r) => r.device + "." + r.knob + " (unused in " + r.still.length + " of "
        + (r.live.length + r.still.length) + ")").sort();

/**
 * *** AND THE KNOBS FOR WHICH THE DEAFNESS QUESTION WAS NEVER ANSWERED, WHICH IS NOT THE SAME AS `none`. ***
 *
 * A knob that reads live and whose device ran out of budget has been checked in SOME modes and not others --
 * exactly the state in which a deaf mode hides. The first draft of partialDeafness returned 0 for that case
 * and for a genuinely clean device alike, which is the measurement-versus-admission distinction v4031 drew for
 * stillKnobs and v4030 drew for null defaults, reintroduced one list later by the same reflex.
 *
 * It bit immediately: the first exhaustive run of `stability` reported ZERO deaf knobs having never opened
 * `deafknob` at all -- "OVER BUDGET at 90000 ms; MODES NEVER ENTERED: direction, horizon, deafknob".
 * incompleteKnobs could not catch it either, because that list requires the knob to be STILL so far and this
 * one is live.
 */
export const deafnessUnanswered = (rows) => rows.filter((r) => r.incomplete && r.live.length)
    .map((r) => r.device + "." + r.knob + " (checked in " + r.live.concat(r.still).join(", ")
        + (r.unenteredModes && r.unenteredModes.length ? "; NEVER ENTERED: " + r.unenteredModes.join(", ") : "") + ")")
    .sort();

/**
 * Probed, moved nothing SO FAR, and the census ran out of budget before it opened every mode. A THIRD
 * CATEGORY on purpose: "moves nothing" is a measurement, "was never probed" is an admission (unprobedKnobs),
 * and this is the one in between -- a partial measurement, which is the most dangerous of the three to
 * promote, because it looks exactly like the first.
 */
export const incompleteKnobs = (rows) => rows.filter((r) => r.probed.length && !r.live.length && r.incomplete)
    .map((r) => r.device + "." + r.knob + " (probed in " + r.probed.join(", ")
        + (r.unenteredModes && r.unenteredModes.length ? "; NEVER ENTERED: " + r.unenteredModes.join(", ") : "") + ")").sort();

/**
 * Read, but flat across its working range -- and the wide ladder proves the code reaches it.
 *
 * *** v4043 -- AND ONLY FROM A DEVICE THE CENSUS FINISHED, WHICH v4031 GOT RIGHT FOR `still` AND ARGUED
 * ITSELF OUT OF HERE. *** That round excluded incomplete rows from stillKnobs and left this list alone on the
 * reasoning, written down at the time, that "an incomplete row that woke on the wide ladder IS live, so leave
 * it alone". The reasoning was wrong, and a sweep found out how wrong.
 *
 * "Insensitive over its working range" is a claim about how a knob behaves WHERE IT IS READ. A row from a
 * device that never entered the modes reading that knob cannot support it: the knob is simply absent from the
 * mode that was probed, so the near ladder finds nothing and the wide ladder wakes something incidental -- a
 * clamp, a refusal, a shared guard. MEASURED: a sweep on tight per-device budgets probed `quantum` in `bands`
 * alone and filed EIGHT of its knobs as insensitive -- E, L, N, V0, count, dt, omega, steps. Given a budget
 * it could finish inside, every one is LIVE: omega in `osc`, E in `tunnel`, count in `well`. The insensitive
 * list had been manufactured by budget starvation.
 *
 * That is the fourth time this file has needed the same line drawn -- v4030 for null defaults, v4031 for
 * still, v4042a for deafness -- and the second time I have been the one to erase it.
 */
export const insensitiveKnobs = (rows) => rows.filter((r) => r.probed.length && !r.live.length && r.wideLive && !r.incomplete)
    .map((r) => r.device + "." + r.knob + " (" + r.wideLive + ")").sort();

/**
 * Declared, and NOT ANSWERED EITHER WAY -- no ordering exists to perturb the default along. A separate list from
 * `still` on purpose: "moves nothing" is a measurement and "was never probed" is an admission, and folding the
 * second into the first would report coverage this census does not have.
 */
export const unprobedKnobs = (rows) => rows.filter((r) => r.unprobed && !r.probed.length)
    .map((r) => r.device + "." + r.knob + " (" + r.kind + ")").sort();

/**
 * v4025 -- KNOBS THAT MOVE NOTHING AND HAVE AN EXAMINED REASON.
 *
 * Empty on purpose, and the emptiness is the claim. The one entry this file was built around --
 * xenon.highFlux -- was FIXED rather than registered: the observable it fed reported the high-flux asymptote
 * itself, so every flux above ~5e17 returned the identical float and the knob demonstrated nothing. A register
 * exists for the case where the right answer is a sentence instead of a fix; adding to it before trying the fix
 * is how a ratchet grows back (v3211's rule, collected here).
 */
export const STILL_OK = {
    // *** hands.span WAS HERE AND HAS BEEN DELETED RATHER THAN LOOSENED. *** It widened a translation sweep
    // whose observable, translationDisagreements, was a load-bearing negative pinned at 0 with NO PLANT THAT
    // COULD MAKE IT FIRE -- so the knob had nothing to move. v4026 gave handsBind a second declared defect knob
    // (fixedAnchor, referencing the fold test to a point in the image instead of to the wrist), the negative
    // now fires 0 -> 24, and the knob reads live in that mode. A REGISTER ENTRY WHOSE REASON HAS EXPIRED IS AN
    // ACTIVE BLIND SPOT, because if the knob went still again the entry would silently swallow it (v3195's
    // rule, collected here), and section 4 of the gate now asserts that every remaining entry STILL FIRES.
    // Young's modulus, read through `lame(c.E, c.nu)` into every mode -- and MEASURED FLAT over four orders of
    // magnitude in all four modes, both plant states, and negative. That is not insensitivity over a margin
    // like galaxy.zeroTol; it is EXACT INVARIANCE, and it is the property the device is for. Drucker-Prager's
    // keys are statements about the YIELD SURFACE: below yield the return mapping is the identity, above it the
    // projection lands the yield function at exactly zero, cohesionless material collapses to the apex, and the
    // shear observables are functions of the friction angle alone. Every one is homogeneous in the elastic
    // moduli, because a friction angle is not a stiffness. *** THE HONEST CONSEQUENCE IS THAT NO KEY THIS
    // DEVICE CARRIES CAN GRADE E OR nu *** -- they are real inputs to the material and the yield surface is
    // blind to them by construction, which is worth knowing rather than worth silencing.
    "mpmdrucker.E": "the Drucker-Prager keys are exactly homogeneous in the elastic moduli -- a friction angle is not a stiffness -- so E is flat over four decades, in all four modes, both plant states, and negative. No key this device carries can grade it",

    // *** v4031 -- THE SECOND ENTRY, AND IT IS THE SAME SHAPE AS THE FIRST: A KEY THAT IS TRUE READS AS A
    // KNOB THAT IS DEAD. *** mpmstep's whole claim is that a freely falling block's centre of mass follows
    // the analytic parabola WHATEVER THE MATERIAL DOES INTERNALLY. Poisson's ratio is the material. It
    // enters through lame(E, nu) into the internal stress and nowhere else, and internal stress cannot move
    // a centre of mass -- so a flat reading here is the device's first sentence, measured, and there is
    // nothing to fix. mpmStepBind-selfcheck section 5 pins it AT THE SOURCE rather than only here, so it
    // goes red where the physics is if it ever stops holding.
    //
    // *** AND THE ENTRY NAMES WHAT IT COSTS. *** E is the same physics and the census calls it LIVE, on a
    // ONE-ULP difference in one observable (errNoPlastic, 8.882e-16 -> 1.776e-15 at E = 250) plus a run at
    // E = 5e8 where the explicit step violates CFL and the particles leave the grid. Motion is tested with
    // Object.is, so one bit of round-off reads exactly like a response. The live/still line between E and nu
    // in this device is rounding, not grading, and registering nu without saying so would leave E looking
    // graded when it is not.
    "mpmstep.nu": "the centre-of-mass parabola is blind to the constitutive model by construction -- nu enters only through lame(E, nu) into the internal stress, and internal stress cannot move a centre of mass. Bit-identical at nu = 0, 0.15, 0.3, 0.45, 0.49, 1e-6, -0.3 and 3e5, in all four modes and both plant states; the last two are not admissible Poisson ratios and the observables do not notice. No key this device carries can grade the constitutive model, and E only reads live on one ULP",

};

/** v3327's split: this half PRINTS, and knobLiveness-selfcheck beside it is what exits nonzero. */
export async function reportLines(opts = {}) {
    const { rows, notes } = await knobLiveness(opts);
    const exhaustive = !!opts.exhaustive;
    const L = [];
    const devices = new Set(rows.map((r) => r.device));
    const still = stillKnobs(rows);
    L.push("[roundhouse/knobLiveness] a declared knob and a knob that DOES something are not the same thing");
    L.push("");
    L.push("  " + rows.length + " declared knobs across " + devices.size + " devices, probed per MODE rather than");
    L.push("  per device -- the first draft of this probe asked per device and reported eight dead knobs on");
    L.push("  `quantum` that were every one of them live in a mode it never entered.");
    L.push("");
    const byDev = new Map();
    for (const r of rows) { if (!byDev.has(r.device)) byDev.set(r.device, []); byDev.get(r.device).push(r); }
    for (const [dev, rs] of [...byDev].sort()) {
        const src = rs[0].modeSource;
        L.push("  " + dev + (src === "probed" ? "   (modes GUESSED, so this is a lower bound)" : ""));
        for (const r of rs.sort((a, b) => a.knob.localeCompare(b.knob))) {
            const verdict = !r.probed.length ? "not probed (" + r.kind + ")"
                : r.live.length ? "live in " + r.live.join(", ") + (r.movedMost ? "  [" + r.movedMost + " observables]" : "")
                : r.incomplete ? "INCOMPLETE -- still in " + r.still.join(", ") + ", "
                    + (r.unenteredModes && r.unenteredModes.length
                        ? "NEVER ENTERED " + r.unenteredModes.join(", ") : "cut off mid-mode")
                : "*** MOVES NOTHING in " + r.still.join(", ") + " ***";
            L.push("    " + r.knob.padEnd(18) + verdict);
        }
    }
    L.push("");
    const unprobed = unprobedKnobs(rows);
    const partial = incompleteKnobs(rows);
    L.push("  MOVES NOTHING ANYWHERE: " + (still.length ? still.join(", ") : "none"));
    L.push("  NOT PROBED (no ordering to perturb the default along): " + (unprobed.length ? unprobed.join(", ") : "none"));
    L.push("  STILL SO FAR, BUT THE CENSUS RAN OUT OF BUDGET -- NOT A VERDICT: "
        + (partial.length ? partial.join(", ") : "none"));
    if (exhaustive) {
        const deaf = partialDeafness(rows);
        const unanswered = deafnessUnanswered(rows);
        L.push("");
        const unused = unusedInMode(rows);
        L.push("  ECHOED BY A MODE AND IGNORED BY IT (" + deaf.length + ") -- THE DEAF-KNOB SHAPE:");
        for (const d of deaf) L.push("      " + d);
        L.push("  ...and still in a mode that never mentions the knob (" + unused.length + "), which is a");
        L.push("  device being ORGANISED rather than broken -- counted, not listed: "
            + (unused.slice(0, 6).join(", ") || "none") + (unused.length > 6 ? ", ..." : ""));
        if (unanswered.length) {
            L.push("  AND NOT ANSWERED AT ALL FOR (" + unanswered.length + ") -- live so far, budget ran out"
                + " before the remaining modes:");
            for (const u of unanswered) L.push("      " + u);
            L.push("  *** A ZERO ABOVE MEANS 'NONE FOUND IN WHAT WAS OPENED', NOT 'NONE'. ***");
        }
        L.push("  A mode with no use for a knob is not ignoring it -- quantum.omega is read by `osc` alone and");
        L.push("  is correctly still in the other six. THE ONE QUESTION THIS PROBE CANNOT ASK IS WHETHER THE");
        L.push("  MODE CLAIMS TO USE THE KNOB, and that is the question this list exists to put in front of");
        L.push("  somebody who can. stability.visc in `deafknob` is the lab's planted example.");
    } else {
        L.push("  (run with --exhaustive to also ask which knobs are IGNORED IN SOME MODES while working in");
        L.push("   others -- this pass stops at the first mode that responds, so it cannot see that.)");
    }
    L.push("  A READING, NEVER A DIAGNOSIS -- dead, saturated at an asymptote, and quantised below the search");
    L.push("  step are three different conditions that produce this same one.");
    for (const n of notes) L.push("  note: " + n);
    return L;
}

// *** v4031 -- THE MAIN BLOCK, WHICH IS WHAT MAKES THIS A TOOL RATHER THAN A LIBRARY NOBODY CALLS. ***
//
// This module shipped with a page and a gate declared in physics/instruments.mjs and NO WAY TO RUN IT: the
// only importer in the tree was its own selfcheck, so graveyard-selfcheck counted it an ORPHANED UTILITY and
// said the right thing -- "wire it, or delete it". The tree has settled this exact shape before and recorded
// how: v3219-v3220 gave five analysis tools a main block and a page, and eight modules came off the list,
// "because A TOOL YOU CAN RUN IS A TOOL WITH A CALLER".
//
// IT PRINTS AND CHANGES NOTHING -- no writeFileSync, no exit(1). That is the REPORTING contract this tree
// draws a hard line on (capabilityCard-selfcheck: "a report prints and exits zero; a gate that fails exits
// nonzero", and v3327 was correctly refused for conflating them). The verdicts here are a READING, and the
// module's own closing lines say so: dead, saturated at an asymptote, and quantised below the search step are
// three different conditions that produce the same MOVES NOTHING.
//
// --only <a,b> narrows to named devices and --budget <ms> bounds the per-knob probe, because the full census
// walks every declared knob across (mode x plant state) and a reader chasing one device should not pay for
// all of them.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const argv = process.argv.slice(2);
    const valueOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
    const only = (valueOf("--only") || "").split(",").map((s2) => s2.trim()).filter(Boolean);
    const budget = parseInt(valueOf("--budget") || "", 10);
    const exhaustive = argv.includes("--exhaustive");
    reportLines({
        only: only.length ? only : null,
        ...(Number.isFinite(budget) && budget > 0 ? { budgetMs: budget } : {}),
        ...(exhaustive ? { exhaustive: true } : {}),
    }).then((L) => console.log(L.join("\n")));
}
