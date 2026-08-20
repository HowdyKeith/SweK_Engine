// WebGLEngine/ai-bridge/fingerprintBridge-selfcheck.mjs — v2655
//
// Run: node ai-bridge/fingerprintBridge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The point of collecting fingerprints across peers is not just to learn THAT they disagree -- a single master hash
// tells you that -- but WHICH science diverged on WHICH machine, so a cross-arch bug is localised in one glance
// instead of a bisect. So the gate feeds compareFingerprints synthetic fleets and checks it: agrees when all agree,
// and when one peer differs in exactly one subsystem, names that subsystem AND that peer and nothing else. It also
// confirms a master-only view would miss the localisation, and that unreachable peers are handled, not fatal.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { compareFingerprints, localFingerprint } = require("./fingerprintBridge.js");
import { computeFingerprint } from "../tools/fingerprint/fingerprint.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const subs = (over = {}) => ["strict-libm", "md-forcefield", "obb-collision", "ewald-electrostatics", "prime-transport", "astar-pathfinding"].map((n) => ({ name: n, hash: over[n] || (n + "-BASE") }));
const peer = (url, over) => ({ url, ok: true, master: "M-" + JSON.stringify(over || {}), subsystems: subs(over) });

// ---- 1. AGREEMENT: an identical fleet reports full agreement, no divergences ------------------------------------
{
    const c = compareFingerprints([peer("A"), peer("B"), peer("C")]);
    ok("!! an identical fleet reports agreement with zero divergences", c.masterAgree && c.divergences.length === 0 && c.reachableCount === 3,
       "three peers, one master group, every subsystem agrees -- the clean case reads clean.");
}

// ---- 2. LOCALISATION: one peer differing in ONE subsystem is pinpointed exactly ---------------------------------
{
    // peer C computed a different md-forcefield hash (e.g. arm64 diverged there); everything else identical
    const c = compareFingerprints([peer("A"), peer("B"), peer("C", { "md-forcefield": "md-ARM-DIFF" })]);
    const d = c.divergences;
    const onlyMd = d.length === 1 && d[0].subsystem === "md-forcefield" && d[0].url === "C";
    const otherAgree = ["strict-libm", "obb-collision", "ewald-electrostatics", "prime-transport", "astar-pathfinding"].every((n) => c.perSubsystem[n].agree);
    ok("!! a single diverging subsystem on a single peer is named exactly (science + machine)", !c.masterAgree && onlyMd && otherAgree,
       "master disagrees, and the divergence list is exactly one entry: md-forcefield on peer C. The other five subsystems still agree -- the bug is localised to one science on one box.");
}

// ---- 3. MASTER-ONLY WOULD MISS IT: the per-subsystem view is what localises ------------------------------------
{
    const results = [peer("A"), peer("B"), peer("C", { "ewald-electrostatics": "ew-DIFF" })];
    const c = compareFingerprints(results);
    const masterOnlyKnows = !c.masterAgree;                    // master-only: "something differs" -- but not what
    const perSubKnows = c.divergences.length === 1 && c.divergences[0].subsystem === "ewald-electrostatics";
    ok("!! per-subsystem comparison localises what a master-only check cannot", masterOnlyKnows && perSubKnows,
       "a master-only view says only that peer C differs; the per-subsystem comparison says it is ewald-electrostatics specifically -- that localisation is the whole reason to compare subsystem hashes.");
}

// ---- 4. UNREACHABLE peers are reported, not fatal --------------------------------------------------------------
{
    const c = compareFingerprints([peer("A"), peer("B"), { url: "C", ok: false, error: "timeout" }]);
    ok("!! an unreachable peer is listed as unreachable and does not break the comparison", c.reachableCount === 2 && c.unreachable.length === 1 && c.unreachable[0].url === "C" && c.masterAgree,
       "peer C timed out: it is reported under unreachable, the remaining two are compared normally, no throw.");
}

// ---- 5. THE LOCAL ENDPOINT PRODUCES A REAL FINGERPRINT WITH ARCH TAG -------------------------------------------
{
    const me = await localFingerprint();
    ok("!! GET /fingerprint yields this box's master, arch tag, and all subsystems", /^[0-9a-f]{64}$/.test(me.master) && me.subsystems.length === computeFingerprint().subsystems.length && typeof me.arch === "string" && me.arch.length > 0,
       "local fingerprint: arch=" + me.arch + ", " + me.subsystems.length + " subsystems, master " + me.master.slice(0, 12) + "... -- exactly what each peer serves for comparison.");
}

console.log(fails ? "\nfingerprintBridge-selfcheck: " + fails + " FAILED" : "\nfingerprintBridge-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
