// FILE: physics/crypto/secp256k1.mjs
// VERSION: v4172 -- the elliptic-curve half of Bitcoin, which this engine had none of.
//
// demos_code/bitcoin_miner.js does double-SHA-256 over block headers, with the VBA cross-runtime comparison
// (identical maths, ~150 H/s against ~100k H/s). THAT IS THE HASHING HALF. The other half -- how a private
// key becomes an address -- was missing entirely: a grep for secp256k1, Jacobian, pointAdd or scalarMult over
// the whole tree returned nothing.
//
// Technique read from tongriyaotxt/gpu-keyhunt (MIT): private key -> k*G -> HASH160 -> address, with
// windowed scalar multiplication in Jacobian coordinates and Montgomery batch inversion.
//
// *** WHAT IS DELIBERATELY NOT BUILT: THE SEARCH. *** That repo's purpose is scanning private keys against a
// database of funded addresses, and its own README says the expected value is negative -- "you will burn more
// electricity than the astronomical-unlikely hit pays". The PIPELINE is worth having and the scan is not, so
// this module computes an address from a key you supply and has no notion of a key space, a database, or a
// hit. It is the demo's missing half, not a tool pointed at anyone.
//
// *** AND IT USES BigInt, NOT 256-BIT LIMBS, WHICH IS A DECISION RATHER THAN A SHORTCUT. *** gpu-keyhunt
// carries its own limb arithmetic because a GPU has no bignum. This runs on a CPU where BigInt is exact,
// constant-effort to read, and impossible to get subtly wrong in the carry chain -- and the whole point here
// is a checkable reference, not throughput. The Jacobian coordinates and the batch inversion are kept because
// they are the ALGORITHMIC content; the limbs were a hardware detail.
//
// *** NOT CONSTANT TIME, AND THAT IS STATED RATHER THAN IMPLIED. *** The windowed ladder branches on scalar
// bits and BigInt itself is variable-time. Do not sign anything with this. It exists to be verified against
// an answer key, and node's own crypto (OpenSSL) is that key in the gate next door.
"use strict";

/** The curve, from SEC 2 v2. Every one of these is checked against an independent source in the gate. */
export const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export const A = 0n;
export const B = 7n;
export const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
export const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

/** Modulo that returns a NON-NEGATIVE residue. JS % keeps the sign of the dividend, which is wrong here. */
export const mod = (a, m = P) => { const r = a % m; return r < 0n ? r + m : r; };

/** Modular inverse by the extended Euclidean algorithm. Throws on 0, which has no inverse. */
export function invMod(a, m = P) {
    let lo = mod(a, m), hi = m, x = 1n, y = 0n;
    if (lo === 0n) throw new Error("invMod: 0 has no inverse mod " + m);
    while (lo > 1n) {
        const q = hi / lo, r = hi % lo;
        [x, y] = [y - q * x, x];
        [hi, lo] = [lo, r];
    }
    return mod(x, m);
}

/**
 * *** MONTGOMERY'S BATCH INVERSION -- n inverses for ONE inversion and 3n multiplications. ***
 *
 * The trick that makes a GPU search viable at all, and it has a property worth gating: it is not an
 * approximation or a heuristic, it is an identity. Running prefix products, one inverse of the total, then
 * unwinding backwards. A zero anywhere poisons the whole product, so zeros are REFUSED rather than skipped --
 * silently returning 0 for them would give every later element the wrong inverse and nothing would say so.
 */
export function batchInvMod(values, m = P) {
    const n = values.length;
    if (n === 0) return [];
    const prefix = new Array(n);
    let acc = 1n;
    for (let i = 0; i < n; i++) {
        const v = mod(values[i], m);
        if (v === 0n) throw new Error("batchInvMod: element " + i + " is 0 and has no inverse");
        prefix[i] = acc;
        acc = mod(acc * v, m);
    }
    let inv = invMod(acc, m);
    const out = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        const v = mod(values[i], m);
        out[i] = mod(inv * prefix[i], m);
        inv = mod(inv * v, m);
    }
    return out;
}

/** A point in JACOBIAN coordinates: (X, Y, Z) stands for the affine (X/Z^2, Y/Z^3). Z = 0 is infinity. */
export const INFINITY = Object.freeze({ x: 0n, y: 1n, z: 0n });
export const isInfinity = (Pt) => Pt.z === 0n;

/** Affine -> Jacobian. */
export const toJacobian = (x, y) => ({ x: mod(x), y: mod(y), z: 1n });

/**
 * Jacobian -> affine. THE ONE DIVISION IN THE WHOLE SCHEME, which is why the ladder stays in Jacobian: an
 * inversion costs roughly a hundred multiplications, so doing it once at the end rather than per step is the
 * entire reason these coordinates exist.
 */
export function toAffine(Pt) {
    if (isInfinity(Pt)) return null;
    const zi = invMod(Pt.z), zi2 = mod(zi * zi), zi3 = mod(zi2 * zi);
    return { x: mod(Pt.x * zi2), y: mod(Pt.y * zi3) };
}

/** Point doubling in Jacobian coordinates, for the a = 0 curve (which secp256k1 is). */
export function pointDouble(Pt) {
    if (isInfinity(Pt) || Pt.y === 0n) return INFINITY;
    const y2 = mod(Pt.y * Pt.y);
    const S = mod(4n * Pt.x * y2);
    const M = mod(3n * Pt.x * Pt.x);          // + a*Z^4, and a is 0 here
    const X = mod(M * M - 2n * S);
    const Y = mod(M * (S - X) - 8n * y2 * y2);
    const Z = mod(2n * Pt.y * Pt.z);
    return { x: X, y: Y, z: Z };
}

/** Point addition in Jacobian coordinates. Falls back to doubling when the inputs coincide. */
export function pointAdd(Pa, Pb) {
    if (isInfinity(Pa)) return Pb;
    if (isInfinity(Pb)) return Pa;
    const z1z1 = mod(Pa.z * Pa.z), z2z2 = mod(Pb.z * Pb.z);
    const U1 = mod(Pa.x * z2z2), U2 = mod(Pb.x * z1z1);
    const S1 = mod(Pa.y * Pb.z * z2z2), S2 = mod(Pb.y * Pa.z * z1z1);
    if (U1 === U2) {
        // SAME x. Either the same point (double it) or a point and its negation (which sum to infinity).
        // Getting this branch wrong is the classic EC bug: it produces a WRONG POINT rather than an error,
        // and the wrong point is still on the curve, so a "is it on the curve" check will not catch it.
        return S1 === S2 ? pointDouble(Pa) : INFINITY;
    }
    const H = mod(U2 - U1), R = mod(S2 - S1);
    const H2 = mod(H * H), H3 = mod(H2 * H);
    const X = mod(R * R - H3 - 2n * U1 * H2);
    const Y = mod(R * (mod(U1 * H2) - X) - S1 * H3);
    const Z = mod(Pa.z * Pb.z * H);
    return { x: X, y: Y, z: Z };
}

/** Is an AFFINE point on the curve: y^2 == x^3 + 7 (mod p)? */
export const onCurve = (pt) => pt !== null && mod(pt.y * pt.y) === mod(pt.x * pt.x * pt.x + B);

/**
 * Windowed scalar multiplication, k*Pt. Precomputes the odd multiples once and consumes `w` bits per step.
 *
 * NOT CONSTANT TIME: the window value branches on scalar bits. Stated at the top of this file too, because a
 * reader who takes this for a signing primitive will not have read the header.
 */
export function scalarMul(k, Pt = toJacobian(Gx, Gy), w = 4) {
    let s = mod(k, N);
    if (s === 0n || isInfinity(Pt)) return INFINITY;
    const tableSize = 1 << (w - 1);
    const dbl = pointDouble(Pt);
    const table = [Pt];
    for (let i = 1; i < tableSize; i++) table.push(pointAdd(table[i - 1], dbl));   // 1P, 3P, 5P, ...
    let acc = INFINITY;
    const bits = s.toString(2);
    let i = 0;
    while (i < bits.length) {
        if (bits[i] === "0") { acc = pointDouble(acc); i++; continue; }
        let take = Math.min(w, bits.length - i);
        while (take > 1 && bits[i + take - 1] === "0") take--;   // window must end on a 1 -> odd multiple
        const chunk = parseInt(bits.slice(i, i + take), 2);
        for (let d = 0; d < take; d++) acc = pointDouble(acc);
        acc = pointAdd(acc, table[(chunk - 1) >> 1]);
        i += take;
    }
    return acc;
}

/** The public key for a private key, as an affine point. */
export function publicKey(privateKey) {
    const k = mod(privateKey, N);
    if (k === 0n) throw new Error("publicKey: private key must be in [1, n-1]");
    return toAffine(scalarMul(k));
}

const hex32 = (v) => v.toString(16).padStart(64, "0");

/** SEC1 encoding. Compressed is 33 bytes with a parity prefix; uncompressed is 65 with 0x04. */
export function encodePoint(pt, compressed = true) {
    if (pt === null) throw new Error("encodePoint: point at infinity has no encoding");
    if (!compressed) return "04" + hex32(pt.x) + hex32(pt.y);
    return ((pt.y & 1n) === 0n ? "02" : "03") + hex32(pt.x);
}
