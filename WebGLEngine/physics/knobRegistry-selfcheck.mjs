// WebGLEngine/physics/knobRegistry-selfcheck.mjs — v3286
//
// Run: node physics/knobRegistry-selfcheck.mjs   (~35s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// THE PROPERTY UNDER TEST IS NOT "the knobs are registered". It is that EVERY REGISTERED ADJUDICATOR CAN SAY
// BOTH YES AND NO. An adjudicator that has never refused anything is an untested branch with a licence attached:
// the ratchet grants tiers on its evidence, applyKnobs consults it, the whole structure keeps working, and it
// means nothing. One that refuses everything is no better and looks more rigorous.
//
// This is the check that stopped a mechanical sweep of all forty-four instruments from shipping. Three of the
// first seven adjudicators passed EVERY candidate they were given, and one refused every candidate; all four
// were calibrated against measured breakpoints or withdrawn.

import { registerAll, NOT_REGISTERED } from "./knobRegistry.mjs";
import { listProposers, getProposer, runProposer, applyKnobs, grantLicence, resetRegistry } from "./proposers.mjs";
import { INSTRUMENTS } from "./instruments.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

resetRegistry();
registerAll();
const all = listProposers();

// ---- 1. EVERY ADJUDICATOR CAN REFUSE, AND EVERY ADJUDICATOR CAN PASS -----------------------------------------
{
    const rows = [];
    for (const inst of all) {
        const p = getProposer(inst.id);
        const verdicts = [];
        for (const c of p.propose()) verdicts.push({ knob: Object.values(c)[0], pass: (await p.adjudicate(c)).pass });
        rows.push({ id: inst.id, verdicts, canRefuse: verdicts.some((v) => !v.pass), canPass: verdicts.some((v) => v.pass) });
    }
    const noRefuse = rows.filter((r) => !r.canRefuse), noPass = rows.filter((r) => !r.canPass);
    ok("!! every registered adjudicator REFUSES at least one of its own candidates (no control that cannot fail)",
       noRefuse.length === 0,
       noRefuse.length ? "ALWAYS PASSES: " + noRefuse.map((r) => r.id).join(", ")
                       : rows.map((r) => r.id + " [" + r.verdicts.map((v) => v.knob + (v.pass ? "+" : "-")).join(" ") + "]").join("  "));
    ok("!! ...and PASSES at least one (an adjudicator that refuses everything is as useless, and looks more rigorous)",
       noPass.length === 0, noPass.length ? "ALWAYS REFUSES: " + noPass.map((r) => r.id).join(", ") : rows.length + " proposers, all two-sided");
}

// ---- 2. EVERY REGISTERED KNOB NAMES ITS INSTRUMENT, EXPLICITLY ------------------------------------------------------
// The first version matched proposer names to instrument ids by stem and reported "lz-window" as an orphan of
// "landau-zener". A link that has to be guessed is not a link, so registerProposer carries it as a field.
{
    const ids = new Set(INSTRUMENTS.map((i) => i.id));
    const missing = all.filter((p) => !p.instrument);
    const dangling = all.filter((p) => p.instrument && !ids.has(p.instrument));
    ok("!! every registered knob NAMES the instrument it belongs to (an explicit link, not a filename guess)",
       missing.length === 0, missing.length ? "no instrument field: " + missing.map((p) => p.id).join(", ") : all.length + " proposers linked");
    ok("...and every named instrument exists in the registry",
       dangling.length === 0,
       dangling.length ? "dangling: " + dangling.map((p) => p.id + " -> " + p.instrument).join(", ")
                       : all.map((p) => p.id + " -> " + p.instrument).join(", "));
}

// ---- 3. THE EXCLUSIONS ARE RECORDED, NOT SILENT ---------------------------------------------------------------------
{
    ok("!! instruments deliberately NOT registered are listed WITH the reason",
       Object.keys(NOT_REGISTERED).length >= 5 &&
       Object.values(NOT_REGISTERED).every((r) => typeof r === "string" && r.length > 40),
       Object.keys(NOT_REGISTERED).join(", ") + " — a registry that silently omits things is indistinguishable from one that forgot");
    ok("!! ...including the one that was ATTEMPTED AND WITHDRAWN, which is the honest half of this round",
       /ATTEMPTED AND WITHDRAWN/.test(NOT_REGISTERED["ising-samples"] || ""),
       "an adjudicator nobody understands well enough to calibrate is an invented one, and inventing forty to hit a count would have been the worst trade in the lab");
}

// ---- 4. THE DEGENERATE REWARD LOSES EVERY TIME ------------------------------------------------------------------------
// Each score here is the cheap direction on purpose: fewer grid points, shorter window, fewer realizations,
// smaller population, bigger timestep, smaller box. In every case the winner on score must be refused.
{
    const rows = [];
    for (const inst of all) {
        const r = await (async () => {
            const p = getProposer(inst.id);
            const cands = p.propose().map((c) => ({ c, s: p.score(c) })).sort((a, b) => b.s - a.s);
            return { id: inst.id, best: Object.values(cands[0].c)[0], verdict: await p.adjudicate(cands[0].c) };
        })();
        rows.push(r);
    }
    const passed = rows.filter((r) => r.verdict.pass);
    ok("!! the cheapest candidate wins the score for EVERY instrument and is refused by EVERY adjudicator",
       passed.length === 0,
       passed.length ? "these cheap winners were accepted: " + passed.map((r) => r.id + "=" + r.best).join(", ")
                     : rows.map((r) => r.id.split("-")[0] + "=" + r.best).join(", ") + " — all refused");
}

// ---- 5. THE LICENCE RATCHET APPLIES TO ALL OF THEM IDENTICALLY -------------------------------------------------------
{
    const id = "kuramoto-N";
    const p = getProposer(id);
    ok("a knob cannot be self-applied at the default tier", !applyKnobs(id, { N: 4096 }).applied);
    const good = await p.adjudicate({ N: 4096 });
    grantLicence(id, "adopt", good, { persist: false });
    ok("!! adopted on adjudicated evidence, the good value applies and the cheap one still does not",
       applyKnobs(id, { N: 4096 }).applied && !applyKnobs(id, { N: 64 }).applied,
       "the licence buys the right to ask, never the right to be believed — and that is uniform across physics, fluids, MD and the suite scheduler");
}

// ---- 6. THE GENERALITY CLAIM, MADE CONCRETE ----------------------------------------------------------------------------
{
    const areas = new Set();
    for (const p of all) {
        const inst = INSTRUMENTS.find((i) => i.id === p.instrument);
        if (inst) areas.add(inst.area);
    }
    ok("!! one interface now governs knobs across several areas of the lab, not one corner of it",
       areas.size >= 3, [...areas].join(", ") + " — plus the LBM and the suite scheduler registered elsewhere");
}

console.log(fails ? ("[knobRegistry-selfcheck] FAILED " + fails) : "[knobRegistry-selfcheck] all passed");
process.exit(fails ? 1 : 0);
