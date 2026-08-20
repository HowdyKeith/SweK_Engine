// tools/repro/harness.js
//
// The reproducibility harness -- the whole verification spine of this engine, turned outward at anyone's computation.
// Everything the fingerprint does for SweK's own physics, this does for a set of "probes" you supply: named functions
// that return an array of numbers. It hashes each, rolls them into a master, and packages an attestation two machines
// can compare to prove they agree to the bit -- and, crucially, it catches the thing that silently breaks
// reproducibility more than any architecture difference: hidden non-determinism. Run a probe a few times, and if its
// hash is not identical every time, the computation is reaching for Math.random, the clock, unordered iteration, or
// something else that will not reproduce. That is a bug the author usually cannot see, and this names it.
//
// It depends only on the portable hash, so it is standalone -- drop these three files (this, hash.mjs, sha256.mjs) into
// any project and point it at your own functions; no engine required.
import { hashFloats } from "../hash.mjs";
import { sha256Hex } from "../sha256.mjs";

const enc = new TextEncoder();
function masterOf(subs) { let s = ""; for (const x of subs) s += x.name + "=" + x.hash + ";"; return sha256Hex(enc.encode(s)); }

// Fingerprint a set of probes ([{ name, run: () => number[] }]) -> per-probe hashes and a master.
export function fingerprintProbes(probes) {
    const subsystems = probes.map((p) => ({ name: p.name, hash: hashFloats(p.name, p.run()) }));
    return { subsystems, master: masterOf(subsystems) };
}

// Run each probe several times and report which ones do NOT reproduce -- the hidden-non-determinism detector.
export function checkDeterminism(probes, runs = 4) {
    return probes.map((p) => {
        const hashes = []; for (let i = 0; i < runs; i++) hashes.push(hashFloats(p.name, p.run()));
        const deterministic = hashes.every((h) => h === hashes[0]);
        return { name: p.name, deterministic, hash: hashes[0] };
    });
}

// Package this machine's fingerprint of the probes as a portable attestation.
export function attestProbes(probes, { label = "this-machine", arch = "?" } = {}) {
    const { subsystems, master } = fingerprintProbes(probes);
    return { kind: "repro-attestation", label, arch, count: subsystems.length, subsystems, master };
}

// Compare two attestations -> identical, and if not, exactly which probes diverged or are missing from one side.
export function compareAttestations(a, b) {
    const mapA = new Map(a.subsystems.map((s) => [s.name, s.hash])), mapB = new Map(b.subsystems.map((s) => [s.name, s.hash]));
    const names = new Set([...mapA.keys(), ...mapB.keys()]);
    const diverged = [], onlyA = [], onlyB = [];
    for (const n of names) { const ha = mapA.get(n), hb = mapB.get(n); if (ha === undefined) onlyB.push(n); else if (hb === undefined) onlyA.push(n); else if (ha !== hb) diverged.push(n); }
    diverged.sort(); onlyA.sort(); onlyB.sort();
    return { identical: a.master === b.master && !diverged.length && !onlyA.length && !onlyB.length, diverged, onlyA, onlyB, agreed: [...names].length - diverged.length - onlyA.length - onlyB.length };
}

// Example probes, to show the tool working on foreign code: one honest, two secretly non-deterministic.
export const EXAMPLE_PROBES = [
    { name: "sum-of-reciprocal-squares", run: () => { const a = []; for (let n = 1; n <= 50; n++) a.push(1 / (n * n)); return a; } },   // deterministic
    { name: "uses-random", run: () => [Math.random(), Math.random(), Math.random()] },                                                    // NOT deterministic
    { name: "uses-clock", run: () => [Date.now() % 100000, performance.now() % 1000] },                                                   // NOT deterministic
    { name: "unordered-set-iteration", run: () => { const s = new Set(); for (let i = 0; i < 8; i++) s.add((i * 2654435761) % 97); return [...s].map((x, i) => x + i * 0); } }, // deterministic here, but the pattern to watch
];
