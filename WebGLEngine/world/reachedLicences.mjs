// FILE: world/reachedLicences.mjs -- v4198
//
// THE REGISTER OF SOURCES THIS TREE HAS READ AND NOT VENDORED, each with the licence that governs it,
// quoted rather than characterised.
//
// world/orrery.mjs already models a VENDORED dependency: it scans vendor/ for licence files and calls the
// result CAPTURED, UNPAPERED or REACHED. But its evidence is a FILE ON DISK, so it can only see what was
// taken. A source that was read and deliberately not taken leaves no trace for it to find -- and "we looked
// at this and chose not to vendor it, for this reason" is exactly the fact that goes missing first.
//
// gpu/khronosSamples.mjs set the precedent for the shape: it records BrainStem as LicenseRef-Poser-EULA,
// "not an open licence at all", and marks such sources "restricted -- stream only, do not vendor without
// reading the actual licence". This file is that idea applied to code rather than models.
//
// *** WHAT CLOSED BACKLOG ITEM #59, AND IT CORRECTED THE ITEM'S OWN PREMISE. *** The item read "codrops: same
// publisher, two different licences four years apart". Four codrops repositories were then read and their
// licence sections compared. They are not two licences. They are ONE licence, restated once -- and the
// restatement is three years apart, not four. The 2018 wording is LONGER and STRICTER: it adds a permission
// (web templates intended for sale) and two prohibitions (selling "pluginized" versions, re-publishing).
// A drift in wording is not a drift in terms, and saying which one happened is the whole value of quoting.
//
// *** AND THE CLAUSE THAT DECIDES EVERYTHING FOR THIS TREE IS THE SAME IN BOTH: DO NOT REDISTRIBUTE. ***
// Vendoring a file into a public git repository IS redistribution. So no codrops byte can ever enter this
// tree, in any era of their licence, however permissive the "integrate or build upon it" half sounds. The
// effect can be REACHED -- read for what it is and written here -- and that is all.
"use strict";

/** Verbatim, from codrops/ElasticProgress and codrops/RainEffect. Both carry (c) Codrops 2015. */
export const CODROPS_2015 =
    "Integrate or build upon it for free in your personal or commercial projects. " +
    "Don't republish, redistribute or sell 'as-is'.";

/** Verbatim, from codrops/ParticleEffectsButtons, (c) Codrops 2018. */
export const CODROPS_2018 =
    "This resource can be used freely if integrated or built upon in personal or commercial projects such as " +
    "websites, web apps and web templates intended for sale. It is not allowed to take the resource 'as-is' " +
    "and sell it, redistribute, re-publish it, or sell 'pluginized' versions of it.";

/** How a source may be used here. Narrower than the orrery's vocabulary, because this file is about intent. */
export const POSTURE = Object.freeze({
    REACHED: "reached",         // read for the idea; nothing copied. The only posture a non-redistributable source can have here.
    VENDORABLE: "vendorable",   // the licence permits redistribution; the tree simply has not taken it.
    REFUSED: "refused",         // read and rejected, for a reason worth keeping.
});

/**
 * Sources read during assessment rounds and NOT vendored.
 *
 * `licence` is quoted verbatim where the source states one in prose. `spdx` is filled only where the source
 * names a standard licence, because "MIT" is a claim a reader can verify and a paraphrase is not.
 * `taken` says what actually entered the tree, and null is a real and common answer.
 */
export const REACHED_SOURCES = Object.freeze([
    {
        repo: "codrops/ElasticProgress", licenceExists: true, publisher: "Codrops", year: 2015,
        spdx: null, licence: CODROPS_2015, redistributable: false, posture: POSTURE.REACHED,
        taken: null, takenPaths: [],
        why: "Needs GSAP, which this tree does not carry, and its SVG-morph half is already ui/svgPath.mjs. " +
             "The one transferable piece is an elastic easing curve, which simulation/easing.js lacks -- " +
             "a damped sinusoid, where easeOutBack overshoots exactly once.",
    },
    {
        repo: "codrops/RainEffect", licenceExists: true, publisher: "Codrops", year: 2015,
        spdx: null, licence: CODROPS_2015, redistributable: false, posture: POSTURE.REACHED,
        taken: null, takenPaths: [],
        why: "Rain on glass -- droplets as refractive lenses over a background, with trails that merge. " +
             "Genuinely absent here: the tree's `raindrop` hits are hydraulic erosion and `droplet` is a " +
             "kaiju attack. Reachable as an idea; the bytes cannot be taken.",
    },
    {
        repo: "codrops/HeatDistortionEffect", licenceExists: true, publisher: "Codrops", year: 2016,
        // *** NOT QUOTED, BECAUSE IT WAS NOT READ VERBATIM. *** The README points at the Codrops licence page
        // rather than restating it, and recording a paraphrase in a field the gate treats as a quotation is
        // how a register starts lying. Same publisher, same posture, text uncaptured -- said plainly.
        spdx: null, licence: null, licenceNote: "Codrops site licence, referenced by link rather than restated",
        redistributable: false, posture: POSTURE.REACHED, taken: null, takenPaths: [],
        why: "Already present by another route: bcs_heatShimmer shipped at v4164 from krispuckett/SwiftUIShaders " +
             "(MIT), CPU-modelled and verified bit-exact against the GPU at v4196.",
    },
    {
        repo: "codrops/ParticleEffectsButtons", licenceExists: true, publisher: "Codrops", year: 2018,
        spdx: null, licence: CODROPS_2018, redistributable: false, posture: POSTURE.REFUSED,
        taken: null, takenPaths: [],
        why: "Refusable twice over. It depends on anime.js, which v4197 refused by name because its own rAF " +
             "loop is invisible to document.getAnimations() and therefore to engine/frameDirty.js. And its " +
             "effect is the element-to-particles idea of ZachSaucier/Disintegrate, which is MIT and needs no " +
             "dependency at all.",
    },
    {
        repo: "ZachSaucier/Asset-Loading-Effects", licenceExists: false, publisher: "Zach Saucier", year: null,
        spdx: null, licence: null, licenceNote: "no LICENSE file and no licence section -- UNPAPERED",
        redistributable: false, posture: POSTURE.REACHED, taken: null, takenPaths: [],
        why: "No licence means no permission, so nothing can be taken regardless of merit -- the same posture " +
             "as Gixxern/JS---Webcam-effects. It does name a real gap: splat.load, realTerrain.load and " +
             "schematic.load fetch large assets and report no progress at all.",
    },
    {
        repo: "gre/beez", licenceExists: true, publisher: "Zengularity", year: 2014,
        spdx: "AGPL-3.0", licence: null, redistributable: false, posture: POSTURE.REACHED, taken: null, takenPaths: [],
        why: "AGPL-3.0's network clause makes it the strictest copyleft here; archived in 2022. And the idea " +
             "-- a phone as an XY-pad controller -- is already phone.html's joysticks sending movevec/lookvec.",
    },
    {
        repo: "kamend/ChuckClose-SparkAR", licenceExists: false, publisher: "kamend", year: null,
        spdx: null, licence: null, licenceNote: "a Spark AR project file with no licence shown",
        redistributable: false, posture: POSTURE.REACHED,
        taken: "render/chuckCloseModel.mjs -- the effect written from its description, with nothing copied",
        // *** THE FILES ALLOWED TO NAME THIS SOURCE, WHICH IS NOT THE SAME AS FILES CONTAINING ITS BYTES. ***
        // A module that took an IDEA must credit where it came from -- that is the provenance discipline
        // working, not a leak. The gate's byte-scan reads this list rather than a hardcoded allowance, so
        // crediting a source and smuggling one stay distinguishable.
        takenPaths: ["render/chuckCloseModel.mjs"],
        why: "The technique is decades older than any repository. Recorded because REACHED-with-something-taken " +
             "is the posture most likely to be mistaken for CAPTURED later.",
    },
]);

/** Everything wrong with one entry. Empty means it can be trusted as a record. */
export function validateEntry(e) {
    const p = [];
    if (!e || typeof e !== "object") return ["not an object"];
    if (!e.repo) p.push("no repo");
    if (!Object.values(POSTURE).includes(e.posture)) p.push(`unknown posture "${e.posture}"`);
    // *** A LICENCE FIELD IS EITHER A QUOTATION, AN SPDX ID, OR AN EXPLICIT NOTE SAYING WHY IT IS NEITHER. ***
    // Silence in this field reads as "unlicensed" and could equally mean "nobody looked", and those are very
    // different facts. This is the same distinction world/orrery.mjs draws between UNPAPERED and unchecked.
    if (!e.licence && !e.spdx && !e.licenceNote) {
        p.push(`${e.repo}: no licence, no spdx and no note -- silence here cannot distinguish "unlicensed" from "nobody looked"`);
    }
    if (typeof e.redistributable !== "boolean") p.push(`${e.repo}: redistributable is not stated`);
    if (typeof e.licenceExists !== "boolean") {
        p.push(`${e.repo}: does not say whether a licence EXISTS -- distinct from whether we quoted it`);
    }
    if (!("taken" in e)) p.push(`${e.repo}: does not say what was taken (null is a real answer)`);
    if (!Array.isArray(e.takenPaths)) p.push(`${e.repo}: no takenPaths list -- the files allowed to name it`);
    else if (!e.taken && e.takenPaths.length) p.push(`${e.repo}: took nothing, yet lists files that took something`);
    if (!e.why) p.push(`${e.repo}: no reason recorded -- the reason is the whole point of the register`);
    // A source that may not be redistributed may not be vendored, so it cannot be VENDORABLE.
    if (e.redistributable === false && e.posture === POSTURE.VENDORABLE) {
        p.push(`${e.repo}: marked vendorable while its licence forbids redistribution`);
    }
    return p;
}

/** Every entry that must never contribute bytes to this tree. */
export function nonRedistributable(sources = REACHED_SOURCES) {
    return sources.filter((e) => e.redistributable === false);
}

/**
 * *** THE #59 FINDING, AS A FUNCTION RATHER THAN A SENTENCE. ***
 *
 * Compares the two codrops licence texts and reports what actually changed. The answer a reader needs is not
 * "they differ" -- of course they differ -- but whether the TERMS moved or only the WORDS. Both texts grant
 * the same permission and impose the same prohibition; the later one is longer and adds two clauses.
 */
export function codropsDrift() {
    // `built? upon` was the first spelling here and it is WRONG: it matches "buil" or "built", never "build".
    // The 2015 text says "build upon" and so failed a clause it plainly contains, and codropsDrift() reported
    // bothGrantIntegration:false -- a made-up difference between two licences, inside the function written to
    // say whether they differ. An optional letter is not the same as a character class.
    const grants = (t) => /integrat/i.test(t) && /buil[dt] upon/i.test(t) && /free/i.test(t)
                       && /personal or commercial/i.test(t);
    const forbids = (t) => /(re-?publish)/i.test(t) && /redistribute/i.test(t) && /sell/i.test(t) && /as-is/i.test(t);
    return {
        identical: CODROPS_2015 === CODROPS_2018,
        bothGrantIntegration: grants(CODROPS_2015) && grants(CODROPS_2018),
        bothForbidRedistribution: forbids(CODROPS_2015) && forbids(CODROPS_2018),
        yearsApart: 2018 - 2015,
        addedIn2018: [
            /web templates intended for sale/i.test(CODROPS_2018) && !/web templates/i.test(CODROPS_2015)
                ? "permits web templates intended for sale" : null,
            /pluginized/i.test(CODROPS_2018) && !/pluginized/i.test(CODROPS_2015)
                ? "forbids selling pluginized versions" : null,
        ].filter(Boolean),
        verdict: "one licence, restated -- the terms did not move",
    };
}

/**
 * *** HOW FORMIDABLE A LICENCE IS, AS A NUMBER THE ORRERY CAN DRAW. ***
 *
 * Keith's framing, and it is the right one: a restrictive licence should make a BIGGER, angrier planet, not a
 * footnote. So severity is not "how bad" -- it is HOW FAR THE RESTRICTION REACHES, which is what makes one
 * feel dangerous to approach:
 *
 *   0 open        a standard permissive licence. Take it, ship it, keep the notice.
 *   1 unpapered   no licence at all. No grant, but no terms either -- inert rather than hostile.
 *   2 no-redist   a bespoke licence permitting use and forbidding movement of the bytes (Codrops).
 *   3 reciprocal  strong copyleft, and AGPL's network clause reaches your own work even unshipped.
 *
 * All of 1-3 come to the same practical answer for this tree -- do not vendor -- and they get there for
 * completely different reasons, which is exactly why one number beats one boolean. An AGPL body is the most
 * formidable not because it forbids the most but because its terms follow you home.
 */
export const SEVERITY = Object.freeze({ OPEN: 0, UNPAPERED: 1, NO_REDISTRIBUTION: 2, RECIPROCAL: 3 });

export function severityOf(e) {
    // *** THIS ASKED WHETHER THE LICENCE WAS QUOTED, NOT WHETHER ONE EXISTS. *** codrops/HeatDistortionEffect
    // came out UNPAPERED beside its three identically-licensed siblings, purely because its README links the
    // terms instead of restating them. "We did not copy the text" and "there is no text" are opposite facts,
    // and world/orrery.mjs draws exactly that line for vendored code. `licenceExists` is the field that
    // carries it, so a gap in OUR record can never be reported as a gap in THEIRS.
    if (/^(AGPL|GPL|LGPL)/i.test(e.spdx || "")) return SEVERITY.RECIPROCAL;
    if (e.licenceExists === false) return SEVERITY.UNPAPERED;
    if (e.redistributable === false) return SEVERITY.NO_REDISTRIBUTION;
    return SEVERITY.OPEN;
}

/** The register as orbital bodies, for world/orrery.mjs -- severity is the body's heft. */
export function asBodies(sources = REACHED_SOURCES) {
    return sources.map((e) => ({
        name: e.repo,
        severity: severityOf(e),
        posture: e.posture,
        vendored: false,                 // by definition: this register is what was NOT taken
        took: e.taken || null,
    }));
}

/** A readable line per source, for a page or a console. */
export function describeSource(e) {
    const lic = e.spdx || (e.licence ? "bespoke (quoted)" : e.licenceNote || "unknown");
    return `${e.repo} (${e.year || "year unknown"}) -- ${lic}, ${e.posture}` +
           (e.taken ? `, TOOK: ${e.taken}` : ", took nothing");
}
