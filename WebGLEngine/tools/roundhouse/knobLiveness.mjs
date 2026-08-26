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
import { DEVICE_NAMES, getDevice } from "./devices.mjs";
import { deviceModeTable } from "./deviceModes.mjs";

/** The values tried for one knob. A knob is live as soon as ONE of them moves something -- the rest are skipped. */
export function probeValues(v) {
    if (typeof v === "boolean") return [!v];
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
export async function probeKnob(device, mode, cfg, knob, base, extra = {}) {
    for (const alt of probeValues(cfg[knob])) {
        let out;
        try { out = await device.build({ mode, config: { ...cfg, ...extra, [knob]: alt } }); }
        catch { return { state: "refused", moved: [] }; }
        const moved = Object.keys(base).filter((o) => base[o] !== out[o]);
        if (moved.length) return { state: "live", moved };
    }
    return { state: "still", moved: [] };
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
export async function knobLiveness({ only = null, budgetMs = 20000 } = {}) {
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
        const devStart = Date.now();
        let overBudget = false;
        for (const mode of modes) {
            if (overBudget) break;
            let def; try { def = dev.defaults({ mode }); } catch { continue; }
            const cfg = (def && def.config) || {};
            const m = (def && def.mode) || mode;
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
                    if (!probeValues(v).length) { a.kind = Array.isArray(v) ? "array" : kind; continue; }  // strings/arrays: no ordering to perturb along
                    if (a.live.length) continue;                       // already answered yes; the rest is cost
                    a.probed.push(where);
                    const r = await probeKnob(dev, m, cfg, knob, base, ps.extra);
                    if (r.state === "still") a.still.push(where);
                    else { a.live.push(r.state === "refused" ? where + " (refused)" : where); a.movedMost = Math.max(a.movedMost, r.moved.length); }
                }
            }
        }
        // A device the budget cut short is REPORTED, never counted as clean. A census that silently dropped its
        // slowest members would report best-case coverage as coverage, and every knob it never reached would
        // read as "nothing dead here" -- the most expensive kind of quiet.
        if (overBudget) notes.push(name + ": OVER BUDGET at " + budgetMs + " ms -- probed " +
            [...acc.values()].filter((a) => a.probed.length).length + " of " + acc.size + " knobs, INCOMPLETE");
        for (const [knob, a] of acc) rows.push({ device: name, knob, modeSource, incomplete: overBudget, ...a });
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

/** Knobs that moved nothing in any mode they were probed in. THE READING, not the diagnosis. */
export const stillKnobs = (rows) => rows.filter((r) => r.probed.length && !r.live.length && !r.wideLive)
    .map((r) => r.device + "." + r.knob).sort();

/** Read, but flat across its working range -- and the wide ladder proves the code reaches it. */
export const insensitiveKnobs = (rows) => rows.filter((r) => r.probed.length && !r.live.length && r.wideLive)
    .map((r) => r.device + "." + r.knob + " (" + r.wideLive + ")").sort();

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

    // The width of the translation sweep in the dislocation test: `for (const dx of [-c.span, -c.span/2,
    // c.span/2, c.span])`. It is read, and it makes the test STRONGER -- a wider translation is a harder
    // invariance to satisfy. But the observable it feeds, translationDisagreements, is a LOAD-BEARING NEGATIVE
    // pinned at 0: classification must not change when a hand pose moves. MEASURED 0 at every span in
    // [0.02, 0.4], in all four modes, honest AND planted -- so the knob has nothing to move while the property
    // holds, which is exactly when it should have nothing to move.
    //
    // *** WHAT IS ACTUALLY MISSING IS A PLANT THAT BREAKS TRANSLATION INVARIANCE. *** Without one, the test
    // this knob strengthens has never been shown to be ABLE to fail -- knobGate's own phrase, "an untested
    // branch with a licence attached", one level up. Registered here rather than fixed because the fix belongs
    // to handsBind's plant, not to the knob.
    "hands.span": "widens a translation sweep whose observable is a load-bearing negative pinned at 0; flat at every span because the invariance holds. The gap is a PLANT that breaks translation invariance -- until one exists, the test this knob strengthens has never been shown able to fail",
};

/** v3327's split: this half PRINTS, and knobLiveness-selfcheck beside it is what exits nonzero. */
export async function reportLines(opts = {}) {
    const { rows, notes } = await knobLiveness(opts);
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
                : "*** MOVES NOTHING in " + r.still.join(", ") + " ***";
            L.push("    " + r.knob.padEnd(18) + verdict);
        }
    }
    L.push("");
    L.push("  MOVES NOTHING ANYWHERE: " + (still.length ? still.join(", ") : "none"));
    L.push("  A READING, NEVER A DIAGNOSIS -- dead, saturated at an asymptote, and quantised below the search");
    L.push("  step are three different conditions that produce this same one.");
    for (const n of notes) L.push("  note: " + n);
    return L;
}
