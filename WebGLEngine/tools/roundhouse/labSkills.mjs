// tools/roundhouse/labSkills.mjs
//
// Run: node tools/roundhouse/labSkills.mjs             (front door: a reportingTools row)
// Gated by tools/roundhouse/skillCodeTrial-selfcheck.mjs.
//
// v3711 -- THE FIRST CODE SKILLS THAT ARE ABOUT SOMETHING REAL, and the reason they are code rather than hints
// is a capability, not a preference: THEY RUN THE DEVICE.
//
// deviceCritic already tells a proposer the mechanical facts it can read off the device -- which observables
// exist, and the nearest name when one is mistyped. What it CANNOT say is what a reasonable tolerance would be,
// because that depends on the SCALE of the observable, and the scale is not written anywhere. It has to be
// measured by building the device and looking. A hint string cannot do that; every hint in skillbook is a
// sentence fixed at authoring time. This is the seam where an executable skill earns its keep.
//
// WHAT THESE DO NOT DO:
//   * THEY DO NOT REPAIR THE CLAIM. tolFor returns a MEASUREMENT -- the observable's value at this device's
//     defaults, its order of magnitude, and a tolerance derived from that -- and the proposer still writes its
//     own claim. composePropose's line holds: the reply is never repaired.
//   * THEY DO NOT DECIDE WHETHER THEY HELP. That is skillCodeTrial's measured before/after, and until it has
//     run against a producer that varies, these are PROPOSED and nothing more.
//
// NOT CLAIMED: that a magnitude-derived tolerance is the RIGHT tolerance for any particular claim. It is a
// starting scale measured from the device instead of guessed, which is a different and smaller claim.

import { makeCodeSkill, codeBook } from "./skillCode.mjs";

/** Order of magnitude of a finite non-zero number, or null. The small composable piece. */
export const magnitude = makeCodeSkill({
    id: "magnitude",
    trigger: "malformed",
    run: (x) => {
        const v = Math.abs(Number(x));
        if (!Number.isFinite(v) || v === 0) return null;   // 0 has no order of magnitude, and NaN is not one either
        return Math.floor(Math.log10(v));
    },
});

/**
 * Build the named device, read one observable, and derive a tolerance from its measured scale.
 * Returns null rather than a guess when the device or the observable is not there -- ABSENT IS NOT A NUMBER.
 */
export const tolFor = makeCodeSkill({
    id: "tolFor",
    trigger: "malformed",
    uses: ["magnitude"],
    run: async ({ device, mode, observable } = {}, ctx) => {
        // getDevice, from devices.mjs -- the registry that hands out devices. v3707 measured why this matters:
        // reaching for a module-level export instead of the registry found NOTHING.
        const { getDevice } = await import("./devices.mjs");
        const dev = await getDevice(device).catch(() => null);
        if (!dev || typeof dev.build !== "function") return null;
        const out = dev.build(dev.defaults ? dev.defaults({ mode }) : { mode });
        if (!out || typeof out[observable] !== "number") return null;
        const value = out[observable];
        // AWAIT THE COMPOSITION: runSkillAsync's ctx.call is async, so an unawaited call yields a Promise that
        // arithmetic silently turns into NaN rather than throwing. Measured at v3711 -- the front door printed
        // "magnitude [object Promise], suggested tol NaN" and NOTHING ELSE COMPLAINED.
        const mag = await ctx.call("magnitude", value);
        if (mag === null) return null;
        // One decade below the value: 6.03 -> 0.1, 11 -> 1, 0.61 -> 0.01. A SCALE, NOT A VERDICT.
        return { observable, value, magnitude: mag, suggestedTol: Math.pow(10, mag - 1),
                 measuredFrom: `${device}/${mode} at this device's own defaults` };
    },
});

export const LAB_SKILLS = Object.freeze([magnitude, tolFor]);

/** The book, built in dependency order -- codeBook refuses `uses` of anything not already registered. */
export function labBook() { return codeBook(LAB_SKILLS); }

// ---- front door ------------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
    const { runSkillAsync } = await import("./skillCode.mjs");
    const book = labBook();
    console.log("[labSkills] code skills that RUN THE DEVICE -- the thing a hint string cannot do\n");
    console.log("  book:", book.ids().join(", "));
    for (const [dv, mode, obs] of [["blackhole", "neutronstar", "rsKm"], ["blackhole", "neutronstar", "escapeFrac"], ["blackhole", "neutronstar", "notAnObservable"]]) {
        const r = await runSkillAsync(book, "tolFor", { device: dv, mode, observable: obs });
        const v = r.state === "ran" ? r.value : null;
        console.log(`  tolFor(${dv}/${mode}, ${obs}) ->`, v ? `value ${v.value}, magnitude ${v.magnitude}, suggested tol ${v.suggestedTol}` : "null (absent is not a number)");
    }
    console.log("\n  NOT CLAIMED: that these tolerances are right for any claim, or that either skill helps.");
    console.log("  Both are PROPOSED until skillCodeTrial measures them against a producer that varies.");
}
