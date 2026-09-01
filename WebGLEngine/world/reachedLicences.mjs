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
    // =========================================================================================================
    // v4258 -- #53's TWO NAMES, AND THEY WERE BUILT BEFORE THEY WERE RECORDED.
    //
    // Backlog #53 read "jsfx: sound effects as DATA, and animatelo: DOM animation the dirty flag can see".
    // Both were BUILT -- audio/sfxModel.mjs at v4190 and ui/domAnimation.mjs at v4191, each citing its source
    // by name in its own header -- and neither was ever entered here. The item stayed open for the paperwork
    // while the code shipped, gated, with consumers.
    // =========================================================================================================
    // =========================================================================================================
    // v4268 -- #100 SENT THE ROUND LOOKING FOR A TSL REFERENCE, AND THE TREE ALREADY HAD ONE, UNREGISTERED.
    //
    // Open-list #100 reads "advanced-threejs-tsl-webgpu-rendering has no licence at all, and it is the only
    // TSL reference". The second clause is what kept the item open, and it is false: render/solidTexture.mjs
    // has opened with "The idea is boytchev/tsl-textures (MIT, Pavel Boytchev 2024)" since v4243.
    //
    // *** AND IT WAS CITED IN EXACTLY ONE FILE HEADER AND ENTERED IN NO REGISTER -- THE SHAPE OF #137. ***
    // That round found ashima/webgl-noise "used everywhere, credited in headers, registered nowhere"; #53
    // found jsfx and animatelo built and gated with their sources named only in their own headers. A header
    // is where a citation goes to be read by whoever opens that file. A register is where it goes to be
    // COUNTED. Three rounds have now found the same gap, so the habit is the finding, not the instance.
    // =========================================================================================================
    {
        repo: "boytchev/tsl-textures", sourceUrl: "https://github.com/boytchev/tsl-textures",
        grantorHoldsRights: true, licenceExists: true, publisher: "Pavel Boytchev", year: 2024,
        spdx: "MIT", licence: null,
        licenceNote: "MIT with the author and year, as stated in render/solidTexture.mjs's header at v4243. " +
             "*** THAT IS A SECOND-HAND READING AND IS RECORDED AS ONE: *** this round has no network and " +
             "did not re-open the repository, so what is registered here is OUR OWN v4243 note, not a fresh " +
             "look at the LICENSE file. It is entered in the direction that cannot become a false accusation " +
             "-- affirming a grant the tree already relied on when it shipped solidTexture -- and a round " +
             "with a network should confirm it.",
        redistributable: true, posture: POSTURE.REACHED,
        taken: "The idea only: procedural texture as a function evaluated on the GPU rather than an image " +
             "fetched from a file. No bytes. The library is TSL against a WebGPURenderer and this tree has " +
             "neither, so the ALGORITHM was rewritten twice here, once in JS and once in GLSL, the way every " +
             "shader in this tree is graded.",
        takenPaths: ["render/solidTexture.mjs"],
        // *** render/rebar.mjs IS NOT LISTED HERE AND ALMOST WAS. *** It says "Keith's TSL blueprint reached
        // for mx_noise_vec3", which names TSL and a blueprint and NOT this repository -- a near-miss that a
        // grep for "TSL" would have filed as a citation. The existing reachedLicences gate only checks that
        // a cited path EXISTS, so it would have accepted the wrong file; tools/ship/namedNotChecked-selfcheck
        // checks that each cited file actually contains the name.
        citedPaths: ["world/namedNotChecked.mjs", "tools/ship/namedNotChecked-selfcheck.mjs"],
        why: "It is the CONSUMER argument that #114 already won: v4235's mesh booleans return positions only " +
             "-- the word 'uv' does not appear in meshCSG.mjs -- so a cut face is a polygon no unwrap ever " +
             "assigned a coordinate, and a UV-based pipeline has nothing to offer it. Solid texturing is the " +
             "answer, and this is where the tree read it. Registering it also settles #100 without needing " +
             "the unpapered repository at all: the TSL door is open and it is MIT.",
    },
    {
        repo: "loov/jsfx", sourceUrl: "https://github.com/loov/jsfx",
        grantorHoldsRights: true, licenceExists: true, publisher: "loov", year: 2016,
        spdx: "MIT", licence: null,
        licenceNote: "MIT, stated in the repository. jsfx is sfxr's lineage -- DrPetter's 2007 tool by way of " +
             "as3sfxr -- and the IDEA of a sound effect as a parameter block predates all three.",
        redistributable: true, posture: POSTURE.REACHED,
        taken: "The shape: a parameter block in, a buffer of samples out. No bytes -- audio/sfxModel.mjs is " +
             "written here.",
        takenPaths: ["audio/sfxModel.mjs"],
        citedPaths: ["audio/sfxPlay.js", "audio/inputChain.mjs", "world/spellBook.mjs", "sfx.html",
                     "tools/ship/sfx-selfcheck.mjs", "tools/media/makeStageClip.mjs"],
        why: "*** AND THE ONE REAL DEPARTURE IS THE REASON IT IS WORTH HAVING SEPARATELY. *** Every sound in " +
             "this engine was a live Web Audio node graph, which plays and can never be tested -- no artefact, " +
             "nothing to hash. A renderer that returns samples is testable at every level. jsfx uses Math.sin, " +
             "which is not specified to the last bit across JS engines, so v4190 substituted tools/strictTrig " +
             "and MEASURED the cost: 4.48 ms per second of audio against 10.18 ms, 2.3x, worst per-sample " +
             "difference 1.11e-16. Fine for a game, fatal for a hash -- so the same spell always sounds the same.",
    },
    {
        repo: "gibbok/animatelo", sourceUrl: "https://github.com/gibbok/animatelo",
        grantorHoldsRights: true, licenceExists: true, publisher: "gibbok", year: 2018,
        spdx: "MIT", licence: null,
        licenceNote: "MIT. animatelo ports animate.css to the Web Animations API; animate.css itself is " +
             "Daniel Eden's, also MIT, and is NOT reached here -- what was read is the WAAPI port.",
        redistributable: true, posture: POSTURE.REACHED,
        taken: "Not the animations: the observation that WAAPI makes an animation an OBJECT THE PAGE CAN BE " +
             "ASKED ABOUT. ui/domAnimation.mjs holds twelve keyframe sets written here.",
        takenPaths: ["ui/domAnimation.mjs"],
        citedPaths: ["ui/domAnimate.js", "fx/cssKeyframes.mjs", "fx/timeline.mjs", "engine/domScope.mjs",
                     "tools/ship/domAnimation-selfcheck.mjs", "tools/ship/cssKeyframes-selfcheck.mjs"],
        why: "engine/frameDirty.js had eleven sources and NOT ONE was about the DOM, while the tree carried 86 " +
             "distinct @keyframes across 34 files -- so a spinner could turn while the flag called the frame " +
             "quiet. document.getAnimations() covers CSS and WAAPI in one call, which is what made a DOM probe " +
             "possible at all. *** AND v4252 THEN MEASURED THAT THE PROBE ASKS THE WRONG QUESTION: *** the DOM " +
             "runs on the compositor's clock -- 999.96 ms of animation across 1001 ms of wall clock with the " +
             "engine stepping ZERO frames -- so engine/domScope.mjs now separates chrome from what the render " +
             "actually samples. The idea was right and its first application was too broad.",
    },
    // =========================================================================================================
    // v4262 -- *** A REFUSAL, WHICH IS WHAT THIS LEDGER IS FOR. *** Nothing was taken; the entry exists so the
    // reasoning survives and nobody re-opens the question from scratch.
    // =========================================================================================================
    {
        repo: "ruvnet/sublinear-time-solver", sourceUrl: "https://github.com/ruvnet/sublinear-time-solver",
        grantorHoldsRights: true, licenceExists: true, publisher: "ruvnet", year: 2025,
        spdx: "MIT OR Apache-2.0", licence: null,
        licenceNote: "Dual MIT / Apache-2.0, stated in the repository. The licence was never the question here.",
        redistributable: true, posture: POSTURE.REACHED,
        taken: "NOTHING. No bytes, no port, no idea. math/solverFit.mjs is the REFUSAL and its reasoning, not " +
             "a derivative of anything in the repository -- which was not read beyond its premise.",
        takenPaths: [],
        citedPaths: ["math/solverFit.mjs", "tools/ship/solverFit-selfcheck.mjs"],
        why: "Backlog #133 put the discipline in its own title: FIND THE CONSUMER BEFORE TAKING THE SOLVER. " +
             "A local solver returns ONE coordinate of Mx = b without forming the whole vector, and needs " +
             "three things at once: M diagonally dominant, a consumer wanting k << n coordinates, and n large " +
             "enough. *** THE TWO PROPERTIES ARE IN DIFFERENT FILES IN THIS TREE. *** fluid/multigrid.mjs's " +
             "Poisson operator is dominant in every row (worst ratio exactly 1.0000) and flip2d's pressure " +
             "projection needs all 16,384 cells. tools/roundhouse/beamBind.mjs is the ONE genuine " +
             "single-coordinate consumer -- solve(K, unit(N,i2))[i1], two numbers wanted of 320 computed -- " +
             "and its matrix reads 0.3333 with one row of 160 dominant, identically at n = 8, 20, 60 and 160, " +
             "so refinement never approaches the precondition. The module import graph WOULD fit " +
             "((I - alpha P) is row-dominant at 1.1765, all 3,467 rows) and NOTHING ASKS IT ANYTHING: " +
             "gateReach does BFS reachability, and a tree-wide scan finds zero files computing an influence " +
             "score. Inventing that consumer to justify the taking is the failure #133 was written to " +
             "prevent, so it is recorded as a hole. What was kept is dominance(), the measurement that " +
             "decided it. AND THE LIMIT IS STATED: the solver itself was never run or benchmarked, so this " +
             "says the SHAPE does not fit and says nothing about its quality.",
    },
    // =========================================================================================================
    // v4260 -- REGISTERED IN THE SAME ROUND IT WAS READ, which is the habit #53 said this ledger should have.
    // =========================================================================================================
    {
        repo: "activetheory/activeframe", sourceUrl: "https://github.com/activetheory/activeframe",
        grantorHoldsRights: true, licenceExists: true, publisher: "Active Theory", year: 2018,
        spdx: "MIT", licence: null,
        licenceNote: "MIT, stated in the repository.",
        redistributable: true, posture: POSTURE.REACHED,
        taken: "The premise only: that a video is a SEQUENCE OF ADDRESSABLE FRAMES rather than a thing that " +
             "plays, so a frame can be asked for by number. render/videoFrames.mjs is written here -- no bytes, " +
             "and none of activeframe's own machinery.",
        takenPaths: ["render/videoFrames.mjs"],
        citedPaths: ["render/cameraTexture.js", "tools/ship/videoFrames-selfcheck.mjs"],
        why: "v4188 pointed the whole shader chain at a live camera, which no gate can ever hold still -- the " +
             "tree gained a video input and still had none a test could repeat. *** AND MEASURING IT SPLIT THE " +
             "GOAL IN TWO. *** Seek-and-wait IS reproducible: twenty of twenty frames identical across two " +
             "runs, with identical pixel digests. It is NOT thereby accurate: that same run was on the wrong " +
             "frame nineteen times out of twenty, because the file was 20.3 fps and the plan assumed 30. " +
             "Frame-accurate seeking is achievable when the timing really matches (47/47 at 10 fps) and the " +
             "failure is always a step, never noise. So what this tree took is the premise, and what it added " +
             "is the verification the premise needs: a frame that carries its own index, because neither " +
             "currentTime nor rVFC's mediaTime could be trusted to say which frame had arrived.",
    },
    // =========================================================================================================
    // v4257 -- *** THREE ENTRIES THAT ARE THE FIRST OF THEIR LICENCE SHAPE IN THIS LEDGER. ***
    //
    // Censused before writing: every `spdx` field in this file held exactly TWO distinct values, "MIT" and
    // "AGPL-3.0", and the string "Apache" and the string "BSD" appeared nowhere in it at all. So the two most
    // common permissive licences after MIT had never been recorded, and the machinery around them -- the
    // severity scale, the redistributable flag, the posture -- had never been exercised on either.
    // =========================================================================================================
    {
        // *** THE ONE THAT WAS ALREADY LOAD-BEARING, WHICH IS WHY IT GOES FIRST. *** v3337 built
        // render/perceptual.mjs and render/silhouette.mjs around this repository's hard-gate rule and cited
        // it by name in both; v4255 built mesh/lathe.mjs against the judge those two provide. So an
        // Apache-2.0 source has been shaping shipped code for nine hundred rounds while the ledger that
        // exists to record such things did not contain it. The gap was not a risk -- Apache-2.0 grants far
        // more than an idea -- it was a RECORD that did not match the tree.
        repo: "img2threejs/img2threejs", sourceUrl: "https://github.com/img2threejs/img2threejs",
        grantorHoldsRights: true, licenceExists: true, publisher: "img2threejs", year: 2025,
        spdx: "Apache-2.0", licence: null,
        licenceNote: "Apache License 2.0, stated in the repository. NOT quoted verbatim here: it is 11 KB of " +
             "standard text, and unlike the codrops prose it is a named licence a reader can look up, which " +
             "is exactly the distinction the spdx field exists to draw.",
        redistributable: true, posture: POSTURE.REACHED,
        taken: "The rule that a HARD gate cannot be averaged away by soft signals -- from their stage-4 " +
             "evaluator. An idea, not bytes.",
        takenPaths: ["render/perceptual.mjs", "render/silhouette.mjs"],
        citedPaths: ["render/perceptual-selfcheck.mjs", "physics/imagePair.mjs", "main.js", "mesh/lathe.mjs",
                     "tools/ship/lathe-selfcheck.mjs"],
        why: "*** AND WHAT WAS REFUSED IS RECORDED IN THE CODE ITSELF: their NUMBERS. *** IoU < 0.85 and " +
             "scale delta > 0.08 are tuned on photographs of knives by a different rasteriser, so " +
             "silhouette.mjs ships null defaults and makes a caller earn a threshold from a measured floor. " +
             "Apache-2.0 would have permitted taking the thresholds; measurement is why they were not taken.",
    },
    {
        repo: "amagine-ai/Amagine3D", sourceUrl: "https://github.com/amagine-ai/Amagine3D",
        grantorHoldsRights: true, licenceExists: true, publisher: "amagine-ai", year: 2024,
        spdx: "Apache-2.0", licence: null,
        licenceNote: "Apache License 2.0. *** ITS PATENT GRANT IS THE PART MIT DOES NOT HAVE, *** and it is " +
             "the reason this shape deserved recording rather than being filed as 'MIT-ish': section 3 grants " +
             "patent rights and terminates them for anyone who sues over the work. Nothing here turns on that " +
             "today, and a ledger that only records what currently matters is a ledger that learns too late.",
        redistributable: true, posture: POSTURE.REACHED, taken: null, takenPaths: [], citedPaths: [],
        why: "Reached in the assessment round that also looked at shadertoy-render and mock-raf. Nothing was " +
             "taken; it is recorded because the LICENCE SHAPE was new to this ledger, which is a reason to " +
             "file an entry independent of whether anything was used.",
    },
    {
        repo: "Makio64/shadertoy-render", sourceUrl: "https://github.com/Makio64/shadertoy-render",
        grantorHoldsRights: true, licenceExists: true, publisher: "Makio64", year: 2016,
        spdx: "BSD-3-Clause", licence: null,
        licenceNote: "BSD 3-Clause. The third clause is the one MIT lacks: the contributors' names may not be " +
             "used to endorse derived work without permission. A NON-ENDORSEMENT clause is a constraint on " +
             "what may be SAID rather than on what may be copied, which is a category this ledger had no " +
             "entry for -- every previous non-redistributable entry constrains the bytes.",
        redistributable: true, posture: POSTURE.REACHED, taken: null, takenPaths: [], citedPaths: [],
        why: "Renders a Shadertoy shader to video off-screen. The tree already records frames " +
             "(webgl-recorder, v4102) and already runs headless GL, so the mechanism is duplicate. Recorded " +
             "for the licence shape and for the refusal.",
    },
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
        takenPaths: ["render/chuckCloseModel.mjs"], citedPaths: [
            // v4257 -- ADDED, AND THE GATE FOUND IT RATHER THAN A READER. v4247's ui/gazeDwell.mjs names this
            // repository to say that vr-menu-demo's refusal is recorded ALONGSIDE it -- a citation of a
            // refusal, which is the shape this register's ElasticProgress entry already documents as "the
            // opposite of taken". The byte-scan cannot tell the two apart and is right not to try: it flags
            // the mention and a person decides. This one is a mention.
            "ui/gazeDwell.mjs",
            // ...and this gate's own prose names it while explaining the citation above, which is the scan
            // being consistent rather than fussy: a mention is a mention wherever it is written.
            "tools/ship/vendoredLicences-selfcheck.mjs",
        ],
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
/**
 * *** THE DEBT, AS A NUMBER THAT MAY ONLY FALL. ***
 *
 * v4258 censused every `owner/repo (LICENCE)` citation in a module header and found 54 distinct sources --
 * and NOT ONE of them was in this register, while all eleven register entries appeared in NO header. Two
 * independent records of the same fact, grown from opposite ends: this file from assessment rounds, where
 * the answer is usually "read it, took nothing"; the headers from BUILD rounds, where something was taken
 * and the author wrote down whose idea it was. Nothing ever joined them.
 *
 * The repair is not a bulk import. Each entry needs grantorHoldsRights, licenceExists, redistributable and a
 * `why` that says what was taken -- judgements, one source at a time, and inventing them to clear a number
 * would be worse than the debt. So the number is a RATCHET: it may fall and it may not rise. Two are cleared
 * at v4258 (loov/jsfx and gibbok/animatelo, both from backlog #53), leaving 52, and one more at v4260
 * (activetheory/activeframe, backlog #70) -- registered in the SAME round its idea was taken, which is the
 * habit #53 said this ledger should have -- leaving 51.
 *
 * v4268 clears a fourth, boytchev/tsl-textures, leaving 50. *** THAT ONE WAS FOUND BY THE OPEN LIST BEING
 * WRONG ABOUT SOMETHING ELSE. *** Item #100 called an unpapered repository "the only TSL reference"; going to
 * check produced render/solidTexture.mjs, which has credited boytchev/tsl-textures in its header since v4243
 * and appeared in no register -- the same shape as #137 and #53, a third time. The debt did not shrink because
 * anybody set out to shrink it; it shrank because a claim was checked and the check ran into a citation.
 */
export const UNREGISTERED_CITED_BASELINE = 50;

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
