// WebGLEngine/world/licenceSweep.mjs -- v4276
//
// TWENTY-SIX REPOSITORIES, ACTUALLY OPENED, WITH THE EVIDENCE THAT SAYS SO.
//
// ---- *** THE PREMISE THIS CORRECTS WAS MINE, AND IT SHIPPED ONE ROUND AGO. *** ------------------------------------
//
// v4275 registered six repositories in world/namedNotChecked.mjs as NAMED and unchecked, and said in its module
// header, its gate, its changelog and its commit message that "this session has no network". *** THAT WAS NEVER
// TESTED. *** A plain `curl https://github.com` returns HTTP 400 through this environment's proxy, which reads
// like a wall and is not one: the proxy gates GitHub PER REPOSITORY, and its own error text names the way
// through. Anonymous git reads of public repositories work. All six were clonable the whole time.
//
// So this file is the check that should have happened then, plus the six suggested since -- and a thirteenth
// nobody suggested: boytchev/tsl-textures, whose MIT the tree has RELIED on since v4243 on the strength of our
// own file header. v4275 registered that reading as explicitly SECOND-HAND, which was honest, and once the
// network turned out to be real the honest thing was to stop citing ourselves. It is MIT. Every verdict below
// was read off a file on disk in this session, and the evidence is recorded so a later round can tell a real
// reading from a remembered one.
//
// ---- WHAT THE EVIDENCE IS FOR -----------------------------------------------------------------------------------
//
// `sha256` is the first twelve hex characters of the licence file's hash. It is here because *** IDENTICAL
// HASHES ARE A FACT WORTH HAVING: *** four of these repositories ship byte-identical MIT text (snelly, fibre,
// gravy, hydrogenic) and two more share a different byte-identical MIT (EON-diffuse, OpenPBR-viewer). That is
// one author reusing one file, which is unremarkable -- and it means a future round that finds a SEVENTH copy
// with a different hash has learned something, where a round that only recorded "MIT" would not have.
//
// *** AND IT IS A HASH RATHER THAN A LINE COUNT FOR A REASON THE THIRTEENTH ENTRY DEMONSTRATES. *** Three
// distinct MIT files here are all exactly 21 lines -- EON-diffuse's, Trinity's and tsl-textures' -- and all
// three hash differently. A ledger that recorded length would have called them the same file. Length is a
// coincidence three ways; bytes are not.
//
// ---- AND THE TWO WAYS A LICENCE SCAN GOES WRONG, BOTH HIT IN ONE SESSION ------------------------------------------
//
// world/orrery.mjs records three scans of this tree's own that reported "no licence" against a dependency that
// had one, because the file was not named LICENSE. That happened again here: christopherbatty/SDFGen has NO
// licence file at all, and its README carries the full MIT text. A root-directory scan calls it unpapered and
// is wrong.
//
// *** THE OPPOSITE ERROR ALSO HAPPENED, IN THE SAME HOUR. *** Grepping READMEs case-insensitively for "MIT"
// reported hits in snellytracer and OculusShaderToy -- from the words "emitter" and "transmitted". A scan that
// had stopped there would have recorded two licences that do not exist. Both directions were corrected by
// reading the actual matched lines rather than counting them.
//
// A third variant of the first error turned up in the last nine: ashima/webgl-diagnostic and redcamel/gl-matrix
// are both plainly MIT and NEITHER CARRIES THE WORDS "MIT License" ANYWHERE. They open with a copyright line
// and go straight into the grant. A scan keyed on the title calls them unlicensed; what makes them MIT is the
// body, which was read. (And reading it caught a fourth thing: a grep for "shall be included in all copies"
// answered zero on a file that says exactly that, because it wraps as "included in / all copies". Prose does
// not hold still for a grep, which is the same defect v4275 shipped in a gate and this round shipped again.)
//
// ---- *** AND THE QUESTION THE LAST NINE RAISED THAT THE FIRST THIRTEEN DID NOT: WHO IS GRANTING? *** ---------
//
// Eight of the nine sit under one account, and FOUR OF THOSE EIGHT carry a licence file naming somebody else
// entirely -- Brendan Duncan, Jamie Owen, Alin, and Brandon Jones with Colin MacKenzie IV. (Only two of the
// eight name the account holder. A ninth-of-nine is Ashima's own.) The licences are real and permissive; the
// account you cloned from is not the party granting them. Recording "redcamel/gl-matrix, MIT" and stopping is
// how a tree ends up crediting a mirror for gl-matrix.
//
// The count was written as FIVE and run as four before a later batch made it five for a different reason.
// redcamel/screen-space-reflections is a mirror on every other sign and has no licence file, so there is no
// name in it to read; but0n/three-raymarcher, added afterwards, does name one. mirrors() reports what the
// evidence supports, not what the pattern suggests, and the number is derived from the entries rather than
// stated in this comment for exactly that reason.
//
// ---- *** AND TWO STATES THE LAST FOUR ADDED THAT NO EARLIER ENTRY NEEDED. *** --------------------------------
//
// A repository CAN STATE TWO DIFFERENT LICENCES. but0n/recastCLI.js ships the MIT text in LICENSE and says
// "license": "ISC" in package.json. Both are permissive, so nothing is alarming, and THEY ARE NOT THE SAME
// GRANT. A ledger that recorded whichever it happened to read first would be writing down a coin toss. That
// entry is the only one where licenceExists is true and spdx is null: a licence certainly exists, and which
// one is open. contradictions() reports it, and tally() counts it under `unresolved` rather than letting a
// key literally named "null" appear in the spdx histogram, which is what the first version did.
//
// AND THE GRANTOR QUESTION IS NOT AUTOMATABLE. but0n/Ashes is licensed to "Jeff Ma" and its package.json
// author is "but0n" -- the same person under a legal name and a handle, which no comparison of the URL's
// owner segment against the copyright line could ever have got right. Every isRepoOwner in this file was
// decided by reading at least two things in the repository. That is a limit on the method, stated here rather
// than discovered later by whoever trusts the field too far.
//
// So every entry from here carries `grantor`, with the name read out of the licence file and whether it is
// the repository owner. Backlog #82 is the same question in its dangerous direction -- ENCUMBERED, a licence
// granted by somebody who lacked the rights. This is its ordinary direction, and it is far more common: the
// grant is good, the attribution would have been wrong.
"use strict";

/** A verdict this session read, or the absence of one. `evidence` is where it was read FROM. */
export const SWEEP = Object.freeze([
    // ---- the six v4275 registered as unchecked, now checked -----------------------------------------------
    { repo: "portsmouth/EON-diffuse", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "74bf9a05e75f", lines: 21 }, namedIn: "v4275 suggestion",
      note: "The idea v4275 took an energy-preserving rough diffuse FROM, having declined to open it. MIT all along." },
    { repo: "AcademySoftwareFoundation/OpenPBR", spdx: "Apache-2.0", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "c71d239df917", lines: 201 }, namedIn: "v4275 suggestion",
      note: "201 lines, which is the Apache text's length and the reason the hash differs from every other entry here." },
    { repo: "portsmouth/OpenPBR-viewer", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "74bf9a05e75f", lines: 21 }, namedIn: "v4275 suggestion",
      note: "Byte-identical to EON-diffuse's." },
    { repo: "portsmouth/snelly", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "e39f20060e23", lines: 23 }, namedIn: "v4275 suggestion", note: null },
    { repo: "portsmouth/fibre", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "e39f20060e23", lines: 23 }, namedIn: "v4275 suggestion", note: null },
    { repo: "portsmouth/Trinity", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "d3d2194485af", lines: 21 }, namedIn: "v4275 suggestion",
      note: "Still LIKELY DUPLICATE on the merits -- four fluid solvers already ship here -- which is a separate question from the licence." },

    // ---- the six suggested at v4276 ------------------------------------------------------------------------
    { repo: "christopherbatty/SDFGen", spdx: "MIT", licenceExists: true,
      evidence: { file: "README.md", sha256: "2dccaac5cccd", lines: 25 }, namedIn: "v4276 suggestion",
      note: "*** NO LICENCE FILE, AND FULLY LICENSED ANYWAY. *** The MIT text with '(c) 2015, Christopher Batty' " +
            "is in the README. A root-directory scan reports this repository unpapered and is wrong about it, " +
            "which is the exact mistake world/orrery.mjs records three of its own scans making." },
    { repo: "portsmouth/gravy", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "e39f20060e23", lines: 23 }, namedIn: "v4276 suggestion",
      note: "(c) 2017 Jamie Portsmouth. Same bytes as snelly, fibre and hydrogenic." },
    { repo: "portsmouth/hydrogenic", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "e39f20060e23", lines: 23 }, namedIn: "v4276 suggestion", note: null },
    { repo: "portsmouth/snellytracer", spdx: null, licenceExists: false,
      evidence: { file: null, sha256: null, lines: 0 }, namedIn: "v4276 suggestion",
      note: "*** GENUINELY UNPAPERED. *** No licence file anywhere outside a vendored three.js CTM loader's own, " +
            "and no licence section in the README. The word 'MIT' does appear there -- inside 'emitter'." },
    { repo: "portsmouth/vidfilt", spdx: null, licenceExists: false,
      evidence: { file: null, sha256: null, lines: 0 }, namedIn: "v4276 suggestion",
      note: "GENUINELY UNPAPERED. An 11-line README with no licence word in it at all." },
    { repo: "portsmouth/OculusShaderToy", spdx: null, licenceExists: false,
      evidence: { file: null, sha256: null, lines: 0 }, namedIn: "v4276 suggestion",
      note: "GENUINELY UNPAPERED. Its two 'MIT' hits are 'transmitted' and a path fragment." },

    // ---- and the one the tree had been RELYING on second-hand ------------------------------------------------
    { repo: "boytchev/tsl-textures", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "9b78f997e3b1", lines: 21 }, namedIn: "v4275 register",
      note: "*** THIS ONE WAS NOT SUGGESTED. IT WAS ALREADY LOAD-BEARING. *** render/solidTexture.mjs has " +
            "opened since v4243 with 'boytchev/tsl-textures (MIT, Pavel Boytchev 2024)', and v4275 registered " +
            "that in world/reachedLicences.mjs with a licenceNote saying the reading was SECOND-HAND -- our own " +
            "header, not the LICENSE file. Opened now: MIT, (c) 2024 Pavel Boytchev, 21 lines. The header was " +
            "right, and 'the header was right' is a thing you only know once you look. package.json agrees." },

    // ---- the nine suggested at v4276, and the question they raised that the first thirteen did not ----------
    //
    // *** FIVE OF THESE ARE MIRRORS WHOSE LICENCE NAMES SOMEBODY ELSE. *** `grantor` exists because of them.
    { repo: "ashima/webgl-diagnostic", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "03b69f25153e", lines: 19 }, namedIn: "v4276 suggestion",
      grantor: { named: "Ashima Arts", isRepoOwner: true },
      note: "*** MIT BY BODY, NOT BY TITLE. *** The file opens 'Copyright (C) 2011 by Ashima Arts' with no " +
            "'MIT License' heading at all -- a scan keyed on the title reports it unlicensed. What makes it " +
            "MIT is the text: the grant clause with sublicense, the notice-retention condition and the " +
            "as-is disclaimer, all read. Second Ashima repository the tree has met, after webgl-noise at #137." },
    { repo: "redcamel/ComputeShaderRnd_WebGPU", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "6be672e1d0e0", lines: 21 }, namedIn: "v4276 suggestion",
      grantor: { named: "Redcamel", isRepoOwner: true },
      note: "(c) 2022 Redcamel. Redcamel's own work, and one of only two here that is." },
    { repo: "redcamel/RedRnd", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "7d50794de8dd", lines: 21 }, namedIn: "v4276 suggestion",
      grantor: { named: "Redcamel", isRepoOwner: true },
      note: "(c) 2018 Redcamel. The other one." },
    { repo: "redcamel/wgsl_reflect", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE.md", sha256: "99d01341499d", lines: 21 }, namedIn: "v4276 suggestion",
      grantor: { named: "Brendan Duncan", isRepoOwner: false },
      note: "(c) 2021 Brendan Duncan, and package.json's author field says the same. A mirror. Crediting " +
            "redcamel for this would be crediting the wrong person for a WGSL parser." },
    { repo: "redcamel/glsl-blend", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE.md", sha256: "a78941cd1fcd", lines: 20 }, namedIn: "v4276 suggestion",
      grantor: { named: "Jamie Owen", isRepoOwner: false },
      note: "(c) 2015 Jamie Owen. A mirror of the well-known GLSL blend-mode collection." },
    { repo: "redcamel/procedural-tileable-shaders", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "6e5a319b178f", lines: 21 }, namedIn: "v4276 suggestion",
      grantor: { named: "Alin", isRepoOwner: false },
      note: "(c) 2019 Alin. A mirror." },
    { repo: "redcamel/gl-matrix", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE.md", sha256: "e8b80a53d0f9", lines: 18 }, namedIn: "v4276 suggestion",
      grantor: { named: "Brandon Jones, Colin MacKenzie IV", isRepoOwner: false },
      note: "(c) 2015 Brandon Jones and Colin MacKenzie IV, pinned at version 2.4.0. A mirror of gl-matrix " +
            "itself. Like ashima/webgl-diagnostic it carries no 'MIT License' title, only the body." },
    { repo: "redcamel/screen-space-reflections", spdx: "MIT", licenceExists: false,
      evidence: { file: null, sha256: null, lines: 0 }, namedIn: "v4276 suggestion",
      grantor: { named: null, isRepoOwner: false },
      note: "*** AN SPDX WITH NO GRANT BEHIND IT -- A THIRD PAPERWORK SHAPE THE LEDGER HAS NOT HELD. *** " +
            "package.json says \"license\": \"MIT\" and there is NO licence file anywhere in the tree, root " +
            "or nested, and no licence line in the readme. So this entry is the one place in the sweep where " +
            "spdx is set and licenceExists is false, deliberately: somebody DECLARED MIT, and nobody granted " +
            "it in the words the licence requires be included in all copies. That is not the same as papered " +
            "and it is not the same as unpapered, and collapsing it into either would lose the distinction." },
    // ---- the four suggested last at v4276, which broke the sweep's model twice more --------------------------
    { repo: "but0n/Ashes", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "563667c39a94", lines: 21 }, namedIn: "v4276 suggestion",
      grantor: { named: "Jeff Ma", isRepoOwner: true },
      note: "*** THE LICENCE NAMES A LEGAL NAME AND THE ACCOUNT IS A HANDLE. *** LICENSE says (c) 2018 Jeff " +
            "Ma; package.json's author says 'but0n'. Same person, and NO STRING COMPARISON WOULD SAY SO. " +
            "isRepoOwner is true here because two fields in the repository were read together, which is the " +
            "limit on the grantor question worth stating plainly: it is answerable from evidence, and it is " +
            "not automatable by matching the owner segment of the URL against the copyright line. " +
            "package.json also says MIT, agreeing with the file -- which recastCLI.js does not." },
    { repo: "but0n/three-raymarcher", spdx: "MIT", licenceExists: true,
      evidence: { file: "LICENSE", sha256: "c093aa852b7a", lines: 21 }, namedIn: "v4276 suggestion",
      grantor: { named: "Daniel Esteban Nombela", isRepoOwner: false },
      note: "(c) 2022 Daniel Esteban Nombela, and package.json's author field says the same. A mirror, and " +
            "the fifth in the sweep." },
    { repo: "but0n/recastCLI.js", spdx: null, licenceExists: true,
      evidence: { file: "LICENSE", sha256: "0178ba03251c", lines: 21 }, namedIn: "v4276 suggestion",
      grantor: { named: "recastCLI.js authors", isRepoOwner: null },
      contradiction: { file: "MIT", metadata: "ISC" },
      note: "*** THIS REPOSITORY STATES TWO DIFFERENT LICENCES AND THE LEDGER REFUSES TO PICK ONE. *** " +
            "LICENSE is the MIT text, (c) 2018 'recastCLI.js authors'; package.json says \"license\": " +
            "\"ISC\". Both permissive, so nothing here is alarming -- and they are NOT THE SAME GRANT, and a " +
            "ledger that recorded whichever it happened to read first would be recording a coin toss as a " +
            "fact. spdx is null with licenceExists TRUE, which no other entry is: a licence certainly exists " +
            "and WHICH ONE is unresolved. The grantor is a collective, so isRepoOwner is null rather than " +
            "false -- 'the authors' is neither the account holder nor somebody else." },
    { repo: "but0n/webgpu-cluster", spdx: "ISC", licenceExists: false,
      evidence: { file: null, sha256: null, lines: 0 }, namedIn: "v4276 suggestion",
      grantor: { named: null, isRepoOwner: false },
      note: "DECLARED-ONLY, and the second of them. No licence file at any depth; package.json says ISC and " +
            "its author field is empty. *** ISC IS `npm init`'s DEFAULT. *** That does not make the " +
            "declaration void, and it does mean a declared-only ISC is weaker evidence of intent than a " +
            "declared-only MIT somebody typed -- which is a judgement, so it is recorded as a note and not " +
            "as a field the gate grades." },
    { repo: "redcamel/Crowd.lab", spdx: null, licenceExists: false,
      evidence: { file: null, sha256: null, lines: 0 }, namedIn: "v4276 suggestion",
      grantor: { named: null, isRepoOwner: false },
      note: "GENUINELY UNPAPERED. No licence file at any depth, no package.json licence field, and no " +
            "licence word in the README -- all three checked, because SDFGen taught this sweep that the " +
            "root directory is not the whole answer." },
]);

/** Only a nested third-party licence, which is NOT the repository's own and must never be read as one. */
export const NESTED_THIRD_PARTY = Object.freeze({
    path: "js/thirdparty/three/loaders/ctm/license",
    seenIn: Object.freeze(["portsmouth/snellytracer", "portsmouth/vidfilt", "portsmouth/gravy", "portsmouth/hydrogenic"]),
    why: "A vendored three.js CTM loader carries its own licence. A recursive search finds it in all four, and " +
         "in two of them it is the ONLY licence file present -- so a recursive scan that does not ask WHOSE " +
         "licence it found would call snellytracer and vidfilt papered. They are not.",
});

/**
 * Counts, so a caller and a gate read the same numbers rather than each deriving them.
 *
 * *** bySpdx COUNTS ONLY ENTRIES WITH A RESOLVED SPDX, AND `unresolved` IS SEPARATE. *** The first version
 * reduced over every papered entry, which put a key literally named "null" into bySpdx as soon as
 * but0n/recastCLI.js arrived -- a repository that HAS a licence file and states a different licence in its
 * metadata, so the licence exists and which one is genuinely open. Counting that as an spdx called "null" is
 * how an unresolved question becomes a category nobody looks at twice.
 */
export function tally(sweep = SWEEP) {
    const papered = sweep.filter((e) => e.licenceExists);
    const resolved = papered.filter((e) => e.spdx !== null);
    return {
        total: sweep.length,
        papered: papered.length,
        unpapered: sweep.length - papered.length,
        bySpdx: resolved.reduce((a, e) => { a[e.spdx] = (a[e.spdx] || 0) + 1; return a; }, {}),
        unresolved: papered.length - resolved.length,
        declaredOnly: declaredOnly(sweep).length,
        licenceInReadme: papered.filter((e) => /README/i.test(e.evidence.file || "")).length,
    };
}

/** Repositories that state one licence in a file and a DIFFERENT one in metadata. */
export function contradictions(sweep = SWEEP) {
    return sweep.filter((e) => e.contradiction);
}

/** Repositories sharing a licence file byte for byte, keyed by hash. Only groups of two or more. */
export function identicalLicences(sweep = SWEEP) {
    const by = {};
    for (const e of sweep) if (e.evidence.sha256) (by[e.evidence.sha256] ||= []).push(e.repo);
    return Object.fromEntries(Object.entries(by).filter(([, v]) => v.length > 1));
}

/** Every entry this sweep settled that world/namedNotChecked.mjs had been holding as UNCHECKED. */
export function settles(named) {
    const have = new Set(SWEEP.map((e) => e.repo));
    return named.filter((e) => have.has(e.repo)).map((e) => e.repo);
}

/** Entries whose spdx is DECLARED (in metadata) with no licence text anywhere. Neither papered nor unpapered. */
export function declaredOnly(sweep = SWEEP) {
    return sweep.filter((e) => e.spdx !== null && !e.licenceExists);
}

/** Entries whose licence names somebody other than the account the repository sits under. */
export function mirrors(sweep = SWEEP) {
    return sweep.filter((e) => e.grantor && e.grantor.named && e.grantor.isRepoOwner === false);
}

/** The account a repository sits under, which is NOT the same question as who granted the licence. */
export const ownerOf = (repo) => repo.split("/")[0];
