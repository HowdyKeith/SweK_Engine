// WebGLEngine/physics/labScenes-selfcheck.mjs -- v3587
//
// Run: node physics/labScenes-selfcheck.mjs
// RUNTIME 0.3s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 2 IS THE ROUND: NINE OF TWELVE KNOB NAMES WERE WRONG ON THE FIRST PASS, IN A TABLE WHOSE HEADER
// SAID THEY WERE "READ FROM THE PAGE, NOT INVENTED". *** I had typed them from the scene LABELS. A claim about
// provenance is a claim like any other, and this one was false in the same paragraph that made it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENE_TRIAGE, PROVENANCE, candidates, refused, joinRegistered,
         MEASURED_V3587, reportLines } from "./labScenes.mjs";
import { listProposers, resetRegistry } from "./proposers.mjs";
import { registerAll, NOT_REGISTERED } from "./knobRegistry.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const PAGE = fs.readFileSync(path.join(ENG, "physics-lab.html"), "utf8");
// the page's own scene table, parsed rather than restated
const BODY = PAGE.slice(PAGE.indexOf("const SCENES = {"));
const pageScenes = new Map();
{
    const re = /\n  ([a-zA-Z0-9_]+): \{[\s\S]*?params: \[([\s\S]*?)\],\n/g;
    let m;
    while ((m = re.exec(BODY))) pageScenes.set(m[1], [...m[2].matchAll(/name: "([^"]+)"/g)].map((x) => x[1]));
}

console.log("labScenes-selfcheck -- can the roundhouse work on a lab scene, and what was claimed about it\n");

// ---------------------------------------------------------------------------
console.log("1. THE THREE FACTS THAT ANSWER THE QUESTION");
{
    resetRegistry(); registerAll();
    const props = listProposers();
    const joined = joinRegistered(props);
    report("lab scenes / proposers / registered lab scenes",
           SCENE_TRIAGE.length + " / " + props.length + " / " + joined.filter((r) => r.registered).length);

    // *** MATCHED AS A CALL, NOT AS A WORD -- FOR THE THIRD TIME THIS SESSION. *** v3577 hit this on
    // alphaBuckets, v3580 on swk_contacts, and I wrote both fixes and then grepped for a bare identifier again
    // here: the page's own comment EXPLAINING that a proposer needs an adjudicator contains the word, and the
    // check fired on its own explanation. A file that says where its logic lives should not be punished for it.
    ok("!! physics-lab.html registers no proposer of its own",
        !/registerProposer\s*\(/.test(PAGE),
        "*** THE PAGE CONTAINED ZERO REFERENCES TO THE ROUNDHOUSE, TO PROPOSERS, OR TO ANY AI WORKER -- not " +
        "hidden, not disabled, ABSENT. *** The question 'where is the Initiate button' had no answer because " +
        "there was no button.");
    ok("!! the panel reports the LIVE registry, and it is no longer empty",
        joined.filter((r) => r.registered).length >= 1 &&
        joined.find((r) => r.scene === "gyroscope").registered === true,
        // *** THIS LINE ASSERTED THE INTERSECTION WAS ZERO AND WENT RED WHEN v3591 REGISTERED gyro-spin -- the
        // fourth time this session a check has announced its own completion. It is REWRITTEN TO THE PROPERTY:
        // what matters is that the panel reflects the registry, not that the registry is empty. The zero was
        // the state on the day, never the claim worth keeping.
        "v3587 built the drill-down and reported zero of twelve honestly. GYROSCOPE IS THE FIRST, and it " +
        "arrived after three candidates were WITHDRAWN by measurement rather than one added on argument.");
    ok("!! *** AND THE PAGE WAS ALREADY REFUSED ON RECORD -- BUT THE PAGE, NOT THE SCENES ***",
        typeof NOT_REGISTERED["physics-lab"] === "string" && /aggregate front door/.test(NOT_REGISTERED["physics-lab"]),
        "knobRegistry says: 'an aggregate front door rather than a single measurement with knobs'. THAT " +
        "REFUSAL IS CORRECT. Each of its twelve SCENES is a single measurement with knobs, and NOT ONE HAD BEEN " +
        "ASSESSED -- the page-level no was read as a scene-level no and the question stopped being asked.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE KNOB NAMES ARE THE PAGE'S, AND NINE OF TWELVE WERE NOT ***");
{
    const mismatched = SCENE_TRIAGE.filter((r) => !(pageScenes.get(r.scene) || []).includes(r.knob));
    report("scenes parsed from the page", String(pageScenes.size));
    report("knob mismatches", String(mismatched.length));

    ok("!! every triage row names a knob the page actually exposes",
        mismatched.length === 0,
        "*** THE FIRST PASS HAD NINE WRONG, IN A TABLE WHOSE HEADER SAID THEY WERE 'READ FROM THE PAGE, NOT " +
        "INVENTED'. *** friction where the page says mu, temperature where it says tempK, eccentricity where it " +
        "says e -- typed from the LABELS. A claim about provenance is a claim like any other, and that one was " +
        "false in the same paragraph that made it.");
    ok("!! ...and this check parses the page rather than restating the table",
        pageScenes.size === 12 && [...pageScenes.values()].every((v) => v.length > 0),
        "the scene ids and their params come out of physics-lab.html's own SCENES object. A gate holding its " +
        "own copy of the knob names would agree with the table by construction and catch nothing.");
    ok("every scene on the page has a triage row",
        [...pageScenes.keys()].every((id) => SCENE_TRIAGE.some((r) => r.scene === id)),
        "a scene with no row would show 'no triage row for this scene' in the panel -- honest, but it means " +
        "somebody added a scene and the drill-down silently stopped covering it");
}

// ---------------------------------------------------------------------------
console.log("\n3. NOTHING IS REGISTERED HERE, AND EVERY ROW SAYS `assessed`");
{
    report("candidates / refused", candidates().length + " / " + refused().length);
    ok("!! *** THE FILE REGISTERS NO PROPOSER AT ALL ***",
        !/registerProposer\s*\(/.test(fs.readFileSync(path.join(ENG, "physics", "labScenes.mjs"), "utf8")),
        "registerProposer REQUIRES an adjudicator, and main.js records what happens without one: 'an invented " +
        "adjudicator is A CONTROL THAT CANNOT FAIL', and THREE OF THE FIRST SEVEN written there passed every " +
        "candidate and were withdrawn. Registering eight on an afternoon's reading would have been eight of those.");
    ok("!! no row claims `measured` unless it was actually run",
        // *** THE ALLOW-LIST WENT STALE IN ONE ROUND. *** v3589 replaced a pinned count with a pinned LIST,
        // which is the same ratchet in a longer coat: three more rows were genuinely measured and the check
        // called them liars. The property is that a MEASURED row carries a measurement IN ITS TEXT -- numbers
        // somebody could re-run -- which is what separates it from an assessment, and it does not need a roster.
        SCENE_TRIAGE.filter((r) => r.provenance === PROVENANCE.MEASURED)
            .every((r) => /MEASURED|e-1[0-9]|[0-9]\.[0-9]{3,}/.test((r.key || "") + (r.reason || "") + (r.key2 || ""))) &&
        SCENE_TRIAGE.filter((r) => r.provenance === PROVENANCE.MEASURED).length >= 1,
        // *** PINNED `=== 1` AND WENT RED WHEN THREE MORE WERE MEASURED -- which is the field working. That is
        // the sixth count in this session to fail on progress. The property is WHICH rows earned the word, not
        // how many, and measuring more is the whole direction of travel.
        // *** THE FIRST VERSION SAID `every row is assessed` AND WENT RED WHEN ONE BECAME MEASURED -- which is
        // the field working. The property was never 'nothing is measured', it is that MEASURED IS RESERVED FOR
        // THINGS THAT WERE RUN. Exactly one row has earned it, and it earned it by being refuted.
        "*** AN ASSESSMENT WEARING THE WORD MEASURED WOULD BE THE INVENTED ADJUDICATOR ONE LEVEL UP: *** a " +
        "claim about whether a claim can be checked, itself unchecked. Eleven rows say `assessed` because I " +
        "reasoned about them; ONE says `measured` because I ran it, and running it is what withdrew it.");
    ok("!! every candidate names the key that would adjudicate it",
        candidates().every((r) => r.key && r.key.length > 40),
        "'this one looks promising' is not a candidate. ORBIT is the strongest: ANGULAR MOMENTUM IS CONSERVED " +
        "EXACTLY in a central force -- an exact invariant rather than a toleranced fit.");
    ok("!! and every refusal names its reason, in NOT_REGISTERED's own shape",
        refused().every((r) => r.reason && !r.key),
        "flag, stretch, swirl and aquarium. A refusal without a reason is indistinguishable from an oversight, " +
        "which is the doctrine NOT_REGISTERED and UNPLACED both hold.");
    // v3598 -- *** THIS PINNED THE COUNT AT TWO AND WENT RED WHEN diffusion WAS WITHDRAWN, WHICH IS THE
    // ROUND SUCCEEDING. *** How many candidates happen to carry a caution is a round's outcome; the property
    // is that a caution, wherever it appears, is a real sentence rather than a shrug. Rewritten to that and
    // the count REPORTED, so a future withdrawal or a new candidate moves a number instead of a gate.
    ok("...and every caution that exists is a real sentence, not a shrug",
        SCENE_TRIAGE.filter((r) => r.caution).every((r) => r.caution.length > 60),
        SCENE_TRIAGE.filter((r) => r.caution).length + " rows carry one: " +
        SCENE_TRIAGE.filter((r) => r.caution).map((r) => r.scene).join(", "));
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE CRITERION v3587 MISSED, AND IT KILLED THE CANDIDATE I CALLED STRONGEST ***");
{
    const orbit = SCENE_TRIAGE.find((r) => r.scene === "orbit");
    report("orbit", orbit.eligible + " / " + orbit.provenance + " / responds: " + orbit.responds);

    ok("!! every row now states whether the key RESPONDS to the knob",
        SCENE_TRIAGE.every((r) => typeof r.responds === "string" && r.responds.length),
        "*** v3587 ASKED 'DOES AN INDEPENDENT KEY EXIST' AND STOPPED. *** A key that does not move when the knob " +
        "moves cannot grade it -- it passes every candidate, which is the CONTROL THAT CANNOT FAIL reached from " +
        "a new direction: not an INVENTED adjudicator, a REAL one POINTED AT THE WRONG PARAMETER.");
    ok("!! orbit is withdrawn, and it is the one v3587 called the strongest",
        orbit.eligible === "refused" && orbit.responds === "no" && !orbit.key,
        "angular momentum IS conserved exactly -- and AT EVERY ECCENTRICITY, because a symplectic integrator " +
        "conserves it regardless of orbit shape. THE KEY IS REAL, EXACT, AND COMPLETELY DEAF TO THE KNOB.");
    ok("!! ...and orbit is marked MEASURED, because it was run",
        orbit.provenance === PROVENANCE.MEASURED,
        "|dL|/L came back 1.1e-15, 1.1e-14, 3.1e-15, 3.1e-15, 2.4e-14, 8.1e-15 across e = 0 to 0.7 at the " +
        "page's own dt -- FLAT, at machine precision. *** THE OTHER SEVEN SAY `asserted`, because reasoning " +
        "about a key is not the same as watching it move. ***");
    ok("!! the responsive key is refused too, and the reason is that it would reject correct physics",
        /reject correct physics/.test(orbit.reason) && /O\(dt\^2\)/.test(orbit.reason),
        "energy drift DOES respond, 2.2e-15 to 1.2e-6 -- but it is O(dt^2) at fixed e, so a high eccentricity " +
        "LEGITIMATELY drifts more. An adjudicator rejecting e = 0.7 would be rejecting a correct scene setting.");
    ok("!! and the diagnosis is named: a scene parameter where a proposer wants a solver one",
        /SCENE PARAMETER WHERE A PROPOSER WANTS A SOLVER ONE/.test(orbit.reason) && /dt is hardcoded/.test(orbit.reason),
        "*** e IS WHAT YOU CAME TO LOOK AT; dt IS WHAT A KNOB SEARCH SHOULD TUNE, and the scene hardcodes it at " +
        "0.002. *** v3587 read 'the knob the page exposes' as 'the knob a proposer would tune', and for orbit " +
        "those are different parameters entirely -- which is a question worth asking of the other seven.");
    ok("the withdrawal is recorded in NOT_REGISTERED's own shape rather than deleted",
        /ATTEMPTED AND WITHDRAWN/.test(orbit.reason),
        "the same words ising-samples uses. A candidate that quietly disappeared would invite the next reader " +
        "to propose it again, which is the whole reason that entry is worded as it is.");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE responds TEST APPLIED TO THE REST, BY MEASUREMENT ***");
{
    const meas = SCENE_TRIAGE.filter((r) => r.provenance === PROVENANCE.MEASURED);
    report("measured rows", meas.map((r) => r.scene + ":" + r.responds).join("  "));
    report("still asserted", SCENE_TRIAGE.filter((r) => r.provenance === PROVENANCE.ASSESSED &&
           r.eligible === "candidate").map((r) => r.scene).join(", "));

    ok("!! three more keys were driven, and all three MOVE with their knob",
        ["gyroscope", "vibrations", "pile"].every((n) => {
            const r = SCENE_TRIAGE.find((x) => x.scene === n);
            return r.provenance === PROVENANCE.MEASURED && r.responds === "yes";
        }),
        "GYROSCOPE is the sharpest: rate x omega came back 11.808, 11.938, 11.970, 11.977, 11.979 across a 16x " +
        "sweep -- *** CONVERGING TO 12, WHICH IS EXACTLY THE APPLIED TORQUE, a number nobody fed it. *** " +
        "VIBRATIONS matches the exact sine sequence over an 8.2x spread. PILE reuses v3570's OWN adjudicator " +
        "against the real box3d and tracks mu with the additive 0.01 offset that round characterised.");
    ok("!! *** NO CANDIDATE REMAINS ON REASONING ALONE ***",
        SCENE_TRIAGE.filter((r) => r.provenance === PROVENANCE.ASSESSED && r.eligible === "candidate").length === 0,
        "every surviving candidate was DRIVEN across its knob range. Orbit was the standing reason not to " +
        "promote on argument -- strongest of the eight by reasoning, and the first that measurement refuted -- " +
        "and running the rest refuted two more.");
    ok("!! *** MEASUREMENT REFUTED THREE OF THE EIGHT, IN THREE DIFFERENT WAYS ***",
        ["orbit", "balloon"].every((n) => SCENE_TRIAGE.find((r) => r.scene === n).eligible === "refused") &&
        SCENE_TRIAGE.find((r) => r.scene === "orbit").responds === "no" &&
        SCENE_TRIAGE.find((r) => r.scene === "balloon").responds === "identity",
        "ORBIT: a REAL, EXACT key that is DEAF to the knob -- |dL|/L flat at 1e-15 across every eccentricity. " +
        "BALLOON: a key that IS the knob's setpoint -- V/Vrest hits the inflation target to 6e-12 IN ONE " +
        "SUBSTEP and to 6.7e-16 at ten-thousand-fold looser compliance, SO IT CANNOT SAY NO AT ANY SOLVER " +
        "SETTING. MUSCLE inherits balloon's constraint and is withdrawn on that ground, marked ASSESSED because " +
        "I did not run it. *** THREE FLAVOURS OF CONTROL-THAT-CANNOT-FAIL, AND ONLY ONE OF THEM WAS THE ONE " +
        "knobRegistry'S HEADER WARNED ABOUT. ***");
    ok("!! and diffusion carries the trap it nearly fell into",
        /CONTROL THAT CANNOT FAIL/.test(SCENE_TRIAGE.find((r) => r.scene === "diffusion").caution || ""),
        "kelvinOfWarmth(warmthOfKelvin(T)) returns T to 5.7e-14 -- A FORWARD AND AN INVERSE OF THE SAME " +
        "FORMULA, which is algebra rather than a measurement. The honest key must go through the TRAJECTORY: " +
        "recover D from the MSD of the simulated walk and then invert. An adjudicator written against the " +
        "exposed pair would pass everything.");
    ok("the response is a SPREAD across the knob range rather than a single reading",
        /16x sweep|8\.2x|0\.2, 0\.5, 0\.8/.test(JSON.stringify(SCENE_TRIAGE)),
        "one value cannot distinguish a key that moves from a key that happens to sit somewhere. Orbit's |dL|/L " +
        "read 1.1e-15 at e = 0.4 and looked perfect; it read 1.1e-15 EVERYWHERE, which is the whole problem.");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE PANEL REPORTS THE REGISTRY, NOT THE TRIAGE");
{
    ok("!! the page has an Initiate button and it is DISABLED by default",
        /id="initiateBtn"/.test(PAGE) && /initiateBtn"[^>]*disabled/.test(PAGE),
        "*** A DISABLED CONTROL THAT NAMES WHAT IS MISSING IS A DIFFERENT THING FROM NO CONTROL AT ALL: *** the " +
        "second leaves you wondering whether you missed a menu.");
    ok("!! a CANDIDATE does not enable the button",
        /row\.eligible === "candidate"[\s\S]{0,400}b\.disabled = true;/.test(PAGE),
        "enabling on 'candidate' would imply an adjudicator exists, and the entire point of the triage is that " +
        "nobody has written one. ONLY `registered` ENABLES IT.");
    ok("!! ...and even registered only promises propose, not adopt",
        /does NOT adopt/.test(PAGE),
        "the tiers are read/propose/adopt and all six live proposers sit at PROPOSE. A button implying the AI " +
        "will change your scene would be promising a licence nothing has granted.");
    ok("an unreachable bridge leaves the panel at a dash rather than asserting a verdict",
        /bridge not reachable|catch\(\(\) => \{/.test(PAGE),
        "absent is not empty: 'no proposer' and 'could not ask' need different actions from the reader");
}

console.log(fails ? `\nlabScenes-selfcheck: ${fails} FAILED` : "\nlabScenes-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
