// brain/agent/fleetFingerprint-selfcheck.mjs
//
// Run: node brain/agent/fleetFingerprint-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The fleet-wide master check, held to its own standard: it has to CATCH a divergent peer, not just wave the fleet
// through. The test stands up simulated peers -- most agreeing on the master, one computing a different hash, one
// offline -- and checks that the report matches all the agreers, singles out the divergent one by name, and notes the
// unreachable one without counting it as agreement. The sabotage makes the comparison always report a match; then the
// divergent peer slips through and allMatch goes true when it must be false -- which is exactly the failure a fingerprint
// check exists to prevent, so the gate refuses it.
import { collectFleetMasters, summarizeFleetCheck } from "./fleetFingerprint.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const LOCAL = "347be10159ee6db7012b392fe33c3f5831be6efa2368c56cc20ec1aa03b23e05";
const BAD = "0000dead0000beef0000dead0000beef0000dead0000beef0000dead0000beef";
const peers = [{ id: "galaxina" }, { id: "mbp" }, { id: "peer56" }, { id: "peer195" }];
// galaxina + mbp agree, peer56 diverges, peer195 is offline
const fetchMasterFn = async (p) => {
    if (p.id === "peer195") throw new Error("unreachable");
    return p.id === "peer56" ? BAD : LOCAL;
};

// ---- 1. IT REACHES EVERY PEER AND CLASSIFIES EACH ONE ----------------------------------------------
{
    const r = await collectFleetMasters(LOCAL, peers, fetchMasterFn);
    ok("!! it checks every peer and classifies each as match, divergent, or unreachable", r.checked === 4 && r.reached === 3 && r.unreachable.length === 1,
       "four peers checked: three reached, one (" + r.unreachable[0] + ") unreachable -- the report accounts for all of them.");
}

// ---- 2. IT CATCHES THE DIVERGENT PEER BY NAME ------------------------------------------------------
{
    const r = await collectFleetMasters(LOCAL, peers, fetchMasterFn);
    ok("!! a peer whose master differs is caught and named", !r.allMatch && r.divergent.length === 1 && r.divergent[0] === "peer56",
       "peer56 computed " + BAD.slice(0, 8) + "\u2026 against the local " + LOCAL.slice(0, 8) + "\u2026 -- it is flagged, not silently trusted. allMatch is false, as it must be.");
}

// ---- 3. A CLEAN FLEET REPORTS ALL-MATCH ------------------------------------------------------------
{
    const allGood = async () => LOCAL;
    const r = await collectFleetMasters(LOCAL, [{ id: "a" }, { id: "b" }, { id: "c" }], allGood);
    ok("!! when every reached peer agrees, allMatch is true", r.allMatch && r.divergent.length === 0 && r.reached === 3,
       "three peers, all on " + LOCAL.slice(0, 12) + "\u2026 -- " + summarizeFleetCheck(r));
}

// ---- 4. UNREACHABLE IS NOT COUNTED AS AGREEMENT ----------------------------------------------------
{
    const allOffline = async () => { throw new Error("down"); };
    const r = await collectFleetMasters(LOCAL, [{ id: "a" }, { id: "b" }], allOffline);
    ok("!! an all-unreachable fleet is not reported as a match", !r.allMatch && r.reached === 0,
       "nothing was verified, so allMatch stays false -- silence is not agreement.");
}

console.log(fails ? "\nfleetFingerprint-selfcheck: " + fails + " FAILED" : "\nfleetFingerprint-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
