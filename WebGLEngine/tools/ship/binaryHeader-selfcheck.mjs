#!/usr/bin/env node
// tools/ship/binaryHeader-selfcheck.mjs -- v4228
//
// Run: node tools/ship/binaryHeader-selfcheck.mjs      (pure, no browser, no GL)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES engine/binaryHeader.mjs and the six formats now built on it.
//
// Filed off google/flatbuffers (Apache-2.0) and NOT by adopting it. Vendoring a schema compiler and a runtime
// to rewrite formats that mostly have to match somebody else's spec would be the wrong trade. What flatbuffers
// is FOR is forward and backward compatibility, and checking this tree against that idea found a real defect.
import {
    FormatHeaderError, VERSIONED_HEADER_BYTES, versionedMagic, magicText,
    writeVersionedHeader, readVersionedHeader,
} from "../../engine/binaryHeader.mjs";
import { encodeWND, decodeWND, WND_MAGIC, WND_VERSION } from "../../engine/wndFormat.js";
import { encodeMTO, decodeMTO, MTO_MAGIC, MTO_VERSION } from "../../engine/mtoFormat.js";
import { encodeMOL, decodeMOL, MOL_MAGIC, MOL_VERSION } from "../../engine/molFormat.js";
import { encodeOVM, decodeOVM, OVM_MAGIC, OVM_VERSION } from "../../engine/ovmFormat.js";
import { encodeP3D, decodeP3D, P3D_MAGIC, P3D_VERSION } from "../../engine/p3dFormat.js";
import { encodeVX,  decodeVX,  VX_MAGIC,  VX_VERSION  } from "../../engine/vxFormat.js";
import { codeOnly } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("binaryHeader-selfcheck -- a version that lives in the FILE, not in a comment in the reader\n");

// Every format, with a body whose values are checkable after a round trip.
const FORMATS = [
    {
        name: "WND", file: "wndFormat.js", magic: WND_MAGIC, version: WND_VERSION, legacyBody: 4,
        enc: () => encodeWND({ width: 2, height: 2, depth: 2, data: new Float32Array(32).fill(0.25) }),
        dec: decodeWND, probe: (r) => `${r.width}x${r.height}x${r.depth}:${r.data[31]}`,
    },
    {
        name: "MTO", file: "mtoFormat.js", magic: MTO_MAGIC, version: MTO_VERSION, legacyBody: 4,
        enc: () => encodeMTO({ count: 2, coords: new Int16Array([1, 2, 3, 4, 5, 6]), normals: new Float32Array([0, 1, 0, 1, 0, 0]), intensity: new Uint8Array([7, 8]), classes: new Uint8Array([1, 2]) }),
        dec: decodeMTO, probe: (r) => `${r.count}:${r.coords[5]}:${r.intensity[1]}`,
    },
    {
        name: "MOL", file: "molFormat.js", magic: MOL_MAGIC, version: MOL_VERSION, legacyBody: 4,
        enc: () => encodeMOL({ count: 2, positions: new Float32Array([1, 2, 3, 4, 5, 6]), fields: new Float32Array([90, 1, 80, 1]), elements: new Uint8Array([6, 0, 0, 0, 7, 0, 0, 0]) }),
        dec: decodeMOL, probe: (r) => `${r.count}:${r.positions[5]}:${r.elements[4]}`,
    },
    {
        name: "OVM", file: "ovmFormat.js", magic: OVM_MAGIC, version: OVM_VERSION, legacyBody: 4,
        enc: () => encodeOVM({ count: 2, coords: new Int16Array([1, 2, 3, 4, 5, 6]), offsets: new Float32Array([0, 0, 0, 0.5, 0, 0]), materials: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]) }),
        dec: decodeOVM, probe: (r) => `${r.count}:${r.coords[5]}:${r.materials[5]}`,
    },
    {
        name: "P3D", file: "p3dFormat.js", magic: P3D_MAGIC, version: P3D_VERSION, legacyBody: 4,
        enc: () => encodeP3D({ vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint16Array([0, 1, 2]) }),
        dec: decodeP3D, probe: (r) => `${r.numVerts}v${r.numFaces}f:${r.vertices[7]}:${r.indices[2]}`,
    },
    {
        name: "VX", file: "vxFormat.js", magic: VX_MAGIC, version: VX_VERSION, legacyBody: 4,
        enc: () => encodeVX({ width: 2, height: 2, depth: 2, channels: 1, data: new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2]) }),
        dec: decodeVX, probe: (r) => `${r.width}x${r.height}x${r.depth}c${r.channels}:${r.data[7]}`,
    },
];

// Rebuild a versioned buffer as a PRE-VERSION one: original magic, and the body with the version word removed.
// This is the file somebody exported from a demo page before this round existed.
function asLegacyFile(buf, legacyMagic) {
    const src = new Uint8Array(buf);
    const out = new Uint8Array(src.length - 4);
    out.set(src.subarray(0, 4), 0);
    out.set(src.subarray(VERSIONED_HEADER_BYTES), 4);
    new DataView(out.buffer).setUint32(0, legacyMagic, true);
    return out.buffer;
}

// ---- 1. THE DEFECT, COUNTED IN THE SOURCE ------------------------------------------------------------------
console.log("1. *** A '// VERSION: v1' COMMENT TRAVELS WITH THE READER AND NEVER WITH THE DATA ***");
{
    // Read the SHIPPED source of each format and confirm each still carries the comment that started this --
    // it is not wrong, it is just not a version field, and that distinction is the whole round.
    let commented = 0, gated = 0;
    for (const f of FORMATS) {
        const src = fs.readFileSync(path.join(ROOT, "engine", f.file), "utf8");
        if (/^\/\/ VERSION: v\d+/m.test(src)) commented++;
    }
    ok("!! all six still carry a '// VERSION: vN' line in their SOURCE", commented === 6,
        `${commented}/6 -- true before this round and true after it, and by itself it protects nothing`);

    // AND NOTHING HAD EVER CHECKED ANY OF THEM. This is why the gap survived to v4228.
    const gates = fs.readdirSync(path.join(ROOT, "tools", "ship")).filter((g) => g.endsWith(".mjs"));
    const SELF = path.basename(fileURLToPath(import.meta.url));
    for (const g of gates) {
        if (g === SELF) continue;
        const src = fs.readFileSync(path.join(ROOT, "tools", "ship", g), "utf8");
        if (/wndFormat|mtoFormat|molFormat|ovmFormat|p3dFormat|vxFormat/.test(src)) gated++;
    }
    ok("!! *** AND NOT ONE GATE IN THE TREE HAD EVER TOUCHED ANY OF THEM ***", gated === 0,
        `${gated} gates besides this one mention any of the six -- which is why nobody noticed`);

    ok("media/afContainer.mjs is the one that already did it right, and is the model",
        /u32 magic \| u32 version/.test(fs.readFileSync(path.join(ROOT, "media", "afContainer.mjs"), "utf8")) &&
        /version \$\{version\}, this reader is version/.test(fs.readFileSync(path.join(ROOT, "media", "afContainer.mjs"), "utf8")));
}

// ---- 2. THE ITEM WAS WRONG ABOUT bzPack, AND SAYING SO IS PART OF THE ROUND --------------------------------
console.log("\n2. *** THE BACKLOG ITEM NAMED bz/net/bzPack.js AS 'WORSE AGAIN'. IT WAS WRONG. ***");
{
    const pack = fs.readFileSync(path.join(ROOT, "bz", "net", "bzPack.js"), "utf8");
    const proto = fs.readFileSync(path.join(ROOT, "bz", "net", "bzProtocol.js"), "utf8");
    const worldDb = fs.readFileSync(path.join(ROOT, "bz", "net", "bzWorldDb.js"), "utf8");

    ok("bzPack really does have no magic and no version -- that part of the item was true",
        !/MAGIC/.test(codeOnly(pack)) && !/VERSION/.test(codeOnly(pack)));
    // ...and it is not ours to give one to. It is a transcription of BZFlag's src/net/Pack.cxx, and a magic
    // would put four bytes on the wire that no bzfs server expects.
    ok("!! ...because it is a transcription of somebody else's wire, and inventing a header would BREAK it",
        /Pack\.cxx/.test(pack) && /NETWORK BYTE ORDER/.test(pack),
        "adding a magic to a protocol you do not own is not a fix, it is a desync");
    ok("!! ...and BZFlag versions at the HANDSHAKE, which this port already implements",
        /const PROTO_VERSION = "0221"/.test(proto) && /BZFS/.test(proto), 'client sends "BZFLAG", server answers "BZFS0221"');
    ok("!! ...and REFUSES a map version it does not speak, by name, already",
        /if \(mapVersion !== MAP_VERSION\) return \{ ok: false/.test(worldDb),
        "`map version ${mapVersion}, and this client speaks ${MAP_VERSION}` -- exactly the discipline this round adds elsewhere");
}

// ---- 3. THE HELPER ------------------------------------------------------------------------------------------
console.log("\n3. one place that knows what a versioned header is");
{
    ok("!! the magic bump is the trailing byte, so it stays readable in a hex dump",
        magicText(WND_MAGIC) === "WND!" && magicText(versionedMagic(WND_MAGIC)) === "WND2",
        `"${magicText(WND_MAGIC)}" -> "${magicText(versionedMagic(WND_MAGIC))}"`);
    ok("...and it is derived, never written down twice",
        FORMATS.every((f) => magicText(versionedMagic(f.magic)).endsWith("2")),
        FORMATS.map((f) => magicText(f.magic) + ">" + magicText(versionedMagic(f.magic))).join(" "));
    ok("a header is 8 bytes: the magic and the version", VERSIONED_HEADER_BYTES === 8);

    const dv = new DataView(new ArrayBuffer(16));
    ok("write then read gives the version back", (() => {
        writeVersionedHeader(dv, WND_MAGIC, 3);
        const h = readVersionedHeader(dv, { name: "t", legacyMagic: WND_MAGIC, current: 5, legacyBodyOffset: 4 });
        return h.version === 3 && h.bodyOffset === 8 && h.legacy === false;
    })());
    let e = ""; try { writeVersionedHeader(dv, WND_MAGIC, 0); } catch (err) { e = err.message; }
    ok("version 0 cannot be WRITTEN -- 0 is reserved to mean 'pre-versioning'", /must be an integer >= 1/.test(e));
    e = ""; try { readVersionedHeader(new DataView(new ArrayBuffer(16)), { name: "t", legacyMagic: WND_MAGIC, current: 1, legacyBodyOffset: 4 }); } catch (err) { e = err.message; }
    ok("!! a foreign buffer is refused with BOTH acceptable magics named", /magic mismatch/.test(e) && /WND2/.test(e) && /WND!/.test(e), e.slice(0, 110));

    // *** SABOTAGE FOUND THIS ONE UNGUARDED BY ANY CHECK. *** Deleting the `version < 1` refusal left the gate
    // entirely green, so the guard was carrying no weight here even though it carries real weight in the code:
    // the versioned magic with a ZERO version is what a partly zeroed buffer looks like, and treating it as
    // "legacy" would then read the body at the LEGACY offset -- the versioned magic and the old offsets at the
    // same time, which is precisely the silent misread this whole round exists to stop.
    const zeroed = new DataView(new ArrayBuffer(16));
    writeVersionedHeader(zeroed, WND_MAGIC, 1);
    zeroed.setUint32(4, 0, true);
    e = ""; try { readVersionedHeader(zeroed, { name: "t", legacyMagic: WND_MAGIC, current: 1, legacyBodyOffset: 4 }); } catch (err) { e = err.message; }
    ok("!! a versioned magic with a ZERO version is refused, not silently treated as a pre-version file",
        /version 0 in a versioned file/.test(e), e || "*** IT ACCEPTED IT ***");
    ok("the error is a typed one a caller can branch on",
        (() => { try { readVersionedHeader(new DataView(new ArrayBuffer(16)), { name: "t", legacyMagic: WND_MAGIC, current: 1, legacyBodyOffset: 4 }); } catch (err) { return err instanceof FormatHeaderError && err.name === "FormatHeaderError"; } return false; })());
}

// ---- 4. THE VERSION IS IN THE BYTES -------------------------------------------------------------------------
console.log("\n4. *** READ AT THE BYTES, NOT THROUGH THE API THAT WROTE THEM ***");
{
    for (const f of FORMATS) {
        const buf = f.enc();
        const dv = new DataView(buf);
        // *** ASSERTED FROM THE BUFFER. *** Asking decode() what version it read would be asking the writer to
        // confirm its own work: a format that stored nothing at all could pass that and fail this.
        const gotMagic = dv.getUint32(0, true), gotVersion = dv.getUint32(4, true);
        ok(`${f.name}: the file itself carries "${magicText(versionedMagic(f.magic))}" and version ${f.version} at offset 4`,
            gotMagic === versionedMagic(f.magic) && gotVersion === f.version,
            `magic "${magicText(gotMagic)}", version ${gotVersion}, ${buf.byteLength} bytes`);
    }
}

// ---- 5. IT ROUND TRIPS, AND A PRE-VERSION FILE STILL READS -------------------------------------------------
console.log("\n5. *** NOTHING THAT ALREADY EXISTS STOPS BEING READABLE ***");
{
    for (const f of FORMATS) {
        const buf = f.enc();
        const now = f.dec(buf);
        ok(`${f.name}: round trips, and reports version ${f.version}`, now.version === f.version && f.probe(now).length > 0, f.probe(now));
        const legacy = f.dec(asLegacyFile(buf, f.magic));
        ok(`  !! ${f.name}: a PRE-VERSION file reads, as version 0, with identical data`,
            legacy.version === 0 && f.probe(legacy) === f.probe(now),
            `v0 "${f.probe(legacy)}" == v${f.version} "${f.probe(now)}"`);
    }
}

// ---- 6. AND A FUTURE FILE IS REFUSED BY NAME ----------------------------------------------------------------
console.log("\n6. *** THE ONE THAT MATTERS: A LAYOUT THIS READER DOES NOT KNOW IS REFUSED, NOT GUESSED AT ***");
{
    for (const f of FORMATS) {
        const buf = f.enc().slice(0);
        new DataView(buf).setUint32(4, 99, true);
        let msg = "";
        try { f.dec(buf); msg = ""; } catch (e) { msg = e.message; }
        ok(`!! ${f.name}: version 99 is refused, naming both versions`,
            /version 99/.test(msg) && new RegExp(`speaks version ${f.version}`).test(msg),
            msg ? msg.slice(msg.indexOf(":") + 2, msg.indexOf(":") + 92) : "*** IT READ THE FILE ANYWAY ***");
    }
    // Before this round the same edit was INVISIBLE: the version byte did not exist, so the four bytes now
    // holding it were the first field of the body and a changed layout simply produced a different picture.
    ok("!! ...and the refusal is one-sided on purpose: a reader can know the past and never the future",
        (() => {
            const dv = new DataView(new ArrayBuffer(16));
            writeVersionedHeader(dv, WND_MAGIC, 1);
            return readVersionedHeader(dv, { name: "t", legacyMagic: WND_MAGIC, current: 4, legacyBodyOffset: 4 }).version === 1;
        })(), "a v4 reader happily reads a v1 file; a v1 reader refuses a v4 file");
}

// ---- 7. ALIGNMENT: TWO FORMATS, TWO RIGHT ANSWERS -----------------------------------------------------------
console.log("\n7. why one header is padded to a multiple of four and another is 15 bytes long");
{
    const p3d = fs.readFileSync(path.join(ROOT, "engine", "p3dFormat.js"), "utf8");
    const vx = fs.readFileSync(path.join(ROOT, "engine", "vxFormat.js"), "utf8");
    // p3d reads its payload as a typed-array VIEW over the buffer, which THROWS on an unaligned offset.
    ok("!! p3d builds a Float32Array view over the buffer, so its header must stay 4-aligned",
        /new Float32Array\(buf, headerBytes/.test(p3d), "16 bytes: 8 header + 8 counts");
    // vx reads its payload one field at a time through a DataView, which does not care.
    ok("...while vx reads the RLE pairs through a DataView, so 15 bytes costs it nothing",
        /getUint16\(off, true\)/.test(vx) && !/new Uint8Array\(buf, headerBytes/.test(vx), "15 bytes: 8 header + 7 fields");
    let threw = false;
    try { new Float32Array(new ArrayBuffer(32), 15, 1); } catch { threw = true; }
    ok("!! ...and the platform really does throw on the unaligned view, so this is a constraint not a preference",
        threw, "new Float32Array(buffer, 15, 1) -> RangeError");
    // ...and p3d's alignment is not a claim, it is exercised: the round trip in section 5 would have thrown.
    ok("p3d's own round trip exercises it rather than asserting it", (() => {
        try { decodeP3D(encodeP3D({ vertices: new Float32Array(9), indices: new Uint16Array([0, 1, 2]) })); return true; } catch { return false; }
    })());
}

// ---- 8. WHAT IT IS AND IS NOT -------------------------------------------------------------------------------
console.log("\n8. what it is and is not");
{
    const helper = fs.readFileSync(path.join(ROOT, "engine", "binaryHeader.mjs"), "utf8");
    ok("!! ONE helper, imported six times -- not six independent fixes that could disagree",
        FORMATS.every((f) => /from "\.\/binaryHeader\.mjs"/.test(fs.readFileSync(path.join(ROOT, "engine", f.file), "utf8"))));
    ok("no dependency: it takes a DataView and returns numbers", !/^import /m.test(helper));
    // I first wrote this with a second conjunct that reduced to /afContainer/.test("x") -- a clause that is
    // false for every possible input and so contributed nothing but the appearance of rigour. Deleted.
    const af = fs.readFileSync(path.join(ROOT, "media", "afContainer.mjs"), "utf8");
    ok("...and it does not touch afContainer, which was already right",
        !/binaryHeader/.test(af) && /export const VERSION = 1;/.test(af),
        "a working format was left alone rather than churned for uniformity");
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT A VERSION FIELD MAKES A FORMAT COMPATIBLE. It makes an INCOMPATIBILITY DETECTABLE, which");
console.log("      is a smaller and much more useful thing. Nothing here migrates a v1 file to a future v2; when");
console.log("      that day comes somebody writes the migration, and the version field is what tells them they");
console.log("      have to. What it buys today is that a file this reader cannot read is REFUSED BY NAME instead");
console.log("      of misread into a plausible number and handed to a renderer.");
console.log("      AND THE LEGACY PATH IS UNTESTED AGAINST A REAL OLD FILE, because there is not one: the only");
console.log("      file of any of these six types anywhere in the tree is none at all. The pre-version buffers");
console.log("      above are SYNTHESISED by stripping the version word back out, which exercises the reader's");
console.log("      branch honestly but proves nothing about a file this code has never seen.");

console.log("\nbinaryHeader-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
