// tools/roundhouse/fragmentRotationBind-selfcheck.mjs
//
// Run: node tools/roundhouse/fragmentRotationBind-selfcheck.mjs   (~4s MEASURED -- two carves and two censuses)
//
// THIS GRADES THE BIND. physics/mechanics/fragmentRotation-selfcheck.mjs owns the physics.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THE DIFFERENCE BETWEEN "IS A BODY" AND "IS THE BODY". *** Trace
// invariance and the triangle inequality are real falsifiers -- a spectrum violating I1 <= I2 + I3 is not
// slightly wrong, it is not a body at all. But they are STRUCTURAL: they ask whether the numbers describe SOME
// rigid body, never whether they describe THIS one. The plant produces a perfectly admissible body with the
// wrong moments, and both of them pass it without a mark. Only the rotated box -- the one place an independently
// known answer exists -- can tell, which is why the module's own header calls it "the key that makes everything
// below mean anything."
"use strict";
import { fragmentRotationDevice, FRAGROT_OBSERVABLES } from "./fragmentRotationBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("fragmentRotationBind-selfcheck -- is a body, or is THE body?\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("fragmentRotation appears in DEVICE_NAMES", DEVICE_NAMES.includes("fragmentRotation"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("fragmentRotation");
    ok("!! the registry hands back THIS device", !!d && d.name === "fracture-fragments-intermediate-axis",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method",
        "the tensor is computed correctly and a TERM IS DISCARDED before it is diagonalised");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = fragmentRotationDevice.build(fragmentRotationDevice.defaults());
    ok("!! no advertised observable is missing", FRAGROT_OBSERVABLES.every((k) => k in v),
        FRAGROT_OBSERVABLES.filter((k) => !(k in v)).join(", ") || FRAGROT_OBSERVABLES.length + " produced");
    ok("...and every one is finite", FRAGROT_OBSERVABLES.every((k) => finite(v[k])),
        FRAGROT_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => FRAGROT_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !FRAGROT_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
    ok("...and the carve really produced fragments to talk about", v.censusTotal >= 2,
        v.censusTotal + " fragments, " + v.censusDistinct + " with distinct moments. A census of one would make "
        + "the intermediate-axis question vacuous.");
}

console.log("\n3. *** THE ROTATED BOX: THE ONLY PLACE AN INDEPENDENTLY KNOWN ANSWER EXISTS ***");
{
    const v = fragmentRotationDevice.build({ config: {} });
    ok("!! a known diagonal, conjugated by a known rotation, comes back through the eigensolver",
        v.rotatedBoxWorstErr < 1e-12,
        "worst error " + v.rotatedBoxWorstErr.toExponential(3) + " recovering [3, 5, 7] from a full tensor with "
        + "products of inertia. The two routes share NOTHING -- one is a 3x3 matrix multiply, the other is "
        + "tred2 + tql -- and the answer is known before the eigensolver runs. On a real fragment there is no "
        + "such answer, which is why this one carries the others.");
    ok("!! trace invariance: the eigenvalues sum to tr(I)", v.traceResidual < 1e-12,
        "residual " + v.traceResidual.toExponential(3) + " -- a number the eigensolver never sees as a target");
    ok("!! the spectrum is PHYSICAL: I1 <= I2 + I3", v.spectrumPhysical === 1,
        "not a numerical property but a statement about mass being non-negative and lying somewhere");
    ok("...and every real fragment in the census is physical too", v.censusAllPhysical === 1,
        "worst census trace residual " + v.censusWorstTraceResidual.toExponential(3));
}

console.log("\n4. *** THE PLANT: ASSUME THE PRINCIPAL AXES ARE THE COORDINATE AXES ***");
{
    const h = fragmentRotationDevice.build({ config: {} });
    const p = fragmentRotationDevice.build({ config: { planted: true } });

    ok("!! *** the rotated box catches it, by fourteen orders of magnitude ***",
        h.rotatedBoxWorstErr < 1e-12 && p.rotatedBoxWorstErr > 0.5,
        "worst recovery error " + h.rotatedBoxWorstErr.toExponential(3) + " -> " + p.rotatedBoxWorstErr.toFixed(6)
        + ". This is the limitation the three-file join existed to remove: v3562's instrument could only be "
        + "handed a body whose principal axes ARE the coordinate axes, and A FRACTURE FRAGMENT'S TENSOR IS NOT "
        + "DIAGONAL -- the break leaves its axes wherever it likes.");
    ok("!! *** AND TRACE INVARIANCE IS BIT-IDENTICAL, because discarding off-diagonal terms leaves the diagonal ***",
        h.traceResidual === p.traceResidual,
        "residual " + h.traceResidual.toExponential(3) + " under both. tr(I) is the sum of the diagonal, and the "
        + "plant never touches it.");
    ok("!! *** AND THE TRIANGLE INEQUALITY PASSES THE PLANTED SPECTRUM, because it IS a body ***",
        h.spectrumPhysical === 1 && p.spectrumPhysical === 1,
        "I1 <= I2 + I3 holds for the planted moments as well: they describe a perfectly admissible rigid body. "
        + "IT IS JUST NOT THIS ONE. A device carrying only the structural checks would certify a fragment whose "
        + "moments are wrong by 36% -- that is the difference between IS A BODY and IS THE BODY, and only a key "
        + "with an independently known answer can tell them apart.");
    report("the census observables are REPORTED, not graded: fragmentCensus returns principal moments already "
        + "computed and never the raw tensor, so the planted reader cannot reach them and they are blind by "
        + "construction. Six of nine observables being identical only means something if it is clear which of "
        + "them could have moved -- and only three could.");
}

console.log("\n" + (fails ? "fragmentRotationBind-selfcheck: " + fails + " FAILED" : "fragmentRotationBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
