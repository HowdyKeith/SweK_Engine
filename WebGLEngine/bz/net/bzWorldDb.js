// WebGLEngine/bz/net/bzWorldDb.js — the world a server sends you, opened one layer at a time.
//
// `MsgGetWorld` does not deliver a `.bzw`. It delivers BZFlag's binary world database, and there are three
// layers before you reach a single obstacle. This file opens the two that can be PROVED, and stops where
// the proving stops.
//
//   LAYER 1 -- the envelope. From bzfs.cxx, where `worldDatabase` is assembled:
//
//       uint16  WorldCodeHeaderSize   = 10
//       uint16  WorldCodeHeader       = 0x6865  -- "he"
//       uint16  mapVersion            = 1
//       uint32  uncompressedSize
//       uint32  compressedSize
//       ...compressedSize bytes...
//       uint16  WorldCodeEndSize      = 0
//       uint16  WorldCodeEnd          = 0x6564  -- "ed"
//
//     The two-ASCII-letter habit again: "he" and "ed", head and end. `WorldCodeHeaderSize` is 10 and counts
//     exactly the three fields after the code -- 2 + 4 + 4 -- which is the same size-then-code shape as
//     every message on the wire.
//
//   LAYER 2 -- THE PAYLOAD IS ZLIB-DEFLATED, and nothing in the message says so. `bzfs` calls `compress2`
//     at level 9 and the client calls `uncompress`. You cannot read a byte of the world without inflating
//     it, and nothing in `MsgGetWorld` hints at that: the frame that carries it is an ordinary frame.
//
//   LAYER 3 -- the database itself: ten manager sections back to back, each a count and then its items.
//     `bz/net/bzWorldSections.js` walks them. Since v2199 all ten are transcribed, and the walk ends by
//     ARRIVING rather than by stopping: `bytesRead === database.length`, or it refuses. It never skips: a
//     record whose layout you do not know has no length you can compute.
//
// AND THE HASH MAKES THE FIRST TWO LAYERS CHECKABLE. `MsgWantWHash` answers with `hexDigest`, which is one
// character ('t' for a random map, 'p' for a map file) followed by the **MD5 of the whole envelope** --
// header, compressed bytes, footer and all. So a client can prove it downloaded exactly what the server
// sent, byte for byte, before it tries to understand any of it. That is worth having on its own: a bad
// parse of good bytes is a bug, and a good parse of bad bytes is a mystery.

"use strict";

// zlib + crypto are node-only here: inflating and MD5-verifying a DOWNLOADED world is the Node network path,
// while the browser parses local .bzw via bzwParse and never calls readWorld. Lazy-load behind a process guard
// so this module -- reached from bzflag.html through bzfsClient -- loads in a browser instead of dying on a bare
// "zlib" / "crypto" specifier. v2766.
let zlib = null, crypto = null;
if (typeof process !== "undefined" && process.versions != null && process.versions.node != null) {
    zlib = (await import("zlib")).default;
    crypto = (await import("crypto")).default;
}
import { Reader } from "./bzPack.js";
import { walkSections } from "./bzWorldSections.js";

// include/Protocol.h, and the same two-letter habit as every message code.
const WORLD_CODE_HEADER = 0x6865;      // "he"
const WORLD_CODE_END = 0x6564;         // "ed"
const WORLD_CODE_HEADER_SIZE = 10;
const WORLD_CODE_END_SIZE = 0;
const MAP_VERSION = 1;                 // include/global.h

// The ten sections of the inflated database, in the order `WorldInfo::packDatabase` writes them. Named so
// that the gap has a shape rather than being "the rest".
const SECTIONS = [
    "dynamicColors", "textureMatrices", "materials", "physicsDrivers", "transforms",
    "obstacles", "links", "waterLevel", "worldWeapons", "entryZones",
];

// `hexDigest` is one character and then thirty-two of hex. The first says where the map came from.
function parseHash(digest) {
    const s = String(digest || "").replace(/\0+$/, "");
    if (s.length !== 33) return { ok: false, reason: `a world hash is 33 characters, not ${s.length}` };
    const source = s[0] === "t" ? "random" : (s[0] === "p" ? "map file" : "unknown");
    const md5 = s.slice(1).toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(md5)) return { ok: false, reason: "not an md5" };
    return { ok: true, source, md5, raw: s };
}

// Does this blob hash to what the server said it would? Every byte of it, envelope included.
function verifyHash(bytes, digest) {
    const want = parseHash(digest);
    if (!want.ok) return { ok: false, reason: want.reason };
    const got = crypto.createHash("md5").update(Buffer.from(bytes)).digest("hex");
    return got === want.md5
        ? { ok: true, md5: got, source: want.source }
        : { ok: false, reason: "hash mismatch", expected: want.md5, actual: got, source: want.source };
}

// Layer 1 and layer 2. Returns the inflated database, and never guesses: every field is checked against the
// constant it must be, because a world that is one byte out of step will inflate into garbage that looks
// almost right.
function openWorld(bytes) {
    const r = new Reader(bytes);
    let headerSize, headerCode;
    try { headerSize = r.u16(); headerCode = r.u16(); } catch (e) { return { ok: false, reason: "too short to be a world" }; }

    if (headerCode !== WORLD_CODE_HEADER) return { ok: false, reason: `expected WorldCodeHeader "he" (0x6865), got 0x${headerCode.toString(16)}` };
    if (headerSize !== WORLD_CODE_HEADER_SIZE) return { ok: false, reason: `WorldCodeHeaderSize is 10, not ${headerSize}` };

    let mapVersion, uncompressedSize, compressedSize;
    try { mapVersion = r.u16(); uncompressedSize = r.u32(); compressedSize = r.u32(); }
    catch (e) { return { ok: false, reason: "truncated world header" }; }

    if (mapVersion !== MAP_VERSION) return { ok: false, reason: `map version ${mapVersion}, and this client speaks ${MAP_VERSION}` };
    if (r.left < compressedSize + 4) return { ok: false, reason: `world claims ${compressedSize} compressed bytes and only ${Math.max(0, r.left - 4)} are here` };

    const compressed = r.raw(compressedSize);
    const endSize = r.u16(), endCode = r.u16();
    if (endCode !== WORLD_CODE_END) return { ok: false, reason: `expected WorldCodeEnd "ed" (0x6564), got 0x${endCode.toString(16)}` };
    if (endSize !== WORLD_CODE_END_SIZE) return { ok: false, reason: `WorldCodeEndSize is 0, not ${endSize}` };

    // Nothing in the message says the payload is deflated. It is.
    let database;
    try { database = new Uint8Array(zlib.inflateSync(Buffer.from(compressed))); }
    catch (e) { return { ok: false, reason: "could not inflate the world: " + e.message }; }

    if (database.length !== uncompressedSize)
        return { ok: false, reason: `inflated to ${database.length} bytes, and the header promised ${uncompressedSize}` };

    // Layer 3. It walks as far as it can be trusted and names where it stopped.
    const walk = walkSections(database);
    return {
        ok: true, mapVersion, compressedSize, uncompressedSize, database,
        sections: SECTIONS,
        parsed: Object.keys(walk.sections),
        obstacles: walk.obstacles,
        world: walk,
        usable: walk.complete,
        note: walk.complete
            ? `${walk.obstacles.length} obstacles read; the database walked to its last byte`
            : `stopped at "${walk.stopped.section}": ${walk.stopped.reason}`,
    };
}

// The whole thing, in the order a client does it: verify, then open.
function readWorld(bytes, digest) {
    const check = digest != null ? verifyHash(bytes, digest) : { ok: true, md5: null, source: null, unverified: true };
    if (!check.ok) return { ok: false, reason: check.reason, hash: check };
    const w = openWorld(bytes);
    if (!w.ok) return { ok: false, reason: w.reason, hash: check };
    return { ...w, hash: check };
}

export {
    openWorld, readWorld, verifyHash, parseHash,
    WORLD_CODE_HEADER, WORLD_CODE_END, WORLD_CODE_HEADER_SIZE, WORLD_CODE_END_SIZE, MAP_VERSION, SECTIONS,
};
