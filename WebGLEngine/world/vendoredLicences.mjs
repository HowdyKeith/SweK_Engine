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
    { path: "vendor/draco-encoder", kind: KIND.THIRD_PARTY, spdx: "Apache-2.0", grant: GRANT.LICENCE_FILE, file: "LICENSE",
      upstream: "https://github.com/google/draco", pin: "draco3d@1.5.7 (npm tarball registry.npmjs.org/draco3d/-/draco3d-1.5.7.tgz)",
      note: "draco_encoder_nodejs.js + draco_encoder.wasm, vendored at v4601 for task #53's mesh-compression " +
            "export. The tarball itself carries no LICENSE file -- fetched directly from google/draco's own " +
            "repo root, per package.json's \"license\": \"Apache-2.0\" field. PROVENANCE.txt beside it records " +
            "the evidence and why the decoder half was left unvendored." },
    // v4486 -- vendor/fonts holds FOUR families now (Plex flat, cinzel/, jetbrains-mono/, source-sans-3/), each with its own
    // <Family>-OFL.txt beside it; this entry papers the directory under the Plex grant as before, and the per-family grants,
    // Reserved Font Names, sources and digests are text/fontRegistry.mjs, held by tools/ship/vendoredFonts-selfcheck.mjs.
    { path: "vendor/fonts",     kind: KIND.THIRD_PARTY, spdx: "OFL-1.1",   grant: GRANT.NAMED_OTHER,  file: "IBMPlexSerif-OFL.txt",
      note: "*** THE ONE A FILENAME CENSUS CALLS UNPAPERED AND IS WRONG ABOUT. *** IBM Plex Serif, SIL Open " +
            "Font License 1.1, Copyright 2017 IBM Corp with Reserved Font Name Plex. A font licence is also " +
            "the only one here that constrains RENAMING rather than copying." },
    { path: "vendor/gifenc",    kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/grass",     kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    // v4498 -- the core of guillermolg00/morphicons (three files, no DOM, no dependencies), vendored when physics/mesh/strokeMorph.mjs's
    // written refusal expired: font glyphs are closed multi-subpath outlines, which is the half that file said not to re-derive.
    { path: "vendor/morphicons", kind: KIND.THIRD_PARTY, spdx: "MIT",      grant: GRANT.LICENCE_FILE, file: "LICENSE",
      upstream: "https://github.com/guillermolg00/morphicons", pin: "npm morphicons@1.7.1",
      note: "papered at v4498 with PROVENANCE.md beside it (the tarball's sha256, which files are vendored and which are not)." },
    { path: "vendor/heerich",   kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    { path: "vendor/htmx",      kind: KIND.THIRD_PARTY, spdx: "0BSD",      grant: GRANT.LICENCE_FILE, file: "LICENSE",
      upstream: "https://github.com/bigskysoftware/htmx", pin: "v2.0.10",
      note: "*** THE ONLY GENUINELY UNPAPERED ONE, AND #61's ACTUAL SUBJECT. *** The bundle carries no banner: " +
            "ten licence-word hits in htmx.2.0.10.min.js are all the substring 'submit'. Recovered from " +
            "upstream at the pinned tag at v4257. 0BSD drops even attribution, so nothing was at risk." },
    { path: "vendor/jolt",      kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE" },
    // Racing city 0 (task 63) -- Kenney's two Godot starter kits, models and the colormap only: the road tiles the flat track is laid
    // from, the cars a brain learns to drive, the small buildings CityGen's stand beside. Each LICENSE was read off the file in this
    // tree (MIT, holder Kenney); the README of each says the models are CC0 and its License section carries a DIFFERENT YEAR from the
    // file (2026 against 2023 and 2025), recorded in each PROVENANCE.md. world/kenneyKit.mjs holds the manifest with bytes and hashes.
    { path: "vendor/kenney-city", kind: KIND.THIRD_PARTY, spdx: "MIT",     grant: GRANT.LICENCE_FILE, file: "LICENSE.md",
      upstream: "https://github.com/KenneyNL/Starter-Kit-City-Builder", pin: "4535092b740b378b700efd9df9e27a631815b84a",
      note: "LICENSE.md, Copyright (c) 2025 Kenney, MIT; 15 GLB models and models/Textures/colormap.png; PROVENANCE.md beside it." },
    { path: "vendor/kenney-racing", kind: KIND.THIRD_PARTY, spdx: "MIT",   grant: GRANT.LICENCE_FILE, file: "LICENSE",
      upstream: "https://github.com/KenneyNL/Starter-Kit-Racing", pin: "2f2e5f2646dda89cb21d4e8539bab60c6e955dc8",
      note: "LICENSE, Copyright (c) 2023 Kenney, MIT; 13 GLB models and models/Textures/colormap.png; PROVENANCE.md beside it." },
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
      upstream: "https://registry.npmjs.org/three/-/three-0.186.1.tgz", pin: "three@0.186.1",
      note: "*** VENDORED AT v4319 AND UNDECLARED UNTIL v4371 -- FIFTY ROUNDS RED AND NOBODY SAW IT. *** The " +
            "TSL build (three.webgpu.js, three.core.js, three.tsl.js) beside r160, with three's own MIT LICENSE " +
            "copied in the same commit, so nothing was ever unpapered on disk; what was missing was the RECORD, " +
            "which is what this list is for. The gate that says so takes 15 s and is therefore outside verify's " +
            "3 s quick sweep, so it went red on every run and was reported by none of them -- found by a round " +
            "that ran it by hand for an unrelated reason. A standing red nobody runs is a check nobody has. " +
            "*** RE-VENDORED 2026-09-08, 0.178.0 -> 0.185.1: *** tools/ship/three-probe.json settled the question " +
            "vendor/three-webgpu/README.md's history section describes -- the 0.185 refusal at v4319 was one " +
            "build box's WebGPU implementation lagging the spec, not a fact about the fleet. Same pin shape, " +
            "same one-line edit, same grant. *** v4805: 0.185.1 -> 0.186.1, *** the same three files and edit again, the " +
            "LICENSE byte for byte the same; the 0.185.1 files moved, unchanged, to vendor/three-webgpu-r185." },
    { path: "vendor/three-webgpu-r185", kind: KIND.THIRD_PARTY, spdx: "MIT", grant: GRANT.LICENCE_FILE, file: "LICENSE",
      upstream: "https://registry.npmjs.org/three/-/three-0.185.1.tgz", pin: "three@0.185.1",
      note: "*** KEPT, NOT IMPORTED BY THE ENGINE. *** vendor/three-webgpu's files from 2026-09-08 until v4805, moved here " +
            "unchanged when that directory went to 0.186.1, so the r185 drafts in docs/upstream-three/ and their patches " +
            "still have the build they are written against: tools/ship/threePatch.mjs applies the patches to it, and " +
            "threeUpstream-selfcheck.mjs and threeUpstreamPaths-selfcheck.mjs run it. The same blobs git already held, so " +
            "the copy adds nothing to the repository; three's own MIT LICENSE beside it, as for the other two copies." },
    { path: "vendor/wasm",      kind: KIND.FIRST_PARTY, spdx: null,        grant: GRANT.NONE,         file: null,
      note: "*** OURS, NOT SOMEBODY ELSE'S. *** sha256.wasm and graphlayout.wasm are AssemblyScript output " +
            "from sha256.ts and graphlayout.ts in the same directory. A filename census calls this unpapered; " +
            "the right answer is that there is nobody to ask." },
    { path: "vendor/xatlas",    kind: KIND.THIRD_PARTY, spdx: "MIT",       grant: GRANT.LICENCE_FILE, file: "LICENSE",
      upstream: "https://github.com/jpcy/xatlas", pin: "f700c7790aaa030e794b52ba7791a05c085faf0c",
      note: "*** A REFERENCE ORACLE, NOT A DEPENDENCY, AND THE DISTINCTION IS ENFORCED BY THE LANGUAGE. *** " +
            "xatlas.h and xatlas.cpp are C++ and there is no emscripten in this sandbox, so nothing the engine " +
            "ships can load them and nothing does -- tools/mesh/xatlasRef.mjs COMPILES them on demand with g++ " +
            "and runs the binary as a subprocess, to grade physics/mesh/uvLscm.mjs against the reference " +
            "implementation of the same pipeline. (c) 2018-2020 Jonathan Young. The LICENCE IS TWENTY LINES, " +
            "sha256 2c16d5b1c280, which is NOT the 21-line MIT text six other bodies here share -- the length " +
            "is what says it was read rather than assumed, and world/licenceSweep.mjs records the hash for " +
            "exactly that reason. Only the two source files and the licence were taken: no models, no build " +
            "script, no thirdparty tree. vendor/xatlas/PROVENANCE.txt carries the evidence commands." },
    // v4778 -- TWO BODIES THE rtx LINE VENDORED WITHOUT A LINE HERE, found by this gate at the merge. Each grant was read
    // off the files in this tree, not remembered: the zlib text at the top of both MikkTSpace sources, and the licence
    // line of male-cns's PROVENANCE.md, which records what the Neuprint server declares and says in the same breath that
    // the declaration was not re-confirmed against Janelia's own terms. That caveat is carried below, not dropped.
    { path: "vendor/male-cns",  kind: KIND.THIRD_PARTY, spdx: "CC-BY-4.0", grant: GRANT.NAMED_OTHER,  file: "PROVENANCE.md",
      upstream: "https://neuprint.janelia.org (Janelia FlyEM male-cns connectome)", pin: "male-cns:v1.0, fetched 2026-09-21T13:46:26Z",
      note: "*** DATA, NOT CODE, AND THE GRANT IS A SERVER'S DECLARATION RECORDED IN PROVENANCE.md. *** Two baked " +
            "circuits (the 34-neuron Giant Fiber Circuit and the 50-neuron EPG compass) from a Neuprint fetch the " +
            "maintainer ran on their own machine. PROVENANCE.md states CC-BY-4.0 'as declared by the Neuprint server' " +
            "and that the version was not independently re-confirmed against Janelia's publication terms -- verify " +
            "before any redistribution wider than this repo's demo use. CC-BY asks for attribution, which that " +
            "file carries." },
    { path: "vendor/mikktspace", kind: KIND.THIRD_PARTY, spdx: "Zlib",     grant: GRANT.IN_HEADER,    file: "mikktspace.h",
      upstream: "https://github.com/mmikk/MikkTSpace", pin: "3e895b49d05ea07e4c2133156cfa94369e19e409",
      note: "*** A REFERENCE ORACLE LIKE xatlas, AND PAPERED IN THE HEADER LIKE ui/vendor. *** (C) 2011 Morten S. " +
            "Mikkelsen, zlib; the upstream repository carries no LICENSE file and the grant is the comment at the " +
            "top of mikktspace.c and mikktspace.h, verbatim. tools/mesh/mikktRef.mjs compiles the two files with " +
            "g++ to grade physics/mesh/mikktSpace.mjs; nothing the engine ships loads them. PROVENANCE.txt beside " +
            "them carries the pin and both sha256 digests." },
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
