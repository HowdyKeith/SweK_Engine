// WebGLEngine/tools/ship/fleetView-selfcheck.mjs -- v3016
//
// Run: node tools/ship/fleetView-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the fleet-version and Tasker-chain panels in report.html.
//
// Keith asked whether the fleet view carries the engine version and the Tasker step status, and whether those
// should be lifted to human view. IT DID NOT, AND THEY SHOULD.
//
// PEERS HAVE REPORTED engineVersion SINCE v2957 AND NOTHING EVER SHOWED IT, which is not cosmetic. TWO separate
// mechanisms in this tree already REFUSE to compare across versions:
//     fleetBench returns INCOMPARABLE when the fleet is running two builds (v2984)
//     macSession reports CONFOUNDED when a cross-arch divergence sits beside a version difference (v2998)
// Both refusals are correct. And a human could not see WHY either of them fired, BECAUSE THE THING THEY WERE
// REFUSING OVER WAS INVISIBLE. A refusal nobody can account for gets read as a bug and worked around.
//
// The Tasker chain (v3008) had no view at all -- three rounds of a surface nobody could look at, which is the
// same class this session has now found in pages, modules, lints, gates, findings, bridges and run transcripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const page = fs.readFileSync(path.join(ENG, "report.html"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. VERSIONS ARE VISIBLE, AND A MIXED FLEET IS NAMED --------------------------------------------------
{
    ok("!! the fleet view reads the roster", /\/lighthouse/.test(page),
       "it fetched devices, fingerprint, metrics and perf -- and never the peers themselves");
    ok("...and shows each peer's engineVersion", /engineVersion/.test(page));
    ok("!! a MIXED-version fleet is called out", /MIXED/.test(page) && /INCOMPARABLE by design, not broken/.test(page),
       "two mechanisms already refuse to compare across builds; this is where a reader finds out why");
    ok("...and a peer that reported no version says so", /version not reported/.test(page),
       "silence is not agreement -- an unreported version must not read as matching");
    ok("a single-version fleet is stated positively", /all peers on/.test(page),
       "'no problem found' is a different message from 'nothing checked'");
}

// ---- 2. THE TASKER CHAIN IS VISIBLE, WITH ITS HONESTY INTACT ---------------------------------------------------
{
    ok("!! the chain is rendered", /\/android\/tasker/.test(page));
    ok("...and the HUMAN stage is labelled as a decision, not a gap", /your decision, by design/.test(page),
       "installing an APK requires a tap, and Keith's instruction was that the user makes that call -- a view that showed it as 'missing' would invite someone to close it");
    ok("!! ...and automatable is shown SEPARATELY from confirmable", /automatable/.test(page) && /confirmable from this hub/.test(page),
       "four of five stages are driveable and only two produce an artefact this hub can check -- collapsing those overstates what the machine knows");
    ok("a STALE stage is coloured differently from a done one", /stale/.test(page) && /done/.test(page),
       "a stale artefact is the previous run mistaken for this one, and rendering it green would be the failure the chain exists to prevent");
}

// ---- 3. IT DOES NOT TRUST WHAT IT FETCHES ----------------------------------------------------------------------------
{
    ok("!! everything rendered is escaped", /const esc = /.test(page) && /replace\(\/\[&<>"\]/.test(page),
       "host names and stage reasons come from other machines");
    ok("...and an unreachable source says so rather than rendering empty", /lighthouse unreachable/.test(page) && /android bridge unreachable/.test(page),
       "an empty panel and a dead endpoint look identical, and only one of them means the fleet is fine");
}

console.log(fails ? "\nfleetView-selfcheck: " + fails + " FAILED" : "\nfleetView-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
