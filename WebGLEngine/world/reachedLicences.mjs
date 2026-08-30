// FILE: world/reachedLicences.mjs -- v4198, corrected at v4203
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
// *** v4203: THREE OF THIS FILE'S OWN RECORDS WERE WRONG, IN THE FILE WHOSE ENTIRE PURPOSE IS QUOTING
// LICENCES VERBATIM. *** Found by assessing projapati66/Svg-IsometricCityAnimation, whose README licence
// turned out to be codrops's text on a repo that is not codrops. Checking that against what was recorded
// here at v4198:
//
//   1. CODROPS_2018 WAS TRUNCATED -- 48 words of a 77-word licence. The two dropped sentences are not
//      boilerplate: one is an ATTRIBUTION REQUIREMENT ("should have a visible mention and link to the
//      original work") and the other is the clause that decides the DesignTheWay entry below ("Always
//      consider the licenses of all included libraries, scripts and images used"). A condition was dropped
//      from a field the gate treats as a quotation.
//
//   2. IT ALSO READ "built upon" WHERE THE SOURCE SAYS "build upon" -- and that is the same word v4198
//      wrote a regex fix for. Facing a text that would not match `built? upon`, I widened the pattern to
//      `buil[dt] upon` and never asked why the text disagreed with itself. The regex was right to be
//      widened; the transcription was the thing that was wrong.
//
//   3. THE HEAT-DISTORTION ENTRY NAMED A REPOSITORY THAT DOES NOT EXIST. `codrops/HeatDistortionEffect`
//      404s; the repo is `lbebber/HeatDistortionEffect`. And the note explaining why its licence was not
//      quoted -- "referenced by link rather than restated" -- was simply false. It restates it in full, and
//      the text it restates is byte-identical to the 2015 one.
//
// *** SO THE ANSWER TO #59 GETS SHARPER RATHER THAN OVERTURNED. *** The 2015 text is not a 2015 text: the
// same 123 bytes appear in ElasticProgress (2015), RainEffect (2015) AND HeatDistortionEffect (2016), all
// three hashing to 92e30c8d. One licence, unchanged across at least two years, restated once in 2018.
//
// *** AND THE FIX IS ATTRIBUTION, WHICH gpu/khronosSamples.mjs ALREADY HAD AND THIS FILE DID NOT. *** That
// module gives every model a licenceUrlFor() -- where a person goes to read the licence themselves, even
// for the ones nobody has read. Nothing here carried a URL, so no quotation in this file could be checked
// against anything. Every quoted text now lives in LICENCE_TEXTS with the URL it came from, the date it was
// read, its word and character counts and its sha256; tools/ship/verifyLicenceTexts.mjs re-fetches and
// compares; and the gate proves the record is self-consistent without a network.
//
// *** THE CLAUSE THAT DECIDES EVERYTHING FOR THIS TREE IS THE SAME IN BOTH: DO NOT REDISTRIBUTE. ***
// Vendoring a file into a public git repository IS redistribution. So no codrops byte can ever enter this
// tree, in any era of their licence, however permissive the "integrate or build upon it" half sounds. The
// effect can be REACHED -- read for what it is and written here -- and that is all.
"use strict";

/**
 * *** EVERY QUOTED LICENCE, WITH THE EVIDENCE THAT IT IS A QUOTATION. ***
 *
 * A bare string in a field called `licence` is indistinguishable from a paraphrase somebody typed from
 * memory -- which is exactly what v4198 shipped. Each text here carries where it was read, when, and a
 * digest, so a later edit changes the hash and a truncation changes the counts. None of that proves the
 * ORIGINAL transcription was right; only re-fetching does, which is why tools/ship/verifyLicenceTexts.mjs
 * exists as a separate network tool and why `retrieved` records when it last agreed.
 *
 * `words` and `chars` are stored beside `sha256` deliberately. A hash says "something changed" and stops
 * there; a word count says "29 words went missing", which is the shape the v4198 bug actually had.
 */
export const LICENCE_TEXTS = Object.freeze({
    "codrops-2015": {
        text:
            'Integrate or build upon it for free in your personal or commercial projects. ' +
            'Don\'t republish, redistribute or sell "as-is".',
        // *** THREE REPOSITORIES, ONE TEXT, BYTE FOR BYTE. *** Including the 2016 one this file previously
        // recorded as not restating its licence at all.
        sourceUrls: [
            "https://raw.githubusercontent.com/codrops/ElasticProgress/master/README.md",
            "https://raw.githubusercontent.com/codrops/RainEffect/master/README.md",
            "https://raw.githubusercontent.com/lbebber/HeatDistortionEffect/master/README.md",
        ],
        retrieved: "2026-08-30", words: 19, chars: 123,
        sha256: "92e30c8db85cf3714711ffcd937ae3fd4def7612d4b3c2558a57631c4a8147e2",
        note: "the README section headed '## License', excluding the 'Read more here' link line that follows it",
    },
    "codrops-2018": {
        text:
            'This resource can be used freely if integrated or build upon in personal or commercial projects ' +
            'such as websites, web apps and web templates intended for sale. It is not allowed to take the ' +
            'resource "as-is" and sell it, redistribute, re-publish it, or sell "pluginized" versions of it. ' +
            'Free plugins built using this resource should have a visible mention and link to the original ' +
            'work. Always consider the licenses of all included libraries, scripts and images used.',
        // *** THE SECOND URL IS NOT A CODROPS REPOSITORY, AND THAT IS THE POINT OF LISTING IT. ***
        sourceUrls: [
            "https://raw.githubusercontent.com/codrops/ParticleEffectsButtons/master/README.md",
            "https://raw.githubusercontent.com/projapati66/Svg-IsometricCityAnimation/master/README.md",
        ],
        retrieved: "2026-08-30", words: 77, chars: 466,
        sha256: "1fb1764108a736f8b1b7bfbc0b9e63dd3c2dd6acbf0e067021ce965c11a53a43",
        note: "v4198 recorded 48 of these 77 words and spelled 'build' as 'built'",
    },
});

/** Verbatim, from three repositories spanning 2015-2016. See LICENCE_TEXTS for the URLs and the digest. */
export const CODROPS_2015 = LICENCE_TEXTS["codrops-2015"].text;

/** Verbatim, from codrops/ParticleEffectsButtons (c) 2018 -- and, byte for byte, from a repo that is not codrops. */
export const CODROPS_2018 = LICENCE_TEXTS["codrops-2018"].text;

/** A quoted text with its provenance, or null. The only supported way to read one. */
export function quotationOf(id) {
    const q = LICENCE_TEXTS[id];
    return q ? { id, ...q, sourceUrls: q.sourceUrls.slice() } : null;
}

/**
 * Everything internally checkable about a recorded quotation. The hash is NOT checked here -- this module
 * stays dependency-free and browser-safe, so the gate computes sha256 with node:crypto and compares.
 */
export function validateQuotation(id) {
    const p = [];
    const q = LICENCE_TEXTS[id];
    if (!q) return [`${id}: no such quotation`];
    if (typeof q.text !== "string" || !q.text.trim()) p.push(`${id}: empty text`);
    if (!Array.isArray(q.sourceUrls) || !q.sourceUrls.length) {
        p.push(`${id}: no source URL -- a quotation nobody can go and check is a paraphrase with a footnote`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.retrieved || "")) p.push(`${id}: no retrieval date`);
    const words = q.text.split(/\s+/).filter(Boolean).length;
    if (words !== q.words) p.push(`${id}: recorded ${q.words} words, the text has ${words}`);
    if (q.text.length !== q.chars) p.push(`${id}: recorded ${q.chars} chars, the text has ${q.text.length}`);
    if (!/^[0-9a-f]{64}$/.test(q.sha256 || "")) p.push(`${id}: no sha256`);
    // *** A TRUNCATION ALWAYS DROPS THE END, WHICH IS WHY THE END IS CHECKED SPECIFICALLY. *** The v4198 bug
    // was a licence cut off mid-document, and the cut left the string ending in a full stop -- so "ends in a
    // terminator" would have passed it. The counts above are what catch it; this only catches a text that
    // was stopped mid-sentence.
    if (!/[.!?"']$/.test(q.text.trim())) p.push(`${id}: text does not end at a sentence boundary -- truncated?`);
    return p;
}

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
        repo: "codrops/ElasticProgress", sourceUrl: "https://github.com/codrops/ElasticProgress", grantorHoldsRights: true, licenceExists: true, publisher: "Codrops", year: 2015,
        spdx: null, licence: CODROPS_2015, licenceId: "codrops-2015", redistributable: false, posture: POSTURE.REACHED,
        taken: null, takenPaths: [],
        // *** CITED, WHICH IS THE OPPOSITE OF TAKEN, AND THE SCAN CANNOT TELL THEM APART BY ITSELF. ***
        // tools/ship/easingCurves-selfcheck.mjs names this repo in order to assert that elastic easing comes
        // from PENNER and not from here -- a refusal being written down. Found by the byte-scan flagging it,
        // the same way that scan found render/chuckCloseModel.mjs crediting kamend one round earlier. Two
        // legitimate reasons to name a source, and neither is a leak: one took an idea and says so, the other
        // took nothing and says that.
        citedPaths: ["tools/ship/easingCurves-selfcheck.mjs"],
        why: "Needs GSAP, which this tree does not carry, and its SVG-morph half is already ui/svgPath.mjs. " +
             "The one transferable piece is an elastic easing curve, which simulation/easing.js lacks -- " +
             "a damped sinusoid, where easeOutBack overshoots exactly once.",
    },
    {
        repo: "codrops/RainEffect", sourceUrl: "https://github.com/codrops/RainEffect", grantorHoldsRights: true, licenceExists: true, publisher: "Codrops", year: 2015,
        spdx: null, licence: CODROPS_2015, licenceId: "codrops-2015", redistributable: false, posture: POSTURE.REACHED,
        taken: null, takenPaths: [], citedPaths: [],
        why: "Rain on glass -- droplets as refractive lenses over a background, with trails that merge. " +
             "Genuinely absent here: the tree's `raindrop` hits are hydraulic erosion and `droplet` is a " +
             "kaiju attack. Reachable as an idea; the bytes cannot be taken.",
    },
    {
        // *** v4198 RECORDED THIS AS "codrops/HeatDistortionEffect", WHICH 404s. *** The repository is
        // lbebber's -- Lucas Bebber wrote the RainEffect and ElasticProgress ones too, and codrops hosts the
        // article, not the code. An entry naming a repository nobody can open is worse than no entry: it
        // reads as evidence and resolves to nothing, which is why every entry now carries sourceUrl.
        repo: "lbebber/HeatDistortionEffect", grantorHoldsRights: true, licenceExists: true, publisher: "Codrops", year: 2016,
        sourceUrl: "https://github.com/lbebber/HeatDistortionEffect",
        // *** AND "NOT QUOTED, BECAUSE IT WAS NOT READ VERBATIM" WAS FALSE. *** The old note here said the
        // README "points at the Codrops licence page rather than restating it". It restates it in full, and
        // the text is byte-identical to the 2015 one -- same sha256, 92e30c8d. Being careful about not
        // recording a paraphrase is right; recording a claim about the source without reading the source is
        // the same failure one level up.
        spdx: null, licence: CODROPS_2015, licenceId: "codrops-2015",
        redistributable: false, posture: POSTURE.REACHED, taken: null, takenPaths: [], citedPaths: [],
        why: "Already present by another route: bcs_heatShimmer shipped at v4164 from krispuckett/SwiftUIShaders " +
             "(MIT), CPU-modelled and verified bit-exact against the GPU at v4196.",
    },
    {
        repo: "codrops/ParticleEffectsButtons", sourceUrl: "https://github.com/codrops/ParticleEffectsButtons", grantorHoldsRights: true, licenceExists: true, publisher: "Codrops", year: 2018,
        spdx: null, licence: CODROPS_2018, licenceId: "codrops-2018", redistributable: false, posture: POSTURE.REFUSED,
        taken: null, takenPaths: [], citedPaths: [],
        why: "Refusable twice over. It depends on anime.js, which v4197 refused by name because its own rAF " +
             "loop is invisible to document.getAnimations() and therefore to engine/frameDirty.js. And its " +
             "effect is the element-to-particles idea of ZachSaucier/Disintegrate, which is MIT and needs no " +
             "dependency at all.",
    },
    {
        repo: "ZachSaucier/Asset-Loading-Effects", sourceUrl: "https://github.com/ZachSaucier/Asset-Loading-Effects", grantorHoldsRights: true, licenceExists: false, publisher: "Zach Saucier", year: null,
        spdx: null, licence: null, licenceNote: "no LICENSE file and no licence section -- UNPAPERED",
        redistributable: false, posture: POSTURE.REACHED, taken: null, takenPaths: [], citedPaths: [],
        why: "No licence means no permission, so nothing can be taken regardless of merit -- the same posture " +
             "as Gixxern/JS---Webcam-effects. It does name a real gap: splat.load, realTerrain.load and " +
             "schematic.load fetch large assets and report no progress at all.",
    },
    {
        repo: "gre/beez", sourceUrl: "https://github.com/gre/beez", grantorHoldsRights: true, licenceExists: true, publisher: "Zengularity", year: 2014,
        spdx: "AGPL-3.0", licence: null, redistributable: false, posture: POSTURE.REACHED, taken: null, takenPaths: [], citedPaths: [],
        why: "AGPL-3.0's network clause makes it the strictest copyleft here; archived in 2022. And the idea " +
             "-- a phone as an XY-pad controller -- is already phone.html's joysticks sending movevec/lookvec.",
    },
    {
        repo: "kamend/ChuckClose-SparkAR", sourceUrl: "https://github.com/kamend/ChuckClose-SparkAR", grantorHoldsRights: true, licenceExists: false, publisher: "kamend", year: null,
        spdx: null, licence: null, licenceNote: "a Spark AR project file with no licence shown",
        redistributable: false, posture: POSTURE.REACHED,
        taken: "render/chuckCloseModel.mjs -- the effect written from its description, with nothing copied",
        // *** THE FILES ALLOWED TO NAME THIS SOURCE, WHICH IS NOT THE SAME AS FILES CONTAINING ITS BYTES. ***
        // A module that took an IDEA must credit where it came from -- that is the provenance discipline
        // working, not a leak. The gate's byte-scan reads this list rather than a hardcoded allowance, so
        // crediting a source and smuggling one stay distinguishable.
        takenPaths: ["render/chuckCloseModel.mjs"], citedPaths: [],
        why: "The technique is decades older than any repository. Recorded because REACHED-with-something-taken " +
             "is the posture most likely to be mistaken for CAPTURED later.",
    },
    {
        // *** AN MIT LICENCE FILE AND A NON-MIT README, IN THE SAME REPOSITORY. *** LICENSE is MIT,
        // (c) 2018 Ananda -- and the README's own "## License" section is the CODROPS 2018 text, byte for
        // byte, sha256 1fb17641, on a repository that has nothing to do with codrops. Whatever the intent,
        // the two documents do not say the same thing, and the MIT file is not automatically the answer just
        // because a licence detector prefers files to prose.
        //
        // *** WHAT MAKES IT ENCUMBERED IS NEITHER OF THEM. *** The README credits the city artwork to
        // FREEPIK and the tweening to GSAP. Ananda's MIT covers Ananda's code; it cannot reach Freepik's
        // vector or GreenSock's library, because Ananda never held those rights -- the TIE fighter shape
        // exactly, and the reason severityOf() checks grantorHoldsRights before it reads the licence.
        //
        // And the clause that says so is one of the two sentences v4198 dropped from CODROPS_2018: "Always
        // consider the licenses of all included libraries, scripts and images used." The truncation removed
        // the sentence that decides this entry.
        repo: "projapati66/Svg-IsometricCityAnimation",
        sourceUrl: "https://github.com/projapati66/Svg-IsometricCityAnimation",
        grantorHoldsRights: false, licenceExists: true, publisher: "DesignTheWay (Ananda)", year: 2018,
        spdx: "MIT", licence: CODROPS_2018, licenceId: "codrops-2018",
        licenceNote: "LICENSE says MIT (c) 2018 Ananda; README's License section is the codrops 2018 text verbatim; " +
                     "the SVG is Freepik's and the tweening is GSAP, neither of which the grantor holds",
        redistributable: false, posture: POSTURE.REACHED, taken: null, takenPaths: [], citedPaths: [],
        why: "An isometric city animated with GSAP. The tree has no isometric projection helper and no " +
             "SVG scene animation, so the idea is genuinely absent -- but nothing here can be taken: the " +
             "artwork is a third party's and the library is not open source. Recorded as the second worked " +
             "ENCUMBERED case, and the first found by reading rather than by asking.",
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
    // *** REQUIRED, AND THAT IS THE WHOLE MECHANISM. *** A severity level nobody remembers to apply is a
    // comment. Making the question mandatory at record time is what turns "did the grantor own this?" from
    // something you think of when it occurs to you into something you cannot file an entry without answering.
    // There is no null: an asset whose provenance has not been established is not yet an entry.
    if (typeof e.grantorHoldsRights !== "boolean") {
        p.push(`${e.repo}: does not say whether the GRANTOR HELD THE RIGHTS they licensed -- ` +
               `a permissive licence from someone who did not own the work grants nothing`);
    }
    if (!("taken" in e)) p.push(`${e.repo}: does not say what was taken (null is a real answer)`);
    if (!Array.isArray(e.takenPaths)) p.push(`${e.repo}: no takenPaths list -- the files allowed to name it`);
    if (!Array.isArray(e.citedPaths)) p.push(`${e.repo}: no citedPaths list -- files that name it to record that nothing was taken`);
    else if (!e.taken && e.takenPaths.length) p.push(`${e.repo}: took nothing, yet lists files that took something`);
    if (!e.why) p.push(`${e.repo}: no reason recorded -- the reason is the whole point of the register`);
    // *** A SOURCE URL, BECAUSE v4198 RECORDED A REPOSITORY THAT DOES NOT EXIST. *** "codrops/HeatDistortionEffect"
    // sat here for four versions looking like evidence and resolving to a 404. gpu/khronosSamples.mjs has had
    // licenceUrlFor() since it was written -- where a person goes to read the licence themselves, available
    // even for models nobody read. This register had no such field, so nothing in it could be checked.
    if (!e.sourceUrl) p.push(`${e.repo}: no sourceUrl -- an entry nobody can open reads as evidence and resolves to nothing`);
    // *** AND A QUOTATION MUST BE THE RECORDED ONE, NOT A STRING THAT RESEMBLES IT. *** Without this, an
    // entry can carry a hand-edited near-copy of a licence while LICENCE_TEXTS holds the checked version.
    if (e.licence) {
        if (!e.licenceId) p.push(`${e.repo}: quotes a licence with no licenceId -- unattributed, so uncheckable`);
        else if (!LICENCE_TEXTS[e.licenceId]) p.push(`${e.repo}: licenceId "${e.licenceId}" is not in LICENCE_TEXTS`);
        else if (LICENCE_TEXTS[e.licenceId].text !== e.licence) {
            p.push(`${e.repo}: its licence text differs from LICENCE_TEXTS["${e.licenceId}"] -- one of them is a copy that drifted`);
        }
    } else if (e.licenceId) p.push(`${e.repo}: names a licenceId but quotes nothing`);
    // *** THE DISAGREEMENT CASE. *** A repo whose LICENSE file and README say different things is not a
    // record error, it is a FACT about that repo -- and it must be stated, not silently resolved in favour
    // of whichever one a licence detector happened to read first.
    if (e.spdx && e.licence && !e.licenceNote) {
        p.push(`${e.repo}: carries both an SPDX id and a quoted bespoke licence with no note saying which governs what`);
    }
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
 * *** THE #59 FINDING, AS A FUNCTION RATHER THAN A SENTENCE -- SHARPENED AT v4203. ***
 *
 * Compares the two codrops licence texts and reports what actually changed. The answer a reader needs is not
 * "they differ" -- of course they differ -- but whether the TERMS moved or only the WORDS.
 *
 * *** THE EARLIER TEXT IS NOT A 2015 TEXT. *** v4198 labelled it by the year of the two repositories it was
 * read from. The identical 123 bytes -- sha256 92e30c8d -- also appear in lbebber/HeatDistortionEffect,
 * (c) Codrops 2016, which this file previously recorded as not restating its licence at all. So the earlier
 * wording is attested across at least 2015-2016 and the honest statement is a SPAN, not a year.
 *
 * *** AND THE 2018 TEXT ADDS A THIRD THING, WHICH v4198 COULD NOT SEE BECAUSE IT HAD DROPPED IT. *** The
 * recorded quotation stopped 29 words early, so the attribution requirement -- free plugins built on the
 * resource must carry a visible mention and link -- was missing from the record and therefore missing from
 * this function's answer. A drift detector cannot report a clause its own corpus does not contain.
 */
export function codropsDrift() {
    // `built? upon` was the first spelling here and it is WRONG: it matches "buil" or "built", never "build".
    // Both texts say "build upon" and so failed a clause they plainly contain, and codropsDrift() reported
    // bothGrantIntegration:false -- a made-up difference between two licences, inside the function written to
    // say whether they differ. An optional letter is not the same as a character class.
    //
    // *** AND WIDENING THE PATTERN WAS ONLY HALF THE FIX. *** The recorded 2018 text said "built upon"
    // where its source says "build upon", so the widened pattern was papering over a transcription error
    // rather than a spelling variance between the two eras. Both texts now read as their sources do, and
    // the character class stays because it is the correct pattern either way.
    const grants = (t) => /integrat/i.test(t) && /buil[dt] upon/i.test(t) && /free/i.test(t)
                       && /personal or commercial/i.test(t);
    const forbids = (t) => /(re-?publish)/i.test(t) && /redistribute/i.test(t) && /sell/i.test(t) && /as-is/i.test(t);
    const requiresAttribution = (t) => /visible mention and link/i.test(t);
    return {
        identical: CODROPS_2015 === CODROPS_2018,
        bothGrantIntegration: grants(CODROPS_2015) && grants(CODROPS_2018),
        bothForbidRedistribution: forbids(CODROPS_2015) && forbids(CODROPS_2018),
        earlierAttestedFrom: 2015, earlierAttestedTo: 2016, laterAttestedAt: 2018,
        yearsApart: 2018 - 2016,
        addedIn2018: [
            /web templates intended for sale/i.test(CODROPS_2018) && !/web templates/i.test(CODROPS_2015)
                ? "permits web templates intended for sale" : null,
            /pluginized/i.test(CODROPS_2018) && !/pluginized/i.test(CODROPS_2015)
                ? "forbids selling pluginized versions" : null,
            requiresAttribution(CODROPS_2018) && !requiresAttribution(CODROPS_2015)
                ? "requires a visible mention and link on free plugins built with it" : null,
            /consider the licenses of all included/i.test(CODROPS_2018) && !/included/i.test(CODROPS_2015)
                ? "points at the licences of bundled libraries, scripts and images" : null,
        ].filter(Boolean),
        verdict: "one licence, restated -- the prohibition did not move, and the restatement added an attribution requirement",
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
 *   4 encumbered  a licence that EXISTS, reads as permissive, and was granted by someone who did not hold
 *                 the rights they were granting.
 *
 * All of 1-4 come to the same practical answer for this tree -- do not vendor -- and they get there for
 * completely different reasons, which is exactly why one number beats one boolean.
 *
 * *** ENCUMBERED RANKS HIGHEST, AND NOT BECAUSE IT FORBIDS THE MOST. *** Every other posture announces
 * itself: you read the licence and you know where you stand, and AGPL in particular is loud and honest about
 * following your work home. Encumbrance is the one case where READING THE LICENCE GIVES YOU THE WRONG
 * ANSWER, because the restriction reaches from OUTSIDE the agreement -- from a party who licensed you
 * nothing, never agreed to anything, and whose rights no document in your possession can settle. It is the
 * only posture you can walk into while doing everything right.
 *
 * *** THE WORKED CASE, WHICH IS WHY THIS CATEGORY EXISTS. *** Keith asked whether SweK's flight sims could
 * use TIE fighter models. Fan-made ones are everywhere and many carry CC-BY from the modeller, sincerely
 * meant. That licence is real and it covers what the modeller MADE -- the mesh, the topology, the texture
 * work. It cannot cover Lucasfilm's design, because the modeller never held that. So the file reads
 * licenceExists: true, redistributable: true by its own terms, and is still not vendorable.
 *
 * The practical answer was yes anyway, and for a reason this scale makes precise: ev/esShipModels.js (v3827)
 * assigns models per ship class from a local file or URL and keeps the assignment as a string in
 * localStorage. GPU_Assets/ships/ holds one README and no models. Nothing is redistributed when the bytes
 * never leave the machine -- so encumbrance bites on VENDORING and not on USE, which is the distinction the
 * rest of this register was already built on.
 */
export const SEVERITY = Object.freeze({ OPEN: 0, UNPAPERED: 1, NO_REDISTRIBUTION: 2, RECIPROCAL: 3, ENCUMBERED: 4 });

export function severityOf(e) {
    // *** THIS ASKED WHETHER THE LICENCE WAS QUOTED, NOT WHETHER ONE EXISTS. *** codrops/HeatDistortionEffect
    // came out UNPAPERED beside its three identically-licensed siblings, purely because its README links the
    // terms instead of restating them. "We did not copy the text" and "there is no text" are opposite facts,
    // and world/orrery.mjs draws exactly that line for vendored code. `licenceExists` is the field that
    // carries it, so a gap in OUR record can never be reported as a gap in THEIRS.
    // Checked BEFORE the licence itself, because an encumbered file's licence is exactly what misleads.
    if (e.grantorHoldsRights === false) return SEVERITY.ENCUMBERED;
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
    // *** WHEN TWO LICENCES DISAGREE, SAY SO. *** This preferred `spdx` and would have described the
    // DesignTheWay entry as plain "MIT" -- the one word in that record that is misleading, and the reason
    // its severity is 4 rather than 0. A reader skimming this line is exactly the reader who needs the
    // conflict, not the tidier of the two answers.
    const both = e.spdx && e.licence;
    const lic = both ? `${e.spdx} file, but a bespoke licence in the README -- they DISAGREE`
                     : e.spdx || (e.licence ? "bespoke (quoted)" : e.licenceNote || "unknown");
    const sev = SEVERITY_NAMES[severityOf(e)];
    return `${e.repo} (${e.year || "year unknown"}) -- ${lic}, ${e.posture}, ${sev}` +
           (e.taken ? `, TOOK: ${e.taken}` : ", took nothing");
}

/** severityOf's numbers as words, so a console line does not read "4" and leave the reader to remember. */
export const SEVERITY_NAMES = Object.freeze(["open", "unpapered", "no-redistribution", "reciprocal", "ENCUMBERED"]);
