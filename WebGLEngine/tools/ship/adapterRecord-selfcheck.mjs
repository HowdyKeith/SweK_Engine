// WebGLEngine/tools/ship/adapterRecord-selfcheck.mjs -- v4646
//
// Gates tools/ship/adapterRecord.mjs: HELD / OWED, the three-state shape deviceOwed.mjs established, applied
// to device READINGS rather than to pages. The whole value is that OWED is neither a pass nor a failure, so
// the rows below drive all three outcomes and the CONTROL is that a HELD disagreement still fails -- an
// OWED state that swallowed real regressions would be worse than the reds it replaces.
"use strict";
import { adapterKey, verdict, describe, coverage, owedCount,
         compareFor, boundFrom, SLACK, readReadings, recordReading, mergeRecords } from "./adapterRecord.mjs";

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

console.log("\n4. *** THE DIRECTION, BECAUSE SEVEN HAND-WRITTEN COMPARATORS ARE SEVEN CHANCES TO WRITE ONE BACKWARDS ***");
{
    const B = { g: 2e-7 };
    ok("!! *** max: at or below the bound passes, above it fails ***",
       compareFor("g", "max")(B, 1e-7) === true && compareFor("g", "max")(B, 2e-7) === true &&
       compareFor("g", "max")(B, 3e-7) === false, "the boundary itself is INSIDE, on both directions");
    ok("!! *** min: at or above the bound passes, below it fails ***",
       compareFor("g", "min")(B, 3e-7) === true && compareFor("g", "min")(B, 2e-7) === true &&
       compareFor("g", "min")(B, 1e-7) === false);
    let threw = false;
    try { compareFor("g", "maximum"); } catch { threw = true; }
    ok("!! CONTROL: a direction that is not max or min THROWS rather than picking one",
       threw, "a typo that silently chose a direction would invert an assertion and still look green");
    ok("  and the slack widens in the direction the row is asserted in, never the other way",
       boundFrom("max", 4) === 4 * SLACK && boundFrom("min", 4) === 4 / SLACK,
       `SLACK=${SLACK}: a max-row's ceiling rises, a min-row's floor drops`);
    ok("  ...and a non-finite measurement is passed through rather than turned into a number",
       Number.isNaN(boundFrom("max", NaN)) && boundFrom("min", Infinity) === Infinity,
       "a bound computed from NaN would be a bound nothing can ever fail");
}

console.log("\n5. *** --record WRITES, AND WHAT IT REFUSES TO WRITE IS THE WHOLE SAFETY ***");
{
    // Injected read/write throughout: this gate must not touch the tree's real readings file, and a gate that
    // writes the record it grades is the fault sweepCoverage.mjs exists for.
    let disk = null;
    const io = { read: () => { if (disk === null) throw new Error("ENOENT"); return disk; },
                 write: (f, t) => { disk = t; } };

    const r1 = recordReading("gateA", "nvidia/pascal", { laneSame: 18 }, { ...io, frozen: REC, stamp: "T0" });
    ok("!! *** an adapter the frozen record does NOT name is written ***", r1.wrote === true, r1.why);
    ok("  ...into a gate-keyed document, so one file serves every WGSL gate",
       JSON.parse(disk).gates.gateA["nvidia/pascal"].laneSame === 18 &&
       JSON.parse(disk).gates.gateA["nvidia/pascal"].at === "T0", disk.replace(/\s+/g, " ").slice(0, 80));

    const r2 = recordReading("gateA", "google/swiftshader", { laneSame: 1 }, { ...io, frozen: REC, stamp: "T1" });
    ok("!! *** CONTROL: an adapter the FROZEN record already names is REFUSED ***",
       r2.wrote === false && /frozen/.test(r2.why),
       "otherwise --record would be a way to make a red gate green by running it, which is the one thing it must not be");
    ok("  ...and the refusal does not corrupt what was already on file",
       JSON.parse(disk).gates.gateA["nvidia/pascal"].laneSame === 18 &&
       !JSON.parse(disk).gates.gateA["google/swiftshader"], "a refused write leaves the document alone");

    const r3 = recordReading("gateA", "unknown/unknown", { laneSame: 1 }, { ...io, frozen: REC });
    ok("!! CONTROL: an adapter that would not name itself is REFUSED",
       r3.wrote === false && /has no owner|will not say/.test(r3.why),
       "two unidentified adapters are not evidence about each other -- they would share one slot");

    const r4 = recordReading("gateB", "nvidia/pascal", { x: 5 }, { ...io, frozen: REC, stamp: "T2" });
    ok("  a second gate is added BESIDE the first rather than replacing it",
       JSON.parse(disk).gates.gateA && JSON.parse(disk).gates.gateB["nvidia/pascal"].x === 5 && r4.wrote,
       "sweep-timings.json lost 46 rows to exactly this and the repair was merge-by-key");

    ok("!! *** readReadings returns the gate's own slice, and NOTHING for a gate that has none ***",
       readReadings("gateA", { read: io.read })["nvidia/pascal"].laneSame === 18 &&
       Object.keys(readReadings("gateC", { read: io.read })).length === 0);
    // *** THE FIRST DRAFT OF THIS ROW CRASHED INSTEAD OF FAILING, AND A SABOTAGE CAUGHT IT. *** It called
    // readReadings straight inside the condition, so deleting the try/catch it exists to test threw out of
    // ok() and took the whole gate down: exit 1 with ZERO FAIL lines, a finding reported as a stack trace.
    // That is the SIXTH instance of that species in this tree and the second I have written myself. A row
    // whose claim IS "this does not throw" has to CATCH, or it is asserting the claim by assuming it.
    const empty = (read) => { try { return Object.keys(readReadings("gateA", { read })).length === 0; } catch { return false; } };
    // *** THE PRECEDENCE, DRIVEN BY A FIXTURE BECAUSE NO LIVE RUN CAN SEE IT. *** Inverting the merge in
    // microfacetWgsl-selfcheck went 0 RED: the tree ships no readings file, so `recorded` is {} there and both
    // spreads give the same object. The property is real and the live data cannot exercise it, which is the
    // case this tree's own rule says to build a fixture for rather than count as covered.
    const FROZEN = { "google/swiftshader": { laneSame: 30 } };
    const LOOSE = { "google/swiftshader": { laneSame: 1 }, "nvidia/pascal": { laneSame: 18 } };
    const m = mergeRecords(FROZEN, LOOSE);
    ok("!! *** CONTROL: a recorded reading CANNOT override the frozen bound for the same adapter ***",
       m["google/swiftshader"].laneSame === 30,
       "30 on file beats the 1 a --record run would have written -- the whole safety of letting a gate write its own record");
    ok("  ...and it DOES cover an adapter the frozen record never named, which is the point",
       m["nvidia/pascal"].laneSame === 18 && Object.keys(m).length === 2);
    ok("  CONTROL: a null on either side is an empty record rather than a throw",
       Object.keys(mergeRecords(null, null)).length === 0 &&
       mergeRecords(null, LOOSE)["nvidia/pascal"].laneSame === 18 &&
       mergeRecords(FROZEN, null)["google/swiftshader"].laneSame === 30);

    ok("!! CONTROL: an ABSENT or unparseable file is no readings, never a throw",
       empty(() => { throw new Error("ENOENT"); }) && empty(() => "{{{ not json"),
       "a gate whose record file is missing must behave exactly like a gate whose adapter is unrecorded");
}

console.log(`\nadapterRecord-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
