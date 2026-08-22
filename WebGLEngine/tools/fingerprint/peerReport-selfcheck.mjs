// tools/fingerprint/peerReport-selfcheck.mjs
//
// Run: node tools/fingerprint/peerReport-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2892 -- THE CROSS-MACHINE CLAIM, MADE CHECKABLE.
//
// Three machines, and the claim that they compute the same physics has always been a human comparing two hex
// masters by eye -- which is to say it has never been checked. attest.mjs could compare two peers' HASHES;
// ledger.mjs could remember hashes with provenance; v2891 added measured PHYSICS that no peer could report at
// all, because an attestation only knows how to carry hashes.
//
// What makes the join more than plumbing is that a hash and a measurement need DIFFERENT comparison rules, and
// v2891 already produced the rule: the corroboration harness labels each measurement portable or not, and that
// label is a PREDICTION about cross-machine behaviour. Portable means the code path has nothing left for two
// libms to disagree about -- so those peers must match BIT FOR BIT, and any difference is a real fault (a JIT
// bug, x87 intermediates, fast-math) rather than the shrug of "libm varies". Unportable means drift is expected,
// bounded, and reported as a number. This gate holds that rule, in both directions: it must catch a one-ulp
// violation, and it must NOT cry wolf over a tolerated drift.

import { peerReport, compareReports, reportLines, ledgerEntriesFrom } from "./peerReport.mjs";
import { measureFns } from "../roundhouse/physicsBaseline.mjs";
import { measurePortability } from "../roundhouse/corroborate.mjs";
import { emptyLedger, record, mergeLedgers } from "../ledger/ledger.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const bitsOf = (x) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return d.getBigUint64(0).toString(16).padStart(16, "0"); };
const clone = (o) => JSON.parse(JSON.stringify(o));

const local = await peerReport({ version: "v2892", arch: "x64", host: "galaxina" });

// ---- 1. THE REPORT CARRIES WHAT A FLEET NEEDS -------------------------------------------------------------------
{
    ok("!! a peer report carries hashes AND measured physics AND corroborations",
        local.attestation.subsystems.length === 50 && local.observables.length >= 5 && local.corroborations.length >= 1,
        local.attestation.subsystems.length + " subsystems, " + local.observables.length + " observables, " +
        local.corroborations.length + " corroboration record(s) -- an attestation alone could carry only the first");
    ok("every observable declares its portability, kind and bit pattern",
        local.observables.every((o) => typeof o.portable === "boolean" && o.kind && /^[0-9a-f]{16}$/.test(o.bits)));
    ok("the artefact entry travels WITH its condition, so a peer cannot inherit it stripped of the caveat",
        local.observables.some((o) => o.kind === "artefact" && o.condition && o.condition.includes("RESOLUTION DEPENDENT")));
}

// ---- 2. THE PORTABILITY FLAG IS EARNED BY RE-MEASURING, NOT BY REREADING ------------------------------------------
{
    // The shortcut this gate exists to forbid: wrapping the FINISHED value arms the tripwire around a variable
    // read, sees zero libm calls, and marks everything portable. Calibration caught exactly that in this module.
    const fns = await measureFns();
    const real = measurePortability(fns["logistic-lyapunov-r38"]);
    const sham = measurePortability(() => 0.431928);
    ok("!! re-measuring is what earns the flag -- rereading a finished number always says 'portable'",
        real.rawCalls === 0 && sham.rawCalls === 0,
        "both read zero here, which is the trap: the sham would say portable for a Math.log-riddled quantity too");
    const libmy = measurePortability(() => { let s = 0; for (let i = 1; i < 500; i++) s += Math.log(i); return s; });
    ok("...and a genuinely libm-dependent measurement is caught when actually run",
        libmy.rawCalls === 499, libmy.rawCalls + " raw calls named at " + libmy.sites[0]);
    ok("all five pinned observables are genuinely portable on this machine",
        local.observables.every((o) => o.portable),
        "so the fleet prediction for every one of them is BIT-IDENTICAL, not merely close");
}

// ---- 3. N-WAY AGREEMENT: three peers that agree, agree ------------------------------------------------------------
{
    const atlas = { ...clone(local), host: "stellar-atlas" };
    const mseries = { ...clone(local), host: "m-series", arch: "arm64" };
    const cmp = compareReports([local, atlas, mseries]);
    ok("!! three agreeing peers produce one fleet verdict, not three pairwise comparisons held in a human's head",
        cmp.summary.fleetAgrees === true && cmp.summary.subsystemsDiverged === 0 && cmp.summary.observablesIdentical === local.observables.length,
        cmp.summary.subsystemsAgreed + " subsystems agreed; " + cmp.summary.observablesIdentical + " observables bit-identical across x64 and arm64");
    ok("the report names the peers and their architectures", reportLines(cmp)[0].includes("arm64"));
}

// ---- 4. AND THE FAILURES ARE CAUGHT, EACH NAMED ---------------------------------------------------------------------
{
    // (a) one ulp on a PORTABLE observable: the loudest thing this report can say
    const drifted = clone(local); drifted.host = "m-series"; drifted.arch = "arm64";
    const o = drifted.observables.find((x) => x.id === "logistic-lyapunov-r38");
    o.value = o.value * (1 + 2e-16); o.bits = bitsOf(o.value);
    const cmpA = compareReports([local, drifted]);
    ok("!! a ONE-ULP difference in a portable quantity is a PORTABILITY VIOLATION, not a rounding shrug",
        cmpA.summary.portabilityViolations.includes("logistic-lyapunov-r38") && cmpA.summary.fleetAgrees === false,
        "a specified-ops path that differs means a JIT bug, x87 intermediates or fast-math -- mathProbe.mjs's whole point, now enforced");

    // (b) a diverged subsystem hash is named, exactly as attest could for two peers -- but N-way
    const badHash = clone(local); badHash.host = "stellar-atlas";
    badHash.attestation.subsystems.find((s) => s.name === "obb-collision").hash = "0".repeat(64);
    const cmpB = compareReports([local, badHash, { ...clone(local), host: "m-series" }]);
    ok("!! a diverged subsystem is named, and the clusters say WHICH machines are on each side",
        cmpB.summary.divergentSubsystems.includes("obb-collision") &&
        cmpB.subsystems.find((s) => s.name === "obb-collision").clusters.length === 2,
        "two clusters: the odd machine is identified, not just 'the masters differ, somewhere'");

    // (c) an UNPORTABLE observable drifting within tolerance must NOT be reported as a fault
    const a2 = clone(local), b2 = clone(local);
    b2.host = "m-series";
    for (const rep of [a2, b2]) rep.observables.find((x) => x.id === "isco-pw-onset").portable = false;
    const ob = b2.observables.find((x) => x.id === "isco-pw-onset");
    ob.value = ob.value * (1 + 1e-9); ob.bits = bitsOf(ob.value);
    const cmpC = compareReports([a2, b2]);
    const verdict = cmpC.observables.find((x) => x.id === "isco-pw-onset").verdict;
    ok("!! an unportable quantity drifting INSIDE its tolerance is 'within-tolerance', not a fault",
        verdict === "within-tolerance" && cmpC.summary.fleetAgrees === true,
        "the drift budget spent as designed -- a gate that cried wolf here would be turned off within a week");

    // (d) ...and outside tolerance it is DIVERGENT
    const b3 = clone(b2);
    const ob3 = b3.observables.find((x) => x.id === "isco-pw-onset");
    ob3.value = ob3.value * 1.05; ob3.bits = bitsOf(ob3.value);
    const cmpD = compareReports([a2, b3]);
    ok("...and outside tolerance the same quantity is DIVERGENT",
        cmpD.observables.find((x) => x.id === "isco-pw-onset").verdict === "DIVERGENT" && cmpD.summary.fleetAgrees === false);
}

// ---- 5. THE JOIN: a peer's results become the fleet's memory ------------------------------------------------------
{
    const entries = ledgerEntriesFrom(local);
    ok("!! a peer report converts to ledger entries for hashes, observables AND corroborations",
        entries.some((e) => e.key.startsWith("fp:")) && entries.some((e) => e.key.startsWith("obs:")) && entries.some((e) => e.key.startsWith("cor:")),
        entries.length + " entries -- before this, a joining peer contributed hashes and nothing about the physics");
    ok("observable keys carry the portability contract, so the ledger knows which ones were PROMISED identical",
        entries.filter((e) => e.key.startsWith("obs:")).every((e) => /:(portable|libm)$/.test(e.key)));

    // two agreeing peers -> one result hash per key; a disagreeing third -> a divergence the ledger reports
    const drifted = clone(local); drifted.host = "m-series"; drifted.arch = "arm64";
    const od = drifted.observables.find((x) => x.id === "logistic-lyapunov-r38");
    od.value = od.value * (1 + 2e-16); od.bits = bitsOf(od.value);

    let L1 = emptyLedger(), L2 = emptyLedger();
    for (const e of ledgerEntriesFrom(local)) record(L1, e);
    for (const e of ledgerEntriesFrom(drifted)) record(L2, e);
    const { divergences } = mergeLedgers(L1, L2);
    const obsDiv = divergences.filter((d) => d.key.startsWith("obs:"));
    ok("!! merging two peers' ledgers surfaces the physics divergence with both machines named",
        obsDiv.length === 1 && obsDiv[0].key.includes("logistic-lyapunov-r38"),
        "mergeLedgers already knew how to report machines that disagree on one key -- it had simply never been given physics to disagree about");
    const provs = Object.values(obsDiv[0].results).flat().map((p) => p.machine).sort();
    ok("...and the provenance names both sides", provs.includes("galaxina") && provs.includes("m-series"), provs.join(", "));
}

console.log();
if (fails) { console.log("peerReport-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("peerReport-selfcheck: all checks pass");
