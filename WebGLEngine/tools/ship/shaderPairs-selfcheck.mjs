#!/usr/bin/env node
// WebGLEngine/tools/ship/shaderPairs-selfcheck.mjs -- v4414
//
// *** THE IR DECISION v3274 DEFERRED AND v4380 REFUSED TO MAKE. IT IS MADE HERE, AND IT WAS ALREADY MADE BY
// BUILDING. ***
//
// shaderCensus-selfcheck.mjs has held since v3274 that a hand-written shader pair beats an intermediate
// representation "while few files carry both languages -- if this count climbs toward twenty the arithmetic
// inverts, and THAT is when to re-open llvm-tutorial-book's three-stage shape: parse, lower to an IR, emit per
// target". It said 3 when filed and says 14 now. main's v4380 found the red register recording 4 against the
// gate's 14, noted that "the TSL rounds of this session put some of them there", and deferred: "whether the
// arithmetic has inverted is a decision about the engine's shape and belongs to a round of its own".
//
// ---- THIS IS NOT A JUDGEMENT ROUND. THREE THINGS ARE MEASURABLE AND THEY SETTLE IT. -------------------------
//
//   1. THE TRIGGER COUNTS CO-OCCURRENCE; THE DECISION NEEDS DUPLICATION. `both` means "this text contains
//      markers of both languages", which is not "this file writes one computation twice". Of the 14: FIVE
//      duplicate a computation, two share only an entry-point convention, and SEVEN share nothing at all.
//
//   2. THE POPULATION INCLUDES THE MACHINERY THAT WOULD BE THE IR. render/tslSource.mjs holds eleven GLSL
//      markers because it EMITS GLSL. An emitter necessarily contains text in every language it emits, so
//      *** BUILDING THE IR RAISES THE COUNT THE TRIGGER READS. *** An instrument that fires harder the more
//      the problem is solved is not a threshold anybody should act on, and that is provable rather than
//      arguable: the file is in `both` and its GLSL is output, not source.
//
//   3. THE THREE-STAGE SHAPE WAS ALREADY RE-OPENED, AT v4319-v4320, AND HAS SHIPPED TEN ROUNDS SINCE.
//      three's node builders parse and lower; render/tslSource.mjs's `transplantFragment(fragment, language)`
//      emits per target. That IS parse, lower, emit. The question "when to re-open it" has an answer in the
//      changelog rather than in a threshold, and nobody noticed because the trigger was watching a number
//      that the work made worse.
//
// ---- SO THE VERDICT, AND WHAT IT DOES NOT SETTLE -----------------------------------------------------------
//
// THE ARITHMETIC HAS NOT INVERTED AT FIVE PAIRS -- and the reason to say so is no longer the count, because
// the count was never measuring it. An IR is worth its third-thing-to-maintain when the pairs it replaces
// outnumber it; five pairs, two of which (nebula, wormhole) are ALREADY authored once in JS and mirrored, is
// not that. WHAT THIS DOES NOT SETTLE: whether the five should move onto the TSL path that exists. That is a
// port per file with its own key, not a decision, and v4400 and v4402 are what one costs.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node tools/ship/shaderPairs-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPairs, glslFunctions, wgslFunctions, normaliseName, GENERIC, DUPLICATION_MIN,
         AUTHOR_ONCE, ABOUT_SHADERS } from "./shaderPairs.mjs";
import { shaderCensus } from "./shaderCensus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const C = classifyPairs(ROOT);
const census = shaderCensus(ROOT);

console.log("\n1. THE INSTRUMENT, PROVED ON A FIXTURE BEFORE IT IS POINTED AT THE TREE");
{
    // *** THE TWO SYNTAXES CANNOT COLLIDE, WHICH IS WHY THIS NEEDS NO SPLIT. *** shaderCensus.pairShape cuts
    // the file at "the first WGSL entry point" and says so: "crude, and STATED AS CRUDE. A file interleaving
    // both languages would defeat it." Declared names need no boundary at all.
    const fx = `
      float fbm(vec2 p) { return 0.0; }
      vec3 palette(float t) { return vec3(0.0); }
      float onlyGlsl(float x) { return x; }
      fn fbm(p : vec2<f32>) -> f32 { return 0.0; }
      fn onlyWgsl(x : f32) -> f32 { return x; }
      float notAFunction = 1.0;
      void main() { }
      fn main() { }`;
    const g = glslFunctions(fx), w = wgslFunctions(fx);
    ok("*** the GLSL reader finds only GLSL declarations and the WGSL reader only WGSL ones ***",
        g.length === 4 && g.includes("fbm") && g.includes("palette") && g.includes("onlyGlsl") && g.includes("main") &&
        w.length === 3 && w.includes("fbm") && w.includes("onlyWgsl") && w.includes("main") && !w.includes("onlyGlsl"),
        `GLSL ${JSON.stringify(g)}, WGSL ${JSON.stringify(w)} out of a fixture holding both, INTERLEAVED, plus a declaration that is not a function. *** THE FIXTURE CARRIES onlyGlsl DECLARED WITH float BECAUSE OF A 0-RED SABOTAGE: *** its first draft had every GLSL-only function declared with vec3, so widening the WGSL reader to also match \`float\` leaked only \`fbm\` -- a name the WGSL side already had -- and the count did not move. A fixture whose leak collides with something already present cannot detect a leak`);
    ok("  and a shared entry-point name is NOT counted as a shared computation",
        GENERIC.has("main") && !GENERIC.has("fbm"),
        `every shader in both languages declares a main, so counting it would find duplication everywhere. DUPLICATION needs ${DUPLICATION_MIN} non-generic names, which the fixture's fbm alone does not reach`);
    ok("  and the normaliser is small on purpose, because an aggressive one would manufacture the answer",
        normaliseName("swk_Lyapunov") === "lyapunov" && normaliseName("fbmWgsl") === "fbm" && normaliseName("hash2") !== normaliseName("hash3"),
        `case, this tree's swk_ prefix and the wgsl/glsl/gpu suffixes a twin is given -- and nothing else. A normaliser that stripped digits would make hash2 and hash3 the same function, which is the failure mode that would bend this round toward the conclusion it is testing`);
}

console.log("\n2. THE TRIGGER COUNTS 14 AND THE DECISION NEEDS 5");
{
    report(`shaderCensus.both = ${census.both.length}; classified:`);
    C.rows.forEach((r) => report(`  ${r.verdict.padEnd(12)} ${r.file.padEnd(38)} ${r.real.join(", ")}`));
    ok("*** of the files the trigger counts, FIVE duplicate a computation and SEVEN share nothing at all ***",
        C.duplication.length === 5 && C.disjoint.length === 7 && C.convention.length === 2,
        `${C.duplication.length} DUPLICATION, ${C.convention.length} CONVENTION, ${C.disjoint.length} DISJOINT out of ${census.both.length}. An IR replaces DUPLICATION; it can do nothing for a file whose two halves compute different things, and render/bloomFused.mjs exists precisely because WebGPU can fuse what WebGL2 cannot`);
    ok("  and the five are named, so the decision rests on a list rather than on a number",
        C.duplication.every((r) => r.real.length >= DUPLICATION_MIN),
        C.duplication.map((r) => `${r.file} (${r.real.join("/")})`).join("; "));
    ok("!! and two of the five are ALREADY authored once -- in JavaScript -- and mirrored by hand into both",
        ["fx/nebula/nebulaShaders.js", "fx/wormhole/wormholeNebula.js"].every((f) => C.duplication.some((r) => r.file === f)),
        `both files say so in their own headers: the nebula is "from the CPU reference in nebula.js (same hash/vnoise/fbm/palette/parallax/stars)" and the wormhole's nebula is "defined ONCE and mirrored into GLSL + WGSL". THE AUTHOR-ONCE DISCIPLINE IS ALREADY THERE; what is missing is a machine to do the mirroring, which is a narrower thing than a compiler`);
}

console.log("\n3. AND THE POPULATION INCLUDES THE MACHINERY THAT WOULD BE THE IR");
{
    // *** NAMED EXPLICITLY RATHER THAN COMPARED AGAINST AUTHOR_ONCE'S OWN LENGTH. *** The first draft asserted
    // `emitters.length === AUTHOR_ONCE.length`, which is the list agreeing with itself: dropping a file from
    // the list left the check green, and a sabotage doing exactly that went 0 red. An arrangement, not a
    // property -- the error this tree names most often, written here in a round about mis-specified instruments.
    const emitters = ["render/tslSource.mjs", "render/fleetTsl.mjs"].filter((f) => census.both.includes(f));
    ok("*** render/tslSource.mjs is counted as a dual-language file BECAUSE IT EMITS BOTH LANGUAGES ***",
        emitters.length === 2 && AUTHOR_ONCE.length === 2 && AUTHOR_ONCE.every((f) => emitters.includes(f)),
        `${emitters.join(", ")} are in shaderCensus.both. An emitter necessarily contains text in every language it emits -- so BUILDING THE IR RAISES THE COUNT THE TRIGGER READS. The instrument fires harder the more the problem is solved`);
    const src = fs.readFileSync(path.join(ROOT, "render/tslSource.mjs"), "utf8");
    ok("  and its GLSL is OUTPUT rather than source, which is what makes that a category error and not a quibble",
        /transplantFragment\s*\(\s*fragment\s*,\s*language\s*\)/.test(src) && src.includes("language"),
        `tslSource.mjs exports transplantFragment(fragment, language) -- one graph, a language argument, a shader out. That is "emit per target", the third stage of the shape v3274 said to re-open`);
    const tools = ["render/wgslSpec.mjs", "tools/ship/wgslCorpus.mjs", "tools/roundhouse/magmapVariants.mjs"]
        .filter((f) => census.both.includes(f));
    ok("  and three more of the fourteen are TOOLS whose subject is shader text, not shaders",
        tools.length === 3 && ABOUT_SHADERS.length === 3 && tools.every((f) => C.disjoint.some((r) => r.file === f)),
        `${tools.join(", ")} -- a conformance checker, a corpus, and a table of kernel variants. All three classify DISJOINT, which is the classifier agreeing without being told`);
    ok("!! *** so 5 of the 14 are the answer or tools about the question, and the trigger counts them as the question ***",
        AUTHOR_ONCE.concat(ABOUT_SHADERS).every((f) => census.both.includes(f)),
        `${AUTHOR_ONCE.length + ABOUT_SHADERS.length} of ${census.both.length}. v4380 saw the number climb and said "the TSL rounds of this session put some of them there" -- correct, and the reason is that a TSL round ADDS an emitter, which is the opposite of what the climbing number was taken to mean`);
}

console.log("\n4. THE THREE-STAGE SHAPE WAS ALREADY RE-OPENED, AND THE CHANGELOG SAYS WHEN");
{
    const log = fs.readFileSync(path.join(ROOT, "..", "docs", "CHANGELOG.md"), "utf8");
    const tsl = [...log.matchAll(/^## (v\d+) -- (.*)$/gm)].filter((m) => /tsl|transplant/i.test(m[2]));
    report(`rounds shipped through the author-once path: ${tsl.map((m) => m[1]).join(", ")}`);
    ok("*** ten rounds have shipped through it, starting at v4320 -- \"TSL as a source for gfx/device.js\" ***",
        tsl.length >= 8 && tsl.some((m) => m[1] === "v4320"),
        `${tsl.length} rounds. v3274 asked WHEN to re-open parse-lower-emit; the answer is in the changelog and not in a threshold, and the threshold never fired because the work made its number worse`);
    const importers = ["render/blackbodyTsl.mjs", "render/fleetTsl.mjs", "render/physicsTsl.mjs", "render/isingTsl.mjs", "render/badTvTsl.mjs"]
        .filter((f) => fs.existsSync(path.join(ROOT, f)));
    ok("  and five shader modules author through it today, so it is used rather than merely built",
        importers.length === 5 && importers.every((f) => fs.readFileSync(path.join(ROOT, f), "utf8").includes("tslSource.mjs")),
        `${importers.join(", ")} all import render/tslSource.mjs. A machine nobody authors through would be the third thing to maintain v3274 warned about; this one has five consumers and ten rounds`);
}

console.log("\n5. THE VERDICT, AND WHAT IT DOES NOT SETTLE");
{
    ok("*** THE ARITHMETIC HAS NOT INVERTED: five pairs, not fourteen, and two of the five are already authored once ***",
        C.duplication.length < 10,
        `v3274 set the inversion at "toward twenty" in units of files-authoring-both. Restated in the units that bear on it -- files DUPLICATING a computation -- the count is ${C.duplication.length} and the trigger's twenty would be twenty of these. An IR earns its keep when the pairs it replaces outnumber it, and five does not`);
    ok("!! ...and the reason is no longer the count, because the count was never measuring the claim",
        census.both.length > C.duplication.length * 2,
        `${census.both.length} against ${C.duplication.length}. THE FINDING IS THE INSTRUMENT, not the verdict: a trigger that would have fired at twenty was reading a population that grows when you solve the problem, shrinks for no reason connected to the decision, and includes three tools and two emitters`);
    report("WHAT THIS DOES NOT SETTLE, and it is the actionable half. WHETHER THE FIVE SHOULD MOVE ONTO THE " +
           "TSL PATH THAT ALREADY EXISTS: that is a port per file with a key per file, not a decision -- " +
           "v4400 and v4402 are what one costs, and neither was cheap. WHETHER THE FIVE ARE DRIFTING RIGHT " +
           "NOW: this round counts pairs, it does not compare their halves, and shaderCensus's constant " +
           "overlap is the only instrument the tree has for that -- crude by its own account. AND WHETHER AN " +
           "IR WOULD BE GOOD FOR ANYTHING ELSE: v3274 asked only about drift between two hand-written halves, " +
           "and a compiler bought for one reason usually gets kept for another.");
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 1 / 1 / 1 / 1 / 1, and TWO OF THEM WENT 0 RED FIRST AND WERE DEFECTS IN THIS GATE.
 *
 * A. GENERIC emptied, so a shared `main` counts as a shared computation.                            1 RED
 *    The fixture check only. Worth saying why the classification does NOT move: of the fourteen files, the
 *    two that share an entry-point name share ONLY that, so with GENERIC empty they reach one non-generic
 *    name and still fall under DUPLICATION_MIN. The exclusion protects the PRINCIPLE more than these files --
 *    every shader in both languages has a main, so counting it would find duplication everywhere.
 *
 * B. The normaliser strips digits, making hash2 and hash3 one function.                             1 RED
 *    The check written to catch exactly this. An aggressive normaliser manufactures matches, and matches are
 *    the direction this round WANTS to go -- an instrument that bends toward its own conclusion is the thing
 *    the round is about, so it is checked on the instrument first.
 *
 * C. DUPLICATION_MIN lowered from 2 to 1.                                                           1 RED
 *    The classification itself: fleets and gpuDriven move from CONVENTION to DUPLICATION and the count goes
 *    5 -> 7. A threshold of one shared name would call an entry-point convention a duplicated computation.
 *
 * D. render/fleetTsl.mjs dropped from AUTHOR_ONCE.                                                  1 RED
 *    *** WENT 0 RED FIRST, AND IT WAS A DEFECT IN THIS GATE. *** The check asserted
 *    `emitters.length === AUTHOR_ONCE.length` -- the list agreeing with ITSELF, so shortening the list left
 *    it green. AN ARRANGEMENT, NOT A PROPERTY, which is the error this tree names most often, written inside
 *    a round about mis-specified instruments. The files are named explicitly now. Re-run at 1 red.
 *
 * E. The WGSL reader widened to match GLSL's `float` declarations, so the two syntaxes collide.      1 RED
 *    *** ALSO 0 RED FIRST, AND ALSO THIS GATE'S FAULT. *** The fixture's GLSL-only functions were declared
 *    with `vec3`, so widening the reader to `float` leaked only `fbm` -- a name the WGSL side already had --
 *    and the deduplicated count did not move. A fixture whose leak collides with something already present
 *    cannot detect a leak. It now carries `float onlyGlsl(float x)`. Re-run at 1 red.
 * --------------------------------------------------------------------------------------------------------- */
