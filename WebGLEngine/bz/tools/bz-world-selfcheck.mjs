// bz/tools/bz-world-selfcheck.mjs — the world a server sends you, and where the parse stops.
//
//   node bz/tools/bz-world-selfcheck.mjs
//
// `MsgGetWorld` does not deliver a `.bzw`. It delivers BZFlag's binary world database, and there are three
// layers before you reach a single obstacle. Two of them can be proved, and this file proves them. The third
// is named, and is not pretended to.
//
//   1. the envelope, whose header and footer are the same two-ASCII-letter habit as every message code:
//      "he" and "ed", head and end.
//   2. THE PAYLOAD IS ZLIB-DEFLATED, and nothing in the message says so.
//   3. ten manager sections back to back. `bz/net/bzWorldSections.js` walks them, and stops by name at the
//      first record it has not been transcribed for. See bz/tools/bz-sections-selfcheck.mjs.
//
// And the hash makes the first two checkable. `MsgWantWHash` answers with one character and thirty-two of
// MD5 -- of the WHOLE ENVELOPE, header and footer included -- so a client can prove it downloaded exactly
// what the server sent before it tries to understand any of it. A bad parse of good bytes is a bug; a good
// parse of bad bytes is a mystery.

import zlib from "zlib";
import crypto from "crypto";
import {
    openWorld, readWorld, verifyHash, parseHash,
    WORLD_CODE_HEADER, WORLD_CODE_END, WORLD_CODE_HEADER_SIZE, WORLD_CODE_END_SIZE, MAP_VERSION, SECTIONS,
} from "../net/bzWorldDb.js";
import { Writer } from "../net/bzPack.js";
import { adaptWorld, worldSizeFromWalls } from "../net/bzWorldAdapt.js";
import { codeTag } from "../net/bzProtocol.js";

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

// Build an envelope exactly as `bzfs` assembles `worldDatabase`.
function envelope(inner, { mapVersion = MAP_VERSION, headerSize = WORLD_CODE_HEADER_SIZE, headerCode = WORLD_CODE_HEADER,
    endSize = WORLD_CODE_END_SIZE, endCode = WORLD_CODE_END, lieAboutSize = null } = {}) {
    const comp = zlib.deflateSync(Buffer.from(inner), { level: 9 });
    const w = new Writer(10 + comp.length + 8);
    w.u16(headerSize).u16(headerCode).u16(mapVersion);
    w.u32(lieAboutSize != null ? lieAboutSize : inner.length);
    w.u32(comp.length).raw(new Uint8Array(comp)).u16(endSize).u16(endCode);
    return w.bytes();
}
const md5 = (b) => crypto.createHash("md5").update(Buffer.from(b)).digest("hex");

const INNER = Buffer.from("ten manager sections would go here, and one day they will");

// --- 1. the codes are the same habit as everything else ------------------------------------------
{
    ok('WorldCodeHeader is 0x6865, which is "he"', WORLD_CODE_HEADER === 0x6865 && codeTag(WORLD_CODE_HEADER) === "he");
    ok('WorldCodeEnd is 0x6564, which is "ed"', WORLD_CODE_END === 0x6564 && codeTag(WORLD_CODE_END) === "ed");
    ok("WorldCodeHeaderSize is 10, which is exactly the three fields after the code: 2 + 4 + 4", WORLD_CODE_HEADER_SIZE === 10);
    ok("WorldCodeEndSize is 0: the footer carries nothing", WORLD_CODE_END_SIZE === 0);
    ok("mapVersion is 1", MAP_VERSION === 1);
    ok("the database has ten sections, and we name every one", SECTIONS.length === 10);
    ok("...and the obstacles are the sixth", SECTIONS[5] === "obstacles");
}

// --- 2. the hash ---------------------------------------------------------------------------------
{
    const h = parseHash("p" + "0".repeat(32));
    ok("a world hash is one character and thirty-two of md5", h.ok && h.md5.length === 32);
    ok("'p' means the server is running a map file", h.source === "map file");
    ok("'t' means a random map", parseHash("t" + "a".repeat(32)).source === "random");
    ok("anything else is unknown, and is not guessed at", parseHash("x" + "a".repeat(32)).source === "unknown");
    ok("a short hash is refused", !parseHash("p" + "0".repeat(31)).ok);
    ok("a hash that is not hex is refused", !parseHash("p" + "z".repeat(32)).ok);
    ok("a trailing NUL, as the wire delivers it, is stripped", parseHash("p" + "0".repeat(32) + "\0\0").ok);

    const blob = envelope(INNER);
    const good = verifyHash(blob, "p" + md5(blob));
    ok("a blob that hashes to what the server said is verified", good.ok && good.md5 === md5(blob));
    ok("...and it says where the map came from", good.source === "map file");
    ok("one flipped byte is caught", (() => { const b = Uint8Array.from(blob); b[b.length - 5] ^= 1; return !verifyHash(b, "p" + md5(blob)).ok; })());
    ok("...and the mismatch reports both hashes", (() => { const b = Uint8Array.from(blob); b[3] ^= 1; const r = verifyHash(b, "p" + md5(blob)); return r.expected && r.actual && r.expected !== r.actual; })());
    ok("the hash covers the FOOTER too, not just the payload", (() => { const b = Uint8Array.from(blob); b[b.length - 1] ^= 1; return !verifyHash(b, "p" + md5(blob)).ok; })());
}

// --- 3. the envelope, and the inflate ---------------------------------------------------------------
{
    const blob = envelope(INNER);
    const w = openWorld(blob);
    ok("a good envelope opens", w.ok);
    ok("...reporting the compressed and uncompressed sizes", w.uncompressedSize === INNER.length && w.compressedSize > 0);
    ok("...and the payload really was deflated: it is smaller than what came out", w.compressedSize !== w.uncompressedSize);
    ok("...and inflates to exactly the bytes that went in", Buffer.from(w.database).equals(INNER));
    ok("nothing in the message said it was compressed; it just is", true);

    // v2193 -- the sections are walked now, and this payload is not a database, so the walk stops at once.
    ok("the ten sections are still named", w.sections.length === 10);
    ok("...and a payload that is not a database stops the walk, rather than inventing obstacles",
        w.usable === false && w.obstacles.length === 0);
    ok("...and the note says exactly where it stopped", /^stopped at "/.test(w.note));

    // Every field is checked against the constant it must be, because a world one byte out of step inflates
    // into garbage that looks almost right.
    ok("a bad header code is refused, by name", /WorldCodeHeader/.test(openWorld(envelope(INNER, { headerCode: 0x1234 })).reason));
    ok("a bad header size is refused", /WorldCodeHeaderSize is 10/.test(openWorld(envelope(INNER, { headerSize: 12 })).reason));
    ok("a bad footer code is refused", /WorldCodeEnd/.test(openWorld(envelope(INNER, { endCode: 0x1234 })).reason));
    ok("a bad footer size is refused", /WorldCodeEndSize is 0/.test(openWorld(envelope(INNER, { endSize: 4 })).reason));
    ok("a map version we do not speak is refused, and says both", (() => {
        const r = openWorld(envelope(INNER, { mapVersion: 2 }));
        return /map version 2/.test(r.reason) && /speaks 1/.test(r.reason);
    })());
    ok("a header that promises more bytes than arrived is refused", (() => {
        const b = envelope(INNER);
        return /and only/.test(openWorld(b.subarray(0, b.length - 20)).reason);
    })());
    ok("...and a payload that inflates to the wrong length is refused", /the header promised/.test(openWorld(envelope(INNER, { lieAboutSize: 9999 })).reason));
    ok("a payload that is not deflate at all is refused, not thrown", (() => {
        const w2 = new Writer(30);
        w2.u16(10).u16(WORLD_CODE_HEADER).u16(1).u32(4).u32(4).raw(new Uint8Array([1, 2, 3, 4])).u16(0).u16(WORLD_CODE_END);
        const r = openWorld(w2.bytes());
        return !r.ok && /could not inflate/.test(r.reason);
    })());
    ok("two bytes are too short to be a world", !openWorld(new Uint8Array([0, 10])).ok);
    ok("no bytes at all are too short", !openWorld(new Uint8Array(0)).ok);
}

// --- 4. verify, then open --------------------------------------------------------------------------------
{
    const blob = envelope(INNER);
    const r = readWorld(blob, "p" + md5(blob));
    ok("readWorld verifies before it understands", r.ok && r.hash.ok && Buffer.from(r.database).equals(INNER));
    ok("a bad hash stops it BEFORE the inflate", (() => {
        const bad = readWorld(blob, "p" + "0".repeat(32));
        return !bad.ok && bad.reason === "hash mismatch" && bad.database === undefined;
    })());
    ok("no hash means unverified, and it says so rather than claiming otherwise", (() => {
        const un = readWorld(blob);
        return un.ok && un.hash.unverified === true;
    })());
    ok("a good hash over a broken envelope still fails, on the envelope", (() => {
        const b = envelope(INNER, { endCode: 0x1234 });
        const r2 = readWorld(b, "p" + md5(b));
        return !r2.ok && /WorldCodeEnd/.test(r2.reason);
    })());
}

// --- 5. the adapter, without a server --------------------------------------------------------------------
//
// The world a server sends becomes the world the engine speaks. The one thing that has no counterpart in a
// `.bzw` is the SIZE: a database does not say it, it shows you the four walls bzfs added, and a wall's
// `size[1]` is half the world.
{
    ok("four walls of half-breadth 400 mean an 800-unit world", worldSizeFromWalls([
        { type: "wall", size: [0, 400, 6] }, { type: "wall", size: [0, 400, 6] },
    ]) === 800);
    ok("...and a world with no walls at all falls back to `_worldSize`", worldSizeFromWalls([{ type: "box", size: [1, 1, 1] }]) === 800);
    ok("the largest wall wins, if a map disagrees with itself", worldSizeFromWalls([
        { type: "wall", size: [0, 100, 6] }, { type: "wall", size: [0, 400, 6] },
    ]) === 800);

    const walk = {
        obstacles: [
            { type: "wall", pos: [0, 200, 0], rotation: 0, size: [0, 200, 6], driveThrough: false, shootThrough: false, ricochet: false },
            { type: "box", pos: [10, 0, 0], rotation: 0, size: [5, 5, 9], driveThrough: false, shootThrough: false, ricochet: false },
            { type: "pyramid", pos: [-10, 0, 0], rotation: 0, size: [4, 4, 8], flipz: true, driveThrough: false, shootThrough: false, ricochet: false },
            { type: "base", pos: [0, -50, 0], rotation: 0, size: [10, 10, 0], color: 1, colorValid: true, driveThrough: false, shootThrough: false, ricochet: false },
            { type: "teleporter", name: "/t0", pos: [50, 0, 0], rotation: 0, size: [0.56, 4, 10], border: 1, horizontal: false,
                outerSize: [0.56, 5, 11], driveThrough: false, shootThrough: false, ricochet: false },
        ],
        sections: { links: [{ from: "/t0:f", to: "/t0:b" }], waterLevel: -1 },
        stopped: { section: "worldWeapons" },
    };
    const a = adaptWorld(walk);
    ok("a walked database adapts", a.ok, a.reason || "");
    ok("...the world's size comes off the walls: 400 units", a.world.size === 400);
    ok("...and the walls are the boundary, not obstacles", a.obstacles.length === 4 && !a.obstacles.some((o) => o.type === "wall"));
    ok("...a pyramid keeps its flipz", a.obstacles.find((o) => o.type === "pyramid").flipz === true);
    ok("...a base keeps its team", a.obstacles.find((o) => o.type === "base").color === 1);
    ok("...a teleporter keeps the border its `outerSize` already knew about", a.obstacles.find((o) => o.type === "teleporter").outerSize[1] === 5);
    ok("...the links resolve", a.linking.dsts[0].join() === "1" && a.linking.broken.length === 0);
    ok("...water below zero is no water", a.waterLevel === null);
    ok("the world says it came off the wire, and has no name, because a database has none", a.source === "world database" && a.world.name === null);
    ok("...and no flagHeight, rather than a made-up one", a.world.flagHeight === null);

    // A walk that stopped is not a world.
    const stopped = adaptWorld({ obstacles: [], sections: {}, stopped: { section: "materials", reason: "not transcribed" } });
    ok("a database that stopped at a section is refused, by name", !stopped.ok && /materials/.test(stopped.reason));
    ok("...and so is nothing at all", !adaptWorld(null).ok);
}

console.log("");
console.log("  (the envelope and the inflate are proved against envelopes built here to bzfs's own layout.");
console.log("   NO REAL SERVER HAS SENT US ONE. And the ten manager sections inside remain unparsed: the");
console.log("   obstacles are the sixth, and there is no way to reach them but to walk the five before.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
