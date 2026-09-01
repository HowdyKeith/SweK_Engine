// WebGLEngine/world/namedNotChecked.mjs -- v4268
//
// REPOSITORIES THAT HAVE BEEN NAMED AND NEVER OPENED, WHICH IS NOT THE SAME AS UNLICENSED.
//
// ---- THE FINDING, WHICH IS THAT SIX LICENCE VERDICTS LIVE OUTSIDE THE TREE -----------------------------------
//
// Two open-list items assert a licence state for six repositories:
//
//   #100  "UNPAPERED: advanced-threejs-tsl-webgpu-rendering has no licence at all, and it is the only TSL
//         reference"
//   #132  "UNPAPERED grows to four: gi-voxels, Repo-Explainer, threejs-procedural-terrain, ar-globe,
//         gaze-aware-3d"
//
// *** NOT ONE OF THOSE SIX NAMES APPEARS ANYWHERE IN THIS REPOSITORY. *** Not in world/reachedLicences.mjs,
// whose whole job is sources read and not vendored. Not in world/orrery.mjs, world/vendoredLicences.mjs or
// world/copiedOutsideVendor.mjs. Not in a comment, a gate, a page or a data file. A grep for all six across
// every .js, .mjs, .md, .html and .json in the tree returns nothing but the engine's own "procedural terrain"
// feature, which is unrelated to the repository of that name.
//
// So 1,342 gates cannot see these verdicts, and could not have caught them if they were wrong. That is
// precisely the failure tools/ship/claimCheck-selfcheck.mjs names as the one it cannot reach:
//
//     "THE NOTES MOST AT RISK ARE NOT IN THE TREE AT ALL -- the handoff and open-list live outside it, and
//      every staleness this session actually cost a round was in those."
//
// ---- *** AND THE REASON IS STRUCTURAL, NOT FORGETFULNESS: THE REGISTER WOULD HAVE REJECTED THEM. *** --------
//
// This is the part worth keeping. world/reachedLicences.mjs has three postures, and every one of them
// presupposes somebody OPENED the source:
//
//     REACHED     read for the idea; nothing copied
//     VENDORABLE  the licence permits redistribution; the tree simply has not taken it
//     REFUSED     read and rejected, for a reason worth keeping
//
// and validateEntry() rejects an entry whose `licenceExists` is not a boolean, with the note "does not say
// whether a licence EXISTS -- distinct from whether we quoted it". There is no third value. So a repository
// that has been NAMED as a candidate and never opened cannot be filed: the only way in is to assert
// licenceExists true or false about a repository nobody has looked at.
//
// *** FALSE IS AN ACCUSATION, AND THIS TREE HAS MADE THAT MISTAKE FOUR TIMES. *** world/orrery.mjs records
// three scans of its own that reported "no licence" against a dependency that had one -- fireworks.js's
// MIT-LICENSE.txt, the fonts' IBMPlexSerif-OFL.txt, a LICENSE nested under quickjs/ -- and
// reachedLicences.mjs records a fourth, codrops/HeatDistortionEffect, which "came out UNPAPERED beside its
// three identically-licensed siblings, purely because its README links the terms instead of restating them",
// and closes with the rule this file exists to keep: "a gap in OUR record can never be reported as a gap in
// THEIRS."
//
// The open list wrote UNPAPERED for all six anyway, where no validator could reach it. The register was
// right to refuse the entry. What was missing is a place to put it instead, and that is this file.
//
// ---- WHAT THIS REGISTER MAY AND MAY NOT SAY ------------------------------------------------------------------
//
// It holds ONE fact per repository: this name was written down as a candidate. It carries no spdx, no
// licence text, no licenceExists, and no redistributable flag, and validateNamed() FAILS an entry that grows
// one -- because an entry that can answer those questions belongs in reachedLicences.mjs, not here.
//
// mayTake() therefore returns false for every entry, and the reason it gives is deliberately not the reason
// an UNPAPERED entry gives:
//
//     UNPAPERED  "we looked and found no grant"      -- a finding about the source
//     UNCHECKED  "nobody has established a grant"    -- a finding about our record
//
// Both block taking the bytes. They are opposite statements about whose gap it is, and only one of them is
// something this tree currently has evidence for.
"use strict";

/** The single state every entry here has, named so a caller cannot mistake it for a licence verdict. */
export const UNCHECKED = "unchecked";

/**
 * Named as candidates, never opened.
 *
 * `claimedState` is what the OPEN LIST asserts, quoted so the claim and its status are visible together.
 * `established` is what this tree has evidence for, and it is UNCHECKED for all six because it is UNCHECKED
 * for all six. `wanted` is the reason the name was written down, which survives even when the licence
 * question does not -- an idea can be built from a description, as #117 built gaze dwell from Ramotion's.
 */
export const NAMED_SOURCES = Object.freeze([
    {
        repo: "advanced-threejs-tsl-webgpu-rendering", namedIn: "#100",
        claimedState: "no licence at all",
        established: UNCHECKED,
        wanted: "TSL -- three's node material shading language.",
        // *** THE HALF OF #100 THAT IS CHECKABLE HERE IS FALSE, AND IT IS THE HALF THE ITEM RESTS ON. ***
        // "it is the only TSL reference" is why the item stayed open: an unpapered source is worth arguing
        // about when it is the ONLY door to something. It is not the only one. render/solidTexture.mjs:5,
        // shipped at v4243, opens with "The idea is boytchev/tsl-textures (MIT, Pavel Boytchev 2024)" and
        // explains at length what TSL is, why that library is written in it, and why the ALGORITHM was
        // rewritten in GLSL instead. That is a TSL reference, in the tree, with a permissive licence and a
        // named author -- and it was read a round BEFORE #100's neighbours shipped.
        //
        // So the item is not blocked on a licence. It is asking for a source the tree already has a better
        // version of, and nobody noticed because the better one was recorded in a file header rather than
        // in a register that anything reads.
        checkableClaim: "it is the only TSL reference",
        checkableClaimHolds: false,
        counterExample: "render/solidTexture.mjs -- boytchev/tsl-textures, MIT, Pavel Boytchev 2024, read at v4243",
    },
    {
        repo: "gi-voxels", namedIn: "#132",
        claimedState: "unpapered",
        established: UNCHECKED,
        wanted: "Voxel global illumination. The tree has voxels (world/) and has no GI of any kind: v4243's " +
                "atmospheric scattering is sky radiance, not bounced light.",
    },
    {
        repo: "Repo-Explainer", namedIn: "#132",
        claimedState: "unpapered",
        established: UNCHECKED,
        wanted: "Reading a repository as a subject. Overlaps work already shipped from a different direction: " +
                "ai-bridge/repoTerrainBridge.js scans a tree into entries and world/orrery.mjs models the " +
                "dependencies as bodies, both written here.",
    },
    {
        repo: "threejs-procedural-terrain", namedIn: "#132",
        claimedState: "unpapered",
        established: UNCHECKED,
        wanted: "Procedural terrain. *** THE ONE NAME ON THIS LIST A GREP APPEARS TO FIND AND DOES NOT: *** " +
                "nine files say 'procedural terrain' and every one of them is the engine's own heightfield " +
                "(world/world.js, world/realTerrainStamp.js, engine/ovmGenerator.js). A name search that " +
                "matched on that phrase would report this repository present when it is absent.",
    },
    {
        repo: "ar-globe", namedIn: "#132",
        claimedState: "unpapered",
        established: UNCHECKED,
        wanted: "AR on a globe. The tree gained camera-to-texture at v4218 and image tracking at v4230 " +
                "(mind-ar-js, #98), so the AR half exists and the globe half does not.",
    },
    {
        repo: "gaze-aware-3d", namedIn: "#132",
        claimedState: "unpapered",
        established: UNCHECKED,
        wanted: "Gaze. *** THE IDEA IS ALREADY SHIPPED AND FROM A DIFFERENT SOURCE: *** ui/gazeDwell.mjs " +
                "(v4247, #117) implements look-to-select from Ramotion/vr-menu-demo's published interaction, " +
                "with none of its code. Whatever this repository holds, the tree no longer needs it to have " +
                "gaze selection -- which is the strongest argument there is for not chasing its licence.",
    },
]);

/**
 * *** THE ARITHMETIC IN #132 DOES NOT WORK, AND THIS FILE DOES NOT GUESS WHICH HALF IS WRONG. ***
 *
 * The item reads "UNPAPERED grows to four" and then names FIVE repositories. Two readings are available and
 * the tree cannot choose between them from the text:
 *
 *   (a) "four" is the count of new names, and one of the five was added later without updating the number.
 *   (b) "four" is the TOTAL unpapered count after the item lands, in which case it disagrees with the
 *       register a different way: reachedLicences.mjs carries two entries with licenceExists false
 *       (ZachSaucier/Asset-Loading-Effects, kamend/ChuckClose-SparkAR) and ui/gazeDwell.mjs names a third,
 *       Ramotion/vr-menu-demo, at #106 -- so five more would reach eight, not four.
 *
 * Neither reading is asserted here. What IS asserted is that the number and the list cannot both be right,
 * which is a defect a validator would have caught the day it was written if the item had lived in the tree.
 */
export const COUNT_DISPUTE = Object.freeze({
    item: "#132",
    statedCount: 4,
    namedCount: 5,
    registerUnpaperedNow: 2,
    alsoNamedInProse: 1,
    readings: Object.freeze(["four new names, five listed", "four in total, which would be eight"]),
});

/** Entries here may not carry a licence verdict. Growing one is the signal to move the entry, not to widen this. */
export function validateNamed(e) {
    const p = [];
    if (!e || typeof e !== "object") return ["not an object"];
    if (!e.repo) p.push("no repo");
    if (!e.namedIn) p.push(`${e.repo}: does not say WHERE it was named -- an unattributed claim cannot be checked`);
    if (!e.claimedState) p.push(`${e.repo}: does not quote what was claimed, so the claim cannot be compared to evidence`);
    if (e.established !== UNCHECKED) p.push(`${e.repo}: established is "${e.established}" -- the only state this register holds is UNCHECKED`);
    if (!e.wanted) p.push(`${e.repo}: does not say what it was wanted FOR, which is the part that outlives the licence question`);
    // *** THE FIELDS THAT MUST BE ABSENT, AND THE REASON IS THE WHOLE POINT OF THE FILE. ***
    for (const f of ["spdx", "licence", "licenceExists", "redistributable", "posture", "grantorHoldsRights"]) {
        if (f in e) {
            p.push(`${e.repo}: carries "${f}" -- an entry that can answer a licence question is a ` +
                   `reachedLicences.mjs entry and must MOVE there, not sit here looking checked`);
        }
    }
    return p;
}

/**
 * Always false, and the reason never says the source is unlicensed.
 *
 * A caller that wants to know whether bytes may be copied gets the same no as an UNPAPERED source gets, and
 * a different sentence, because the two facts are different and the sentence is the only place that shows.
 */
export function mayTake(repo) {
    const e = NAMED_SOURCES.find((x) => x.repo === repo);
    if (!e) return { ok: false, known: false, why: `${repo} is not in this register -- ask reachedLicences.mjs before concluding anything` };
    return {
        ok: false, known: true, established: UNCHECKED, claimedState: e.claimedState,
        why: `nobody has established a grant for ${e.repo}. That is a gap in OUR record and NOT a finding ` +
             `that the source is unlicensed -- the open list (${e.namedIn}) says "${e.claimedState}", and ` +
             `no evidence for that claim exists in this tree.`,
        ideaIsSeparate: e.wanted,
    };
}

/**
 * A named entry whose repo has since been properly assessed should leave this register.
 *
 * Passed REACHED_SOURCES (or any array of {repo}), returns the entries here that now have a real record --
 * the ratchet that keeps this file from becoming a parking space where names go to be permanently unexamined.
 */
export function promotable(register = []) {
    const have = new Set(register.map((e) => e && e.repo).filter(Boolean));
    // Registers name repos as "owner/name"; this list mostly carries bare names, so compare on the tail too.
    const tail = (s) => String(s).split("/").pop().toLowerCase();
    const haveTails = new Set([...have].map(tail));
    return NAMED_SOURCES.filter((e) => have.has(e.repo) || haveTails.has(tail(e.repo)));
}

/** Names in this register that a text does NOT mention -- how the round proved the six were absent. */
export function absentFrom(text) {
    const lower = String(text).toLowerCase();
    return NAMED_SOURCES.filter((e) => !lower.includes(e.repo.toLowerCase())).map((e) => e.repo);
}

/** A readable line per entry, for a console or a page. */
export function describeNamed(e) {
    return `${e.repo} -- named at ${e.namedIn}, claimed "${e.claimedState}", ESTABLISHED: nothing. ${e.wanted}`;
}
