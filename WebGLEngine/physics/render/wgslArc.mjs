// physics/render/wgslArc.mjs -- v4478
//
// *** SEVEN WGSL PRODUCERS SHIPPED WITH NO FRONT DOOR, AND THEY ARRIVED AS ONE SPECIES RATHER THAN AS SEVEN
// OVERSIGHTS. *** physicsReach-selfcheck ratchets the count of graded physics modules reachable from no
// roundhouse device, no instruments row and no page. v4461 corrected that baseline from 35 to 7 -- most of the
// 35 was phantom debt, modules with a door the count could not see -- and named the seven real ones. Today it
// reads 14, and the difference is exactly this arc: energyComp, fresnel, furnace, microfacetAniso,
// microfacetSample, microfacet and mis, every one a WGSL producer, every one landed between v4407 and v4416.
//
// They are not unreachable by accident. tools/ship/wgslCorpus.mjs and render/backendParity.mjs both read them,
// and two gates grade them, so they are thoroughly CHECKED. What none of that provides is a way for a PERSON
// to see the shader a module emits and the CPU answer it is held to. That is what a door is, and this file is
// one: a census of the arc, exported through reportLines so instrument-bench.html can serve it.
//
// ---- *** THE ARC HAS TWO SHAPES AND A CENSUS THAT ASSUMES ONE SEES FIVE OF SEVEN *** -----------------------
//
// Five producers export their shader as a CONSTANT -- COMP_WGSL, FRESNEL_WGSL, FURNACE_WGSL, ANISO_WGSL,
// MIS_WGSL. Two BUILD it, through buildWgsl(plant) and buildSampleWgsl(plant), because the planted-defect
// variants change the source text rather than a uniform. A census that looks for a `*_WGSL` string export
// therefore finds five, and reports the other two as HAVING NO SHADER AT ALL.
//
// *** THAT IS NOT HYPOTHETICAL: THIS ROUND'S FIRST PROBE DID EXACTLY THAT AND I NEARLY WROTE THE RESULT DOWN
// AS A FINDING ABOUT THE MODULES. *** It is v4453's rule one level down -- reportDoors measured that reading a
// function's SIGNATURE misclassifies fourteen of twenty modules, because `Function.length` answers "can I call
// this with nothing" and the source text answers a different question. Here the same mistake is one step
// earlier: the shape of an EXPORT is not the shape of the thing. You have to call the builder.
//
// So `sourceOf` tries the constant, then the builder, and reports WHICH -- because a census that silently
// papers over the two shapes would be right about the total and wrong about every member.
//
// ---- *** WHAT THE FIRST RUN FOUND, WHICH IS A CLEAN BILL AND IS REPORTED AS ONE *** -------------------------
//
// All seven yield source: 3697, 11182, 4300, 7540, 13319, 6322 and 8234 bytes. Between them they declare
// TWENTY planted faults -- the deliberate-defect vocabulary each shader is driven with -- and every one of the
// twenty is reachable in the text the module actually emits. Nothing is rotten here today. That is worth
// stating plainly rather than hunting for a defect to justify the round: the DOOR is the deliverable, and the
// census is what makes the door worth opening. A fault declared in an enum and absent from the shader would be
// a plant nobody can plant, and until now nothing would have said so.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ------------------------------------------------------------------------
//
// That the shaders are CORRECT. crossBackend-selfcheck and wgslCorpus-selfcheck own that, and this file would
// report a clean census over seven wrong shaders. It reads what is emitted; it does not run it, and this box
// serves no WebGPU adapter in any case.
//
// That a door proves a working page. physicsReach's own limits say it measures whether a door EXISTS, not
// whether it opens, and adding a row to satisfy a counter would be exactly the defect this tree keeps finding.
// The row this round adds is backed by a real report: instrument-bench.html renders reportLines, so a person
// who opens it sees the seven, their sizes, their shapes and their fault vocabulary. That is the whole test I
// held it to -- if the bench showed nothing, the door would be decorative and the honest move would have been
// to move physicsReach's baseline instead and say why.

import * as backendParity from "../../render/backendParity.mjs";

/** The arc, by module path -- the same strings physicsReach matches against, so one list serves both. */
export const PRODUCERS = Object.freeze([
    "physics/render/energyCompWgsl.mjs",
    "physics/render/fresnelWgsl.mjs",
    "physics/render/furnaceWgsl.mjs",
    "physics/render/microfacetAnisoWgsl.mjs",
    "physics/render/microfacetSampleWgsl.mjs",
    "physics/render/microfacetWgsl.mjs",
    "physics/render/misWgsl.mjs",
]);

export const SHAPE = Object.freeze({ constant: "constant", builder: "builder", none: "none" });

/**
 * The shader a producer emits, and HOW it was obtained. Constant first, builder second; the second is the one
 * a census written for the first shape misses, so `shape` is returned rather than inferred by the caller.
 */
export function sourceOf(mod) {
    const konst = Object.entries(mod).find(([k, v]) => /_WGSL$/.test(k) && typeof v === "string");
    if (konst) return { text: konst[1], shape: SHAPE.constant, via: konst[0] };
    const build = Object.entries(mod).find(([k, v]) => /^build.*Wgsl$/.test(k) && typeof v === "function");
    if (build) {
        try { const t = build[1]({}); if (typeof t === "string") return { text: t, shape: SHAPE.builder, via: build[0] + "()" }; }
        catch (e) { return { text: null, shape: SHAPE.none, via: build[0] + "() threw: " + e.message }; }
    }
    return { text: null, shape: SHAPE.none, via: "no constant and no builder" };
}

/** Is a declared fault bit actually consulted by the emitted shader? A plant nobody can plant is not a plant. */
export const faultReached = (text, bit) => new RegExp("&\\s*" + bit + "u?\\b").test(text);

/**
 * The census. `load` is injectable so the gate can hand this a producer with a fault the shader never reads
 * and watch what it says -- a check for unreachable faults that cannot be given one is a check nobody has run.
 */
export async function arcCensus({ load = null, producers = PRODUCERS } = {}) {
    const rows = [];
    for (const rel of producers) {
        const mod = load ? await load(rel) : await import("../../" + rel);
        const src = sourceOf(mod);
        const faults = mod.FAULT || {};
        const declared = Object.entries(faults);
        const unreached = src.text ? declared.filter(([, bit]) => !faultReached(src.text, bit)).map(([k]) => k) : declared.map(([k]) => k);
        rows.push({
            module: rel, shape: src.shape, via: src.via,
            bytes: src.text ? src.text.length : 0,
            lang: src.text ? backendParity.classify(src.text) : backendParity.LANG.NONE,
            faults: declared.length, unreached,
        });
    }
    return {
        rows,
        producers: rows.length,
        withSource: rows.filter((r) => r.text !== null && r.bytes > 0).length,
        byShape: rows.reduce((a, r) => (a[r.shape] = (a[r.shape] || 0) + 1, a), {}),
        declaredFaults: rows.reduce((n, r) => n + r.faults, 0),
        unreachedFaults: rows.flatMap((r) => r.unreached.map((f) => r.module.split("/").pop() + ":" + f)),
    };
}

export async function reportLines() {
    const c = await arcCensus();
    const L = [];
    L.push("the WGSL arc -- seven producers, the shader each emits, and the faults it can be driven with");
    L.push("  shapes: " + Object.entries(c.byShape).map(([k, v]) => v + " " + k).join(", ") +
           "   (a census written for one shape sees " + (c.byShape.constant || 0) + " of " + c.producers + ")");
    for (const r of c.rows)
        L.push("  " + r.module.split("/").pop().padEnd(22) + String(r.bytes).padStart(6) + " b  " +
               r.lang.padEnd(5) + " via " + r.via.padEnd(24) + " faults " + r.faults +
               (r.unreached.length ? "  UNREACHED: " + r.unreached.join(",") : ""));
    L.push("  " + c.declaredFaults + " declared faults, " + c.unreachedFaults.length + " not consulted by the shader that declares them" +
           (c.unreachedFaults.length ? ": " + c.unreachedFaults.join(", ") : ""));
    return L;
}

export const ARC_AT_V4478 = Object.freeze({
    producers: 7,
    bytes: Object.freeze([3697, 11182, 4300, 7540, 13319, 6322, 8234]),
    byShape: Object.freeze({ constant: 5, builder: 2 }),
    declaredFaults: 20,
    unreachedFaults: 0,
    // physicsReach's baseline was corrected to 7 at v4461 and read 14 before this round gave the arc a door.
    physicsReachBefore: 14, physicsReachBaseline: 7,
});
