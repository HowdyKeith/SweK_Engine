// WebGLEngine/tools/roundhouse/corroborationReach.mjs -- v3511
//
// *** THE BATTERY'S RULE WAS WRITTEN AS "5 OF 27 DEVICES QUALIFY". IT IS STILL FIVE AND THE LAB IS NOW
// SEVENTY-TWO. THE REACH FELL FROM 18.5% TO 6.9% WITHOUT ONE LINE OF CODE CHANGING AND WITH NOTHING REPORTING
// IT -- the numerator was watched and THE DENOMINATOR TRIPLED. ***
//
// Same shape as gateReach's 63.3%, which was a denominator nobody looked inside, and as the 97% coverage figure
// that was known wrong while being quoted. **QUOTE THE RATE, NEVER THE COUNT**, and derive both terms.
//
// corroborateFully judges one quantity on four criteria, and three of them are the lab's whole cross-cutting
// analysis family: c2 is INVARIANCE (a parameter that must not matter), c3 is SENSITIVITY (convergence under
// refinement), c4 is NUMERICAL STABILITY (a one-ulp libm shift). ELIGIBILITY IS THE BINDING CONSTRAINT AND NOT
// TOLERANCE -- a device needs BOTH a refinement and a nuisance knob -- so this report is about who can be asked
// the questions at all, which is a prior question to how any of them answer.
"use strict";
import { REFINEMENT_KNOBS } from "./refinementKnobs.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { NEW_NUISANCE } from "./corroborateFully.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

/**
 * *** THE NUISANCE REGISTER LIVES IN TWO FILES AND ANYTHING COUNTING ELIGIBILITY MUST UNION BOTH. ***
 * NUISANCE_KNOBS is the original register and NEW_NUISANCE was added inside corroborateFully; a census reading
 * only the first would UNDERCOUNT and would do it silently, in the direction of "there is less work than you
 * think". The union is taken here once so no caller has to remember.
 */
/**
 * *** v3515 -- A NEGATIVE CONTROL IS NOT A NUISANCE KNOB, AND THIS COUNTED ONE FROM THE DAY IT WAS WRITTEN. ***
 *
 * blackhole's only entry in the nuisance register carries `negativeControl: true` and says so IN ITS OWN `why`,
 * IN CAPITALS: "NOT a nuisance parameter, and it is here as a NEGATIVE CONTROL. Halving the timestep is a
 * refinement knob: the physics says the answer should CONVERGE, not stay put, so a sweep over it must show
 * movement." IT IS REGISTERED TO MOVE. Counting it as a knob that DEMANDS INVARIANCE did three things:
 *
 *   - inflated the eligible numerator by one, so the census read 6 of 72 when the honest figure is 5;
 *   - made blackhole report as one REFINEMENT knob short when it is one NUISANCE knob short, which sent v3514
 *     to register escTol into a slot that was already filled;
 *   - and let v3514 record A PROMOTION THAT WAS NOT ONE.
 *
 * *** A SET THAT LOOKS LIKE A CORPUS -- the shape this tree names more often than any other -- WITH THE
 * GIVEAWAY SITTING IN THE REGISTER'S OWN PROSE WHERE NOTHING READ IT. *** The union of the two files was the
 * part everyone remembered to check; WHAT IS IN THEM was not.
 *
 * DERIVED FROM THE FLAG rather than from a name list, so a second negative control is excluded automatically
 * and nobody has to remember this file exists.
 */
const allNuisanceEntries = () => ({ ...NUISANCE_KNOBS, ...(NEW_NUISANCE || {}) });
export const nuisanceNames = () =>
    new Set(Object.entries(allNuisanceEntries()).filter(([, k]) => !k.negativeControl).map(([n]) => n));

/** Registered to MOVE. Counted and reported APART, because they are doing their job rather than failing it. */
export const negativeControlNames = () =>
    new Set(Object.entries(allNuisanceEntries()).filter(([, k]) => k.negativeControl).map(([n]) => n));
export const refinementNames = () => new Set(Object.keys(REFINEMENT_KNOBS));

export function reach() {
    const re = refinementNames(), nu = nuisanceNames();
    const registry = new Set(DEVICE_NAMES);
    const eligible = [...re].filter((d) => nu.has(d)).sort();
    return {
        devices: DEVICE_NAMES.length,
        refinement: [...re].sort(), nuisance: [...nu].sort(), eligible,
        // *** THE CHEAPEST WORK IN THE LAB, because the battery's own rule is "A KNOB ADDED IS A DEVICE
        // PROMOTED" -- and until now nothing named who was one knob away.
        needNuisance: [...re].filter((d) => !nu.has(d)).sort(),
        needRefinement: [...nu].filter((d) => !re.has(d)).sort(),
        neither: DEVICE_NAMES.filter((d) => !re.has(d) && !nu.has(d)).sort(),
        // A knob registered against a device that does not exist is a register pointing at nothing.
        orphanKnobs: [...new Set([...re, ...nu])].filter((d) => !registry.has(d)).sort(),
    };
}

/**
 * The config surface of the devices with no knob at all. *** THIS IS A REPORT AND NOT A VERDICT. *** A numeric
 * config key is a candidate for a knob and nothing more: whether a parameter is a NUISANCE (the answer must not
 * move) or a REFINEMENT (the answer must converge) or NEITHER is a physical judgement about that device, and
 * knobCandidates.mjs exists precisely because three candidates were examined and all three REJECTED with
 * reasons. AN ABSENT KNOB IS A MISSING DECLARATION, NOT PROOF OF A MISSING KNOB -- and the converse is equally
 * true, so this column decides nothing on its own.
 */
export async function configSurface() {
    const r = reach(), withNums = [], without = [], broken = [];
    for (const name of r.neither) {
        try {
            const d = await getDevice(name);
            const def = d.defaults ? d.defaults({}) : null;
            const cfg = (def && def.config) || {};
            const nums = Object.entries(cfg).filter(([, v]) => typeof v === "number").map(([k]) => k);
            (nums.length ? withNums : without).push({ name, keys: nums });
        } catch (e) { broken.push({ name, why: String(e && e.message || e).slice(0, 60) }); }
    }
    return { withNums, without, broken };
}

export async function reportLines() {
    const r = reach(), s = await configSurface();
    const pct = (n) => (100 * n / r.devices).toFixed(1) + "%";
    const out = [
        `${r.eligible.length} of ${r.devices} devices can be put through the four-criterion battery at all -- ${pct(r.eligible.length)}`,
        `  eligible (both knobs): ${r.eligible.join(" ")}`,
        `  refinement knobs (${r.refinement.length}): ${r.refinement.join(" ")}`,
        `  nuisance knobs   (${r.nuisance.length}): ${r.nuisance.join(" ")}`,
        `  NEGATIVE CONTROLS, excluded because they are registered to MOVE: ${[...negativeControlNames()].join(" ") || "none"}`,
        "",
        "ONE KNOB SHORT -- the cheapest promotions in the lab, since a knob added is a device promoted:",
        `  have refinement, need a NUISANCE knob:   ${r.needNuisance.join(" ") || "none"}`,
        `  have nuisance,   need a REFINEMENT knob: ${r.needRefinement.join(" ") || "none"}`,
        "",
        `${r.neither.length} devices have NEITHER knob. Of those, ${s.withNums.length} expose numeric config keys and ${s.without.length} expose none` +
        (s.broken.length ? `; ${s.broken.length} would not build` : ""),
        "",
        "  THIS SPLIT IS A REPORT AND NOT A VERDICT. A numeric config key is a candidate and nothing more --",
        "  whether a parameter is a NUISANCE (the answer must not move) or a REFINEMENT (the answer must",
        "  converge) or neither is a physical judgement about that device. knobCandidates.mjs exists because",
        "  three candidates were examined and ALL THREE REJECTED, with the reasons re-measured rather than",
        "  quoted. An absent knob is a missing declaration, not proof of a missing knob -- and the converse",
        "  holds too, so nothing here should be read as a to-do list of 52 items.",
        "",
        "  candidates with numeric config:",
    ];
    for (const d of s.withNums) out.push(`    ${d.name.padEnd(16)} ${d.keys.slice(0, 6).join(", ")}${d.keys.length > 6 ? ", ..." : ""}`);
    if (s.without.length) out.push("", "  no numeric config at all: " + s.without.map((d) => d.name).join(" "));
    if (r.orphanKnobs.length) out.push("", "  *** KNOBS NAMING A DEVICE THAT IS NOT IN THE REGISTRY: " + r.orphanKnobs.join(" ") + " ***");
    out.push("",
        "THE RATE IS THE NUMBER TO QUOTE AND BOTH TERMS ARE DERIVED HERE. The rule this measures was written",
        "as '5 of 27' and is still five; the lab tripled underneath it. A count is a memory and memories go",
        "stale -- so the ratchet in corroborationReach-selfcheck.mjs guards the NUMERATOR and never the rate,",
        "because the rate falls whenever the lab grows, which is the good outcome.");
    return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    console.log("[corroborationReach] who can be put through the four-criterion battery at all");
    for (const l of await reportLines()) console.log(l);
}
