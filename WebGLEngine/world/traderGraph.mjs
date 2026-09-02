// WebGLEngine/world/traderGraph.mjs -- v4289
//
// *** CONTRIBUTORS AS TRADERS, BUILT FROM GIT HISTORY BECAUSE THE GITHUB API IS SHUT. ***
//
// Keith's idea: contributors travel between repositories like traders; owning a repo makes you an armed
// ship, contributing without owning makes you a hauler. The obvious way to build that is the GitHub API.
// THE OBVIOUS WAY IS UNAVAILABLE, and not for a reason anyone would guess from rate limits -- see AXES.
//
// What IS available is better than it sounds: `git clone --filter=blob:none` fetches full history without
// blobs in seconds, and every commit carries its author. That is the same substrate GitHub derives its own
// contributor graphs from. All 35 repositories in world/licenceSweep.mjs were cloned this way, 11,172
// commits read, ZERO clone failures, and no API call was made at any point.
//
// ---- THE FINDING, AND IT IS THE ONE THE METAPHOR NEEDED --------------------------------------------------
//
// *** TWELVE OF THE THIRTY-FIVE REPOSITORIES CONTAIN NO COMMIT BY THEIR OWNER. *** They are forks: cargo
// parked in someone else's dock. Six of redcamel's nine and five of but0n's thirteen. The armed-ship
// question -- does this trader own anything -- turns out to be answerable from history alone, and so does a
// sharper one the API would not have answered: how much of what they own did they actually write.
//
// ---- AND THE IDENTITY PROBLEM, WHICH IS NOT SOLVED AND IS REPORTED RATHER THAN HIDDEN -----------------------
//
// Git author identity is SELF-DECLARED. The same person appears under several names and sometimes several
// addresses, so there is no correct key and this file uses two and states where they disagree:
//
//   by display NAME    473 identities, 13 crossings   -- splits one human into several
//   by email HASH      466 identities, 10 crossings   -- merges better, and still splits some
//
// Email-keying is right about but0n: 'but0n', 'Jeff Ma', 'Jeffrey Ma' and 'Jeffrey' are ONE address, so the
// owner of thirteen repositories here is one trader with four names. It is still wrong about Jamie
// Portsmouth, who holds two addresses and stays two traders (11 repos and 5). *** NEITHER KEY IS CORRECT AND
// PICKING ONE WOULD BE CHOOSING WHICH ERROR TO HAVE. *** Both are recorded; SPLIT_NAMES names the cases.
//
// ---- WHAT IS DELIBERATELY NOT STORED -----------------------------------------------------------------------
//
// *** NO EMAIL ADDRESS APPEARS IN THIS FILE. *** Identity is a truncated SHA-256 of the lowercased address,
// which merges the same author across repositories without keeping the address. Commit emails are personal
// data present in every commit, and a joinable index of them is the thing that turns a project's own
// relationship graph into a database of people -- which is what GitHub's acceptable-use terms restrict and
// what nobody here wants to have built. Display names are kept: they are what git shows and what a reader
// needs to recognise anyone.
//
// *** EXCEPT THAT A DISPLAY NAME CAN BE AN EMAIL ADDRESS, AND ONE IS. *** The first version of this file
// hashed the address field and kept the name field verbatim, on the reasoning that names are not addresses.
// One contributor to redcamel/ComputeShaderRnd_WebGPU has set their git name TO their address, and it came
// through untouched in a topAuthor field -- the privacy promise three paragraphs above was false at the
// moment it was written. Names matching an address pattern are redacted to a hash now, and the gate asserts
// that NO address pattern appears anywhere in this file, which turns the promise into a check. A rule that
// protects one field and trusts another is only as good as the assumption that the fields mean what they
// are called.
"use strict";

/**
 * WHAT GITHUB WILL AND WILL NOT HAND OVER, MEASURED RATHER THAN ASSUMED.
 *
 * Every `blocked` line below was probed and its message recorded verbatim. There are THREE distinct refusals
 * and they have three different remedies, which is why they are not collapsed into one "blocked".
 */
export const AXES = Object.freeze([
    Object.freeze({ axis: "commit authorship (name, date, count)", have: true, via: "git clone --filter=blob:none",
        note: "full history, no API, seconds per repo -- this is what the graph is built from" }),
    Object.freeze({ axis: "repository owner", have: true, via: "the repo path itself" }),
    Object.freeze({ axis: "licence, language mix, file counts", have: true, via: "world/licenceSweep.mjs, already in the tree" }),
    Object.freeze({ axis: "fork-vs-original", have: true, via: "DERIVED: owner absent from the author list",
        note: "the API has a `fork` flag; history gives the same answer and a share as well" }),
    Object.freeze({ axis: "contributor list as GitHub counts it", have: false,
        blocked: "GitHub access to this repository is not enabled for this session. Use add_repo",
        remedy: "attach the repository with add_repo, one at a time" }),
    Object.freeze({ axis: "our own repo's contributors", have: false,
        blocked: "GitHub access is not enabled for this session. An org admin must connect",
        remedy: "an org admin connects GitHub for the account" }),
    Object.freeze({ axis: "a contributor's profile, their other repos, followers", have: false,
        blocked: "This GitHub API path is not available: sessions are bound to their configured repositories",
        remedy: "NONE from here -- the whole /users path class is refused, not rate-limited" }),
    Object.freeze({ axis: "user search (location, language)", have: false,
        blocked: "This GitHub API path is not available: sessions are bound to their configured repositories",
        remedy: "NONE from here. It is also the axis most worth leaving alone: searching users by " +
                "location to decorate a visualisation is profiling strangers, not mapping a project" }),
]);

/** The sweep, as run: no failures, and the number of commits it read. */
export const SWEEP = Object.freeze({ repos: 35, commits: 11172, cloneFailures: 0,
    distinctNames: 473, distinctEmails: 466,
    crossingsByName: 13, crossingsByEmail: 10 });

/**
 * *** v4304: THE LICENCE SWEEP GREW BY EIGHTEEN AND THIS GRAPH DID NOT. *** Those eighteen were opened for
 * their LICENCE (world/licenceSweep.mjs) from depth-1 clones, which is enough to read a LICENSE file and is
 * not history. Graphing them means full-history clones of all eighteen AND a recomputation of the crossings
 * over all fifty-three, because a trader is somebody who appears in more than one repository and the
 * question cannot be answered eighteen at a time. That is a round, not a footnote, so the debt is recorded
 * here BY NAME and the gate holds SWEEP.repos + UNGRAPHED.length to the licence sweep's length: an
 * assessed repository may be ungraphed, but it may not be silently absent from both.
 */
export const UNGRAPHED = Object.freeze({
    at: "v4304",
    why: "opened for licence only, from depth-1 clones; the crossings need every repository's full history at once",
    repos: Object.freeze([
        "shajidhasan/spoilerjs", "evanw/node-source-map-support", "evanw/webgl-vr-editor", "evanw/node-flatbuffers",
        "brunosimon/three.js-tsl-sandbox", "Ramotion/vr-menu-demo", "cmhhelgeson/Threejs_TSL_Tutorials",
        "Makio64/advanced-threejs-tsl-webgpu-rendering", "novalain/gi-voxels", "stuinfla/Repo-Explainer",
        "dimartarmizi/threejs-procedural-terrain", "HenryLoM/CliWaifuTamagotchi", "upf-gti/wgpuEngine",
        "node-3d/webgl", "node-3d/bullet", "node-3d/opencl", "node-3d/uv-loop", "node-3d/steam-api",
    ]),
});

/** Per repository: how much of it the owner actually wrote. ownerShare 0 means a fork. */
export const REPOS = Object.freeze([
    {"repo": "AcademySoftwareFoundation/OpenPBR", "commits": 151, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "Jamie Portsmouth"},
    {"repo": "ashima/webgl-diagnostic", "commits": 123, "ownerCommits": 121, "ownerShare": 0.9837, "topAuthor": "David Sheets"},
    {"repo": "boytchev/tsl-textures", "commits": 289, "ownerCommits": 275, "ownerShare": 0.9516, "topAuthor": "boytchev"},
    {"repo": "but0n/Ashes", "commits": 545, "ownerCommits": 532, "ownerShare": 0.9761, "topAuthor": "but0n"},
    {"repo": "but0n/THREE.js-PathTracing-Renderer", "commits": 1992, "ownerCommits": 1, "ownerShare": 0.0005, "topAuthor": "Erich Loftis"},
    {"repo": "but0n/aframe", "commits": 5479, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "Kevin Ngo"},
    {"repo": "but0n/automaton", "commits": 166, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "FMS-Cat"},
    {"repo": "but0n/ecs.js", "commits": 3, "ownerCommits": 3, "ownerShare": 1.0, "topAuthor": "but0n"},
    {"repo": "but0n/frag3d.js", "commits": 44, "ownerCommits": 43, "ownerShare": 0.9773, "topAuthor": "but0n"},
    {"repo": "but0n/glTF-WebGL-PBR", "commits": 149, "ownerCommits": 3, "ownerShare": 0.0201, "topAuthor": "Ed Mackey"},
    {"repo": "but0n/gltf-to-usdz", "commits": 179, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "Tim van Scherpenzeel"},
    {"repo": "but0n/recastCLI.js", "commits": 93, "ownerCommits": 90, "ownerShare": 0.9677, "topAuthor": "but0n"},
    {"repo": "but0n/rvo2.js", "commits": 32, "ownerCommits": 14, "ownerShare": 0.4375, "topAuthor": "but0n"},
    {"repo": "but0n/three-raymarcher", "commits": 73, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "Daniel Esteban Nombela"},
    {"repo": "but0n/vixel", "commits": 5, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "Rye Terrell"},
    {"repo": "but0n/webgpu-cluster", "commits": 2, "ownerCommits": 2, "ownerShare": 1.0, "topAuthor": "JMA"},
    {"repo": "christopherbatty/SDFGen", "commits": 9, "ownerCommits": 4, "ownerShare": 0.4444, "topAuthor": "Christopher Batty"},
    {"repo": "portsmouth/EON-diffuse", "commits": 12, "ownerCommits": 4, "ownerShare": 0.3333, "topAuthor": "Peter Kutz"},
    {"repo": "portsmouth/OculusShaderToy", "commits": 32, "ownerCommits": 32, "ownerShare": 1.0, "topAuthor": "portsmouth"},
    {"repo": "portsmouth/OpenPBR-viewer", "commits": 127, "ownerCommits": 121, "ownerShare": 0.9528, "topAuthor": "Jamie Portsmouth"},
    {"repo": "portsmouth/Trinity", "commits": 91, "ownerCommits": 91, "ownerShare": 1.0, "topAuthor": "Jamie Portsmouth"},
    {"repo": "portsmouth/fibre", "commits": 115, "ownerCommits": 114, "ownerShare": 0.9913, "topAuthor": "Jamie Portsmouth"},
    {"repo": "portsmouth/gravy", "commits": 27, "ownerCommits": 27, "ownerShare": 1.0, "topAuthor": "Jamie Portsmouth"},
    {"repo": "portsmouth/hydrogenic", "commits": 4, "ownerCommits": 4, "ownerShare": 1.0, "topAuthor": "Jamie Portsmouth"},
    {"repo": "portsmouth/snelly", "commits": 433, "ownerCommits": 432, "ownerShare": 0.9977, "topAuthor": "Jamie Portsmouth"},
    {"repo": "portsmouth/snellytracer", "commits": 108, "ownerCommits": 108, "ownerShare": 1.0, "topAuthor": "portsmouth"},
    {"repo": "portsmouth/vidfilt", "commits": 28, "ownerCommits": 28, "ownerShare": 1.0, "topAuthor": "portsmouth"},
    {"repo": "redcamel/ComputeShaderRnd_WebGPU", "commits": 30, "ownerCommits": 2, "ownerShare": 0.0667, "topAuthor": "redacted-name-1cfdbc75"},
    {"repo": "redcamel/Crowd.lab", "commits": 50, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "lo-th"},
    {"repo": "redcamel/RedRnd", "commits": 12, "ownerCommits": 1, "ownerShare": 0.0833, "topAuthor": "\ubc31\uc120\uae30"},
    {"repo": "redcamel/gl-matrix", "commits": 390, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "Brandon Jones"},
    {"repo": "redcamel/glsl-blend", "commits": 40, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "jamieowen"},
    {"repo": "redcamel/procedural-tileable-shaders", "commits": 70, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "tuxalin"},
    {"repo": "redcamel/screen-space-reflections", "commits": 116, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "0beqz"},
    {"repo": "redcamel/wgsl_reflect", "commits": 153, "ownerCommits": 0, "ownerShare": 0.0, "topAuthor": "Brendan Duncan"},
].map(Object.freeze));

/** Identities crossing more than one repository. `id` is a truncated hash; no address is stored. */
export const TRADERS = Object.freeze([
    {"id": "4d6f1388d18f", "repos": ["AcademySoftwareFoundation/OpenPBR", "portsmouth/EON-diffuse", "portsmouth/OculusShaderToy", "portsmouth/OpenPBR-viewer", "portsmouth/Trinity", "portsmouth/fibre", "portsmouth/gravy", "portsmouth/hydrogenic", "portsmouth/snelly", "portsmouth/snellytracer", "portsmouth/vidfilt"], "name": "Jamie Portsmouth"},
    {"id": "6fd9a40466c0", "repos": ["but0n/Ashes", "but0n/THREE.js-PathTracing-Renderer", "but0n/ecs.js", "but0n/frag3d.js", "but0n/glTF-WebGL-PBR", "but0n/recastCLI.js", "but0n/rvo2.js"], "name": "but0n"},
    {"id": "d85857717c81", "repos": ["AcademySoftwareFoundation/OpenPBR", "portsmouth/Trinity", "portsmouth/fibre", "portsmouth/hydrogenic", "portsmouth/snelly"], "name": "Jamie Portsmouth"},
    {"id": "7757815b920e", "repos": ["but0n/Ashes", "but0n/recastCLI.js", "but0n/webgpu-cluster"], "name": "but0n"},
    {"id": "349e39f3f0e1", "repos": ["AcademySoftwareFoundation/OpenPBR", "portsmouth/EON-diffuse"], "name": "Peter Kutz"},
    {"id": "1cfdbc7502ed", "repos": ["redcamel/ComputeShaderRnd_WebGPU", "redcamel/RedRnd"], "name": "\ubc31\uc120\uae30"},
    {"id": "65b3ff5c101b", "repos": ["but0n/aframe", "redcamel/wgsl_reflect"], "name": "Gregg Tavares"},
    {"id": "172b4b7b90d4", "repos": ["but0n/aframe", "redcamel/gl-matrix"], "name": "Nick Desaulniers"},
    {"id": "e3b0c44298fc", "repos": ["but0n/aframe", "redcamel/gl-matrix"], "name": ""},
    {"id": "bad538e010f0", "repos": ["but0n/Ashes", "but0n/frag3d.js"], "name": "ImgBotApp"},
].map(Object.freeze));

// *** THE HASH OF AN EMPTY STRING IS A STABLE, PLAUSIBLE-LOOKING IDENTITY THAT IS NOT A PERSON. ***
// Two repositories carry commits with an EMPTY author address. Hashing that field produced
// e3b0c44298fc -- the well-known sha256 of "" -- and the first version of this graph reported it as a
// trader crossing two repositories. It is a COINCIDENCE OF ABSENCE read as a connection: two missing
// fields agreeing that they are missing. Named, excluded, and kept here because the next empty field
// this tree hashes will do the same thing.
export const EMPTY_EMAIL_HASH = "e3b0c44298fc";

/**
 * Hashed identities that are automation, each with what matched.
 *
 * *** THE FIRST PREDICATE MISSED ImgBotApp, WHICH IS A BOT WHOSE NAME ENDS IN "App". *** It tested for
 * "[bot]", a "bot@" address and names ending in "bot", and a bot travelling two repositories went into
 * traders() as a person. The pattern is wider now AND the reason each identity matched is recorded, because
 * a bot list nobody can audit is a second place for a wrong answer to live. It is deliberately not just
 * /bot/i: real surnames contain it.
 */
export const AUTOMATION = Object.freeze([
    {"id": "21b60b9166f0", "why": "matched on address"},
    {"id": "4725ba83a826", "why": "dependabot[bot]"},
    {"id": "7f0c229627ba", "why": "matched on address"},
    {"id": "bad538e010f0", "why": "ImgBotApp"},
    {"id": "bd5a8d6c673b", "why": "dependabot[bot]"},
].map(Object.freeze));

/**
 * The rule that produced AUTOMATION, exported so it can be argued with.
 *
 * *** A CLASSIFICATION THAT LIVES ONLY IN THE SCRIPT THAT GENERATED THE DATA IS UNAUDITABLE. *** The first
 * version of this module shipped the LIST and left the predicate in a build script, so the comment claiming
 * the pattern was careful could not be checked against a pattern. It is here now, and the gate feeds it
 * names.
 *
 * The substring "bot" alone is NOT enough and that is the whole difficulty: Abbott, Botha and Talbot are
 * names. What is matched is automation's conventions -- the "[bot]" suffix GitHub appends, an address at a
 * bot domain, and the handful of services that actually commit to these repositories.
 */
export function isAutomation(name = "", email = "") {
    const s = (name + " " + email).toLowerCase();
    // *** "bot@" ALONE MATCHES talbot@example.com, AND THE GATE CAUGHT IT. *** The address form has to be
    // anchored: a bot address begins with "bot@" or has a non-letter before it, which "talbot@" does not.
    return /\[bot\]/.test(s) || /(^|[^a-z])bot@/.test(s) ||
           /dependabot|imgbot|renovate|github-actions|greenkeeper/.test(s);
}

export const BOTS = Object.freeze(AUTOMATION.map((a) => a.id));

/** One address, several display names -- the cases name-keying gets wrong. */
export const SPLIT_NAMES = Object.freeze([
    {"id": "6fd9a40466c0", "names": ["Jeff Ma", "Jeffrey", "Jeffrey Ma", "but0n"], "repos": 7},
    {"id": "4d6f1388d18f", "names": ["Jamie", "Jamie Portsmouth", "portsmouth"], "repos": 11},
    {"id": "eca880ba1094", "names": ["Daniel Canelhas", "danielcanelhas", "dcanelhas"], "repos": 1},
    {"id": "1cfdbc7502ed", "names": ["DESKTOP-UD6SLEN\\redcamel", "Redcamel", "\ubc31\uc120\uae30"], "repos": 2},
    {"id": "0d77a702f280", "names": ["Alin", "Alin Loghin", "tuxalin"], "repos": 1},
    {"id": "1f515c74244b", "names": ["Nicholas L", "Nicholas Latham", "nicholas"], "repos": 1},
].map(Object.freeze));

/** Repositories whose owner never committed: forks, cargo in someone else's dock. */
export function forks() { return REPOS.filter((r) => r.ownerShare === 0).map((r) => r.repo); }

/** Repositories the owner actually wrote, with the share they wrote. */
export function home() { return REPOS.filter((r) => r.ownerShare > 0); }

/** Traders, excluding automation, most-travelled first. */
export function traders() {
    return TRADERS.filter((t) => !BOTS.includes(t.id) && t.id !== EMPTY_EMAIL_HASH);
}

/**
 * Where the two identity keys disagree. A non-empty answer is the honest state of this data, not a defect:
 * git identity is self-declared and no key available to us is correct.
 */
export function identityDisagreement() {
    return { byName: SWEEP.crossingsByName, byEmail: SWEEP.crossingsByEmail,
             mergedByEmail: SPLIT_NAMES.filter((s) => s.repos > 1).length,
             stillSplit: TRADERS.filter((t) => TRADERS.some((u) => u !== t && u.name === t.name)).length };
}
