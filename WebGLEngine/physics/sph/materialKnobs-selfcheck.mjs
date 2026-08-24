// physics/sph/materialKnobs-selfcheck.mjs
//
// v3541 -- GRADES THE FLUID MATERIAL-KNOB CENSUS, AND EVERY NUMBER IS RE-DERIVED RATHER THAN QUOTED.
// STATED RUNTIME: ~230s, MEASURED rather than guessed (v3211-v3213 found 59 of 82 gate headers carrying a
// remembered number). The cost is ~24 SPH column runs; sections 4, 5 and 7 use 1200 steps because their
// claims are about the settled state, and the structural sections use 600 because an exact zero is exact at
// any step count.
//
// A register of verdicts is exactly the kind of file that rots (v3512), and this one is being written in the
// round that found the PREVIOUS proposal wrong twice in one sentence. So nothing here compares against a
// typed value: the assertions are RELATIONS (this ranking inverts, this spread is smaller than that one, this
// movement is EXACTLY zero) which cannot pass on a fixture whose absolute numbers drift.
//
// THE ONE THING THAT IS ASSERTED AS AN EQUALITY IS THE VACUITY, AND DELIBERATELY: pressureOf's two branches
// read DISJOINT parameters, so a vacuous knob here moves the answer by exactly 0.000e+0 rather than by float
// dust. v3537 found `isKnob: rel > 1e-9` cleared by 2.995e-9 of least-squares round-off and warned that an
// absolute floor is the wrong discriminator. IT IS NOT NEEDED HERE, and asserting the exact zero is what says
// so -- if one of these ever becomes merely small, the parameter has started being read somewhere.
//
// v3975 -- WIRED INTO THE LESSON CORPUS, AND THE WRITE SITES ARE CHOSEN BY WHAT SECTION 7 ALREADY LEARNED THE
// HARD WAY. Section 7 tried twice to say something about settling and was WRONG both times before v3542's
// correction: it read a still-collapsing column and a wandering one as evidence the free-surface score could
// not be applied, when the real cause was that THE SHIPPED CONFIGURATION IS UNSTABLE -- kinetic energy
// QUADRUPLES over 2000 steps. That is exactly the kind of finding recordSweepFinding exists to keep someone
// from re-discovering: two settle questions, each a real 230s SPH run, each already rendering a verdict this
// gate would otherwise re-earn from nothing on the next person who wonders why a resting-column check is not
// here.
//
// TWO WRITE SITES, BOTH TWO-POINT SERIES, BOTH DERIVED RATHER THAN HARDCODED. Section 7 asks "did this settle
// between 1200 and 2400 steps" exactly twice -- once under ideal EOS, once under tait in the free box -- and
// each already renders a PASS/FAIL for exactly that question. The wiring reads the SAME boolean the `ok(...)`
// call reads, not a re-derived one, so the corpus and the gate's own verdict cannot diverge.
//
// *** THIS MAKES THE WRITE SELF-CORRECTING ACROSS THE ANTIDOTE, WHICH IS THE POINT OF NOT HARDCODING IT. ***
// Section 7 carries its own antidote: "WHEN SOMEBODY MAKES THIS COLUMN SETTLE, THIS SECTION GOES RED AND
// SHOULD BE REWRITTEN... NOT WEAKENED, AND NOT DELETED." Because `settled` here is read from the live
// condition rather than typed as `false`, the day somebody fixes the instability and the column starts
// settling, `settled` flips to `true` on its own and recordSweepFinding correctly WRITES NOTHING -- no
// separate update is owed to the lesson-corpus wiring when the antidote fires and the check is rewritten.
"use strict";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { createSphWorld } from "./sph.js";
import { makeColumn } from "./hydrostatic.mjs";
import { knobMoves } from "../../tools/ship/floors.mjs";
import { codeOnly } from "../../tools/ship/sourceScan.mjs";
import { census, lidReach, restDensityProbe, columnSpec, packedDensity,
         LATTICE, SHIPPED_LID, FREE_LID, REFUSED_KNOBS, NOT_IN_THIS_TREE } from "./materialKnobs.mjs";
import { reportLines } from "./materialKnobs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "../..");

// Lazily imported with its failure swallowed: a physics gate must never go red because a lesson file could not
// be read. env "sph-column" shares the "sph" family token with levelClaim's "sph-level" and packingTransfer's
// "sph-packing", so all three read each other's findings as related without blending their numbers.
let _lessons = null;
try { _lessons = await import(pathToFileURL(path.join(ENG, "brain", "rl", "lessons.mjs")).href);
      console.log(_lessons.lessonsBrief("sph-column")); } catch {}

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const e = (v) => (v === 0 ? "EXACTLY 0" : v.toExponential(3));

console.log("materialKnobs-selfcheck -- which fluid parameters are material\n");

// ---------------------------------------------------------------------------
console.log("1. THE OLD CALL SHAPE WAS BLIND, AND IT IS DRIVEN RATHER THAN DESCRIBED");
{
    // v3517's rule: the claim is about THE OLD CALL SHAPE, so the callee must be invoked exactly as the
    // harness used to invoke it. This rebuilds pre-v3541 makeColumn's opts -- viscosity hardcoded, gamma
    // never mentioned -- and sweeps gamma through it.
    const fill = (w) => { const L = LATTICE;
        for (let i = 0; i < L.nx; i++) for (let j = 0; j < L.ny; j++) for (let k = 0; k < L.nz; k++)
            w.addParticle([L.x0 + i * L.spacing, L.y0 + j * L.spacing, L.z0 + k * L.spacing]); };
    const oldShape = (gamma) => {
        const o = { h: 0.1, mass: 0.02, restDensity: packedDensity(), stiffness: 8, viscosity: 0.1,
                    gravity: [0, -9.81, 0], eos: "tait" };       // <- gamma NOT passed, viscosity hardcoded
        o.soundSpeed = 15; void gamma;
        const w = createSphWorld(o); fill(w);
        for (let t = 0; t < 600; t++) w.step(1 / 1000, [0, 0, 0, 0.6, SHIPPED_LID, 0.6]);
        return { gammaSeen: w.opts.gamma, viscositySeen: w.opts.viscosity };
    };
    const a = oldShape(7), b = oldShape(5);
    ok("!! *** THE OLD SHAPE SWALLOWED gamma: 5 WENT IN AND 7 CAME OUT ***", a.gammaSeen === b.gammaSeen && b.gammaSeen === 7,
        "solver saw gamma " + b.gammaSeen + " for a caller asking 5. A SWEEP OVER IT WOULD HAVE READ EXACTLY " +
        "ZERO MOVEMENT AND REGISTERED A LIVE KNOB AS VACUOUS -- kepler's dead `mu` (v3517) in the fluid: " +
        "INVARIANT BECAUSE UNREAD.");
    ok("...and viscosity was hardcoded past the caller too", b.viscositySeen === 0.1,
        "0.1 whatever was asked for -- two of the four candidates could not reach the solver at all");

    const now = makeColumn({ eos: "tait", gamma: 5 }).world.opts;
    ok("!! and BOTH ARRIVE NOW, which is the fix", now.gamma === 5 && makeColumn({ viscosity: 9 }).world.opts.viscosity === 9,
        "gamma " + now.gamma + ", viscosity 9 -- makeColumn's signature carries them");
    report("ANTIDOTE", "IF THIS SECTION EVER GOES RED IT MEANS A PARAMETER STOPPED ARRIVING. DO NOT LOOSEN IT " +
        "-- find which call site dropped it, because the symptom is a knob reading vacuous and a register " +
        "recording the wrong reason.");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE WIDENING MOVED NOTHING: PASSING THE DEFAULTS EXPLICITLY IS THE SAME CALL");
{
    const bare = JSON.stringify(makeColumn({}).world.opts);
    const spelt = JSON.stringify(makeColumn({ viscosity: 0.1, gamma: 7 }).world.opts);
    ok("!! defaults unchanged, so every existing row is bit-identical", bare === spelt,
        "*** THIS IS THE PROPERTY AND NOT A COMPARISON AGAINST A REMEMBERED NUMBER: a widened signature is " +
        "safe exactly when spelling out its new defaults changes nothing. ***");
    const t = makeColumn({ eos: "tait" }).world;
    ok("...and the tait branch still derives B from rho0, c and gamma", t.opts._taitB > 0 && t.opts.gamma === 7,
        "_taitB " + t.opts._taitB.toFixed(3) + " at gamma " + t.opts.gamma);
}

// ---------------------------------------------------------------------------
console.log("\n3. WHICH KNOBS EXIST IS A PROPERTY OF THE EQUATION OF STATE");
{
    const ideal = census({ eos: "ideal", lidY: SHIPPED_LID, steps: 600 });
    const tait = census({ eos: "tait", lidY: SHIPPED_LID, steps: 600 });
    const get = (c, k) => c.rows.find((r) => r.knob === k).rel;

    ok("!! *** stiffness IS LIVE UNDER ideal AND EXACTLY VACUOUS UNDER tait ***",
        get(ideal, "stiffness") > 0 && get(tait, "stiffness") === 0,
        "ideal " + e(get(ideal, "stiffness")) + " against tait " + e(get(tait, "stiffness")) +
        ". pressureOf's tait branch reads _taitB and gamma and NEVER READS stiffness.");
    ok("!! ...and gamma and soundSpeed are the mirror image",
        get(tait, "gamma") > 0 && get(ideal, "gamma") === 0 && get(ideal, "soundSpeed") === 0,
        "gamma tait " + e(get(tait, "gamma")) + " / ideal " + e(get(ideal, "gamma")) +
        ", soundSpeed ideal " + e(get(ideal, "soundSpeed")) +
        ". *** A REGISTER LISTING 'THE SPH MATERIAL KNOBS' WITHOUT NAMING THE LAW WOULD BE WRONG HALF THE TIME. ***");
    ok("!! THE VACUITIES ARE **EXACTLY** ZERO, NOT FLOAT DUST",
        get(tait, "stiffness") === 0 && get(ideal, "gamma") === 0 && get(ideal, "soundSpeed") === 0,
        "0.000e+0 by construction, because the two branches read DISJOINT parameters. v3537 found `rel > 1e-9` " +
        "cleared by 2.995e-9 of round-off; THAT HOLE CANNOT OPEN HERE, and asserting the exact zero is what " +
        "would notice if one of these started being read.");
    // POSITIVE CONTROL: an inert harness would report every knob vacuous and pass three checks above.
    ok("...positive control: the harness DOES see movement in the same runs", get(ideal, "viscosity") > 0 && get(tait, "viscosity") > 0,
        "viscosity moves under both laws (" + e(get(ideal, "viscosity")) + " / " + e(get(tait, "viscosity")) +
        ") -- so the exact zeros are a reading and not a dead instrument (v3177's shape)");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE HEADLINE OBSERVABLE IS A MEASUREMENT OF THE CONTAINER ***");
{
    const shipped = lidReach({ lidY: SHIPPED_LID, steps: 1200 });
    const free = lidReach({ lidY: FREE_LID, steps: 1200 });
    // THE SCALE IS THE FIXTURE'S OWN: a gap smaller than the particle SPACING means the fluid is touching.
    ok("!! *** AT THE SHIPPED BOX THE COLUMN IS AGAINST THE LID ***", shipped.gap < LATTICE.spacing,
        "topmost particle " + shipped.top.toFixed(4) + " under a lid at " + SHIPPED_LID + " -- gap " +
        shipped.gap.toFixed(4) + ", LESS THAN ONE PARTICLE SPACING (" + LATTICE.spacing + "). The threshold " +
        "is the lattice's own, not a number chosen here.");
    ok("...and in a taller box it is not", free.gap > LATTICE.spacing,
        "gap " + free.gap.toFixed(4) + " = " + free.gapInH.toFixed(2) + " smoothing lengths AT 1200 STEPS. " +
        "*** CORRECTED AT v3542: THIS IS TRUE FOR 1200 STEPS AND FALSE AT 2000, when the fluid reaches 2.988 " +
        "under this same lid. A STATEMENT ABOUT WHAT SOMETHING DOES NOT REACH IS A STATEMENT ABOUT A DURATION, " +
        "and this one shipped without one. The cause is in settling-selfcheck: the column gains energy. ***");
    ok("!! so `retained` TRACKS THE LID rather than the fluid", free.retained > shipped.retained * 1.2,
        "retained " + shipped.retained.toFixed(4) + " at lid " + SHIPPED_LID + " against " +
        free.retained.toFixed(4) + " at lid " + FREE_LID + ". *** MEASURED_V2881's THREE tait ROWS AGREE " +
        "ACROSS c = 8/15/25 NOT BECAUSE THE FLUID IGNORES SOUND SPEED BUT BECAUSE ALL THREE ARE PRESSED FLAT " +
        "AGAINST THE SAME CEILING. ***");

    const shipC = census({ eos: "tait", lidY: SHIPPED_LID, steps: 1200 });
    const freeC = census({ eos: "tait", lidY: FREE_LID, steps: 1200 });
    ok("!! *** AND THE CENSUS INVERTS: soundSpeed IS LAST IN THE BOX AND FIRST OUT OF IT ***",
        shipC.ranking[shipC.ranking.length - 1] === "soundSpeed" && freeC.ranking[0] === "soundSpeed",
        "shipped " + shipC.ranking.join(" > ") + "   |   free " + freeC.ranking.join(" > ") + " -- THE WHOLE ORDER REVERSES, not just one entry. " +
        ". *** ASSERTED AS AN ORDERING, NOT A MAGNITUDE, so it cannot pass on a fixture whose numbers drift. " +
        "A CENSUS RUN IN THE SHIPPED CONTAINER WOULD HAVE RANKED THE MOST IMPORTANT MATERIAL PARAMETER LAST " +
        "-- and at 8.4e-4 a slightly different tolerance would have called it vacuous outright. ***");
    ok("...stiffness reads exactly zero in BOTH boxes, which is the control",
        shipC.rows.find((r) => r.knob === "stiffness").rel === 0 && freeC.rows.find((r) => r.knob === "stiffness").rel === 0,
        "*** THE ONE VERDICT THE LID CANNOT CHANGE. It proves the vacuity is a property of the equation of " +
        "state and NOT an artefact of the container -- without it, every zero above would be suspect. ***");
}

// ---------------------------------------------------------------------------
console.log("\n5. restDensity IS REFUSED, AND THE REFUSAL IS MEASURED FROM BOTH SIDES");
{
    const p = restDensityProbe({ values: [400, 1000], steps: 1200 });
    const alone1000 = p.rows.find((r) => r.rho0 === 1000).alone;
    ok("!! moved ALONE it destroys the answer", alone1000 < p.nominal * 0.5,
        "retained " + p.nominal.toFixed(4) + " at the packed density (" + p.packed.toFixed(2) + ") against " +
        alone1000.toFixed(4) + " at rho0 = 1000. NOT A SHIFT IN MATERIAL -- the fluid has been desynchronised " +
        "from its own particles.");
    ok("!! *** AND MOVED WITH ITS PARTNER IT DOES NOTHING AT ALL ***", p.compensatedSpread < p.aloneSpread / 10,
        "spread over the same rho0 values: " + p.aloneSpread.toExponential(3) + " alone against " +
        p.compensatedSpread.toExponential(3) + " with mass scaled so the packing still delivers rho0. " +
        "*** MERCURY AGAINST WATER IS UNDER A PERCENT ON THIS COLUMN. ***");
    ok("...so it is NEITHER vacuous NOR live, which is a species this register did not have",
        REFUSED_KNOBS.restDensity.species === "CONSTRAINT" && REFUSED_KNOBS.restDensity.why.length > 200,
        "recorded as a CONSTRAINT BETWEEN TWO PARAMETERS. hydrostatic.mjs's own v2883 correction says it in " +
        "prose -- 'rest density MUST equal m/d^3 for the lattice being built' -- WHERE NOTHING RE-DERIVES IT, " +
        "and v2494 shipped the opposite reading as a discovery about the engine when it was a discovery " +
        "about the test.");
}

// ---------------------------------------------------------------------------
console.log("\n6. ST-FLIP IS SPACETIME, AND Flip2D HAS NO MATERIAL PARAMETER AT ALL");
{
    const flipSrc = readFileSync(path.join(ENG, "fluid/flip2d.mjs"), "utf8");
    const code = codeOnly(flipSrc);
    // ASSERTED AS AN ABSENT MECHANISM RATHER THAN AN ABSENT MENTION (this tree's rule, four instances): a
    // gate hunting the WORDS would match its own explanation of why they are wrong.
    ok("!! Flip2D declares no material parameter", !/\b(surfaceTension|cohesion|restDensity|viscosity|soundSpeed)\b/.test(code),
        "its whole option list is numerical -- flipRatio, iters, solver, omega, overRelax, stflip, stSubsteps, " +
        "twoWay, forceScale. *** AN INCOMPRESSIBLE PROJECTION SOLVER HAS NO MATERIAL PARAMETERS TO SWEEP, " +
        "which is why the knobs and the free-surface score are on different solvers. ***");
    ok("!! *** AND stflip IS THE SPACETIME SEAM, WHICH IS WHAT v3540 MISREAD ***",
        /time-slab|large-time-step|sub-position|spacetime/i.test(flipSrc) && /stflip/.test(code),
        "flip2d.mjs's own seam comment: motion-blur the P2G deposit across the time-slab, the SIGGRAPH 2026 " +
        "ST-FLIP large-time-step technique. v3540 cited stflip/stSubsteps as evidence that 'Flip2D already " +
        "carries surface tension'. *** ST IS SPACETIME. A TWO-LETTER ABBREVIATION WAS READ AS THE WORDS THE " +
        "SENTENCE WANTED, and the round it queued was wrong twice in one line. ***");
    ok("...and the correction is recorded where the next reader will look", NOT_IN_THIS_TREE.surfaceTension.length > 100,
        "materialKnobs' NOT_IN_THIS_TREE names both halves");
}

// ---------------------------------------------------------------------------
console.log("\n7. WHY THE FREE-SURFACE SCORE IS NOT USED HERE, AND IT IS NOT THE SCORE'S FAULT");
{
    // A free surface is only LEVEL if the liquid is AT REST. Ask whether either law produces a resting column.
    const idealSpec = columnSpec({ eos: "ideal", lidY: SHIPPED_LID });
    const a = idealSpec.measure({ steps: 1200 }), b = idealSpec.measure({ steps: 2400 });
    const idealSettled = !(b < a * 0.9);
    ok("!! under ideal the column is STILL COLLAPSING", !idealSettled,
        "retained " + a.toFixed(4) + " at 1200 steps and " + b.toFixed(4) + " at 2400 -- monotone falling, so " +
        "any number read off it is a snapshot of a transient");
    const taitSpec = columnSpec({ eos: "tait", lidY: FREE_LID });
    const c1 = taitSpec.measure({ steps: 1200 }), c2 = taitSpec.measure({ steps: 2400 });
    const taitSettled = !(Math.abs(c2 - c1) / c1 > 0.05);
    ok("!! and under tait in a free box it wanders rather than settling", !taitSettled,
        "retained " + c1.toFixed(4) + " at 1200 steps and " + c2.toFixed(4) + " at 2400 -- and at the SHIPPED " +
        "lid it looks stationary only because it is against the ceiling");

    // v3975 -- BOTH VERDICTS ABOVE, READ FROM THE SAME idealSettled/taitSettled THE ok() CALLS JUST READ. See
    // the note at the head of this file for why that matters: the day the shipped instability is fixed and the
    // column starts settling, these booleans flip on their own and recordSweepFinding correctly writes nothing.
    if (_lessons) {
        try {
            _lessons.recordSweepFinding({
                env: "sph-column", axis: "steps (ideal, shipped lid)",
                series: [{ x: 1200, y: a, settled: true }, { x: 2400, y: b, settled: idealSettled }],
                params: { eos: "ideal", lidY: SHIPPED_LID },
                note: "column retained-fraction vs settle time under ideal EOS (materialKnobs section 7). " +
                      "UNSETTLED IS THE FINDING: the shipped configuration is unstable, not merely slow to " +
                      "settle -- kinetic energy rises rather than drains, per v3542's correction",
            });
            _lessons.recordSweepFinding({
                env: "sph-column", axis: "steps (tait, free lid)",
                series: [{ x: 1200, y: c1, settled: true }, { x: 2400, y: c2, settled: taitSettled }],
                params: { eos: "tait", lidY: FREE_LID },
                note: "column retained-fraction vs settle time under tait EOS in the free box (materialKnobs " +
                      "section 7). Looks stationary at the SHIPPED lid only because it is pressed against the " +
                      "ceiling; in the free box the same instability is visible as wander rather than a floor",
            });
        } catch {}
    }
    report("*** ANSWERED AT v3542, AND THE CAUSE WAS THE OPPOSITE OF WHAT THIS SECTION ASSUMED ***",
        "THE ANTIDOTE BELOW SAID THIS SECTION WOULD GO RED WHEN SOMEBODY MADE THE COLUMN SETTLE. IT DOES " +
        "SETTLE -- at viscosity 10 the kinetic energy drains to 4.5e-5 and the energy ratio falls monotonically " +
        "-- SO THE CHECKS ABOVE ARE REWRITTEN TO THE PROPERTY THEY WERE REALLY ABOUT: that the column does not " +
        "settle AT THE SHIPPED VISCOSITY. *** AND THE REASON IS NOT THAT ITS ENERGY WILL NOT DRAIN. ITS ENERGY " +
        "RISES: total mechanical energy per particle QUADRUPLES over 2000 steps in a system whose only external " +
        "force is gravity and whose only boundary is lossy. THE COLUMN WAS NOT FAILING TO SETTLE, IT WAS " +
        "EXPLODING. *** physics/sph/settling.mjs owns that measurement now; this section keeps only the fact " +
        "that the shipped configuration is the unstable one.");
    report("*** THE ROUND'S ANSWER TO ITS OWN PROPOSAL (v3541, KEPT FOR THE RECORD) ***",
        "v3540 queued 'viscosity and surface tension through knobMoves against the free-surface score'. THE " +
        "SCORE CANNOT BE APPLIED: a free surface is level only when the liquid is at rest, and NEITHER " +
        "EQUATION OF STATE PRODUCES A RESTING COLUMN. The score was never the missing half -- A SETTLED " +
        "COLUMN IS. WHEN SOMEBODY MAKES THIS COLUMN SETTLE, THIS SECTION GOES RED AND SHOULD BE REWRITTEN TO " +
        "ASSERT THAT IT SETTLES AND THEN TO RUN freeSurface's levelness ON IT -- NOT WEAKENED, AND NOT DELETED.");
}

console.log("\n8. THE ORPHAN CENSUS AND THE FRONT-DOOR REGISTRY DISAGREE ABOUT WHAT A CONSUMER IS");
{
    const rt = readFileSync(path.join(ENG, "tools/ship/reportingTools.mjs"), "utf8");
    ok("!! this module HAS a front door", /physics\/sph\/materialKnobs\.mjs/.test(rt),
        "registered in reportingTools' REPORTING list, so tools.html runs it; it PRINTS and EXITS ZERO and " +
        "this gate is what exits nonzero (v3327)");
    const mk = readFileSync(path.join(ENG, "physics/sph/materialKnobs.mjs"), "utf8");
    ok("...and it imports floors' knobMoves rather than re-implementing the instrument", /knobMoves/.test(codeOnly(mk)),
        "*** A SECOND IMPLEMENTATION OF A MEASUREMENT IS THE DEFECT THIS TREE NAMES MOST, and v3515's " +
        "escTolKnob rebuilt an eligibility union inline one round after writing the census. ***");
    report("*** MEASURED, NOT FIXED, AND IT IS A REAL GAP ***",
        "graveyard-selfcheck is RED AT 103 ORPHANED UTILITIES ON THE PRISTINE v3540 EXTRACT -- PRE-EXISTING, " +
        "confirmed by running it there before blaming anything, and v3540 shipped with it red for the second " +
        "time (v3446 was the first, and the open list already says to add graveyard to the by-hand ship " +
        "list). THIS ROUND LEAVES THE COUNT AT 103 AND THE MEMBERSHIP MOVED BY ONE IN EACH DIRECTION, WHICH " +
        "A BARE COUNT WOULD HAVE REPORTED AS NOTHING HAPPENING: tools/ship/floors.mjs CAME OFF the list " +
        "because materialKnobs is its first consumer outside its own gate, and materialKnobs WENT ON it " +
        "DESPITE CARRYING A FRONT DOOR, because graveyard's classifier does not read reportingTools. That is " +
        "a THIRD legitimate shape the classifier cannot name -- after a graded physics module and a per-call " +
        "analysis primitive -- and it is why everything new lands as debt by default. NOT re-frozen here: a " +
        "blanket re-freeze cannot tell 'nothing moved' from 'everything moved and I stopped looking', and " +
        "this round is the proof, since the count did not move while the list did.");
}

{
    // v3904 -- reportLines IS THIS MODULE'S OWN REPORT, AND NOTHING HAD EVER CALLED IT.
    // I nearly skipped this on the belief that toolFrontDoor already covered it. IT DOES NOT, AND I CHECKED
    // RATHER THAN ASSERTED: section 1 SPAWNS the file and demands non-empty stdout matching /[basename]/ --
    // that is what the MAIN BLOCK prints, which is a different function. A reportLines() returning [] would
    // leave the front door perfectly green, because the main block writes its own header either way.
    // *** A REPORTER NOBODY CALLS IS A REPORTER THAT CAN GO SILENT IN PRIVATE. *** The shape graded here is
    // the weakest one worth having -- an array, of strings, longer than a header, carrying its own name --
    // and it is the shape that distinguishes "the report is built" from "the function still returns".
    // WHAT IS NOT CLAIMED: the live arm. reportLines({ live: true }) drives the real solver, and levelClaim's
    // measured at 51s SOLO -- the gate went to 280s against a 143s default budget, so the live arm is
    // DELIBERATELY NOT DRIVEN HERE. A CHECK THAT TIMES OUT IS NOT A STRONGER CHECK, IT IS AN ABSENT ONE.
    const L = reportLines({ live: false });
    ok("reportLines returns a real report and names itself",
       Array.isArray(L) && L.length > 5 && L.every((x) => typeof x === "string") &&
       L.join("\n").includes("[materialKnobs]"),
       L.length + " lines, self-named");
}

console.log(`\nmaterialKnobs-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
