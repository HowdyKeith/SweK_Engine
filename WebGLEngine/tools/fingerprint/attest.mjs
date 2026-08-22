// WebGLEngine/tools/fingerprint/attest.mjs
//
// Peer verification. The fingerprint proves a machine agrees with ITSELF run to run; the cross-architecture claim --
// that Galaxina and an arm64 Mac compute the same physics to the bit -- has until now been a human comparing two hex
// masters by eye. This makes that comparison a first-class operation between two SweK instances. Each machine emits an
// ATTESTATION: its per-subsystem hashes and the master, plus a label of which machine it is. A verifier compares two
// attestations and does the thing eyeballing a master cannot: when they disagree it names WHICH subsystems diverged,
// turning "the masters differ, somewhere" into "thermal-diffusion diverged." Transport is left to the caller -- a peer
// hands over its attestation JSON however it likes (the LAN, a file, a paste); the compare is the part that must be
// exactly right, so the compare is the part that is gated.
//
// CLI:
//   node tools/fingerprint/attest.mjs                      -> print this machine's attestation JSON
//   node tools/fingerprint/attest.mjs --compare a.json b.json  -> compare two attestation files, exit 0 iff identical
import { computeFingerprint } from "./fingerprint.mjs";

// This machine's attestation: what it computed, and a label of who it is.
export function attestation({ version = "?", arch = "?", host = "?" } = {}) {
    const { subsystems, master } = computeFingerprint();
    return { engine: "SweK", version, arch, host, count: subsystems.length, subsystems: subsystems.map((s) => ({ name: s.name, hash: s.hash })), master };
}

// Compare two attestations. Reports whether they are byte-identical AND, if not, exactly which subsystems diverged or
// are missing from one side -- the diagnostic a manual master comparison cannot give.
export function compareAttestations(a, b) {
    const mapA = new Map(a.subsystems.map((s) => [s.name, s.hash]));
    const mapB = new Map(b.subsystems.map((s) => [s.name, s.hash]));
    const names = new Set([...mapA.keys(), ...mapB.keys()]);
    const diverged = [], onlyA = [], onlyB = [];
    for (const n of names) {
        const ha = mapA.get(n), hb = mapB.get(n);
        if (ha === undefined) onlyB.push(n);
        else if (hb === undefined) onlyA.push(n);
        else if (ha !== hb) diverged.push(n);
    }
    diverged.sort(); onlyA.sort(); onlyB.sort();
    const agreed = [...names].length - diverged.length - onlyA.length - onlyB.length;
    return {
        identical: a.master === b.master && diverged.length === 0 && onlyA.length === 0 && onlyB.length === 0,
        masterEqual: a.master === b.master,
        masterA: a.master, masterB: b.master,
        agreed, diverged, onlyA, onlyB,
    };
}

// Verify this machine against a peer's attestation (already received, however). Returns the local attestation and the
// comparison, so a caller can log exactly what matched and what did not.
export function peerVerify(peerAttestation, opts = {}) {
    const local = attestation(opts);
    return { local, peer: peerAttestation, result: compareAttestations(local, peerAttestation) };
}

// A one-line human verdict for a comparison result.
export function verdict(res, labelA = "A", labelB = "B") {
    if (res.identical) return "IDENTICAL -- " + labelA + " and " + labelB + " agree on all " + res.agreed + " subsystems and the master. Byte-for-byte proof across the pair.";
    const parts = [];
    if (res.diverged.length) parts.push("diverged: " + res.diverged.join(", "));
    if (res.onlyA.length) parts.push("only in " + labelA + ": " + res.onlyA.join(", "));
    if (res.onlyB.length) parts.push("only in " + labelB + ": " + res.onlyB.join(", "));
    return "DIVERGENT -- " + res.agreed + " agree; " + parts.join("; ") + ".";
}

// ---- CLI ------------------------------------------------------------------------------------------------
if (typeof process !== "undefined" && process.argv) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const args = process.argv.slice(2);
    if (args[0] === "--compare" && args[2]) {
        const fs = await import("node:fs");
        const a = JSON.parse(fs.readFileSync(args[1], "utf8")), b = JSON.parse(fs.readFileSync(args[2], "utf8"));
        const res = compareAttestations(a, b);
        console.log(verdict(res, a.host || args[1], b.host || args[2]));
        process.exit(res.identical ? 0 : 1);
    } else {
        const os = await import("node:os");
        console.log(JSON.stringify(attestation({ arch: process.arch, host: os.hostname() }), null, 2));
    }
} }
