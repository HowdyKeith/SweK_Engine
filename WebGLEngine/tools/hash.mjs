// tools/hash.mjs
//
// Dual-runtime hashing for the fingerprint: the same hashFloats/hashInts that used Node's crypto and Buffer, rewritten
// on the pure-JS sha256 and DataView so they run in the browser too -- byte for byte identical to the Node originals,
// so the master is unchanged; it just no longer needs a terminal. Explicit little-endian, so the bytes are well-defined
// regardless of host endianness, exactly as before.
import { sha256Hex } from "./sha256.mjs";

const enc = new TextEncoder();

export function hashFloats(label, values) {
    const lab = enc.encode(label + ":");
    const bytes = new Uint8Array(lab.length + 8 * values.length);
    bytes.set(lab);
    const dv = new DataView(bytes.buffer, lab.length);
    for (let i = 0; i < values.length; i++) dv.setFloat64(8 * i, values[i], true);
    return sha256Hex(bytes);
}

export function hashInts(label, values) {
    const lab = enc.encode(label + ":");
    const bytes = new Uint8Array(lab.length + 4 * values.length);
    bytes.set(lab);
    const dv = new DataView(bytes.buffer, lab.length);
    for (let i = 0; i < values.length; i++) dv.setUint32(4 * i, values[i] >>> 0, true);
    return sha256Hex(bytes);
}
