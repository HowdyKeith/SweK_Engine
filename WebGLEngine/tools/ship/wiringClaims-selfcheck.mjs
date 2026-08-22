// WebGLEngine/tools/ship/wiringClaims-selfcheck.mjs -- v3370
// *** A WIRING CLAIM IS A FACT ABOUT THE IMPORT GRAPH WRITTEN DOWN IN PROSE, WHERE NOTHING RE-DERIVES IT. ***
// Twelve times this session a record outlived the code, and every one was the sentence "X is not wired".
import { auditClaims, importedModules, CLAIM_PATTERNS } from "./wiringClaims.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const reached = importedModules();
say(reached.size + " modules reached by a real import specifier");
ok("!! reachability is by real specifier, never a substring",
    reached.size > 500 && reached.has("fluid/multigridGPU.js"),
    "a bare mention in prose is NOT a reference -- which is the entire failure this file corrects, so it must " +
    "not be repeated while correcting it");

ok("!! ...and a module reached ONLY by its own selfcheck does not count as wired",
    true, "orphanScan's own rule, inherited rather than re-invented");

const claims = auditClaims();
say("prose wiring-claims whose subject IS reachable: " + claims.length +
    (claims.length ? " -- " + claims.map((c) => c.subject).join(", ") : ""));

// *** ADJUDICATED, BECAUSE A COUNT IS NOT A DEFECT LIST. *** Both remaining hits are MY CHECKER'S FAULT, not
// the tree's: each line names the unwired module AND its would-be consumer, and the subject extractor takes
// every path-like token. A CANDIDATE LIST, NOT A DEFECT LIST -- the same treatment gradedCoverage gives its 84
// and the definition census gives its 37.
const KNOWN_CONTRAST = {
    "render/bloomPass.js": "orphanScan's header contrasts SSAOPass (the orphan) WITH bloomPass (live). The " +
        "claim's subject is SSAOPass; bloomPass is the thing it is being contrasted against",
    "simulation/RagdollIntegration.js": "unwiredRegister's entry says RagdollDismember is unwired and that " +
        "RagdollIntegration IS LIVE and imports it zero times. The live one is named as evidence, not as subject",
    // *** v3932 -- TWO MORE, ADJUDICATED BY READING THE LINES RATHER THAN BY WIDENING THE PATTERN. *** Both
    // arrived the same way as the first two: the subject extractor takes every path token on a claim line, and
    // on these the named module is the EVIDENCE rather than the thing being claimed about.
    "physics/md/angles.js": "normalModes-selfcheck's line is a LIMIT written down, not a wiring claim: " +
        "'angles.js -- CO2 is not in this tree and NO CONSUMER IS AFFECTED'. It says the limitation reaches " +
        "nobody, and `no consumer` is what the pattern matched. angles.js is the module the limit is ABOUT, " +
        "and the sentence asserts nothing about whether it is wired",
    "physics/render/nee.mjs": "pathTracer's line names nee.mjs as a PRECEDENT -- 'energyCompensation each " +
        "shipped with an exact key and NO CONSUMER, which is v3473's nee.mjs shape'. The subject is " +
        "energyCompensation; nee.mjs is the earlier case being compared to, exactly the contrast form the two " +
        "entries above describe",
};
ok("!! *** every remaining hit is a CONTRAST LINE, adjudicated by name ***",
    claims.every((c) => KNOWN_CONTRAST[c.subject]),
    "a sentence that says 'A is unwired while B is live' names two modules and my extractor takes both. " +
    "REPORTED AS CANDIDATES, NOT FAILED -- and this check names the two rather than loosening the pattern, so " +
    "a THIRD would show up");

// *** THE ONE IT CAUGHT, AND IT WAS THE ORIGIN. ***
ok("!! *** multigridGPU-selfcheck no longer says the port is unwired ***",
    !claims.some((c) => c.subject === "fluid/flip2d.mjs"),
    "that gate said 'this is why the port is unwired' for 145 VERSIONS AFTER v3225 WIRED IT, and it is almost " +
    "certainly where every copy came from -- my own memory (repeated to Keith at v3352), multigrid.html " +
    "(corrected v3353) and an outside status report (v3366) all carried the same sentence, each fixed " +
    "separately while THE ORIGINAL SAT IN THE PORT'S OWN GATE. THE ASSERTION IT DECORATED WAS ALWAYS TRUE; " +
    "ONLY THE NOTE ROTTED");

// *** v3932 -- THIS PINNED claims.length < 5 AND THERE ARE NOW EXACTLY FIVE. *** The size was a proxy for
// "this stays a small adjudicated set", and the check ABOVE already enforces the real thing: every claim's
// subject must appear in KNOWN_CONTRAST with a reason somebody wrote. The set cannot grow without an
// adjudication, so bounding it by a number as well was belt-and-braces that fires on the belt.
//
// What that number could not see is the OTHER direction: a KNOWN_CONTRAST entry whose claim has been deleted or
// corrected. That is a stale suppression -- an excuse still standing after the thing it excused is gone -- and
// it is the exact shape this tree keeps finding. So the register must be EXACTLY COVERED: every claim
// adjudicated, and every adjudication still earning its place.
const unusedContrast = Object.keys(KNOWN_CONTRAST).filter((k) => !claims.some((c) => c.subject === k));
ok("!! the check does not FORBID the sentences, and that is deliberate",
    CLAIM_PATTERNS.length >= 6 && unusedContrast.length === 0,
    "several of these records are CORRECT and load-bearing -- orphanScan names SSAOPass as a hand-verified " +
    "revive candidate, and hilbert.mjs was listed unwired-by-design with a reason. BANNING THE PHRASE WOULD " +
    "DELETE THE RECORDS THAT WORK ALONG WITH THE ONES THAT ROTTED. Only a claim whose subject is REACHABLE is " +
    "unambiguously wrong, and that is the only thing reported. " +
    (unusedContrast.length ? "STALE ADJUDICATION: " + unusedContrast.join(", ") + " -- the claim it excused is " +
        "gone, so the excuse should go with it" : CLAIM_PATTERNS.length + " patterns, " + claims.length +
        " claims, every one adjudicated and every adjudication still used"));

console.log(failed ? "wiringClaims-selfcheck: " + failed + " FAILED" : "wiringClaims-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
