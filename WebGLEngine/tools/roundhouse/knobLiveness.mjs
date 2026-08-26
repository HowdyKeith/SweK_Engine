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
// ================================================================================================================
// THREE THINGS THIS REPORTS SEPARATELY, BECAUSE COLLAPSING THEM WOULD LOSE THE ANSWER
// ================================================================================================================
//
//   LIVE       some observable moved. The knob is a cause.
//   REFUSED    the build threw. *** THIS IS LIVE. *** A knob that rejects a value is read by the code -- a
//              refusal is a response, and counting it as dead would mark the best-behaved knobs in the lab.
//   MOVES NOTHING   no observable moved at any probed value, in any probed mode.
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
export async function probeKnob(device, mode, cfg, knob, base) {
    for (const alt of probeValues(cfg[knob])) {
        let out;
        try { out = await device.build({ mode, config: { ...cfg, [knob]: alt } }); }
        catch { return { state: "refused", moved: [] }; }
        const moved = Object.keys(base).filter((o) => base[o] !== out[o]);
        if (moved.length) return { state: "live", moved };
    }
    return { state: "still", moved: [] };
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
            let base; try { base = await dev.build({ mode: m, config: { ...cfg } }); } catch { continue; }

            for (const knob of Object.keys(cfg)) {
                if (Date.now() - devStart > budgetMs) { overBudget = true; break; }
                const v = cfg[knob];
                const kind = typeof v;
                if (!acc.has(knob)) acc.set(knob, { kind, probed: [], live: [], still: [], movedMost: 0 });
                const a = acc.get(knob);
                if (!probeValues(v).length) { a.kind = Array.isArray(v) ? "array" : kind; continue; }  // strings/arrays: no ordering to perturb along
                a.probed.push(m);
                const r = await probeKnob(dev, m, cfg, knob, base);
                if (r.state === "still") a.still.push(m);
                else { a.live.push(r.state === "refused" ? m + " (refused)" : m); a.movedMost = Math.max(a.movedMost, r.moved.length); }
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

/** Knobs that moved nothing in any mode they were probed in. THE READING, not the diagnosis. */
export const stillKnobs = (rows) => rows.filter((r) => r.probed.length && !r.live.length)
    .map((r) => r.device + "." + r.knob).sort();

/**
 * v4025 -- KNOBS THAT MOVE NOTHING AND HAVE AN EXAMINED REASON.
 *
 * Empty on purpose, and the emptiness is the claim. The one entry this file was built around --
 * xenon.highFlux -- was FIXED rather than registered: the observable it fed reported the high-flux asymptote
 * itself, so every flux above ~5e17 returned the identical float and the knob demonstrated nothing. A register
 * exists for the case where the right answer is a sentence instead of a fix; adding to it before trying the fix
 * is how a ratchet grows back (v3211's rule, collected here).
 */
export const STILL_OK = {};

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
