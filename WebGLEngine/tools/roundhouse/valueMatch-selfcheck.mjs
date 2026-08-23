// tools/roundhouse/valueMatch-selfcheck.mjs
//
// v3364 -- A THIRD COUPLING AXIS, AND AN HONEST ACCOUNT OF HOW NOISY IT IS.
//
// Three couplings found by hand escaped both existing census axes. Two of them share a VALUE and nothing else --
// no observable name, no module -- which is mechanically findable: collect every numeric observable from every
// device and look for agreements across devices.
//
// IT WORKS ON THE KNOWN CASE, which is the first thing to establish: lens/shadow.shadowAngleRad and
// probe/emit.emitConeRad agree at 2e-15 and the scan finds them. A person had to notice that connection; the
// scan does not.
//
// *** AND THE NAIVE VERSION IS USELESS. *** The first run returned 132 matches dominated by 0.5 -- friction's
// mu, plastic's cap, kepler's eccentricity, kerr's horizon angular velocity -- all exactly 0.5 because a human
// typed 0.5 into each config. Excluding values that survive rounding to six significant figures cuts it to 23,
// and the survivors are STILL mostly simple rationals: four normalised quantities at 1.0, a mass ratio and an
// eccentricity that both happen to be 1/3.
//
// So this axis reports CANDIDATES, exactly as the name axis does, and for the same reason: a match is a reason
// to look, not a coupling.
//
// COST IS THE BINDING CONSTRAINT AND IT IS MEASURED. Scanning all 54 devices does not finish -- twof alone takes
// 217 SECONDS. Forty-one build in under 300ms and are scanned; the thirteen slow ones are named with their
// measured cost, so the exclusion is a stated decision rather than a silent omission.

import { valueMatchCensus, humanTypeable, SLOW_DEVICES, ADJUDICATED, survivesPerturbation,
    UNITY_BY_CONSTRUCTION, unityCluster,
         valueMatches, collectObservables } from "./valueMatch.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const cen = await valueMatchCensus();

// ---- 1. IT FINDS THE COUPLING A PERSON HAD TO NOTICE ------------------------------------------------------------
{
    const known = cen.matches.find((h) => /shadowAngleRad/.test(h.a.key + h.b.key) && /emitConeRad/.test(h.a.key + h.b.key));
    ok("!! the scan finds the shadow / escape-cone coupling mechanically",
        !!known && known.rel < 1e-12,
        known ? `matched at relative ${known.rel.toExponential(1)}. lens computes it tracing rays inward from a ` +
                "distant observer; emit computes it from the impact parameter of an outgoing signal. No shared " +
                "name, no shared module -- invisible to both existing axes and found here without being told"
              : "NOT FOUND -- the axis fails its one verified case");
}

// ---- 2. THE HUMAN-TYPEABLE FILTER IS WHAT MAKES IT USABLE ----------------------------------------------------------
{
    ok("!! values a person could have typed are excluded",
        humanTypeable(0.5) && humanTypeable(2) && humanTypeable(1e-3) && humanTypeable(0.02),
        "the unfiltered scan returned 132 matches dominated by 0.5, which appears as friction's mu, plastic's " +
        "cap, kepler's eccentricity and kerr's horizon angular velocity. Four unrelated devices, one number, " +
        "zero physics -- because a human typed it into each config");

    ok("...and a value that could not be typed survives",
        !humanTypeable(0.2490415079291834) && !humanTypeable(99.345882657961),
        "0.2490415079291834 has more significant digits than anyone types. That is the signature of a computed " +
        "quantity, and the filter keeps exactly those");

    // CORRECTION: this asserted `matches < 30`, a count I took from one run. Adding the nuclear device pushed it
    // to 32 and the gate failed on growth rather than on regression -- the corpus grows every time a device is
    // added, so an absolute bound is a magic number with a shelf life. The property meant was the FILTER'S
    // EFFECT, which is measured here against the unfiltered count in the same run.
    const unfiltered = valueMatches(await collectObservables(), 1e-10, true);
    ok("!! the human-typeable filter removes most of the noise",
        unfiltered.length / Math.max(cen.matches.length, 1) > 4,
        `${unfiltered.length} raw matches cut to ${cen.matches.length}, a factor of ` +
        `${(unfiltered.length / cen.matches.length).toFixed(1)}. Measured in this run rather than quoted from an ` +
        "earlier one, so adding a device grows both numbers and the assertion still means what it says");
}

// ---- 3. COST IS MEASURED AND THE EXCLUSION IS STATED ----------------------------------------------------------------
{
    ok("!! slow devices are named with their measured cost, not silently dropped",
        Object.keys(SLOW_DEVICES).length >= 10 && SLOW_DEVICES.twof > 100000,
        `${cen.scannedDevices} devices scanned, ${cen.skippedDevices} skipped. twof alone builds in ` +
        `${(SLOW_DEVICES.twof / 1000).toFixed(0)} seconds, kh in ${(SLOW_DEVICES.kh / 1000).toFixed(0)}. A scan ` +
        "that quietly omitted them would report a coverage it does not have");

    ok("...and the scan actually collected a substantial corpus",
        cen.observables > 500,
        `${cen.observables} numeric observables across ${cen.scannedDevices} devices. The cheap set is most of ` +
        "the lab, so the cost exclusion loses breadth rather than the bulk of it");
}

// ---- 4. CANDIDATES, NOT CLAIMS ----------------------------------------------------------------------------------------
{
    ok("!! one candidate is flagged UNADJUDICATED rather than claimed",
        /UNADJUDICATED/.test(ADJUDICATED["twobody/orbit.periodExact|probe/capture.properTime"] || ""),
        "twobody's exact orbital period and probe's proper time to capture both read 99.345882657961, which is " +
        "pi*sqrt(1000) -- exactly HALF the Kepler period at a = 10. That smells like two devices sharing a " +
        "configuration rather than a physical identity, and it has not been run down. Recording it as open is " +
        "the honest state; asserting either way without checking is what this register prevents");

    ok("...and the backlog is matches minus ADJUDICATED, so a rejection counts as progress",
        cen.open === cen.matches.length - cen.adjudicated && cen.adjudicated >= 1,
        `${cen.matches.length} matches, ${cen.adjudicated} adjudicated, ${cen.open} open. Same accounting as the ` +
        "name axis: a candidate ruled out is finished work, and counting it as outstanding would mean the " +
        "number could never reach zero");
}


// ---- 5. PERTURBATION NARROWS THE CANDIDATES, AND IT IS A FILTER RATHER THAN A VERDICT ------------------------------
//
// v3364 left 22 candidates open. Scaling every config knob of both devices by one factor and re-checking the
// equality cuts them mechanically: 23 matches become 3 survivors, 3 clean breaks, and 17 untestable.
//
// *** BUT "SURVIVES" MEANS SHARED SCALING FAMILY, NOT SAME QUANTITY. *** A uniform scaling preserves any
// equality between quantities with the same dimensional scaling. twobody's orbital period goes as a^1.5/mu^0.5
// and probe's infall proper time as r0^1.5/M^0.5 -- both Kepler-family, so the equality rides through while they
// remain a PERIOD and a PROPER TIME. Related by real physics, not one quantity computed twice.
//
// A CORRECTION KEPT ON PURPOSE: I first refuted this test by hand, setting twobody's config to { a, mu } and
// watching the numbers diverge. twobody has no `mu` knob -- it takes m1 and m2 -- so the key was silently
// ignored and I compared a perturbed probe against an unperturbed twobody. The tool was right and my refutation
// was wrong, and a correct filter was one step from being thrown away over it.
{
    const verdicts = {};
    for (const h of cen.matches) {
        const v = await survivesPerturbation(h);
        verdicts[v.verdict] = (verdicts[v.verdict] || 0) + 1;
    }
    // CORRECTION: this asserted `survives <= 5`, a count taken from one run of a smaller lab. Devices added
    // since pushed it to 9 and the gate failed on GROWTH rather than regression -- the third magic number of
    // mine to do exactly this. The property meant is that perturbation NARROWS the candidate list, which is a
    // ratio between what it tested and what survived, and that survives as the lab grows.
    const testable = (verdicts.survives || 0) + (verdicts.breaks || 0);
    ok("!! perturbation narrows the testable candidates rather than passing them all",
        testable > 0 && (verdicts.survives || 0) / testable < 0.75,
        `${JSON.stringify(verdicts)} -- ${(verdicts.survives || 0)} of ${testable} testable pairs survive, ` +
        `${((verdicts.survives || 0) / testable * 100).toFixed(0)}%. Equalities that hold only at the default ` +
        "configuration are a property of the defaults rather than of the physics, and this separates them " +
        "without a person reading either device. Stated as a FRACTION so adding devices grows both sides");

    ok("!! and 'survives' is honestly labelled as a scaling family, not an identity",
        /SCALING FAMILY/.test(String(await import("node:fs").then((fs) => fs.readFileSync(new URL("./valueMatch.mjs", import.meta.url), "utf8")))),
        "a uniform scaling cannot distinguish two Kepler-family quantities from one quantity computed twice. " +
        "Calling the survivors couplings would automate a verdict the test does not support -- they are a " +
        "shortlist, and the last step is still a person");

    ok("...and untestable cases are reported as such rather than counted either way",
        (verdicts.untestable || 0) > 0,
        `${verdicts.untestable} pairs could not be moved -- a device with no numeric knob, or an observable that ` +
        "does not respond to its own knobs. Scoring those as survivors would inflate the shortlist with cases " +
        "the test never actually examined");
}

console.log();
console.log(`  value-match census: ${cen.matches.length} matches, ${cen.adjudicated} adjudicated, ${cen.open} open`);
if (fails) { console.log("valueMatch-selfcheck: " + fails + " FAILURES"); process.exit(1); }
// ---- v3367: THE UNITY CLASS ---------------------------------------------------------------------------------
{
    const { conservedPair, nearSmallInteger } = await import("./valueMatch.mjs");
    ok("!! *** a value within float error of a small integer is recognised as such ***",
        nearSmallInteger(0.9999999999768472) === 1 && nearSmallInteger(3) === null && nearSmallInteger(0.5) === null,
        "0.9999999999768472 is 1 WEARING FLOAT ERROR. humanTypeable excludes values a person could have TYPED " +
        "and says nothing about ones a computation CONVERGED to -- which is the gap this closes");

    ok("!! *** conservedPair fires on two sides that share a small integer, and not otherwise ***",
        conservedPair({ a: { value: 0.99999999998 }, b: { value: 1.0000000001 } }) === 1 &&
        conservedPair({ a: { value: 1 }, b: { value: 2 } }) === null &&
        conservedPair({ a: { value: 3.7 }, b: { value: 3.7 } }) === null,
        "two quantities that are both conserved at 1 are not one quantity seen twice, and the perturbation " +
        "test CANNOT TELL THEM APART -- each is held there by a law no knob moves, so a survivor is the " +
        "strongest signal it emits and the weakest evidence");

    const cen = await (await import("./valueMatch.mjs")).valueMatchCensus();
    const key = (h) => `${h.a.dev}/${h.a.mode}.${h.a.key}|${h.b.dev}/${h.b.mode}.${h.b.key}`;
    // *** v3941 -- THE CLUSTER IS ADJUDICATED BY CLASS NOW, AND THE CHECK STILL BITES. ***
    // This asserted that no open match sits on a shared small integer. It went red not because the physics
    // changed but because the BOOKKEEPING IS QUADRATIC: the equal-one cluster went from 7 members to 11, and
    // 4 new members against 7 old ones is 34 new pairings to hand-write. valueMatch.mjs's own comment predicted
    // exactly this ("adjudicating it is bookkeeping rather than physics"), two rounds before it happened.
    //
    // UNITY_BY_CONSTRUCTION declares the reason PER OBSERVABLE -- 11 reasons instead of 55 pairings -- and a
    // match with BOTH sides declared is the cluster. What is NOT exempted is the case worth catching: an
    // observable that equals one and is NOT declared still lands in the open pile and still reddens this line.
    // A wholesale exemption of the class would have made the check vacuous, which is the trap; exempting only
    // DECLARED members keeps the question alive for every future arrival.
    const stillOpen = cen.matches.filter((h) => !ADJUDICATED[key(h)] && !unityCluster(h));
    const undeclaredOnes = stillOpen.filter((h) => conservedPair(h) !== null);
    console.log("  ----  census: " + cen.matches.length + " matches, " + cen.adjudicated + " adjudicated, " + cen.open + " open");
    console.log("  ----  equal-one cluster: " + Object.keys(UNITY_BY_CONSTRUCTION).length +
                " observables declared unity-by-construction, adjudicated as a class rather than " +
                (Object.keys(UNITY_BY_CONSTRUCTION).length * (Object.keys(UNITY_BY_CONSTRUCTION).length - 1) / 2) + " pairings");
    ok("!! *** the cluster is declared PER OBSERVABLE, so it cannot outgrow its own bookkeeping ***",
        Object.keys(UNITY_BY_CONSTRUCTION).length >= 11 &&
        Object.values(UNITY_BY_CONSTRUCTION).every((why) => typeof why === "string" && why.length > 30),
        "*** EVERY MEMBER CARRIES A REASON, AND THE REASON IS THE DEVICE'S OWN. *** A registry of bare keys " +
        "would be an exemption list; a registry of reasons is a set of claims somebody can check and refute. " +
        "One of the eleven is a PLANT MODE whose error saturates at unity, declared separately because the " +
        "reason is not normalisation -- and it leaves open whether a coupling census should scan plants at all.");
    ok("!! *** and an UNDECLARED value sitting on a small integer still reddens this gate ***",
        undeclaredOnes.length === 0,
        "SIX OF THE TWENTY-THREE were this class and all six are now recorded as NOT couplings: a symplectic " +
        "Jacobian (volume-preserving), a Crank-Nicolson norm (unitary), a normalised integral ratio, and " +
        "EXTREMAL KERR'S PROGRADE PHOTON ORBIT AT r = M = 1, and since v3433 THE CANONICAL BRACKET {q,p} = 1 -- SIX SEPARATE PHYSICAL REASONS TO EQUAL ONE, " +
        "and a pairwise scan reports every pairing among them");
}

// *** v3941 -- THIS PRINTED "all checks pass" UNCONDITIONALLY RIGHT HERE, ONE STATEMENT AHEAD OF THE REAL
// verdict below it. v3367 appended the unity-class section after an existing trailer instead of before it, so
// a run where THIS SECTION FAILS still prints the all-clear line first and the FAILURES line second -- a
// reader watching the tail of a long run sees the good news and stops looking. There was only ever meant to be
// one trailer; this was the leftover from the one v3367 grew past. ***
console.log();
if (fails) { console.log("valueMatch-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("valueMatch-selfcheck: all checks pass");
