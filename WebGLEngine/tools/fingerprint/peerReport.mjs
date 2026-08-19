// tools/fingerprint/peerReport.mjs
//
// v2892 -- WHAT A PEER SAYS WHEN IT JOINS, AND WHAT THE FLEET DOES WITH IT.
//
// The pieces were all here and none of them met. attest.mjs emits per-subsystem HASHES and compares exactly TWO
// machines. ledger.mjs persists results content-addressed with provenance and classifies MATCH / REGRESSION /
// NEW. And v2891 added a physics baseline -- MEASURED OBSERVABLES with earned tolerances -- which no peer has
// ever reported, because attestation only knows how to carry hashes.
//
// So there are three real gaps, and the middle one is a design problem rather than a plumbing one:
//
//   1. TWO-WAY ONLY. There are three machines. compareAttestations(a, b) run three times, by hand, is how the
//      cross-architecture claim has been checked -- which is to say it has not been checked.
//   2. HASHES CANNOT CARRY PHYSICS. A hash answers "identical bits". A measured observable is a float with a
//      tolerance: two machines can legitimately agree while differing in the last ulp, and the ledger's exact
//      MATCH would call that a REGRESSION. Feeding floats into a hash ledger would either drown the fleet in
//      false regressions or force a rounding that throws away the very digits in question.
//   3. NOBODY REPORTS ON JOIN. The ledger is a CLI oracle. A peer coming online contributes nothing.
//
// THE KEY IDEA, AND IT COMES FREE FROM v2891: the corroboration harness already labels every measurement
// PORTABLE or not -- portable meaning its code path touches only IEEE-specified operations and strict libm, so
// there is nothing left for two libms to disagree about. That flag is a PREDICTION about cross-machine
// behaviour, and this module turns it into the comparison rule:
//
//   portable observable   -> the peers must agree BIT FOR BIT. Any difference at all is a finding, because a
//                            specified-ops path that differs means something is wrong that is not "libm varies"
//                            (a JIT bug, x87 80-bit intermediates, fast-math -- exactly what mathProbe.mjs says
//                            is worth chasing).
//   unportable observable -> the peers must agree WITHIN TOLERANCE, and a difference is expected and quantified:
//                            it is the cost of having a transcendental in the path, measured rather than feared.
//
// That is a sharper cross-machine claim than the master hash can make. The master says "something moved". This
// says "this number was supposed to be identical everywhere and is not", or "this number was allowed to drift
// and drifted by 3e-16, which is the drift budget being spent as designed".
//
// N-WAY, NOT PAIRWISE. compareReports takes ALL peers at once and, per observable, partitions them into
// agreement CLUSTERS. Three machines where two agree and one differs is a different story from three machines
// that all differ, and pairwise comparison cannot tell those apart without a human holding the results in their
// head.

import { attestation, compareAttestations } from "./attest.mjs";
import { measureBaseline, measureFns, runCrossChecks, corroborateLyapunov } from "../roundhouse/physicsBaseline.mjs";
import { measurePortabilityAsync } from "../roundhouse/corroborate.mjs";

const bits = (x) => {
    const b = new DataView(new ArrayBuffer(8));
    b.setFloat64(0, x);
    return b.getBigUint64(0).toString(16).padStart(16, "0");
};

/**
 * THE FULL REPORT a peer emits on join. Everything a fleet needs to decide whether this machine computes the
 * same universe as the others: the subsystem hashes (bit-identity), the measured physics (did the physics move),
 * the corroboration status of the unkeyed numbers, and the libm tripwire verdict for the fingerprint path.
 *
 * Everything here is COMPUTED, never read from a cache -- the ledger's own rule: a green that came from someone
 * else having run it is not a green.
 */
export async function peerReport({ version = "?", arch = process.arch, host = "?" } = {}) {
    const att = attestation({ version, arch, host });

    const rows = await measureBaseline();
    const fns = await measureFns();
    // Each observable carries its portability verdict, which is the cross-machine PREDICTION for it. The flag is
    // obtained by RE-RUNNING the measurement with the libm tripwire armed -- calibration caught the shortcut of
    // wrapping the finished value, which arms the tripwire around a variable read and marks EVERYTHING portable.
    const observables = [];
    for (const r of rows) {
        const port = await measurePortabilityAsync(fns[r.id]);
        // THE FLAG MUST BE EARNED ON THE SAME NUMBER THE BASELINE PINNED. If the re-run disagrees with the row,
        // the portability verdict describes some other computation -- which is exactly how v2892 shipped a flag
        // measured on a promise. Refuse rather than report a flag about the wrong thing.
        if (!Number.isFinite(port.value) || Math.abs(port.value - r.measured) > Math.abs(r.measured) * 1e-9) {
            throw new Error(`peerReport: portability re-measurement of '${r.id}' returned ${port.value}, ` +
                `which is not the baselined ${r.measured} -- the measure function and the baseline disagree`);
        }
        observables.push({
            id: r.id,
            kind: r.kind,
            value: r.measured,
            bits: bits(r.measured),
            expected: r.value,
            tol: r.tol,
            withinBaseline: r.within,
            portable: port.rawCalls === 0,
            condition: r.condition || null,
        });
    }

    const crosses = await runCrossChecks(rows);
    const lyap = await corroborateLyapunov(3.8);

    return {
        engine: "SweK",
        kind: "peer-report",
        reportVersion: 1,
        host, arch, version,
        node: typeof process !== "undefined" ? process.version : "?",
        attestation: att,
        observables,
        crossChecks: crosses.map((c) => ({ quantity: c.quantity, verdict: c.verdict, relDiff: c.relDiff })),
        corroborations: [{
            quantity: lyap.quantity,
            value: lyap.value,
            bits: bits(lyap.value),
            corroborated: lyap.corroborated,
            criteria: lyap.criteria,
            portable: lyap.criteria.portable,
        }],
    };
}

/** Partition values into clusters of exact bit-agreement. Returns [{ bits, value, peers: [host] }] biggest first. */
function clusterExact(entries) {
    const byBits = new Map();
    for (const e of entries) {
        if (!byBits.has(e.bits)) byBits.set(e.bits, { bits: e.bits, value: e.value, peers: [] });
        byBits.get(e.bits).peers.push(e.host);
    }
    return [...byBits.values()].sort((x, y) => y.peers.length - x.peers.length);
}

/**
 * N-WAY COMPARISON. Give it every peer's report; it returns the fleet verdict per subsystem and per observable.
 *
 * Per observable the rule is the portability prediction:
 *   portable   + one cluster    -> "identical"        (the claim the whole apparatus exists to make)
 *   portable   + many clusters  -> "PORTABILITY-VIOLATION"  -- the loudest thing this report can say
 *   unportable + within tol     -> "within-tolerance"  (drift budget spent as designed; the spread is reported)
 *   unportable + outside tol    -> "DIVERGENT"
 */
export function compareReports(reports) {
    if (!Array.isArray(reports) || reports.length < 2) throw new Error("compareReports: need at least two peer reports");
    const peers = reports.map((r) => ({ host: r.host, arch: r.arch, version: r.version }));

    // --- subsystem hashes, N-way -------------------------------------------------------------------------------
    const names = new Set();
    for (const r of reports) for (const s of r.attestation.subsystems) names.add(s.name);
    const subsystems = [];
    for (const name of [...names].sort()) {
        const entries = reports.map((r) => {
            const s = r.attestation.subsystems.find((x) => x.name === name);
            return { host: r.host, bits: s ? s.hash : "MISSING", value: s ? s.hash : null };
        });
        const clusters = clusterExact(entries);
        subsystems.push({
            name,
            agreed: clusters.length === 1 && clusters[0].bits !== "MISSING",
            clusters: clusters.map((c) => ({ hash: c.bits, peers: c.peers })),
        });
    }

    // --- measured observables, N-way, under the portability prediction ------------------------------------------
    const ids = new Set();
    for (const r of reports) for (const o of r.observables) ids.add(o.id);
    const observables = [];
    for (const id of [...ids]) {
        const entries = reports.map((r) => {
            const o = r.observables.find((x) => x.id === id);
            return o ? { host: r.host, bits: o.bits, value: o.value, portable: o.portable, tol: o.tol, kind: o.kind, condition: o.condition } : null;
        }).filter(Boolean);
        if (entries.length < 2) { observables.push({ id, verdict: "insufficient-peers", entries: entries.length }); continue; }

        const portable = entries.every((e) => e.portable);
        const clusters = clusterExact(entries);
        const values = entries.map((e) => e.value);
        const lo = Math.min(...values), hi = Math.max(...values);
        const scale = Math.max(Math.abs(lo), Math.abs(hi), 1e-300);
        const spread = (hi - lo) / scale;
        const tol = Math.max(...entries.map((e) => e.tol));

        let verdict;
        if (portable && clusters.length === 1) verdict = "identical";
        else if (portable) verdict = "PORTABILITY-VIOLATION";
        else if (spread <= tol) verdict = "within-tolerance";
        else verdict = "DIVERGENT";

        observables.push({
            id, verdict, portable, kind: entries[0].kind, condition: entries[0].condition,
            spread, tol, clusters: clusters.map((c) => ({ value: c.value, bits: c.bits, peers: c.peers })),
        });
    }

    const divergentSubsystems = subsystems.filter((s) => !s.agreed).map((s) => s.name);
    const violations = observables.filter((o) => o.verdict === "PORTABILITY-VIOLATION").map((o) => o.id);
    const divergentObservables = observables.filter((o) => o.verdict === "DIVERGENT").map((o) => o.id);

    return {
        peers,
        subsystems,
        observables,
        summary: {
            subsystemsAgreed: subsystems.filter((s) => s.agreed).length,
            subsystemsDiverged: divergentSubsystems.length,
            divergentSubsystems,
            observablesIdentical: observables.filter((o) => o.verdict === "identical").length,
            observablesWithinTolerance: observables.filter((o) => o.verdict === "within-tolerance").length,
            portabilityViolations: violations,
            divergentObservables,
            // The fleet claim, in one boolean: same bits where bits were promised, same physics where they were not.
            fleetAgrees: divergentSubsystems.length === 0 && violations.length === 0 && divergentObservables.length === 0,
        },
    };
}

/** Human-readable fleet report -- the thing that replaces eyeballing two markdown tables. */
export function reportLines(cmp) {
    const L = [];
    L.push("SweK fleet comparison -- " + cmp.peers.map((p) => `${p.host}(${p.arch}/${p.version})`).join(" vs "));
    L.push(`  subsystems: ${cmp.summary.subsystemsAgreed} agreed, ${cmp.summary.subsystemsDiverged} diverged` +
        (cmp.summary.divergentSubsystems.length ? " -> " + cmp.summary.divergentSubsystems.join(", ") : ""));
    for (const o of cmp.observables) {
        if (o.verdict === "identical") L.push(`  ${o.id}: IDENTICAL across all peers (portable -- as predicted)`);
        else if (o.verdict === "within-tolerance") L.push(`  ${o.id}: within tolerance (spread ${(o.spread * 100).toExponential(2)}%, tol ${(o.tol * 100).toFixed(3)}%) -- unportable path, drift budget spent as designed`);
        else if (o.verdict === "PORTABILITY-VIOLATION") L.push(`  ${o.id}: *** PORTABILITY VIOLATION *** a specified-ops path gave different bits on ${o.clusters.length} machines -- this is NOT libm variance; chase the JIT, x87 intermediates or fast-math`);
        else if (o.verdict === "DIVERGENT") L.push(`  ${o.id}: DIVERGENT (spread ${(o.spread * 100).toFixed(4)}% > tol ${(o.tol * 100).toFixed(3)}%)` + (o.condition ? ` [condition: ${o.condition}]` : ""));
        else L.push(`  ${o.id}: ${o.verdict}`);
    }
    L.push(cmp.summary.fleetAgrees
        ? "  FLEET AGREES: same bits where bits were promised, same physics where they were not."
        : "  FLEET DOES NOT AGREE -- see the lines above; each names WHICH quantity and on which machines.");
    return L;
}

/**
 * LEDGER ENTRIES FROM A PEER REPORT. The ledger is content-addressed and exact-match, which is right for hashes
 * and wrong for floats -- so observables are recorded with the OBSERVABLE'S BITS as the result hash, keyed by
 * id + portability. That keeps the ledger's MATCH/REGRESSION/NEW semantics honest: for a portable observable a
 * second bit pattern IS a regression (it was promised identical); for an unportable one the ledger simply
 * accumulates the machines' variants under one key, and the divergence is read from mergeLedgers rather than
 * being mistaken for a fault.
 */
export function ledgerEntriesFrom(report) {
    const entries = report.attestation.subsystems.map((s) => ({
        key: "fp:" + s.name, name: s.name, resultHash: s.hash,
        machine: report.host, arch: report.arch, version: report.version,
    }));
    for (const o of report.observables) {
        entries.push({
            key: "obs:" + o.id + (o.portable ? ":portable" : ":libm"),
            name: o.id,
            resultHash: o.bits,
            machine: report.host, arch: report.arch, version: report.version,
        });
    }
    for (const c of report.corroborations) {
        entries.push({
            key: "cor:" + c.quantity + (c.portable ? ":portable" : ":libm"),
            name: c.quantity,
            resultHash: c.bits + (c.corroborated ? ":corroborated" : ":uncorroborated"),
            machine: report.host, arch: report.arch, version: report.version,
        });
    }
    return entries;
}

/** Convenience for the on-join path: compute this peer's report and fold it into a ledger. */
export async function joinFleet(ledger, { record, opts = {} } = {}) {
    const report = await peerReport(opts);
    for (const e of ledgerEntriesFrom(report)) record(ledger, e);
    return { report, ledger };
}
