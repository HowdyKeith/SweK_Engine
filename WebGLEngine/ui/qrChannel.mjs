// WebGLEngine/ui/qrChannel.mjs -- v4301
//
// QR AS A DATA CHANNEL: a payload cut into frames, each frame a QR symbol, a receiver that reassembles them
// and says -- by sequence number -- which ones it has not seen. The shape is ruvnet/rvQR (MIT): a manifest at
// sequence 0 carrying the length and the SHA-256, data frames after it, out-of-order and duplicate arrival
// costing nothing, and reassembly only when every frame is present and the hash agrees. *** NONE OF rvQR'S
// CODE IS HERE; *** the protocol is written against this tree's own encoder (ui/vendor/qrcode.mjs) and
// decoder (ui/qrDecode.mjs) so the pair is provable in Node with no camera at all.
//
// *** WHY THIS TREE WANTS ONE. *** ui/phoneConnectQR.js has used the encoder since v525 to show ONE symbol
// carrying a URL -- a QR as a link. The phone bridge then needs the phone and the engine on the same Wi-Fi
// with the relay reachable (#87). An optical channel needs none of that: a screen and a camera. This file is
// the screen half and the arithmetic; the camera half -- finding a symbol in a video frame -- is not here.
//
// *** THE FAILURE THIS IS BUILT TO REFUSE. *** A receiver that returns a short buffer when frames are missing
// is worse than one that returns nothing, because the short buffer looks like a file. assemble() throws and
// names the gaps; a hash mismatch throws too. There is no partial success.
//
// FRAME LAYOUT (bytes, big-endian):
//   0-1   "SQ"        magic
//   2     1           protocol version
//   3     flags       bit 0: manifest
//   4-7   stream id   first four bytes of the payload's SHA-256, so frames of two transfers never mix
//   8-9   seq         0 = manifest, 1..total-1 = data
//   10-11 total       frames in the stream, manifest included
//   12..  body        manifest: length u32, sha256 (32), chunk u16 ; data: the chunk
"use strict";
import { sha256Hex } from "../tools/sha256.mjs";
import { decodeQR, dataCapacity, lengthBits } from "./qrDecode.mjs";

export const HEADER_BYTES = 12;
export const MANIFEST_BYTES = 4 + 32 + 2;
export const PROTOCOL = 1;
export const DEFAULTS = Object.freeze({ chunkBytes: 256, version: 19, ec: "L", fps: 10 });

const hexToBytes = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
const be16 = (v) => [(v >> 8) & 255, v & 255];
const be32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

/** The most payload bytes one symbol of a version/level can carry in byte mode, after this header. */
export function chunkFor(version, ec) {
    const bits = 8 * dataCapacity(version, ec) - 4 - lengthBits(4, version);
    return Math.floor(bits / 8) - HEADER_BYTES;
}

/** Bytes per second at a frame rate, from table values -- arithmetic, not a promise. */
export function throughput({ version = DEFAULTS.version, ec = DEFAULTS.ec, fps = DEFAULTS.fps, chunkBytes } = {}) {
    const cap = chunkFor(version, ec);
    const chunk = Math.min(chunkBytes || cap, cap);
    return { chunkBytes: chunk, capacity: cap, bytesPerSecond: chunk * fps, secondsFor: (n) => (1 + Math.ceil(n / chunk)) / fps };
}

/** Cut a payload into frames. Returns { frames, id, hash, total, chunkBytes }. */
export function encodeFrames(payload, { chunkBytes = DEFAULTS.chunkBytes } = {}) {
    const bytes = payload instanceof Uint8Array ? payload : new TextEncoder().encode(String(payload));
    if (!(chunkBytes >= 1 && chunkBytes <= 65535)) throw new Error("qrChannel: chunkBytes must be 1..65535");
    const hash = sha256Hex(bytes), idBytes = hexToBytes(hash.slice(0, 8));
    const dataFrames = Math.ceil(bytes.length / chunkBytes), total = 1 + dataFrames;
    if (total > 65535) throw new Error("qrChannel: too many frames for a 16-bit sequence");
    const header = (seq, flags) => [0x53, 0x51, PROTOCOL, flags, ...idBytes, ...be16(seq), ...be16(total)];
    const frames = [Uint8Array.from([...header(0, 1), ...be32(bytes.length), ...hexToBytes(hash), ...be16(chunkBytes)])];
    for (let i = 0; i < dataFrames; i++) {
        frames.push(Uint8Array.from([...header(i + 1, 0), ...bytes.subarray(i * chunkBytes, (i + 1) * chunkBytes)]));
    }
    return { frames, id: hash.slice(0, 8), hash, total, chunkBytes, length: bytes.length };
}

/** Read a frame's header and body. Throws on anything that is not one of ours. */
export function parseFrame(f) {
    if (!(f instanceof Uint8Array) || f.length < HEADER_BYTES) throw new Error("qrChannel: frame too short");
    if (f[0] !== 0x53 || f[1] !== 0x51) throw new Error("qrChannel: not an SQ frame");
    if (f[2] !== PROTOCOL) throw new Error(`qrChannel: protocol ${f[2]}, this reads ${PROTOCOL}`);
    const id = Array.from(f.subarray(4, 8), (b) => b.toString(16).padStart(2, "0")).join("");
    const seq = (f[8] << 8) | f[9], total = (f[10] << 8) | f[11], manifest = !!(f[3] & 1);
    const body = f.subarray(HEADER_BYTES);
    if (manifest !== (seq === 0)) throw new Error("qrChannel: manifest flag disagrees with sequence 0");
    if (manifest) {
        if (body.length < MANIFEST_BYTES) throw new Error("qrChannel: manifest body too short");
        const length = ((body[0] << 24) | (body[1] << 16) | (body[2] << 8) | body[3]) >>> 0;
        const hash = Array.from(body.subarray(4, 36), (b) => b.toString(16).padStart(2, "0")).join("");
        const chunkBytes = (body[36] << 8) | body[37];
        if (hash.slice(0, 8) !== id) throw new Error("qrChannel: manifest hash does not begin with the stream id");
        return { id, seq, total, manifest, length, hash, chunkBytes };
    }
    return { id, seq, total, manifest, chunk: body };
}

/** Collects frames of ONE stream. Frames of another stream are counted and refused, not mixed in. */
export class Receiver {
    constructor() { this.id = null; this.total = 0; this.manifest = null; this.chunks = new Map(); this.duplicates = 0; this.foreign = 0; this.accepted = 0; }
    /** Feed one frame's bytes. Returns what was learned; never throws on a foreign frame, only on a malformed one. */
    accept(frameBytes) {
        const f = parseFrame(frameBytes);
        if (this.id === null) { this.id = f.id; this.total = f.total; }
        if (f.id !== this.id) { this.foreign++; return { foreign: true, id: f.id }; }
        if (f.total !== this.total) throw new Error(`qrChannel: frame says ${f.total} frames, the stream said ${this.total}`);
        if (f.manifest) { if (this.manifest) this.duplicates++; else { this.manifest = f; this.accepted++; } return { seq: 0, manifest: true, have: this.have(), missing: this.missing().length }; }
        if (this.chunks.has(f.seq)) this.duplicates++; else { this.chunks.set(f.seq, f.chunk); this.accepted++; }
        return { seq: f.seq, have: this.have(), missing: this.missing().length };
    }
    have() { return this.chunks.size + (this.manifest ? 1 : 0); }
    /** Sequence numbers not yet seen -- the list a sender would be asked to replay. */
    missing() {
        if (this.id === null) return [0];
        const out = []; if (!this.manifest) out.push(0);
        for (let s = 1; s < this.total; s++) if (!this.chunks.has(s)) out.push(s);
        return out;
    }
    get complete() { return this.id !== null && this.missing().length === 0; }
    /** The payload, or an exception that names the gaps or the hash mismatch. Never a short buffer. */
    assemble() {
        const gaps = this.missing();
        if (gaps.length) throw new Error(`qrChannel: ${gaps.length} of ${this.total} frames missing: ${gaps.slice(0, 12).join(",")}${gaps.length > 12 ? ",..." : ""}`);
        const m = this.manifest, out = new Uint8Array(m.length); let at = 0;
        for (let s = 1; s < this.total; s++) {
            const c = this.chunks.get(s);
            if (s < this.total - 1 && c.length !== m.chunkBytes) throw new Error(`qrChannel: frame ${s} carries ${c.length} bytes, the manifest says ${m.chunkBytes}`);
            if (at + c.length > out.length) throw new Error(`qrChannel: frames add up to more than the manifest's ${m.length} bytes`);
            out.set(c, at); at += c.length;
        }
        if (at !== out.length) throw new Error(`qrChannel: frames add up to ${at} bytes, the manifest says ${m.length}`);
        const h = sha256Hex(out);
        if (h !== m.hash) throw new Error(`qrChannel: SHA-256 mismatch -- got ${h.slice(0, 12)}..., manifest says ${m.hash.slice(0, 12)}...`);
        return out;
    }
}

// ---- symbols: a frame's bytes into a QR matrix through the vendored encoder, and back through the decoder --------
let _qrcode = null;
async function loadEncoder() { if (!_qrcode) { const m = await import("./vendor/qrcode.mjs"); _qrcode = m.qrcode || m.default; } return _qrcode; }

/** One frame -> the encoder's object (call .isDark / .getModuleCount / .renderTo2dContext on it). */
export async function frameToQR(frame, { version = DEFAULTS.version, ec = DEFAULTS.ec } = {}) {
    const qrcode = await loadEncoder();
    const cap = chunkFor(version, ec) + HEADER_BYTES;
    if (frame.length > cap) throw new Error(`qrChannel: a ${frame.length}-byte frame does not fit version ${version}-${ec} (${cap} bytes)`);
    const q = qrcode(version, ec);
    q.addData(Array.from(frame, (b) => String.fromCharCode(b)).join(""), "Byte");   // latin1: one char per byte
    q.make();
    return q;
}

/** A matrix -> the frame's bytes, through the decoder. */
export function matrixToFrame(isDark, n) { return decodeQR(isDark, n).bytes; }

/** Every frame of a payload as a matrix { n, isDark } -- what a screen would show, one per tick. */
export async function payloadToMatrices(payload, opts = {}) {
    const version = opts.version ?? DEFAULTS.version, ec = opts.ec ?? DEFAULTS.ec;
    const chunkBytes = Math.min(opts.chunkBytes ?? DEFAULTS.chunkBytes, chunkFor(version, ec));
    const enc = encodeFrames(payload, { chunkBytes });
    const out = [];
    for (const f of enc.frames) { const q = await frameToQR(f, { version, ec }); const n = q.getModuleCount(); out.push({ n, isDark: (r, c) => q.isDark(r, c), qr: q }); }
    return { ...enc, matrices: out, version, ec };
}
