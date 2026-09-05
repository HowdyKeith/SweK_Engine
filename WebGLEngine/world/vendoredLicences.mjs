// WebGLEngine/world/vendoredLicences.mjs -- v4257
//
// *** world/reachedLicences.mjs COVERS WHAT WAS READ AND NOT TAKEN. NOTHING COVERED WHAT WAS TAKEN. ***
//
// That module's own docstring says it plainly -- "sources read during assessment rounds and NOT vendored" --
// and it is a careful, well-gated record of thirty-odd repositories whose bytes never entered the tree. The
// asymmetry is that the bytes which DID enter had no record at all. Backlog #61 filed it as "box3d and htmx
// are vendored with no licence provenance", and a census says the shape was bigger and stranger than that.
//
// ---- THE CENSUS, AND WHY COUNTING BY FILENAME IS WRONG IN BOTH DIRECTIONS -------------------------------------
//
// Fourteen directories under vendor/, plus ui/vendor/. Asking "which have a file called LICENSE" returns
// four without one -- fonts, htmx, keyhunt, wasm -- and THREE OF THOSE FOUR ANSWERS ARE WRONG:
//
//   fonts    IS papered. The grant is IBMPlexSerif-OFL.txt, the SIL Open Font License, sitting right there
//            under a name the pattern did not match. A census keyed on filenames finds only the licences
//            somebody named conventionally.
//   keyhunt  needs no grant, because NOTHING IS VENDORED. Its ATTRIBUTION.txt records a technique reference
//            for physics/crypto/secp256k1.mjs and says "NO CODE WAS COPIED". It is a reachedLicences entry
//            that happens to live under vendor/.
//   wasm     needs no grant either, because it is OURS. sha256.wasm and graphlayout.wasm are compiled from
//            sha256.ts and graphlayout.ts, which are in the same directory, by AssemblyScript. First-party
//            build output filed under a directory named for its format rather than for its origin.
//
// So the naive count says four and the true answer is ONE: htmx, which really did carry no grant. It is
// Zero-Clause BSD, recovered from upstream at the pinned tag, because the minified bundle has no banner --
// grepping it for a licence word returns ten hits and all ten are the substring "submit".
//
// *** AND 0BSD IS MORE PERMISSIVE THAN MIT: it drops even attribution. So nothing was ever at risk. The gap
// *** was in the paperwork, which is exactly the kind of gap worth closing BEFORE it matters rather than after.
"use strict";

/** What a vendored directory IS, which decides whether a grant is even the right question. */
export const KIND = Object.freeze({
    THIRD_PARTY: "third-party",   // someone else's bytes: a grant is required
    FIRST_PARTY: "first-party",   // this tree's own output: no grant to record
    NOT_VENDORED: "not-vendored", // a note about a source whose bytes never came
});

/** Where the grant physically lives, because "it has a licence" is three different situations. */
export const GRANT = Object.freeze({
    LICENCE_FILE: "licence-file",   // a file named LICENSE/COPYING
    NAMED_OTHER: "named-other",     // a licence file under a name a pattern will miss
    IN_HEADER: "in-header",         // the grant is a comment at the top of the source
    NONE: "none",                   // no grant anywhere in the tree
});

/**
 * Every vendored path, what it is, and where its grant lives.
 *
 * `path` is relative to WebGLEngine/. The gate walks the filesystem and requires that this list and the disk
 * agree EXACTLY in both directions: a directory here that is not on disk is a stale record, and one on disk
 * that is not here is an undeclared dependency. Neither is allowed to pass quietly.
 */
export const VENDORED = Object.freeze([
    { path: "vendor/box3d",     kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE",
      upstream: "https://github.com/erincatto/box3d", pin: "v0.1.0 / 8441b4a06d6d09dcfb0b0f704df4d847d1437b92",
      note: "papered at v4256 alongside the vendored headers. PROVENANCE.md records the commit." },
    { path: "vendor/draco",     kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    // v4486 -- vendor/fonts holds FOUR families now (Plex flat, cinzel/, jetbrains-mono/, source-sans-3/), each with its own
    // <Family>-OFL.txt beside it; this entry papers the directory under the Plex grant as before, and the per-family grants,
    // Reserved Font Names, sources and digests are text/fontRegistry.mjs, held by tools/ship/vendoredFonts-selfcheck.mjs.
    { path: "vendor/fonts",     kind: KIND.THIRD_PARTY, spdx: "OFL-1.1",   grant: GRANT.NAMED_OTHER,  file: "IBMPlexSerif-OFL.txt",
      note: "*** THE ONE A FILENAME CENSUS CALLS UNPAPERED AND IS WRONG ABOUT. *** IBM Plex Serif, SIL Open " +
            "Font License 1.1, Copyright 2017 IBM Corp with Reserved Font Name Plex. A font licence is also " +
            "the only one here that constrains RENAMING rather than copying." },
    { path: "vendor/gifenc",    kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/grass",     kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/heerich",   kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/htmx",      kind: KIND.THIRD_PARTY, spdx: "0BSD",      grant: GRANT.LICENCE_FILE, file: "LICENSE",
      upstream: "https://github.com/bigskysoftware/htmx", pin: "v2.0.10",
      note: "*** THE ONLY GENUINELY UNPAPERED ONE, AND #61's ACTUAL SUBJECT. *** The bundle carries no banner: " +
            "ten licence-word hits in htmx.2.0.10.min.js are all the substring 'submit'. Recovered from " +
            "upstream at the pinned tag at v4257. 0BSD drops even attribution, so nothing was at risk." },
    { path: "vendor/jolt",      kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/keyhunt",   kind: KIND.NOT_VENDORED, spdx: "MIT",      grant: GRANT.NAMED_OTHER,  file: "ATTRIBUTION.txt",
      note: "*** NOTHING IS VENDORED HERE. *** ATTRIBUTION.txt records gpu-keyhunt as a TECHNIQUE reference " +
            "for physics/crypto/secp256k1.mjs and states 'NO CODE WAS COPIED' -- that project is Python/GPU " +
            "and this is BigInt on the CPU. It is a reachedLicences-shaped entry filed under vendor/, which " +
            "is why a directory census must ask what a directory IS before asking for its grant." },
    { path: "vendor/krbn",      kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/slug",      kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/taichi-js", kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/three",     kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/three-webgpu", kind: KIND.THIRD_PARTY, spdx: "MIT",    grant: GRANT.LICENCE_FILE, file: "LICENSE",
      upstream: "https://registry.npmjs.org/three/-/three-0.178.0.tgz", pin: "three@0.178.0",
      note: "*** VENDORED AT v4319 AND UNDECLARED UNTIL v4371 -- FIFTY ROUNDS RED AND NOBODY SAW IT. *** The " +
            "TSL build (three.webgpu.js, three.core.js, three.tsl.js) beside r160, with three's own MIT LICENSE " +
            "copied in the same commit, so nothing was ever unpapered on disk; what was missing was the RECORD, " +
            "which is what this list is for. The gate that says so takes 15 s and is therefore outside verify's " +
            "3 s quick sweep, so it went red on every run and was reported by none of them -- found by a round " +
            "that ran it by hand for an unrelated reason. A standing red nobody runs is a check nobody has." },
    { path: "vendor/wasm",      kind: KIND.FIRST_PARTY, spdx: null,        grant: GRANT.NONE,         file: null,
      note: "*** OURS, NOT SOMEBODY ELSE'S. *** sha256.wasm and graphlayout.wasm are AssemblyScript output " +
            "from sha256.ts and graphlayout.ts in the same directory. A filename census calls this unpapered; " +
            "the right answer is that there is nobody to ask." },
    { path: "ui/vendor",        kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.IN_HEADER,    file: "qrcode.mjs",
      upstream: "qrcode-generator, Kazuhiko Arase, 2009",
      note: "*** AND A SECOND vendor/ DIRECTORY ENTIRELY, which a census pointed at the top-level one misses. " +
            "*** The grant is a comment at the top of the file -- 'Licensed under the MIT license' -- so it is " +
            "papered without a licence FILE existing at all." },
]);

/** Only these need a grant. The other two kinds are the census's real content. */
export const needsGrant = (e) => e.kind === KIND.THIRD_PARTY;

/** Third-party entries with no grant anywhere. This must stay empty, and it is the whole point. */
export const unpapered = (list = VENDORED) => list.filter((e) => needsGrant(e) && e.grant === GRANT.NONE);

/** Distinct SPDX identifiers actually vendored, which is a different set from the ones REACHED. */
export const spdxSet = (list = VENDORED) =>
    [...new Set(list.filter((e) => e.spdx).map((e) => e.spdx))].sort();

/**
 * What a naive filename census would report, kept as an executable statement of the error rather than a
 * remark about it. Anything whose grant is not a conventionally-named file looks unpapered to it.
 */
export const naiveUnpapered = (list = VENDORED) =>
    list.filter((e) => e.grant !== GRANT.LICENCE_FILE).map((e) => e.path);
