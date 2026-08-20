// demo.mjs — the point of the whole thing, shown on one machine.
//
// Run: node demo.mjs
//
// The problem: a render (or physics step) that leans on Math.sin/cos/hypot/log2/atan2 produces a byte-exact
// result that is only byte-exact PER PLATFORM. The JS VM borrows those functions from the OS math library, and
// Linux's libm and macOS's libm disagree by a few ULPs -- so the same code, same input, same seed hashes to one
// value on Linux and a slightly different value on macOS. That is the drift.
//
// This runs a transcendental-heavy computation twice: once with host Math, once with strict-libm. It prints the
// hash of each output stream, and the largest disagreement between them. On THIS machine both hashes are stable.
// The difference is what happens on a DIFFERENT machine: the host hash can change (its inputs came from the OS
// libm); the strict hash cannot (its inputs came from this code). That is the whole claim, made concrete.
import crypto from "node:crypto";
import { strictSin, strictCos, strictHypot, strictLog2, strictAtan2 } from "./index.mjs";

// a small deterministic PRNG so the workload is identical every run and on every machine
function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// One "frame": project N points through a rotation, take their radius, bearing, and a log-depth -- the exact
// mix of transcendentals a renderer uses. `fns` selects host Math or the strict set.
function renderFrame(N, fns) {
    const rng = mulberry(1234567);
    const out = new Float64Array(N * 4);
    for (let i = 0; i < N; i++) {
        const x = (rng() * 2 - 1) * 1000, y = (rng() * 2 - 1) * 1000;
        const ang = (rng() * 2 - 1) * 3.141592653589793;   // a per-point angle in [-pi, pi], as a renderer uses
        const c = fns.cos(ang), s = fns.sin(ang);
        const rx = x * c - y * s, ry = x * s + y * c;   // rotate
        out[i * 4 + 0] = rx;
        out[i * 4 + 1] = fns.hypot(rx, ry);             // radius
        out[i * 4 + 2] = fns.atan2(ry, rx);             // bearing
        out[i * 4 + 3] = fns.log2(fns.hypot(rx, ry) + 2); // log-depth
    }
    return out;
}

const HOST = { sin: Math.sin, cos: Math.cos, hypot: Math.hypot, atan2: Math.atan2, log2: Math.log2 };
const STRICT = { sin: strictSin, cos: strictCos, hypot: strictHypot, atan2: strictAtan2, log2: strictLog2 };

const N = 100000;
const hostFrame = renderFrame(N, HOST);
const strictFrame = renderFrame(N, STRICT);

const hash = (f) => crypto.createHash("sha256").update(Buffer.from(f.buffer)).digest("hex");
let maxDiff = 0;
for (let i = 0; i < hostFrame.length; i++) maxDiff = Math.max(maxDiff, Math.abs(hostFrame[i] - strictFrame[i]));

console.log("render fingerprint over " + N + " points (sin, cos, hypot, atan2, log2):\n");
console.log("  host Math   sha256:  " + hash(hostFrame));
console.log("  strict-libm sha256:  " + hash(strictFrame));
console.log("");
console.log("  max |host - strict| over " + (N * 4) + " values:  " + maxDiff.toExponential(3));
console.log("");
console.log("  On this machine both hashes are stable across runs.");
console.log("  On a DIFFERENT OS the host hash can change (its numbers came from that OS's libm);");
console.log("  the strict hash cannot (its numbers came from this code). That is the guarantee.");
