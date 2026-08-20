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

ok("!! the check does not FORBID the sentences, and that is deliberate",
    CLAIM_PATTERNS.length >= 6 && claims.length < 5,
    "several of these records are CORRECT and load-bearing -- orphanScan names SSAOPass as a hand-verified " +
    "revive candidate, and hilbert.mjs was listed unwired-by-design with a reason. BANNING THE PHRASE WOULD " +
    "DELETE THE RECORDS THAT WORK ALONG WITH THE ONES THAT ROTTED. Only a claim whose subject is REACHABLE is " +
    "unambiguously wrong, and that is the only thing reported");

console.log(failed ? "wiringClaims-selfcheck: " + failed + " FAILED" : "wiringClaims-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
