// tools/roundhouse/conservationReach-selfcheck.mjs
//
// v3525 -- GRADES THE CENSUS THAT PUTS A NUMBER ON v3132'S WARNING.
//
// v3132 said a fifth criterion is a BATTERY CHANGE EVERY DEVICE MUST SURVIVE and several would not. That
// ordered the round list for hundreds of versions on a REMEMBERED "several". The census says the cost is not
// that several would fail -- IT IS THAT NOT ONE DEVICE CAN BE ASKED -- and section 3 is why: auditConservation
// needs a TIME SERIES, thirty devices already check conservation, and every one of them collapses its series
// to a scalar inside the bind before anything shared can see it.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { reach, seriesReach, shapedCandidates, handRolled, auditedSeries, reportLines, SHAPED, MIN_SAMPLES } from "./conservationReach.mjs";
import { auditConservation, isExact } from "./conservation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("conservationReach-selfcheck -- what criterion five would cost\n");

const R = reach();

// ---------------------------------------------------------------------------
console.log("1. THE SERIES CENSUS IS DERIVED, AND IT IS THE EXACT HALF");
{
    ok("the corpus is the frozen baseline, not a list held here", R.pairs > 200 && R.devices > 50,
        R.pairs + " pairs, " + R.devices + " devices -- and it can only be asked at all because v3520 taught " +
        "the baseline to keep ARRAYS; a numbers-only corpus could not have answered this question");
    ok("!! numeric series long enough for auditConservation exist", R.series.length > 0,
        R.series.length + " fields across " + R.seriesPairs.length + " pairs, floor " + MIN_SAMPLES +
        " samples -- READ FROM THE MODULE'S OWN MINIMUM, not chosen here");

    // *** THE DECISIVE FACT, AND IT IS DERIVED RATHER THAN JUDGED: no field is BOTH a series AND
    // conservation-shaped. Saying "none of them is a conserved quantity" would be my reading; this is the
    // measurable form of the same claim and it needs no physics from me.
    // *** v3526 -- THE v3525 ANTIDOTE NAMED THE RIGHT RESPONSE AND THE DETECTOR COULD NOT SEE THE EVENT. ***
    // It said this line would go RED when a device emitted a conserved series, and one now does -- kepler's
    // `energySeries`. IT DID NOT FIRE, because SHAPED matches `energyErr` and not `energySeries`. A NAME SCAN
    // CANNOT WATCH FOR SOMETHING IT CANNOT SPELL. So the property moved to where it cannot be missed: WHICH
    // BINDS ACTUALLY PASS A SERIES TO auditConservation, derived from code rather than from a name.
    // *** v4000 -- A SECOND DEVICE IS WIRED, SO THE ANTIDOTE BELOW FIRES AND THIS IS THE REWRITE IT ASKED FOR.
    // *** v3525 wrote it in advance: "WHEN A SECOND DEVICE IS WIRED, `audited.length >= 1` STOPS BEING
    // INTERESTING AND SHOULD BE REWRITTEN TO COUNT AGAINST THE 30 CANDIDATES -- NOT WEAKENED, NOT DELETED."
    // v3994's lotkaVolterra is that second device, wired at v4000 when conservationReach caught it hand-rolling
    // the algorithm. FIFTH COLLECTION OF v3196's IDIOM, and the second in this file where the line named its
    // own successor rather than merely its own death.
    //
    // The number to watch is audited AGAINST THE CANDIDATE POOL, because `>= 1` would stay green through 28
    // more devices doing it by hand. A RATCHET THAT CANNOT TIGHTEN IS A FLOOR NOBODY WILL EVER RAISE.
    const audited = auditedSeries();
    const CANDIDATES = R.devicesShaped.length;   // the same pool section 2 reports: devices with a conservation-shaped field
    ok("!! *** SERIES AUDITED BY THE SHARED MODULE, AGAINST THE POOL THAT COULD BE ***", audited.length >= 2,
        audited.length + " of " + CANDIDATES + " candidate devices: " + audited.map((a) => a.device).join(", ") +
        ". Was ZERO at v3525 and ONE at v3526. RAISE THIS FLOOR WHEN A THIRD IS WIRED -- that is what makes it " +
        "a ratchet rather than a plaque.");
    const both = R.series.filter((x) => SHAPED.test(x.field));
    ok("the NAME scan still reports none, which is the correction rather than the finding", both.length === 0,
        "SHAPED cannot spell `energySeries`, so the keyword half stayed silent through the very event it was " +
        "written to catch. THE KEYWORD PROBE HAS MISLED THIS PROJECT FOUR TIMES NOW.");
    report("THE ANTIDOTE, COLLECTED AND RE-ARMED",
        "*** v3525's version of this line FIRED at v4000 and the check above is its rewrite. THE NEXT ONE: " +
        "when a THIRD device is wired, raise the floor from 2 to 3 -- NOT WEAKENED, NOT DELETED. The number to " +
        "watch is audited against the candidate pool, and it is " + audited.length + "/" + CANDIDATES +
        " today. A floor that never rises is a plaque commemorating the day somebody did the work once. ***");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE CANDIDATE LIST IS A CANDIDATE LIST, AND SAYS SO");
{
    ok("conservation-shaped names are plentiful", R.shaped.length > 20,
        R.shaped.length + " fields across " + R.devicesShaped.length + " devices");
    // *** v4145 -- "AND EVERY ONE OF THEM IS A SCALAR" WENT RED, WHICH IS THIS GATE'S OWN PREDICTION COMING
    // TRUE. *** Section 4 named the event in advance and said what to do about it: "IT SHOULD BE REWRITTEN TO
    // COUNT HOW MANY DO -- NOT WEAKENED, AND NOT DELETED." So it counts, and the count is a FLOOR that can
    // only be raised, in the same shape as section 1's audited ratchet.
    //
    // WHAT ACTUALLY LANDED: mpmrefine emits comDrift as an array in both its modes. That is a real conserved
    // quantity -- centre-of-mass drift is momentum conservation -- and a real series, not a naming accident.
    //
    // *** BUT IT IS NOT YET EVIDENCE CRITERION FIVE COULD RUN, AND SECTION 4's ANTIDOTE SAID IT WOULD BE. ***
    // The antidote was written before anybody knew what the first series would look like, and this one fails
    // its expectation TWICE OVER:
    //   1. LENGTH -- two samples against auditConservation's floor of four. Section 3 below proves the module
    //      REFUSES a short series rather than guessing, so it would refuse this one.
    //   2. WHAT THE INDEX MEANS, WHICH MATTERS MORE. mpmRefineBind builds `rows` as `c.levels.map(...)` and
    //      then `out.comDrift = rows.map(r => r.comDrift)` -- ONE VALUE PER GRID REFINEMENT LEVEL, not per
    //      timestep. auditConservation compares "the worst excursion in the FIRST half of the run against the
    //      worst in the SECOND" and reads growth as an ACCUMULATING SCHEME. Across refinement levels that
    //      comparison measures CONVERGENCE, not drift, and calling it conservation would be a category error.
    //      Each element is ALREADY a collapsed scalar -- |d com.y/dt| over the rest window at that level.
    // A NAME-AND-SHAPE MATCH THAT IS NOT THE THING: the keyword probe has misled this project four times by
    // this file's own count, and taking this as criterion five's green light would have been the fifth.
    const nonScalar = R.nonScalar;   // derived ONCE in conservationReach.mjs; this file no longer computes its own
    ok("!! *** conservation-shaped fields that are SERIES rather than scalars -- a floor, counted not assumed ***",
        nonScalar.length >= 2,
        nonScalar.length + " of " + R.shaped.length + " shaped fields are arrays: " +
        nonScalar.map((n) => n.key + "." + n.field + " [" + n.samples + " samples]").join(", ") +
        ". Was ZERO from v3525 to v4093. RAISE THIS FLOOR WHEN A THIRD APPEARS -- the same ratchet rule " +
        "section 1 runs on, and the reason this line is a count instead of the equality it used to be.");
    const auditableNow = nonScalar.filter((n) => n.longEnough);
    ok("!! *** ...and NOT ONE OF THEM IS LONG ENOUGH TO AUDIT, so criterion five still cannot run once ***",
        auditableNow.length === 0,
        "0 of " + nonScalar.length + " reach MIN_SAMPLES=" + MIN_SAMPLES + " (both are 2). *** WHEN THIS GOES " +
        "RED IT IS GOOD NEWS AND MUST NOT BE FLIPPED BACK: rewrite it to assert the long-enough ones are " +
        "TIME-INDEXED before auditing them. A refinement-level series passing the length floor is still the " +
        "wrong shape -- length was never the only thing standing in the way. ***");
    report("WHY THIS HALF IS NOT A VERDICT",
        "whether a field named `drift` is a CONSERVED quantity is a PHYSICAL JUDGEMENT and it is Keith's. THE " +
        "KEYWORD PROBE HAS MISLED THIS PROJECT THREE TIMES, so the name scan is reported APART from the two " +
        "facts above, which are derived.");
}

// ---------------------------------------------------------------------------
console.log("\n3. TWO DECLARATIONS OF ONE ALGORITHM, AND THE SHARED ONE ARRIVED SECOND");
{
    const hr = handRolled();
    ok("!! binds compute a first/second-half comparison themselves", hr.length > 0,
        hr.map((h) => h.file).join(", "));
    // *** THIS ASSERTED "NONE OF THEM IMPORTS conservation.mjs" AT v3525 AND IT IS NOW FALSE, WHICH IS THE
    // ROUND WORKING. *** keplerBind imports it and calls it BESIDE the hand-rolled fields rather than instead
    // of them, because those four are FROZEN IN TWO BASELINES: a refactor that quietly moved a frozen number
    // would be the regression this lab exists to catch. Rewritten to the new property, NOT weakened.
    ok("!! *** THE HAND-ROLLED BIND NOW IMPORTS THE SHARED MODULE ***", hr.every((h) => h.importsSharedModule),
        hr.map((h) => h.file + (h.importsSharedModule ? " (wired)" : " (NOT WIRED)")).join(", ") +
        " -- the second declaration is now compared against the first every run rather than merely coexisting");
    // *** v4000 -- THIS PINNED THE COUNT AT ONE AND WENT RED THE MOMENT A SECOND REAL BIND ARRIVED. ***
    // v3994's lotkaVolterraBind is a GENUINE second hand-rolled declaration -- not the prose false positive
    // this line was written about -- so the pin was failing on the thing it wanted to happen: a new device
    // wired to the shared criterion. REWRITTEN TO THE PROPERTY, NOT WEAKENED, which is what the antidote note
    // at the foot of this file has been asking for since v3525.
    //
    // The property worth keeping is that the DETECTOR IS ACCURATE, not that the count is small. v3525's
    // detector ran over RAW SOURCE and matched discoveryBind's line 6 -- A COMMENT explaining kepler's
    // observable. PROSE-AS-CODE, in the round whose subject was second declarations. codeOnly() blanks it now
    // -- AND THE FIRST FIX BROKE THE IMPORT CHECK THE SAME WAY IN REVERSE, because codeOnly ALSO blanks STRING
    // LITERALS and an import path is a string. codeOnly FOR AN IDIOM, noComments FOR TEXT THE CODE CONTAINS.
    //
    // So the false positive is named directly. It cannot come back without this going red, and a legitimate
    // third bind does not have to fight the gate to be added.
    const prose = hr.filter((h) => /discoveryBind/.test(h.file));
    ok("!! *** EVERY hand-rolled declaration found is a REAL one -- no prose counted as code ***",
        prose.length === 0,
        prose.length ? "PROSE COUNTED AS CODE: " + prose.map((h) => h.file).join(", ") +
                       " -- codeOnly() has stopped blanking comments, which is the v3525 defect returning"
                     : hr.length + " genuine: " + hr.map((h) => h.file).join(", ") +
                       "  (discoveryBind, the v3525 false positive, is correctly absent)");
    report("the number to watch",
        hr.length + " hand-rolled declarations, " + hr.filter((h) => h.importsSharedModule).length +
        " of them wired to the shared module. THE COUNT IS REPORTED RATHER THAN PINNED: pinning it at ONE made " +
        "this line fail the moment v3994 added a second REAL bind, which is the outcome the gate wants. What " +
        "must stay true is the assertion above it -- every one of them is wired.");

    // *** THE LOAD-BEARING NEGATIVE: they are the SAME algorithm, shown by driving both on one series. ***
    // kepler/conserve reports energyErrFirstHalf, energyErrSecondHalf and energyGrowthRatio. That IS
    // auditConservation's growth. Demonstrated rather than asserted from the field names.
    const series = [1, 1.5, 0.6, 1.4, 0.5, 1.6, 0.4, 1.8];
    const q0 = series[0], dev = series.map((v) => Math.abs(v - q0));
    const mid = Math.floor(series.length / 2);
    const first = Math.max(...dev.slice(0, mid)), second = Math.max(...dev.slice(mid));
    const handRolledGrowth = second / first;                 // what a bind computes inline
    const a = auditConservation(series);
    ok("!! *** THE SHARED MODULE AND THE HAND-ROLLED FORM AGREE TO THE BIT ***",
        Object.is(a.growth, handRolledGrowth),
        "growth " + a.growth + " both ways. THE BINDS ARE NOT DOING SOMETHING DIFFERENT -- they are doing THIS, " +
        "separately, which is exactly why a shared criterion is possible and exactly why nothing noticed.");
    ok("...and the module reports EXACT apart from small", isExact([2, 2, 2, 2]) && a.verdict !== "exact",
        "conserved-by-construction and conserved-to-a-tolerance are different claims, and merging them invites " +
        "somebody to loosen the tolerance later");
    ok("a series shorter than the floor is REFUSED, not guessed at",
        auditConservation([1, 2]).verdict === "too-short",
        "a verdict on two samples would be a confident answer about nothing");
}

// ---------------------------------------------------------------------------
console.log("\n4. IT IS A REPORT, AND THE CONSEQUENCE IS STATED RATHER THAN ACTED ON");
{
    const lines = reportLines();
    ok("the report names itself in brackets", /^\[conservationReach\]/.test(lines[0]), lines[0].slice(0, 60));
    ok("and it states the consequence", lines.some((l) => /STOP COLLAPSING AND START EMITTING/.test(l)));
    const src = fs.readFileSync(path.join(HERE, "conservationReach.mjs"), "utf8");
    ok("!! it does NOT wire a fifth criterion", !/corroborateFully|c5_|criteria\.c5/.test(src),
        "*** CRITERION FIVE IS NOT A WIRING JOB: " + R.devicesShaped.length + " devices would have to change " +
        "WHAT THEY RETURN before it could run once. That is LARGER than v3132 feared, and it is now a " +
        "measurement rather than a memory. ***");
    report("THE ANTIDOTE FIRED, AND IT WAS PARTLY WRONG -- BOTH HALVES RECORDED",
        "*** v4145: the old antidote said a conserved series appearing would be 'the first evidence criterion " +
        "five could ever run', and told its successor to COUNT rather than weaken. THE COUNT WAS RIGHT AND " +
        "SECTION 2 NOW DOES IT. THE EXPECTATION WAS WRONG: mpmrefine's comDrift is a series indexed by " +
        "REFINEMENT LEVEL, and auditConservation's first-half-versus-second-half reads an index as TIME. A " +
        "series can satisfy every shape test this gate can write and still be the wrong quantity, which is " +
        "the keyword probe's failure mode wearing a new costume -- the fifth time in this file's history. ***");
    report("THE ANTIDOTE, RE-ARMED AND NARROWED",
        "*** THE NEXT EVENT TO WATCH IS NOT 'A SERIES APPEARS' -- ONE HAS. It is section 2's second check " +
        "going red: a conservation-shaped series reaching " + MIN_SAMPLES + " samples. WHEN THAT HAPPENS, DO " +
        "NOT AUDIT IT ON LENGTH ALONE. Establish first that its index is TIME rather than a refinement level, " +
        "a parameter sweep, or a mode list -- and if it is, THAT is when criterion five gets its first real " +
        "candidate, and section 1's floor of " + R.audited.length + " can rise. NOT WEAKENED, NOT DELETED. ***");
}

console.log(`\nconservationReach-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
