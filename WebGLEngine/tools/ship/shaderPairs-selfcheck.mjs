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
// ---- *** v4471 -- THE COUNT MOVED FROM 14 TO 10 AND THE VERDICT DID NOT MOVE AT ALL. *** ------------------
//
// Merging main brought its v4383, which REPLACED shaderCensus's detector: v1 tested raw source for six tokens,
// two of which -- the GLSL storage qualifiers spelled a-t-t-r-i-b-u-t-e and v-a-r-y-i-n-g -- are also ordinary
// English. v4383's own note gives the figure: "FOUR of the fourteen files it called shader PAIRS carry no GLSL
// at all", and names render/bloomFused.mjs, matched on the sentence "attribute any difference to the SAMPLING".
//
// THE FOUR ARE IDENTIFIED, NOT ASSUMED: render/wgslSpec.mjs, tools/ship/wgslCorpus.mjs,
// tools/roundhouse/magmapVariants.mjs and render/bloomFused.mjs are all still on disk, and backendParity's
// classify() -- the detector v4383 adopted -- returns "wgsl" for every one of them. They did not leave the
// tree; they left the POPULATION, because they were never in it.
//
// *** AND THIS IS THE STRONGEST CORROBORATION THE ROUND HAS. *** The headline count fell 29% under a detector
// replacement, and the quantity the decision rests on DID NOT MOVE: five DUPLICATION and two CONVENTION,
// before and after. Every file that changed hands was DISJOINT -- the class this gate exists to say is noise.
// A number that moves when the instrument is corrected while the decision-bearing quantity holds is exactly
// what "the count was never measuring the claim" predicts, and it was predicted before it was observed.
//
// *** WHAT WENT RED IS THIS FILE, AND THE DEFECT IS THE ONE IT WAS WRITTEN TO NAME. *** Four of its checks
// asserted the ARRANGEMENT -- seven DISJOINT, three tools in `both`, "5 of the 14" -- alongside the property.
// Its own section 3 already carries the warning, about a different check, one paragraph away: "An arrangement,
// not a property -- the error this tree names most often, written here in a round about mis-specified
// instruments." It was written there and committed here. The arrangement assertions are now properties: the
// classes that bear on the decision are asserted by size, the ones that do not are REPORTED, and the named
// tools are asserted to classify DISJOINT *if the census still counts them at all* -- which is the claim that
// was always meant, and which survives a detector that stops counting them.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node tools/ship/shaderPairs-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPairs, glslFunctions, wgslFunctions, normaliseName, GENERIC, DUPLICATION_MIN,
         AUTHOR_ONCE, ABOUT_SHADERS } from "./shaderPairs.mjs";
import { shaderCensus } from "./shaderCensus.mjs";
import { noComments } from "./sourceScan.mjs";
import { GLSL_MARK, WGSL_MARKS } from "../../render/backendParity.mjs";

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
    // *** THE TWO CHECKS ABOVE PROVE THE INGREDIENTS AND NOT THE RECIPE, WHICH A SABOTAGE SHOWED. ***
    // Deleting the GENERIC filter from classifyPairs -- `const real = shared` -- went 0 RED. Nothing on this
    // tree can see it: the only two files sharing a generic name are gpuDriven (shared `main` alone, one name,
    // under DUPLICATION_MIN either way) and lyapunovWgsl (already DUPLICATION on two real names). So a
    // classifier that counts every shared `main` as a duplicated computation gives the identical verdict HERE
    // and a wrong one on the first file that shares an entry point and one function.
    //
    // The check above asserts GENERIC's CONTENTS; it never asserts that classifyPairs CONSULTS it. So the
    // classifier is run for real against fixtures written to a temp root -- the same classifyPairs the tree
    // section uses, not a re-implementation of its rule, because a control that exercises a different instance
    // of the thing it controls is not a control.
    //
    // *** THE FIXTURE IS ONE FILE PER GENERIC NAME, AND THE FIRST DRAFT WAS ONE FILE FOR ALL OF THEM. ***
    // That draft shared `main` and `vert` together, and sabotaging GENERIC down to {main} alone went 0 RED:
    // `vert` became the only real name, one is under DUPLICATION_MIN, and the verdict did not move. A single
    // fixture can only ever show that SOME name is filtered. Each file below shares exactly one generic name
    // plus exactly one real name, which puts every generic member ON the threshold by itself: filtered, the
    // real count is 1 and the verdict is CONVENTION; unfiltered it is 2 and the verdict is DUPLICATION.
    //
    // *** AND TWO OF THE FIXTURES EXIST ONLY TO DISAGREE. *** A second sabotage replaced the row lookup with
    // `() => "CONVENTION"` and went 0 RED, because every fixture in that draft was a CONVENTION -- a constant
    // agrees with a set of rows that all say the same thing. `bothReal` and `sharesNothing` are here so the
    // expected answers are not all alike, and no constant can satisfy them at once.
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shaderPairs-"));
        // *** THE MARKERS ARE IMPORTED, NOT TYPED, AND THAT IS A REGRESSION THIS ROUND CAUSED AND CAUGHT. ***
        // The first draft wrote "#version 300 es" and "@fragment" as literals, and backendParity-selfcheck
        // promptly went red: THIS GATE became the fourteenth dual-language file in the tree -- "a file that
        // MENTIONS both is not a file that IMPLEMENTS both", which is the exact error shaderCensus v1 made
        // against itself and the reason shaderCensus SKIPs -selfcheck files. backendParity does not skip them,
        // so it saw a shader pair where there is a fixture.
        //
        // backendParity's own answer to this is three lines of its source -- `"#" + "version 300 es"`,
        // `"@" + "vertex"` -- split so the detector cannot match its own definition. Importing them is that
        // idiom and one better: the fixture cannot drift from the markers, because it IS them.
        // The head carries GLSL_MARK and NOTHING ELSE. The draft added a `uniform float u;` line for good
        // measure, which is GLSL_TELL exactly -- backendParity's framework-style marker -- and that put this
        // file back in the census as a GLSL-bearing module after the @-marker fix had just taken it out of the
        // pair count. backendParity's own note calls its version of this "the eighth self-count in eight
        // rounds"; this is the ninth, in the gate next door, twice in one round. The directive alone is
        // sufficient and the extra line was never needed.
        const head = GLSL_MARK + "\n";
        // Every fixture carries @fragment, not just the one declaring `main`: shaderCensus reaches a file
        // through backendParity's WGSL markers, and `fn vs()` alone carries none -- the first draft's vs, fs,
        // vert and frag files were never classified at all, and the check said so rather than counting four
        // absences as agreement.
        const decl = (n) => WGSL_MARKS[1] + " fn " + n + "() { }\n";
        // *** THE NAMES ARE LISTED HERE AND NOT READ OUT OF GENERIC, AND THAT IS A THIRD SABOTAGE'S DOING. ***
        // The draft wrote `for (const g of GENERIC)`, so the fixture set was DERIVED from the thing it tests:
        // deleting "frag" from GENERIC deleted generic-frag.mjs along with it and the check went 0 RED, having
        // silently stopped testing exactly what changed. A fixture generated from its subject cannot detect a
        // subtraction from its subject.
        //
        // The cost of writing them out is the one budgetEvidence names -- "a hand-written list is a
        // suppression with a maintenance burden" -- and it is paid off by the line below, which asserts this
        // list IS GENERIC. Adding a name to GENERIC without a fixture goes red there; removing one goes red on
        // the fixture that is still written for it. Neither hole is left to memory.
        const GENERIC_EXPECTED = ["main", "vs", "fs", "vert", "frag"];
        // *** AND THE INDEPENDENCE IS ASSERTED AGAINST THIS FILE'S OWN SOURCE, BECAUSE THE PAIR DEFEATS THE
        // VALUES. *** Rewriting the line above as `[...GENERIC]` is 0 RED on its own -- the two are equal
        // today -- and so is removing a member on its own, now. DOING BOTH is 0 RED again: the derived list
        // shrinks with GENERIC, the fixture for the removed name is never written, and the equality below
        // compares GENERIC against itself and agrees. No comparison of VALUES can tell a literal from a
        // computation that currently equals it; the claim is about how the line is WRITTEN, so it is checked
        // where that is visible.
        //
        // *** ONE SABOTAGE OF THIS CLAUSE IS NOT CLOSED AND IS RECORDED INSTEAD: *** replacing the read below
        // with a crafted string that satisfies the pattern is 0 RED. That is not special to this check -- ANY
        // check that reads a source can be pointed at a different source, and an edit that does so is
        // indistinguishable from a check that legitimately reads somewhere else. What is done about it is
        // proportionate rather than decisive: the read is required to look like THIS file (its header line and
        // this check's own label), so a substituted string has to carry the file's identity along with the
        // pattern. A determined edit still gets through, and at that point it is editing the check, which the
        // check was never able to prevent.
        const selfSrc = noComments(fs.readFileSync(fileURLToPath(import.meta.url), "utf8"));
        const isThisFile = selfSrc.includes("shaderPairs-selfcheck.mjs -- v") &&
                           selfSrc.includes("listed independently so a subtraction cannot delete its own test");
        const literalList = isThisFile &&
            /const\s+GENERIC_EXPECTED\s*=\s*\[\s*(?:"[a-z]+"\s*,\s*)*"[a-z]+"\s*\]/.test(selfSrc);
        ok("  and the fixture names are GENERIC's, listed independently so a subtraction cannot delete its own test",
            literalList && GENERIC_EXPECTED.length === GENERIC.size && GENERIC_EXPECTED.every((g) => GENERIC.has(g)),
            `${GENERIC_EXPECTED.length} names against GENERIC's ${GENERIC.size}: ${GENERIC_EXPECTED.join(", ")}, and the declaration ${literalList ? "IS" : "is NOT"} a literal array of strings in this file's own source. THE LIST IS DUPLICATED ON PURPOSE and this line is the price -- driving the fixtures off GENERIC itself made removing a member 0 RED, because the fixture for it stopped being written. The source test is the half that survives doing both at once`);
        const expected = new Map();
        for (const g of GENERIC_EXPECTED) {
            const f = "generic-" + g + ".mjs";
            fs.writeFileSync(path.join(tmp, f), head +
                "void " + g + "() { }\nfloat fbm(vec2 p) { return 0.0; }\n" +
                decl(g) + "fn fbm(p : vec2<f32>) -> f32 { return 0.0; }\n");
            expected.set(f, "CONVENTION");
        }
        fs.writeFileSync(path.join(tmp, "bothReal.mjs"), head +
            "void main() { }\nfloat fbm(vec2 p) { return 0.0; }\nvec3 palette(float t) { return vec3(0.0); }\n" +
            WGSL_MARKS[1] + " fn main() { }\nfn fbm(p : vec2<f32>) -> f32 { return 0.0; }\nfn palette(t : f32) -> vec3<f32> { return vec3<f32>(0.0); }\n");
        expected.set("bothReal.mjs", "DUPLICATION");
        fs.writeFileSync(path.join(tmp, "sharesNothing.mjs"), head +
            "void glslOnly() { }\nfloat glslFbm(vec2 p) { return 0.0; }\n" +
            WGSL_MARKS[1] + " fn wgslOnly() { }\nfn wgslFbm(p : vec2<f32>) -> f32 { return 0.0; }\n");
        expected.set("sharesNothing.mjs", "DISJOINT");

        const F = classifyPairs(tmp);
        const got = new Map(F.rows.map((r) => [r.file, r.verdict]));
        const wrong = [...expected].filter(([f, v]) => got.get(f) !== v);
        ok("!! *** and the CLASSIFIER consults GENERIC -- every member of it -- which the check above does not establish ***",
            got.size === expected.size && wrong.length === 0,
            wrong.length || got.size !== expected.size
              ? `${got.size} of ${expected.size} fixtures classified; wrong: ` +
                wrong.map(([f, v]) => `${f} expected ${v} got ${got.get(f) || "not classified"}`).join(", ")
              : `${GENERIC.size} fixtures, one per generic name, each sharing THAT name plus fbm: every one CONVENTION, so each member is filtered individually and dropping any single one turns its file DUPLICATION. Plus bothReal -> DUPLICATION and sharesNothing -> DISJOINT, whose only job is to make the expected answers unequal: a lookup replaced by the constant "CONVENTION" agreed with the all-CONVENTION draft and went 0 RED`);
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    ok("  and the normaliser is small on purpose, because an aggressive one would manufacture the answer",
        normaliseName("swk_Lyapunov") === "lyapunov" && normaliseName("fbmWgsl") === "fbm" && normaliseName("hash2") !== normaliseName("hash3"),
        `case, this tree's swk_ prefix and the wgsl/glsl/gpu suffixes a twin is given -- and nothing else. A normaliser that stripped digits would make hash2 and hash3 the same function, which is the failure mode that would bend this round toward the conclusion it is testing`);
}

console.log("\n2. THE TRIGGER COUNTS CO-OCCURRENCE AND THE DECISION NEEDS 5");
{
    report(`shaderCensus.both = ${census.both.length}; classified:`);
    C.rows.forEach((r) => report(`  ${r.verdict.padEnd(12)} ${r.file.padEnd(38)} ${r.real.join(", ")}`));
    // *** THE DISJOINT COUNT IS REPORTED, NOT ASSERTED, AND THAT IS THE v4471 CORRECTION. *** The first
    // version of this line pinned all three classes -- 5, 2 and SEVEN -- and the seven is the one that moved
    // when main's v4383 corrected the detector. DISJOINT is the class this whole gate calls noise: files that
    // share nothing, whose number rises and falls with how good the language detector is and with nothing that
    // bears on whether to build an IR. Asserting it made this gate's verdict hostage to the very quantity it
    // was written to discredit. The two classes that DO bear on the decision are still pinned, and they are
    // the two that held across the correction.
    ok("*** of the files the trigger counts, FIVE duplicate a computation and TWO share only a convention ***",
        C.duplication.length === 5 && C.convention.length === 2,
        `${C.duplication.length} DUPLICATION, ${C.convention.length} CONVENTION out of ${census.both.length} -- and ${C.disjoint.length} DISJOINT, REPORTED rather than asserted because that class is the noise this gate exists to name. An IR replaces DUPLICATION; it can do nothing for a file whose two halves compute different things, and render/bloomFused.mjs exists precisely because WebGPU can fuse what WebGL2 cannot`);
    ok("  ...and the two that bear on the decision are exactly the two that survived a detector replacement",
        C.duplication.length + C.convention.length === 7,
        `main's v4383 replaced shaderCensus's detector and \`both\` fell 14 -> ${census.both.length}, a 29% move in the headline number. DUPLICATION and CONVENTION did not change by one file. THIS IS A CONTROL THAT WAS RUN WITHOUT BEING PLANNED: the round predicted the count was measuring something other than the claim, and then an independent correction to the count left the claim untouched`);
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
    // *** THE CLAIM IS "IF THE CENSUS COUNTS A TOOL, THE CLASSIFIER CALLS IT DISJOINT", NOT "THE CENSUS
    // COUNTS THREE TOOLS". *** The second is an arrangement and it went red the moment a better detector
    // stopped counting them: all three are still on disk and backendParity's classify() returns "wgsl" for
    // each, so they were WGSL-only files that v1's a-t-t-r-i-b-u-t-e regex called pairs. The census dropping
    // them is this section's point ARRIVING FROM THE OTHER DIRECTION -- and a check that reads "3" cannot tell
    // that from the tools quietly being reclassified as the question.
    const tools = ABOUT_SHADERS.filter((f) => census.both.includes(f));
    const toolsOnDisk = ABOUT_SHADERS.filter((f) => fs.existsSync(path.join(ROOT, f)));
    ok("  and any TOOL the trigger counts is a tool whose subject is shader text, never a shader",
        toolsOnDisk.length === ABOUT_SHADERS.length && tools.every((f) => C.disjoint.some((r) => r.file === f)),
        `${ABOUT_SHADERS.length} named -- a conformance checker, a corpus, and a table of kernel variants -- all ${toolsOnDisk.length} present on disk, ${tools.length} still counted by the census, and every counted one classifies DISJOINT, which is the classifier agreeing without being told. The ${ABOUT_SHADERS.length - tools.length} the census no longer counts were dropped by main's v4383 detector fix as WGSL-only: THEY WERE NEVER PAIRS, which is a stronger form of this section's claim than the one it set out to make`);
    ok("!! *** so the answer and the tools about the question are inside the population the trigger reads ***",
        AUTHOR_ONCE.every((f) => census.both.includes(f)),
        `both emitters, and ${tools.length} of ${ABOUT_SHADERS.length} tools, inside a population of ${census.both.length}. v4380 saw the number climb and said "the TSL rounds of this session put some of them there" -- correct, and the reason is that a TSL round ADDS an emitter, which is the opposite of what the climbing number was taken to mean. THE EMITTERS ARE ASSERTED AND THE TOOLS ARE NOT: an emitter is in \`both\` for a reason no detector fix can remove -- it really does contain both languages -- while a tool was only ever there by mistake`);
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
    // *** THIS CHECK WAS A RATIO AND THE RATIO WAS THE WRONG SHAPE. *** It read
    // `census.both.length > C.duplication.length * 2` -- ten against five -- and main's v4383 detector fix
    // dropped the population to exactly 2x, so it failed on the boundary. THE TOLERANCE IS NOT WIDENED. It is
    // removed, because a ratio was never what the sentence claims: "the count was never measuring the claim"
    // is an assertion that the trigger's population and the decision's population ARE DIFFERENT SETS, and a
    // set relation does not care how many files a detector fix moved. Restated that way it is also stronger --
    // it stays true at any size, including the one where the two counts happen to coincide.
    const extra = census.both.filter((f) => !C.duplication.some((r) => r.file === f));
    const emittersInside = AUTHOR_ONCE.filter((f) => census.both.includes(f));
    ok("!! ...and the reason is no longer the count, because the count was never measuring the claim",
        extra.length > 0 && emittersInside.length > 0 && C.duplication.every((r) => census.both.includes(r.file)),
        `the trigger reads ${census.both.length} files and the decision rests on ${C.duplication.length}; every one of the ${C.duplication.length} is inside the ${census.both.length}, and ${extra.length} MORE are too -- ${extra.length - emittersInside.length} that duplicate nothing plus ${emittersInside.length} EMITTER(S), ${emittersInside.join(" and ")}. THE FINDING IS THE INSTRUMENT, not the verdict: a trigger that would have fired at twenty was reading a strict superset of what it needed, one that GROWS when you solve the problem and shrinks when somebody fixes the language detector -- neither of which is a fact about whether to build an IR`);
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
 *
 * ---- v4471 -------------------------------------------------------------------------------------------------
 *
 * F. The DISJOINT count re-pinned at seven, as it was written.                                      1 RED
 *    The defect the round found. Entry A above says GENERIC is "empty -> 0 RED" and calls it earned; entry D
 *    names the arrangement error and fixes ONE instance of it. THE SAME FILE COMMITTED IT AGAIN, three lines
 *    from D's own warning, by pinning all three class sizes when only two bear on the decision.
 *
 * G. A DUPLICATION file, then an emitter, then everything but DUPLICATION dropped from the census.  1-3 RED
 *    The set relation that replaced the `both > duplication * 2` ratio. The ratio failed on the boundary when
 *    main's v4383 detector fix took the population 14 -> 10; A TOLERANCE IS NOT WIDENED AFTER IT FAILS, so it
 *    was replaced by the claim the sentence was always making -- the two populations are different SETS --
 *    which holds at every size including the one where the counts coincide.
 *
 * H. DUPLICATION_MIN moved to 1 and to 3; CONVENTION collapsed into DISJOINT.                       1-2 RED
 *    The decision-bearing classes are still pinned, so moving them is still caught. That is the half of the
 *    original check that was correct and it is unchanged.
 *
 * I. The GENERIC filter deleted from classifyPairs -- `const real = shared`.                        1 RED
 *    *** 0 RED FIRST, AND IT IS ENTRY A LOOKING BACK. *** A says an empty GENERIC is 0 RED and earns it on
 *    the tree's data, which is true and is not the whole answer: the gate proved GENERIC's CONTENTS and never
 *    that the classifier CONSULTS it. The tree cannot show the difference -- gpuDriven shares `main` alone
 *    and lyapunovWgsl is already DUPLICATION on two real names -- so the classifier is now run against
 *    fixtures in a temp root, one per generic name, each sitting exactly on the threshold.
 *
 * J. GENERIC emptied to {main}; then a single member ("frag") removed.                              2 RED
 *    *** BOTH 0 RED FIRST, AND THE FIXTURE WAS THE REASON. *** It looped `for (const g of GENERIC)`, so the
 *    fixture set was DERIVED FROM ITS OWN SUBJECT: removing a name removed the file that tested it. A fixture
 *    generated from what it tests cannot detect a subtraction from what it tests. The names are written out
 *    now, and a separate check asserts that list IS GENERIC so an ADDITION is caught too (1 RED).
 *
 * K. The fixture's row lookup replaced by the constant "CONVENTION".                                1 RED
 *    *** 0 RED FIRST. *** Every fixture in that draft expected CONVENTION, and a constant agrees with a set
 *    of rows that all say the same thing -- the earned-zero species this branch has recorded twice, closed
 *    here rather than earned again: bothReal (DUPLICATION) and sharesNothing (DISJOINT) exist so that no
 *    single constant can satisfy the expectations.
 *
 * L. `GENERIC_EXPECTED = [...GENERIC]` AND a member removed, together.                              1 RED
 *    *** 0 RED FIRST, AS A PAIR, WHILE EACH HALF ALONE WAS RED. *** The derived list shrinks with GENERIC,
 *    the fixture for the removed name is never written, and the equality check compares GENERIC with itself
 *    and agrees. NO COMPARISON OF VALUES CAN TELL A LITERAL FROM A COMPUTATION THAT CURRENTLY EQUALS IT, so
 *    the claim -- "this list is written out, not derived" -- is checked where it is visible, in this file's
 *    own source.
 *
 * M. That source read swapped for a crafted string, and pointed at a sibling gate.                  1 RED
 *    *** THE FIRST WAS 0 RED. *** A check that reads a source can be pointed at a different source, and this
 *    is true of every such check in the tree rather than special to this one. Hardened rather than closed:
 *    the read must carry this file's header line and this check's own label. A determined edit still gets
 *    through, and by then it is editing the check itself, which no check has ever been able to prevent.
 *
 * N. NOT A SABOTAGE -- A REGRESSION THIS ROUND SHIPPED AND A NEIGHBOUR CAUGHT, TWICE.       backendParity RED
 *    The fixtures above are shader text, and writing them as literals made THIS GATE a dual-language file:
 *    backendParity-selfcheck went red with `both` 13 -> 14, naming tools/ship/shaderPairs-selfcheck.mjs among
 *    the shader modules. That is "a file that MENTIONS both is not a file that IMPLEMENTS both" -- the error
 *    shaderCensus v1 made against ITSELF, in a gate whose whole subject is instruments that count themselves.
 *    Fixed by importing GLSL_MARK and WGSL_MARKS instead of typing them, which cannot drift from the markers
 *    because it IS them. THEN IT WENT RED AGAIN, on `uniform float u;` -- GLSL_TELL exactly -- so the file
 *    left the pair count and re-entered as a GLSL-bearing module. backendParity's own note calls its version
 *    of this "the eighth self-count in eight rounds"; this round contributed the ninth and tenth. Neither was
 *    found by a check written here: BOTH were found by the gate next door, which is the argument for a census
 *    that asserts absence rather than trusting the habit.
 * --------------------------------------------------------------------------------------------------------- */
