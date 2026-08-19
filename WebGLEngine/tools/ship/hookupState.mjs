// WebGLEngine/tools/ship/hookupState.mjs -- v3592
// ---------------------------------------------------------------------------------------------------------------
// HOW FAR ALONG IS "HOOK THE PHYSICS INSTRUMENTS INTO THE LAB", AS A DERIVATION RATHER THAN A COUNT SOMEBODY KEEPS.
//
// *** THE QUESTION HID THREE DIFFERENT JOBS AND ONE PHRASE. *** Measured across the 92 physics instruments:
//
//     6   have a knob PROPOSER          -- the roundhouse can actually work on them
//    20   have a reportLines() module   -- a bench page, readable, no proposer
//    50   have their own page           -- openable, no split, no proposer
//    16   have NOTHING                  -- no page, no split, no proposer
//
// "Reachable", "a scene on the lab page", and "roundhouse-workable" are not degrees of one thing. The second is
// not a hookup at all -- each lab scene is bespoke build/step code, and adding eighty would be rewriting the
// page rather than connecting anything.
//
// ================================================================================================================
// AND THE STATE IS DERIVED, NOT STORED, BECAUSE A STORED ONE WOULD BE THE THING IT IS MEASURING
// ================================================================================================================
//
// It would have been easy to add a `hookup: "proposer"` field to each registry entry. *** THAT FIELD WOULD ROT
// THE FIRST TIME SOMEBODY REGISTERED A PROPOSER AND FORGOT TO UPDATE IT, and it would rot INVISIBLY, because
// nothing else reads it. *** Every state here is computed from facts that already exist: the live proposer
// registry, whether the module exports reportLines, and what `page` says. The registry cannot disagree with
// itself.
//
// ================================================================================================================
// THE ATTRITION IS THE NUMBER THAT GOVERNS ANY PLAN, AND IT IS MEASURED
// ================================================================================================================
//
// *** OF EIGHT LAB CANDIDATES ASSESSED AS GOOD ON REASONING, THREE DIED ON MEASUREMENT. *** orbit (a real, exact
// key DEAF to the knob), balloon (a key that IS the knob's setpoint, agreeing at one substep and at ten-thousand-
// fold looser compliance), and muscle (inherits balloon's constraint). knobRegistry's NOT_REGISTERED carried six
// more refusals before any of that.
//
// So a plan promising all 92 would be promising something the evidence refuses. 67 of the 86 unproposered
// instruments CLAIM an exact or closed-form key in their own text -- and that is A TEXT PROXY, NOT AN
// ASSESSMENT, marked as such below, because reading the word "exact" in a description is not the same as
// driving the key across a knob range. Past attrition puts the realistic yield nearer forty.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { INSTRUMENTS } from "../../physics/instruments.mjs";
import { resetRegistry, listProposers } from "../../physics/proposers.mjs";
import { registerAll, NOT_REGISTERED } from "../../physics/knobRegistry.mjs";
import { SCENE_TRIAGE } from "../../physics/labScenes.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Areas that are tooling rather than physics. Split out at v3582 for exactly this kind of question. */
export const TOOLING_AREAS = new Set(["ship", "method"]);
export const isPhysics = (i) => !TOOLING_AREAS.has(i.area);

const hasSplit = (gate) => {
    if (!gate) return false;
    try { return /export\s+(async\s+)?function\s+reportLines/.test(
        fs.readFileSync(path.join(ENG, gate.replace(/-selfcheck\.mjs$/, ".mjs")), "utf8")); }
    catch { return false; }
};

export const STATES = ["proposer", "bench", "page", "none"];

/**
 * The state of one instrument, in descending order of how much the roundhouse can do with it.
 * *** THE ORDER IS THE POINT: a proposer implies a bench page implies reachability, so the FIRST match wins and
 * an instrument is never counted twice. *** A tally that let one instrument land in two buckets would report a
 * total larger than the population and nobody would notice until it was.
 */
export function stateOf(inst, withProposer) {
    if (withProposer.has(inst.id)) return "proposer";
    if (hasSplit(inst.gate)) return "bench";
    if (inst.page) return "page";
    return "none";
}

/** A TEXT PROXY, and it is named one. Reading "exact" in a description is not driving a key across a knob. */
export const CLAIMS_EXACT = /exact|closed form|closed-form|invariant|analytic|conserved|identity/i;

export function survey() {
    resetRegistry(); registerAll();
    const props = listProposers();
    const withProposer = new Set(props.map((p) => p.instrument));
    const phys = INSTRUMENTS.filter(isPhysics);
    const rows = phys.map((i) => ({
        id: i.id, area: i.area, state: stateOf(i, withProposer),
        claimsExact: CLAIMS_EXACT.test(i.key || ""),
    }));
    const byState = Object.fromEntries(STATES.map((s) => [s, rows.filter((r) => r.state === s).length]));
    const pool = rows.filter((r) => r.state !== "proposer" && r.claimsExact);
    const byArea = {};
    for (const r of pool) byArea[r.area] = (byArea[r.area] || 0) + 1;
    return {
        instruments: INSTRUMENTS.length, physics: phys.length, tooling: INSTRUMENTS.length - phys.length,
        // *** PROPOSERS AND INSTRUMENTS-WITH-A-PROPOSER ARE DIFFERENT NUMBERS AND THE REPORT MUST SAY SO. ***
        // md-pbc carries TWO knobs (md-timestep and md-box), so 7 proposers cover 6 instruments -- and a reader
        // seeing "proposers 7" beside "6 proposer" would reasonably suspect a dangling link, which is exactly
        // the fault v3591 found for real. Both counts, and the reason.
        proposers: props.length, instrumentsWithProposer: withProposer.size,
        multiKnob: [...withProposer].filter((id) => props.filter((p) => p.instrument === id).length > 1),
        byState, rows,
        pool: { size: pool.length, byArea, note: "TEXT PROXY, not an assessment" },
        // a dangling proposer -> instrument link is what caught the missing gyroscope entry at v3591
        dangling: props.filter((p) => p.instrument && !INSTRUMENTS.some((i) => i.id === p.instrument))
            .map((p) => p.id + " -> " + p.instrument),
    };
}

/**
 * *** ATTRITION, READ FROM THE TWO PLACES THAT ALREADY RECORD IT RATHER THAN COUNTED BY HAND. ***
 * labScenes marks a withdrawal by `eligible: refused` with `provenance: measured`; knobRegistry records refusals
 * as NOT_REGISTERED entries. Both existed and NOTHING READ EITHER -- so the rate that governs any plan was a
 * number somebody would have restated from memory.
 */
export function attrition() {
    const measured = SCENE_TRIAGE.filter((r) => r.provenance === "measured");
    const withdrawn = measured.filter((r) => r.eligible === "refused");
    const structural = SCENE_TRIAGE.filter((r) => r.eligible === "refused" && r.provenance === "assessed");
    return {
        assessedCandidates: withdrawn.length + SCENE_TRIAGE.filter((r) => r.eligible === "candidate").length,
        withdrawnByMeasurement: withdrawn.map((r) => r.scene + " (" + r.responds + ")"),
        withdrawnOnStructure: structural.map((r) => r.scene),
        stillCandidates: SCENE_TRIAGE.filter((r) => r.eligible === "candidate").map((r) => r.scene),
        priorRefusals: Object.keys(NOT_REGISTERED).length,
        rate: withdrawn.length / Math.max(1, withdrawn.length + SCENE_TRIAGE.filter((r) => r.eligible === "candidate").length),
    };
}

export function reportLines() {
    const s = survey(), a = attrition();
    const L = [];
    L.push("[hookupState] how far along, derived rather than kept");
    L.push("");
    L.push("  instruments " + s.instruments + " = " + s.physics + " physics + " + s.tooling + " tooling");
    L.push("  proposers " + s.proposers + " covering " + s.instrumentsWithProposer + " instruments" +
           (s.multiKnob.length ? " (" + s.multiKnob.join(", ") + " carries more than one knob)" : "") +
           (s.dangling.length ? "   DANGLING: " + s.dangling.join(", ") : ""));
    L.push("");
    L.push("  PHYSICS INSTRUMENTS BY STATE (first match wins, so no double counting):");
    L.push("    " + String(s.byState.proposer).padStart(3) + "  proposer -- the roundhouse can work on them");
    L.push("    " + String(s.byState.bench).padStart(3) + "  bench    -- a reportLines() module, readable, no proposer");
    L.push("    " + String(s.byState.page).padStart(3) + "  page     -- openable, no split, no proposer");
    L.push("    " + String(s.byState.none).padStart(3) + "  none     -- no page, no split, no proposer");
    L.push("");
    L.push("  CANDIDATE POOL (" + s.pool.note + "): " + s.pool.size);
    L.push("    " + Object.entries(s.pool.byArea).sort((x, y) => y[1] - x[1]).slice(0, 8)
        .map(([k, v]) => k + "(" + v + ")").join("  "));
    L.push("");
    L.push("  ATTRITION, read from the records rather than remembered:");
    L.push("    withdrawn BY MEASUREMENT: " + (a.withdrawnByMeasurement.join(", ") || "(none)"));
    L.push("    withdrawn on structure:   " + (a.withdrawnOnStructure.join(", ") || "(none)"));
    L.push("    still candidates:         " + a.stillCandidates.join(", "));
    L.push("    prior refusals on record: " + a.priorRefusals);
    L.push("    *** " + (a.rate * 100).toFixed(0) + "% OF ASSESSED LAB CANDIDATES DIED ON MEASUREMENT. ***");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
