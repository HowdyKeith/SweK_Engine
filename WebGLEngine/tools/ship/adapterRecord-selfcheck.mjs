// WebGLEngine/tools/ship/adapterRecord-selfcheck.mjs -- v4646
//
// Gates tools/ship/adapterRecord.mjs: HELD / OWED, the three-state shape deviceOwed.mjs established, applied
// to device READINGS rather than to pages. The whole value is that OWED is neither a pass nor a failure, so
// the rows below drive all three outcomes and the CONTROL is that a HELD disagreement still fails -- an
// OWED state that swallowed real regressions would be worse than the reds it replaces.
"use strict";
import { adapterKey, verdict, describe, coverage, owedCount } from "./adapterRecord.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

const SWIFT = { vendor: "google", architecture: "swiftshader" };
const PASCAL = { vendor: "nvidia", architecture: "pascal" };
const REC = { "google/swiftshader": 36 };

console.log("adapterRecord-selfcheck -- a reading is a reading OF AN ADAPTER\n");

console.log("1. THE KEY IS DERIVED FROM WHAT THE HARNESS ACTUALLY REPORTS");
{
    ok("!! vendor and architecture make the key, normalised so case and spacing cannot fork it",
        adapterKey(SWIFT) === "google/swiftshader" &&
        adapterKey({ vendor: "NVIDIA", architecture: "Pascal" }) === "nvidia/pascal" &&
        adapterKey({ vendor: "Intel Inc.", architecture: "Gen 12" }) === "intel-inc./gen-12",
        `${adapterKey(SWIFT)}, ${adapterKey({ vendor: "NVIDIA", architecture: "Pascal" })}`);
    ok("  an adapter that will not identify itself gets its OWN key, not everybody else's",
        adapterKey(null) === "unknown/unknown" && adapterKey({}) === "unknown/unknown",
        "two unidentified adapters are not evidence about each other");
}

console.log("\n2. *** HELD, OWED, AND THE CONTROL THAT HELD CAN STILL FAIL ***");
{
    const held = verdict(REC, SWIFT, 36, near);
    ok("!! *** a recorded adapter is HELD and agrees ***", held.state === "HELD" && held.ok === true, describe(held).slice(0, 90));
    const broke = verdict(REC, SWIFT, 18, near);
    ok("!! *** CONTROL: a recorded adapter that DISAGREES still fails -- OWED did not swallow the reds ***",
        broke.state === "HELD" && broke.ok === false, describe(broke).slice(0, 90));
    const owed = verdict(REC, PASCAL, 18, near);
    ok("!! *** an adapter with no reading on file is OWED: not asserted, not failed ***",
        owed.state === "OWED" && owed.ok === true && owed.have === null, `key=${owed.key}`);
    ok("  ...and OWED prints the measurement, so the record can be filled in from the output alone",
        describe(owed).includes("18") && describe(owed).includes("nvidia/pascal"),
        "a register of the unmeasured is useless if the reading is not in it");
    ok("  ...and it does NOT invite widening somebody's tolerance instead",
        /add the reading/.test(describe(owed)) && /widening/.test(describe(owed)));
}

console.log("\n3. THE POPULATION IS A NUMBER, BECAUSE A ROW NOBODY READS MEASURES NOTHING");
{
    const vs = [verdict(REC, SWIFT, 36, near), verdict(REC, PASCAL, 18, near), verdict(REC, null, 1, near)];
    const c = owedCount(vs);
    ok("!! owedCount names how many and WHICH adapters are unmeasured",
        c.owed === 2 && c.of === 3 && c.keys.join(",") === "nvidia/pascal,unknown/unknown",
        `${c.owed} of ${c.of}: ${c.keys.join(", ")}`);
    const cov = coverage(REC);
    ok("  and coverage says how many adapters a record actually covers -- ONE is the number that started this",
        cov.count === 1 && cov.keys[0] === "google/swiftshader", `${cov.count}: ${cov.keys.join(", ")}`);
    ok("  CONTROL: an empty record covers nothing rather than reporting a phantom",
        coverage(null).count === 0 && coverage({}).count === 0);
}

console.log(`\nadapterRecord-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
