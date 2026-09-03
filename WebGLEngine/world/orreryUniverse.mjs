// FILE: world/orreryUniverse.mjs -- v4432
//
// *** #139 ASKS FOR COUNTRY, DEFAULT LANGUAGE AND CONTRIBUTOR COUNT AS ORRERY AXES. ONE OF THE THREE IS
// REACHABLE, AND ASKING FOUND SOMETHING WORTH MORE THAN THE OTHER TWO. ***
//
// ---- WHAT IS REACHABLE, ESTABLISHED BY CALLING IT RATHER THAN BY READING ABOUT IT --------------------------
//
// This session's GitHub access splits cleanly in two, and the split is what decides the item:
//
//     SEARCH endpoints      search_repositories, search_users -- NOT repo-scoped, any public repo answers
//     PER-REPO endpoints    list_commits, list_repository_collaborators, get_file_contents -- scoped to this
//                           session's own repositories and refused for everything else
//
// So, axis by axis:
//
//     default language     REACHABLE. search_repositories returns `language` directly.
//     contributor count    REFUSED. Both routes are per-repo endpoints. list_repository_collaborators AND
//                          list_commits on mrdoob/three.js returned the identical refusal naming the two
//                          allowed repositories. A page of commits would be a SAMPLE of recent activity and
//                          not a contributor count anyway, and the endpoint that would sample it is the one
//                          refused.
//     country              REFUSED. search_users returns login, id, node_id, avatar_url and profile_url and
//                          nothing else -- there is no location field in the response and no get_user tool
//                          here. Probing `location:X` qualifiers could confirm a guess, but GitHub locations
//                          are free text ("Bay Area", "Earth", empty), so that neither converges nor measures.
//
// Two of three are refused WITH A REASON rather than replaced by a local proxy that shares their name. The
// tree could count distinct authors in its own vendored bytes and call it a contributor count; it would be a
// different quantity wearing the right label, which is the defect half this session's rounds have been about.
//
// ---- *** AND THE FIRST TIME ANYTHING ASKED GITHUB ABOUT THESE OWNERS, ONE OF THEM WAS NOT THERE. *** -------
//
// Nine distinct upstream owner/repo pairs are recorded in orrery-authors.json. Eight resolve. The ninth,
// `justjakel/quickjs-emscripten`, does not exist -- GitHub's user search answers "the listed users cannot be
// searched either because the users do not exist" -- and the real one, `justjake/quickjs-emscripten`, has
// 1,702 stars. ONE LETTER, and it is the attribution for 810,948 vendored bytes.
//
// The chain, measured end to end:
//
//   1. vendor/wasm/quickjs/quickjs-emscripten-core/README.md line 5 links github.com/justjakel/...
//   2. THE SAME FILE links github.com/justjake/... FORTY-ONE times, on 31 further lines
//   3. three SIBLING packages vendored from the same upstream release spell it correctly on their own line 3-5
//   4. world/orreryAuthor.mjs's upstreamFrom() took the FIRST GitHub URL in the file
//   5. so the orrery attributed the body to an account that does not exist
//
// *** THE ONE OCCURRENCE THAT WAS WRONG IS THE ONE OCCURRENCE ANYTHING READ. *** Forty-one correct copies
// sat in the same file and none was consulted. upstreamFrom now votes on the OWNER of the repo the first URL
// names -- 41 to 1 here -- and records the vote, so a disagreement is visible instead of silently resolved.
//
// WHAT THIS DOES NOT CLAIM: that the stray L was introduced here. The vendored README's upstream cannot be
// fetched from this session (a per-repo endpoint), so whether upstream shipped it or it arrived in the vendor
// step is not decidable from inside this tree. The DERIVED record is corrected because GitHub is authoritative
// that one of the two accounts exists; the VENDORED text is left exactly as it is, because editing somebody
// else's README on a hunch is not provenance work.
//
// ---- THE LANGUAGE AXIS, AND THE TREE ALREADY HAD AN ANSWER NOBODY HAD COMPARED IT TO ----------------------
//
// world/repoHeightfield.js's LANGUAGE_BIOME maps a file EXTENSION to a biome -- the tree's own answer to
// "what language is this" (#30, "language as biome"). GitHub's `language` is a second answer to the same
// question, and the two had never met. Over the eleven bodies with an upstream:
//
//     7 agree      4 disagree      0 unexplained
//
// *** AND EVERY DISAGREEMENT HAS A NAMED MECHANISM, WHICH IS WHY THE RESULT IS NOT "THE TREE IS WRONG". ***
// The two are answers to DIFFERENT QUESTIONS: GitHub describes the upstream SOURCE, the biome describes the
// VENDORED BYTES. Where those differ, they must disagree:
//
//     box3d     .a is 1,451,810 bytes (libbox3d.a)    GitHub says C      dominant ext is a BUILD ARTIFACT
//     wasm      .wasm is 511,923 bytes                GitHub says TS     dominant ext is a BUILD ARTIFACT
//     jolt      .js is 3,222,495 of 3,224,554 bytes   GitHub says C++    NOT ONE .cpp OR .h IS VENDORED
//     taichi-js .js is 3,634,580 of 3,638,669 bytes   GitHub says TS     NOT ONE .ts IS VENDORED
//     slug      .txt is 2,752 of 3,821 bytes          GitHub says HLSL   vendor/slug HAS NO CODE AT ALL
//
// *** AND THERE ARE THREE MECHANISMS HERE, NOT ONE, WHICH IS ONLY VISIBLE BECAUSE THE FIRST GUESS WAS
// CHECKED. *** The obvious rule -- "the upstream's own language is absent, so this must be output" -- fits
// jolt and FAILS the other two: vendor/box3d holds 7 .c and 8 .h files and vendor/wasm holds 7 .ts files, so
// their source IS present, merely outweighed by a 1.45 MB static archive and 511 KB of .wasm. And the opposite
// rule -- "the dominant extension is a build artifact" -- fits those two and fails jolt, whose 3.2 MB is a
// single .js, an extension that is source everywhere else in this tree. So:
//
//     built        the dominant extension by BYTES is a known build artifact (.a, .wasm, .so, .min, ...)
//     transpiled   the upstream's declared language has NO file of its own extension in the vendored body
//     paperwork    the body carries no code at all, so it has no language to be right or wrong about
//
// The first two are the same finding with different evidence: FOUR OF ELEVEN BODIES ARE VENDORED AS OUTPUT
// RATHER THAN AS SOURCE -- and the fourth, taichi-js, was invisible until the order of those tests was fixed,
// because TypeScript and JavaScript are ONE BIOME in the tree's legend and a bundled .js therefore "agreed"
// with a TypeScript upstream. A comparison between a fine measure and a coarse one hides exactly the cases
// where the coarse one cannot tell two things apart. The third is not a disagreement at all -- vendor/slug is LICENSE and PROVENANCE.txt
// and nothing else, and reporting that as a wrong answer would be counting paperwork as a language.
"use strict";

/** The axes #139 asked for, and what happened when each was tried. Data, so a gate can check the refusals. */
export const AXES = Object.freeze([
    Object.freeze({ axis: "defaultLanguage", reachable: true, via: "search_repositories -> items[].language" }),
    Object.freeze({ axis: "contributorCount", reachable: false, via: "list_commits / list_repository_collaborators",
        why: "per-repo endpoints are scoped to this session's own repositories; both returned the same refusal" }),
    Object.freeze({ axis: "country", reachable: false, via: "search_users",
        why: "the response carries login, id, node_id, avatar_url and profile_url -- there is no location field" }),
]);

/** GitHub language name -> an extension the tree's own legend already classifies. Not a new legend. */
export const GH_EXT = Object.freeze({
    JavaScript: "js", TypeScript: "ts", "C++": "cpp", C: "c", HLSL: "hlsl", HTML: "html", CSS: "css",
    Python: "py", Rust: "rs", Go: "go", Java: "java", Shell: "sh", GLSL: "glsl", WGSL: "wgsl",
});

/** Extensions that are BUILD OUTPUT, not source -- the mechanism behind three of the four disagreements. */
export const BUILT_EXT = Object.freeze(new Set(["a", "o", "so", "dll", "dylib", "lib", "wasm", "min", "map", "bc"]));

/** Files that are paperwork rather than code. A body made only of these has no language to be wrong about. */
export const PAPERWORK = Object.freeze(new Set(["LICENSE", "LICENCE", "LICENSE.txt", "LICENSE.md",
    "PROVENANCE.txt", "PROVENANCE.md", "NOTICE", "COPYING", "VERSIONS.txt", "README.md"]));

/**
 * Why one body's two language answers differ, or that they do not.
 *
 * Returns one of: "agree", "built" (the vendored bytes are compiled output of the upstream source),
 * "paperwork" (the body carries no code), or "unexplained" -- and the last is the one a gate must hold at zero,
 * because an unexplained disagreement is the only kind that is a defect rather than a fact.
 */
export function classifyLanguage({ dominantExt, treeBiome, ghLanguage, biomeOf, codeFiles,
                                   upstreamLanguageFiles }) {
    if (!codeFiles) return { verdict: "paperwork", ghBiome: null };
    const ext = GH_EXT[ghLanguage];
    const ghBiome = ext ? biomeOf("x." + ext) : null;
    if (ghBiome === null) return { verdict: "unexplained", ghBiome, why: "GitHub's language is not in the tree's legend" };
    // *** THE ABSENCE TEST RUNS BEFORE THE BIOME TEST, AND THE FIRST DRAFT HAD IT THE OTHER WAY ROUND. ***
    // The biome legend is COARSER than the language: TypeScript and JavaScript both map to "forest". So a
    // TypeScript project vendored as one 3.6 MB bundled .js -- taichi-js -- came out as `agree`, and the
    // comparison agreed with itself about a body whose source is not here at all. Asking "is the claimed
    // language actually present in these bytes?" first is what separates agreement from coincidence.
    if (upstreamLanguageFiles === 0) return { verdict: "transpiled", ghBiome };
    if (treeBiome === ghBiome) return { verdict: "agree", ghBiome };
    if (BUILT_EXT.has(dominantExt)) return { verdict: "built", ghBiome };
    return { verdict: "unexplained", ghBiome };
}

/** Every extension the tree's legend would classify as the given GitHub language. Used to ask "is the source here?" */
export const extsFor = (ghLanguage) => ({
    "C++": ["cpp", "cc", "cxx", "hpp", "h", "hxx"], C: ["c", "h"], JavaScript: ["js", "mjs", "cjs"],
    TypeScript: ["ts", "tsx"], HLSL: ["hlsl", "fx"], HTML: ["html", "htm"],
}[ghLanguage] || (GH_EXT[ghLanguage] ? [GH_EXT[ghLanguage]] : []));

/**
 * The orbital elements a reachable GitHub quantity implies.
 *
 * *** LANGUAGE BECOMES AN INCLINATION, WHICH IS THE ONE ORBITAL ELEMENT A CATEGORY CAN HONESTLY BE. *** A
 * language is not an ordered quantity -- JavaScript is not "more" than C -- so it cannot be a radius or a
 * period without inventing an order. An inclination is a PLANE, and bodies of one language sharing a plane is
 * a true statement about a category. The order within the list is alphabetical so it is derived from the data
 * rather than chosen; two languages being adjacent means nothing, and that is correct.
 */
export function axesFor(body, languages) {
    const langs = [...new Set(languages)].sort();
    const i = langs.indexOf(body.language);
    return {
        inclinationDeg: langs.length > 1 ? (i / (langs.length - 1)) * 40 - 20 : 0,
        // stars span 339 to 115,084 here, so a linear radius would render eight of nine as the same dot
        radius: Math.log10(Math.max(1, body.stars)),
        ageDays: (Date.parse("2026-09-03") - Date.parse(body.createdAt)) / 86400000,
    };
}

/** What v4432 measured. Re-take with: node tools/ship/orreryUniverse-selfcheck.mjs */
export const MEASURED_AT_V4432 = Object.freeze({
    upstreams: 9,
    resolved: 8,
    notFound: 1,
    notFoundOwner: "justjakel",
    realOwner: "justjake",
    wrongOccurrencesInFile: 1,
    rightOccurrencesInFile: 41,
    siblingPackagesSpellingItRight: 3,
    vendoredBytesMisattributed: 810948,
    axesReachable: 1,
    axesRefused: 2,
    languageAgree: 6,
    languageBuilt: 2,
    languageTranspiled: 2,
    languagePaperwork: 1,
    languageUnexplained: 0,
});
