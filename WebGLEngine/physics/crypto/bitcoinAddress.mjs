// FILE: physics/crypto/bitcoinAddress.mjs
// VERSION: v4172 -- public key -> HASH160 -> Base58Check address, the last leg of the pipeline.
//
// *** THE HASHES ARE INJECTED, FOR TWO REASONS AND THE SECOND IS THE IMPORTANT ONE. ***
//
// (1) An `import crypto from "node:crypto"` here would make this module unloadable in a browser -- the exact
//     defect v4169 spent a round undoing, where two shader files shipped as CommonJS and could be loaded by
//     nothing but their own gates.
//
// (2) If the module hashed with node's crypto and the gate graded it with node's crypto, THE GATE WOULD BE
//     COMPARING A THING TO ITSELF. Injection keeps node's implementation on ONE side of the comparison, so
//     the published BIP address vectors on the other side remain an independent answer key.
//
// The caller supplies sha256 and ripemd160 as (Uint8Array) -> Uint8Array. In Node that is crypto; in a page
// it is whatever the page already bundles.
"use strict";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** hex string -> bytes. Rejects odd lengths rather than silently dropping the last nibble. */
export function hexToBytes(hex) {
    const h = String(hex);
    if (h.length % 2 !== 0) throw new Error("hexToBytes: odd-length hex (" + h.length + ")");
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
}
export const bytesToHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** RIPEMD160(SHA256(x)) -- "HASH160", the step that makes an address shorter than a key. */
export function hash160(bytes, { sha256, ripemd160 }) {
    if (typeof sha256 !== "function" || typeof ripemd160 !== "function") {
        throw new Error("hash160: pass { sha256, ripemd160 } -- see the header on why they are injected");
    }
    return ripemd160(sha256(bytes));
}

/**
 * Base58 encoding. NOT base64 with a different alphabet: it is a full base conversion, so it has no fixed
 * block size and no padding character.
 *
 * *** LEADING ZERO BYTES ARE THE PART EVERY IMPLEMENTATION GETS WRONG. *** A leading 0x00 contributes nothing
 * to the NUMBER, so the base conversion drops it -- and a mainnet address begins with a 0x00 version byte.
 * They are re-added as explicit "1"s. Without that, every P2PKH address would be one character short and
 * would still decode to the right hash, so a round-trip test would pass while the string was wrong.
 */
export function base58Encode(bytes) {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let out = "";
    while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    return "1".repeat(zeros) + out;
}

/** Base58Check: payload + the first 4 bytes of its double-SHA256, then base58. */
export function base58Check(payload, { sha256 }) {
    if (typeof sha256 !== "function") throw new Error("base58Check: pass { sha256 }");
    const sum = sha256(sha256(payload)).slice(0, 4);
    const full = new Uint8Array(payload.length + 4);
    full.set(payload, 0); full.set(sum, payload.length);
    return base58Encode(full);
}

/**
 * A P2PKH address from an encoded public key.
 * @param {string} pubHex SEC1 encoding, compressed or not -- THEY GIVE DIFFERENT ADDRESSES FROM ONE KEY,
 *   which is not a bug and is the reason a wallet has to say which form it used.
 * @param {number} version 0x00 mainnet, 0x6f testnet
 */
export function p2pkhAddress(pubHex, hashes, version = 0x00) {
    const h = hash160(hexToBytes(pubHex), hashes);
    const payload = new Uint8Array(1 + h.length);
    payload[0] = version; payload.set(h, 1);
    return base58Check(payload, hashes);
}
