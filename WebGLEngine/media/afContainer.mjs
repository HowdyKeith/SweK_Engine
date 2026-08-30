// FILE: media/afContainer.mjs -- v4193
//
// A FRAME CONTAINER: encoded video samples plus a manifest, in one buffer, with frame-accurate random access.
// Pure -- no DOM, no codec, no clock -- so a gate can pack, unpack, validate and plan a seek without a GPU or
// a video decoder anywhere near it. media/afDecode.js is the WebCodecs half.
//
// Shape taken from activetheory/activeframe (MIT), which packs raw H.264/H.265 samples beside a JSON manifest
// and decodes them through WebCodecs for scrubbing. Written here rather than vendored, because the value to
// this tree is not playback -- it is that a clip is a REPRODUCIBLE INPUT.
//
// *** WHY THIS TREE WANTS IT. *** camera-effects.html (v4188) can be driven by exactly two things today: a
// synthetic test image, which is deterministic but is a painted rectangle, or a live webcam, which is real
// but different on every run and absent in CI. A clip is the third thing and the missing one -- real footage
// that yields the SAME FRAME EVERY TIME. It turns "the chroma key handles a shadowed fold" from a claim about
// a rectangle I painted into a claim about a frame anyone can re-decode and hash.
//
// *** AND THE CODEC IS NAMED, NOT ASSUMED. *** The manifest carries it, because this container holds bytes it
// does not understand. Chromium's open build has no H.264 at all -- measured: avc1 unsupported for both
// encode and decode, vp8 and vp09 supported both ways -- so a container that hard-coded a codec would produce
// a file that plays on one machine and shows black on another. A decoder that cannot handle the named codec
// must say so loudly; see media/afDecode.js.
"use strict";

export const MAGIC = 0x53774146;           // "SwAF"
export const VERSION = 1;
export const HEADER_BYTES = 16;            // magic, version, manifestLen, sampleCount

/**
 * *** THE PART THAT IS ACTUALLY HARD: FRAME-ACCURATE RANDOM ACCESS. ***
 *
 * You cannot decode frame 47 by handing the decoder sample 47. Inter-frame codecs encode most frames as a
 * DIFFERENCE from the one before, so sample 47 is meaningless without its predecessors. To show frame 47 you
 * must feed every sample from the last KEYFRAME at or before 47, through 47.
 *
 * This is the whole reason "frame-accurate seeking" is a feature rather than an array index, and it is a pure
 * function of the sample table -- which means it can be tested exhaustively with no codec present at all.
 *
 * @returns the sample indices to feed, in order
 */
export function decodePlanFor(samples, index) {
    if (!Array.isArray(samples) || !samples.length) throw new RangeError("afContainer: no samples");
    const i = Math.trunc(index);
    // *** OUT OF RANGE IS REFUSED, NOT CLAMPED. *** Clamping turns "show me frame 500 of a 90-frame clip" into
    // a picture of frame 89, which looks like a working seek and is a bug that survives review.
    if (!(i >= 0 && i < samples.length)) throw new RangeError(`afContainer: frame ${index} is outside 0..${samples.length - 1}`);
    let k = i;
    while (k > 0 && !samples[k].key) k--;
    if (!samples[k].key) throw new Error(`afContainer: no keyframe at or before frame ${i} -- the clip is unseekable`);
    const plan = [];
    for (let j = k; j <= i; j++) plan.push(j);
    return plan;
}

/**
 * What seeking to a random frame COSTS, in samples that must be decoded.
 *
 * This is the tradeoff the format makes and it is worth stating in numbers: a keyframe every N frames makes
 * the file smaller and the seek slower, and the average is (N+1)/2 decodes rather than one. A caller choosing
 * a GOP length is choosing this, so the container reports it rather than leaving it to be discovered.
 */
export function seekCostOf(samples) {
    if (!Array.isArray(samples) || !samples.length) return { worst: 0, mean: 0, keyframes: 0, gop: 0 };
    let worst = 0, total = 0, keys = 0;
    for (let i = 0; i < samples.length; i++) {
        if (samples[i].key) keys++;
        const n = decodePlanFor(samples, i).length;
        if (n > worst) worst = n;
        total += n;
    }
    return { worst, mean: total / samples.length, keyframes: keys, gop: samples.length / Math.max(1, keys) };
}

/**
 * Everything wrong with a sample table, as a list. Empty means it is decodable.
 *
 * Each of these produces a file that LOOKS fine and fails at play time, which is why they are checked at pack
 * time instead: a container that only reveals its problems inside a decoder is a container that reveals them
 * on someone else's machine.
 */
export function validateSamples(samples) {
    const p = [];
    if (!Array.isArray(samples) || !samples.length) return ["no samples"];
    if (!samples[0].key) p.push("the first sample is not a keyframe, so frame 0 cannot be decoded");
    let last = -Infinity;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        if (!s || typeof s !== "object") { p.push(`sample ${i} is not an object`); continue; }
        if (!(s.data instanceof Uint8Array)) p.push(`sample ${i} has no byte payload`);
        else if (s.data.length === 0) p.push(`sample ${i} is empty`);
        if (!Number.isFinite(s.ts)) p.push(`sample ${i} has no timestamp`);
        else if (s.ts <= last && i > 0) p.push(`sample ${i} timestamp ${s.ts} does not advance (previous ${last})`);
        else last = s.ts;
        if (typeof s.key !== "boolean") p.push(`sample ${i} does not say whether it is a keyframe`);
    }
    return p;
}

/** Everything wrong with a manifest. */
export function validateManifest(m) {
    const p = [];
    if (!m || typeof m !== "object") return ["manifest is not an object"];
    if (!m.codec || typeof m.codec !== "string") p.push("no codec named -- this container holds bytes it does not understand, so it must say what they are");
    if (!(m.width > 0) || !(m.height > 0)) p.push("no frame size");
    if (!(m.frameCount > 0)) p.push("no frame count");
    if (!(m.timescale > 0)) p.push("no timescale, so timestamps mean nothing");
    return p;
}

const enc = new TextEncoder(), dec = new TextDecoder();

/**
 * Pack a manifest and samples into one buffer.
 *
 * Layout, all little-endian:
 *   u32 magic | u32 version | u32 manifestLen | u32 sampleCount
 *   manifest JSON
 *   sample table: sampleCount x (f64 ts, u32 byteLength, u32 flags)      flags bit 0 = keyframe
 *   sample bytes, concatenated in order
 *
 * The table is separate from the bytes on purpose: a seek needs to know WHERE every sample is without having
 * read any of them, which is the whole point of a container over a stream.
 */
export function pack(manifest, samples) {
    const mp = validateManifest(manifest), sp = validateSamples(samples);
    if (mp.length || sp.length) throw new Error("afContainer.pack: " + [...mp, ...sp].join("; "));
    const json = enc.encode(JSON.stringify(manifest));
    const tableBytes = samples.length * 16;
    const payload = samples.reduce((n, s) => n + s.data.length, 0);
    const buf = new Uint8Array(HEADER_BYTES + json.length + tableBytes + payload);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, MAGIC, true);
    dv.setUint32(4, VERSION, true);
    dv.setUint32(8, json.length, true);
    dv.setUint32(12, samples.length, true);
    buf.set(json, HEADER_BYTES);
    let o = HEADER_BYTES + json.length;
    for (const s of samples) {
        dv.setFloat64(o, s.ts, true);
        dv.setUint32(o + 8, s.data.length, true);
        dv.setUint32(o + 12, s.key ? 1 : 0, true);
        o += 16;
    }
    for (const s of samples) { buf.set(s.data, o); o += s.data.length; }
    return buf;
}

/** Read a buffer back. Throws with a reason rather than returning something half-formed. */
export function unpack(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("afContainer.unpack: expected a Uint8Array");
    if (bytes.length < HEADER_BYTES) throw new Error("afContainer.unpack: too short to be a container");
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = dv.getUint32(0, true);
    // *** THE MAGIC IS CHECKED FIRST AND BY NAME. *** Without it, handing this a PNG produces a manifest
    // parsed out of pixel data and an error three functions away that mentions JSON.
    if (magic !== MAGIC) throw new Error(`afContainer.unpack: not a container (magic 0x${magic.toString(16)}, expected 0x${MAGIC.toString(16)})`);
    const version = dv.getUint32(4, true);
    if (version !== VERSION) throw new Error(`afContainer.unpack: version ${version}, this reader is version ${VERSION}`);
    const jsonLen = dv.getUint32(8, true), count = dv.getUint32(12, true);
    let manifest;
    try { manifest = JSON.parse(dec.decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + jsonLen))); }
    catch (e) { throw new Error("afContainer.unpack: manifest is not valid JSON -- " + e.message); }

    let o = HEADER_BYTES + jsonLen;
    const table = [];
    for (let i = 0; i < count; i++) {
        table.push({ ts: dv.getFloat64(o, true), size: dv.getUint32(o + 8, true), key: (dv.getUint32(o + 12, true) & 1) === 1 });
        o += 16;
    }
    const samples = [];
    for (const t of table) {
        if (o + t.size > bytes.length) throw new Error("afContainer.unpack: sample table runs past the end of the buffer");
        samples.push({ ts: t.ts, key: t.key, data: bytes.subarray(o, o + t.size) });
        o += t.size;
    }
    if (manifest && manifest.frameCount !== samples.length) {
        throw new Error(`afContainer.unpack: manifest says ${manifest.frameCount} frames, the table holds ${samples.length}`);
    }
    return { manifest, samples };
}

/** A readable summary, for a page or a console. */
export function describe(container) {
    const { manifest: m, samples } = container;
    const c = seekCostOf(samples);
    const bytes = samples.reduce((n, s) => n + s.data.length, 0);
    return `${m.width}x${m.height} ${m.codec}, ${samples.length} frames, ${(bytes / 1024).toFixed(1)} KiB, ` +
           `${c.keyframes} keyframes (GOP ${c.gop.toFixed(1)}), seek costs ${c.mean.toFixed(1)} decodes on average and ${c.worst} at worst`;
}
