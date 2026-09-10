// WebGLEngine/tools/ship/backlogAbsence.mjs -- v4537
//
// *** THE INSTRUMENT FOR GRADING ABSENCE CLAIMS HAS BEEN RUN ON EXACTLY ONE CLAIM: ITS OWN. ***
//
// tools/ship/absenceScope.mjs was built at v4435 to grade a claim that says the tree does NOT have
// something. It is careful work -- it separates OUT OF SCOPE from IN SCOPE AND MISSED from A DENIAL
// COUNTED AS A PRESENCE, and it keeps its exclusions listed by name so one can be argued with rather than
// added quietly. And `gradeClaim` is called from one file in this tree: absenceScope-selfcheck.mjs, on
// absenceScope's own frozen BVH_AT_V4435 record, from the round that wrote it.
//
// Meanwhile tools/ship/nextRounds.mjs -- the standing list of what is deferred and why, the file whose
// entries say things like "there is no edge-tint code in this tree" and "all four greps empty" -- imports
// `node:url` and nothing else. The instrument and its subject have been in the same directory for a
// hundred rounds and have never met. THAT IS A CHECK NOTHING REACHES, which is a defect species this tree
// names often enough to have a phrase for.
//
// ---- WHAT POINTING IT AT THE BACKLOG FOUND, AND IT CONVICTS IN BOTH DIRECTIONS -------------------------
//
// The reason to wire this is NOT that the backlog lies. It is that two of the three claims graded here
// SURVIVE a check that a plain grep would have failed them on, and the third does not survive at all:
//
//   HOLDS  gltf-conformance-fixtures, on the glTF accessor kind it says the parser does not support. A
//          tree-wide grep for that token returns TWELVE code files and would read as a refutation. Every
//          one is outside the single directory the claim's author actually wrote -- the same word names a
//          matrix storage layout in math/solverFit.mjs and an unrelated field in ai/ComfyUIClient.js.
//          Scoped as written: 0 in scope, 0 missed. The first draft of this module convicted it anyway, by
//          running scan() tree-wide where gradeClaim() exists -- absenceScope's own item 1, committed
//          inside the check written to apply it.
//
//   HOLDS  glb-export-conformance, on the reference validator it says the tree does not carry. 0 code.
//
//   FAILS  gpu-pathtracer-render-mode, which says this tree has NOTHING like a GPU path tracer as a
//          rendering feature. SIXTEEN code files IN SCOPE AND MISSED on one term -- among them the voxel
//          pass under render/, a WebGL2 fullscreen fragment shader stepping a ray per pixel through a 3D
//          texture of the real generated world; its options module beside it; and the octree shader under
//          physics/octree/, an acceleration structure encoded into a texture and descended in
//          a fragment shader -- which is the very architecture that entry calls foreign to this tree. Not
//          denials, not mentions, not out of scope. Sixteen files of the thing the claim says is not there.
//
// *** THAT ENTRY IS NOT IN THIS TREE AND THE GATE CANNOT READ IT. *** It lives on the branch
// origin/claude/shader-porting-swek-ozgvb0 and is absent from origin/main and from here, so it is recorded
// in this header as the finding that prompted the round and is NOT one of the graded rows below. A gate
// that graded a file on another branch would be a gate whose subject can change without this tree moving.
//
// ---- WHY THE REGISTER IS A LIST, WHICH IS NORMALLY THIS TREE'S COMPLAINT --------------------------------
//
// v4482 built a pre-flight over five hand-maintained records and its own header conceded the flaw: "known
// is a LIST rather than a DISCOVERY". The list was short and the next merge produced two more it could not
// see. So a hand-listed register here needs an argument, and it has one plus a ratchet.
//
// The argument is absenceScope's own, and it is in that file at the top of gradeClaim: the TERM is a
// person's job. No mechanism can read "there is no edge-tint code in this tree" and know which parameter
// name from the literature to search for, or that one entry's accessor word means a file format and not a
// matrix. A register that guessed terms would grade the wrong thing and report a number about its guessing.
//
// *** AND EVERY NEEDLE IS BUILT BY CONCATENATION, WHICH IS v4409'S RULE AND NOT A STYLE CHOICE. *** A
// register that spells its own search terms becomes a file carrying every one of them, and absenceScope
// reads string literals as code and comments as mentions. The first draft of this module spelt all six and
// landed in ALL SIX of its own censuses -- it moved two of them from one denial to two, measured, before
// it had graded anything. `frag` holds the pieces and termOf() joins them, and the prose above describes
// the tokens rather than spelling them for the same reason. Sixth instance of this defect in this session.
//
// The ratchet is what stops the list going quietly stale: claimSentences() counts absence-shaped sentences
// in nextRounds.mjs on every run, and the gate fails when that count RISES above the recorded figure
// without the register growing to match. A new absence claim cannot arrive unnoticed. It can arrive
// UNGRADED -- the gate names it and goes red -- which is the honest failure, because the alternative is a
// register that silently covers a shrinking fraction of its subject.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as AS from "./absenceScope.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The term-shaped absence claims nextRounds.mjs makes, with the scope each author actually wrote.
 *
 * `term` is the token to search for and is a JUDGEMENT, recorded here so it can be argued with. `searched`
 * is the claim's own scope -- omit it for a claim about the whole tree. `exclude` names files that carry
 * the token without being the thing, and every name on it is an argument somebody has to make out loud.
 */
export const CLAIMS = Object.freeze([
    Object.freeze({
        id: "gltf-conformance-fixtures", frag: Object.freeze(["spar", "se"]), searched: Object.freeze(["gpu"]),
        says: "the entry says that accessor kind has zero occurrences in the parser",
        why: "the scope is one directory and the term is a format feature. Tree-wide the token is mostly " +
             "linear algebra, which is what makes the scope load-bearing rather than decorative.",
    }),
    Object.freeze({
        id: "glb-export-conformance", frag: Object.freeze(["gltf-", "validator"]),
        says: "the entry says a grep for the reference validator's package name returns nothing",
        why: "a tool name, so the token is the claim -- there is no wider sense of it to confuse this with.",
    }),
    Object.freeze({
        id: "spherical-gaussian-view-dependence", frag: Object.freeze(["Baked", "SDF"]),
        says: "the entry says four named techniques are absent, all four greps empty",
        why: "a published technique's proper name. THIS ENTRY ALREADY CARRIES A CORRECTION of its own sweep, " +
             "which called view-dependent shading confirmed-absent when it was shipped and in a shader -- so " +
             "the surviving literal half is exactly the half worth re-deriving each run.",
    }),
    Object.freeze({
        id: "spherical-gaussian-view-dependence", frag: Object.freeze(["Mobile", "NeRF"]),
        says: "(the same sentence's second name)",
        why: "as above.",
    }),
    Object.freeze({
        // the entry's OWN id spells the needle, so it is joined too -- see the concatenation note above
        id: "f" + "82-tint-metal-fresnel", frag: Object.freeze(["F", "82"]), expect: "built",
        says: "the entry SAID there is no edge-tint code in this tree, and it is CLOSED -- the other line " +
              "built it, so this row now asserts the code is THERE",
        why: "the parameter's name in the literature the entry cites; the spelling a code identifier would " +
             "use is graded beside it, because a claim about a CONCEPT needs more than one token or it " +
             "grades a spelling.",
    }),
    Object.freeze({
        id: "f" + "82-tint-metal-fresnel", frag: Object.freeze(["edge", "Tint"]), expect: "absent",
        says: "(the same claim under the name a code identifier would use, which the built module does NOT " +
              "use -- so this row stays an absence and the pair records that the concept arrived under one " +
              "of its two names and not the other)",
        why: "as above.",
    }),
    // *** THE CONTROL, AND IT MUST FAIL. *** A register whose every row passes is a register that has never
    // been seen to convict, and this one would otherwise be six acquittals. This row restates the claim that
    // prompted the round -- the off-branch entry's "this tree has NOTHING like it as a rendering feature" --
    // against a term this tree really carries, so the same code that acquits six claims is watched
    // convicting a seventh. It is not a fixture inflating its own census: the files it finds are a shipped
    // WebGL2 fragment-shader renderer and an octree shader that predate this module by hundreds of rounds.
    Object.freeze({
        id: "CONTROL -- the off-branch entry's claim, restated", frag: Object.freeze(["ray", "march"]),
        mustFail: true,
        says: "that this tree has nothing resembling a marched-ray rendering feature",
        why: "the round's own finding, kept as a row that goes red if it ever stops being findable.",
    }),
]);

/** Grade one claim through absenceScope, and say plainly whether it survived. */
export function termOf(claim) { return claim.frag.join(""); }

export function grade(claim, { root = ENG } = {}) {
    const g = AS.gradeClaim({
        term: termOf(claim),
        searched: claim.searched ? [...claim.searched] : null,
        said: claim.said ? [...claim.said] : [],
        exclude: claim.exclude ? [...claim.exclude] : [],
    }, { root });
    const missed = g.inScopeMissed || [];
    const scoped = claim.searched ? (g.narrow && g.narrow.code) || [] : (g.wide && g.wide.code) || [];
    const holds = scoped.length === 0 && missed.length === 0;
    // *** A CLOSED ENTRY EXPECTS ITS ABSENCE CLAIM TO HAVE STOPPED HOLDING, AND THAT IS NOT A LOOPHOLE. ***
    // Closing an item means BUILDING the thing it said was missing, so the claim in its `why` field is the
    // record of why the round was raised rather than a live assertion. Grading it as though it were live
    // convicts the tree for having done the work. Grading it in the OTHER DIRECTION is worth more than
    // skipping it: it asserts the round actually landed, and it goes red if a closed item's code is ever
    // deleted. So `expect` is "absent" for a live entry and "built" for a closed one.
    const expect = claim.expect || "absent";
    return {
        id: claim.id, term: termOf(claim), mustFail: !!claim.mustFail, expect,
        holds, asExpected: expect === "built" ? !holds : holds,
        inScope: scoped.length, missed: missed.length,
        outOfScope: (g.outOfScope || []).length,
        denialsCounted: (g.denialsCounted || []).length,
        files: [...new Set([...scoped, ...missed])].slice(0, 6),
    };
}

export function gradeAll({ root = ENG } = {}) {
    return CLAIMS.map((c) => grade(c, { root }));
}

/**
 * Absence-shaped sentences in nextRounds.mjs -- the RATCHET's input, not a claim about how many claims exist.
 *
 * *** THIS COUNTS A SHAPE AND NOT A MEANING, AND SAYING SO IS THE POINT. *** Most of what it counts is not
 * gradeable: "NOTHING IS WIRED" is about a caller, "nothing has complained about bandwidth" is about a want,
 * and neither is a term a scanner can look for. The number is a TRIPWIRE on the file's absence-claim
 * vocabulary, so a rising count forces somebody to look. Reading it as "the backlog makes N absence claims"
 * would be a proxy reported as a fact, which is the defect this file exists to catch one level down.
 */
export function claimSentences({ root = ENG } = {}) {
    const src = fs.readFileSync(path.join(root, "tools/ship/nextRounds.mjs"), "utf8");
    const RX = /(nothing like|nothing in the tree|zero occurrences|confirmed[- ]absent|greps empty|no [a-z-]+ code in this tree|is no [a-z-]+ anywhere|returns nothing)/i;
    let n = 0;
    for (const s of src.split(/(?<=\.)\s+(?=[A-Z*])/)) if (RX.test(s)) n++;
    return n;
}

/**
 * *** RE-DERIVED BY tools/ship/backlogAbsence-selfcheck.mjs ON EVERY RUN. *** The graded figures are a
 * reading of this tree at v4537; the sentence count is the ratchet's floor.
 */
export const BACKLOG_AT_V4537 = Object.freeze({
    claims: 7,            // six live backlog claims and one control that must convict
    holding: 6,           // v4538: now "as expected" -- five absences that hold, one CLOSED entry whose
                          // absence is expected to be GONE. See the `expect` note in grade().
    failing: 1,           // the control, and a run where this is 0 is a register that cannot convict
    sentenceFloor: 8,
    // The conviction that prompted the round is NOT in the six above: it is on another branch. Recorded
    // here as a number so a later round can see it moved, and named in the header as unreachable from here.
    offBranchConvicted: 1,
    offBranchMissedFiles: 16,
    gradeClaimCallSitesBeforeThisRound: 1,
});
