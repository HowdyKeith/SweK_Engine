// ===================================================================
// world/copiedOutsideVendor.mjs -- v4263
// -------------------------------------------------------------------
// *** THE TREE HAS TWO LICENCE REGISTERS AND THERE IS A GAP BETWEEN
// *** THEM THAT THIRD-PARTY CODE FALLS INTO. ***
//
//   world/orrery.mjs        answers "what did we VENDOR, and is it
//                           papered?" -- and its population is the
//                           subdirectories of the TOP-LEVEL vendor/.
//   world/reachedLicences   answers "what did we READ AND NOT VENDOR?"
//                           -- explicitly the not-vendored ones.
//
// Code that was COPIED but does not live under vendor/ is in neither.
// The orrery cannot see it because it is not in vendor/; the reached
// register will not hold it because it WAS vendored. Nothing in 4,262
// rounds has ever listed that population.
//
// ---- WHAT IS IN IT, AND WHAT WAS WRONG ABOUT IT -------------------
//
// Two files, both MIT, both real copies rather than ports:
//
//   shaders/ashimaNoise.js  Ashima Arts' GLSL simplex noise, whose own
//                           header says "unmodified apart from
//                           whitespace". Used by badTvPass,
//                           aquarellePass, solidTexture, fireMesh and
//                           the noise gates.
//   ui/vendor/qrcode.mjs    Kazuhiko Arase's QR generator, 2,237 lines.
//                           *** IT IS IN A DIRECTORY CALLED vendor
//                           *** AND THE ORRERY STILL CANNOT SEE IT,
//                           because the scan is of the top-level
//                           vendor/ and this one is ui/vendor/.
//
// *** AND BOTH WERE OUT OF COMPLIANCE, NOT MERELY UNFILED. *** MIT
// requires TWO things in every copy: "The above copyright notice AND
// THIS PERMISSION NOTICE shall be included in all copies or
// substantial portions of the Software." Each file carried the
// copyright line and a POINTER to the licence -- "Distributed under
// the MIT License", or a URL. A pointer is not an inclusion.
//
// Measured before the fix: 15 files in this tree contain the MIT
// permission notice and 14 of them are under vendor/. Neither copy
// outside it had one. Both now do, beside the bytes they cover.
//
// Worse than the gap: shaders/ashimaNoise.js stated the obligation
// and stated it WRONG, calling attribution "the licence's one
// requirement" -- understating what it owed, in the file whose job
// was to discharge it.
//
// ---- WHAT THIS FILE DELIBERATELY DOES NOT CLAIM -------------------
//
// *** A PORT IS NOT A COPY, AND THIS REGISTER DOES NOT PRETEND TO
// *** KNOW WHERE THE LINE IS. *** The tree also holds work DERIVED
// from third-party sources -- render/aquarellePass.js from Ramotion,
// render/doomFire.mjs from filipedeschamps, ui/odometer.js from
// coderitual, shaders/ashimaNoise.mjs translated line by line from
// the GLSL beside it. Whether a re-implementation is a "substantial
// portion of the Software" is a legal judgement, not a grep result.
// Those are recorded as DERIVED with their attributions noted, and
// flagged as needing a person rather than asserted either way. Only
// the unambiguous copies are called a compliance gap.
// ===================================================================
"use strict";

/** How the bytes got here, which decides what is owed. */
export const KIND = Object.freeze({
    COPIED: "COPIED",        // upstream's own bytes, near-verbatim. The notice obligation is unambiguous.
    DERIVED: "DERIVED",      // re-implemented, translated or ported. A judgement, not a grep result.
});

/** What the file carries today. A POINTER is the failure mode this round found. */
export const NOTICE = Object.freeze({
    FULL: "FULL",            // copyright notice AND permission notice present
    POINTER: "POINTER",      // copyright notice plus a URL or a name. NOT an inclusion.
    CREDIT_ONLY: "CREDIT_ONLY",
    NONE: "NONE",
});

/**
 * The register. `noticeFile` is where the permission notice lives -- relative to the engine root -- and the
 * gate asserts it exists and really contains the notice, because a register that records paperwork nobody
 * checked is the thing v4258 found the tree already had two of.
 */
export const COPIED = Object.freeze([
    {
        path: "shaders/ashimaNoise.js",
        upstream: "ashima/webgl-noise", holder: "Ashima Arts", year: 2011, spdx: "MIT",
        kind: KIND.COPIED,
        evidence: "unmodified apart from whitespace",   // the file's own words, greppable
        noticeBefore: NOTICE.POINTER,                   // "Distributed under the MIT License"
        noticeFile: "shaders/ASHIMA-LICENSE.txt",
        seenBy: [],                                     // *** neither register: not under vendor/, and vendored
        note: "Used by render/badTvPass.js, render/aquarellePass.js, render/solidTexture.mjs, " +
              "physics/fire/fireMesh.js and the noise gates. Its header also MIS-STATED the obligation, " +
              "calling attribution 'the licence's one requirement'.",
    },
    {
        path: "ui/vendor/qrcode.mjs",
        upstream: "kazuhikoarase/qrcode-generator", holder: "Kazuhiko Arase", year: 2009, spdx: "MIT",
        kind: KIND.COPIED,
        evidence: "QR Code Generator for JavaScript",
        noticeBefore: NOTICE.POINTER,                   // a URL to the MIT text
        noticeFile: "ui/vendor/LICENSE",
        seenBy: [],
        note: "*** IN A DIRECTORY LITERALLY CALLED vendor AND STILL INVISIBLE, *** because world/orrery.mjs " +
              "scans the top-level vendor/ and this is ui/vendor/. 2,237 lines. Also carries a DENSO WAVE " +
              "trademark notice, which is not a licence term but is reproduced with it.",
    },
]);

/**
 * The other population, kept beside it so nobody mistakes the short COPIED list for the whole story.
 * These are NOT called a compliance gap -- see the header on why a port is a judgement and not a grep.
 */
export const DERIVED = Object.freeze([
    { path: "shaders/ashimaNoise.mjs", upstream: "ashima/webgl-noise", spdx: "MIT",
      evidence: "translated line by line from the GLSL" },
    { path: "render/aquarellePass.js", upstream: "Ramotion/aquarelle", spdx: "MIT", evidence: "ported to this tree" },
    { path: "render/aquarelleModel.mjs", upstream: "Ramotion/aquarelle", spdx: "MIT", evidence: "CPU reference" },
    { path: "render/doomFire.mjs", upstream: "filipedeschamps/doom-fire-algorithm", spdx: "MIT", evidence: "ported from" },
    { path: "ui/odometer.js", upstream: "coderitual/bounty", spdx: "MIT", evidence: "Ported from" },
    // v4301: the decoder carries the encoder's two ISO 18004 tables, with the full MIT notice this time.
    { path: "ui/qrDecode.mjs", upstream: "kazuhikoarase/qrcode-generator", spdx: "MIT", evidence: "reproduced unchanged",
      noticeInFile: true },   // the only engine-source file outside vendor/ that carries the full MIT text, on purpose
    { path: "ui/odometerModel.mjs", upstream: "coderitual/bounty", spdx: "MIT", evidence: "ported from" },
    { path: "world/procPlanet.js", upstream: "TheLongSilence", spdx: "MIT", evidence: "lifted (not copied)" },
    { path: "world/spaceStructures.js", upstream: "TheLongSilence", spdx: "MIT", evidence: "Technique from" },
    { path: "render/greeble.js", upstream: "TheLongSilence", spdx: "MIT", evidence: "nothing copied" },
]);

/** The MIT sentence this round turned on, so a gate can assert against the words rather than a paraphrase. */
export const MIT_INCLUSION_CLAUSE =
    "The above copyright notice and this permission notice shall be included in all " +
    "copies or substantial portions of the Software.";

/** A copy is papered when a notice file exists AND contains the permission notice. Checked, never assumed. */
export function unpapered(readFile) {
    return COPIED.filter((c) => {
        if (!c.noticeFile) return true;
        const text = readFile(c.noticeFile);
        return !text || !/Permission is hereby granted, free of charge/.test(text);
    });
}

/** Neither register sees these -- the structural claim, as a function so the gate can falsify it. */
export const seenByNoRegister = () => COPIED.filter((c) => c.seenBy.length === 0);
