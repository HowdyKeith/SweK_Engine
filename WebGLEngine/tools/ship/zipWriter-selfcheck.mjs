// WebGLEngine/tools/ship/zipWriter-selfcheck.mjs -- v4607
//
// Run: node tools/ship/zipWriter-selfcheck.mjs
//
// GATES ai-bridge/packagerBridge.js's pure-Node zip writer (_zip/_zipTreeReal), which replaced a spawned
// PowerShell Compress-Archive / `zip` subprocess this round. The subprocess could not report progress -- Keith
// watched a release zip sit at 0 bytes for ten minutes with no way to tell "still working" from "stuck" on a
// tree of several thousand files, which is exactly the shape PowerShell's Compress-Archive is slowest at. The
// replacement writes the archive one file at a time, in a loop this code owns, so GET /package/progress (and,
// for the spawned-clone publish path, a throttled console.log tailed into the panel's existing log) can report
// real numbers: this many of this many files, this many percent.
//
// *** THIS IS A BEHAVIOUR-PRESERVATION GATE FOR THE ARTIFACT ITSELF, NOT A CONVENIENCE FEATURE. *** The zip
// this function produces is the release asset the fleet downloads and installs -- a bug here does not fail
// loudly, it ships a broken or incomplete engine build. Verified end to end against the REAL project tree
// before this gate was written (5,974 real files, 8.2s, unzip -t clean, Python's strict zipfile.testzip()
// clean, main.js's 3,230,253 bytes round-tripping byte-identical) -- this gate covers the edge cases that real
// run did not organically exercise: a non-ASCII filename, an empty file, a file deflate does not shrink, and a
// corrupted archive that the verification here must actually catch, not wave through.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const PB = require_(path.join(HERE, "..", "..", "ai-bridge", "packagerBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("zipWriter-selfcheck -- the pure-Node zip writer that replaced a spawned Compress-Archive/zip, real percentage progress\n");

console.log("1. CRC-32 -- the two textbook vectors, before trusting it on anything real");
{
    ok("!! crc32('') === 0", PB._crc32(Buffer.from("")) === 0);
    ok("!! crc32('The quick brown fox jumps over the lazy dog') === 0x414FA339",
        PB._crc32(Buffer.from("The quick brown fox jumps over the lazy dog")) === 0x414FA339);
}

// A minimal, dependency-free zip READER, independent of the writer under test -- it re-derives the central
// directory and re-inflates every entry itself, rather than trusting the writer's own claims about itself.
function readZip(zipPath) {
    const b = fs.readFileSync(zipPath);
    let eocd = -1;
    for (let i = b.length - 22; i >= 0 && i > b.length - 66000; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("no EOCD record");
    const count = b.readUInt16LE(eocd + 10);
    let off = b.readUInt32LE(eocd + 16);
    const entries = [];
    for (let k = 0; k < count; k++) {
        if (b.readUInt32LE(off) !== 0x02014b50) throw new Error("central directory entry " + k + " bad signature");
        const flag = b.readUInt16LE(off + 8), method = b.readUInt16LE(off + 10);
        const crc = b.readUInt32LE(off + 16), compSize = b.readUInt32LE(off + 20), uncompSize = b.readUInt32LE(off + 24);
        const nLen = b.readUInt16LE(off + 28), eLen = b.readUInt16LE(off + 30), cLen = b.readUInt16LE(off + 32);
        const lho = b.readUInt32LE(off + 42);
        const name = b.slice(off + 46, off + 46 + nLen).toString("utf8");
        if (b.readUInt32LE(lho) !== 0x04034b50) throw new Error("local header for '" + name + "' bad signature");
        const lNameLen = b.readUInt16LE(lho + 26), lExtraLen = b.readUInt16LE(lho + 28);
        const dataStart = lho + 30 + lNameLen + lExtraLen;
        const raw = b.slice(dataStart, dataStart + compSize);
        const data = method === 0 ? raw : zlib.inflateRawSync(raw);
        entries.push({ name, flag, method, crc, compSize, uncompSize, data });
        off += 46 + nLen + eLen + cLen;
    }
    return entries;
}

console.log("\n2. A REAL FIXTURE -- text, an empty file, a file deflate cannot shrink, a highly compressible one, a non-ASCII name");
let fixDir, outZip, entries;
{
    const stamp = "zipgate-" + process.pid + "-" + Date.now().toString(36);
    fixDir = path.join(os.tmpdir(), stamp + "-src");
    outZip = path.join(os.tmpdir(), stamp + ".zip");
    fs.mkdirSync(path.join(fixDir, "sub", "deep"), { recursive: true });
    fs.writeFileSync(path.join(fixDir, "a.txt"), "hello world, plain text file");
    fs.writeFileSync(path.join(fixDir, "empty.txt"), "");
    fs.writeFileSync(path.join(fixDir, "sub", "random.bin"), crypto_random(20000));
    fs.writeFileSync(path.join(fixDir, "sub", "deep", "repeated.txt"), "abcdefgh".repeat(20000));
    fs.writeFileSync(path.join(fixDir, "sub", "déep nämes ünïcode.txt"), "unicode content");

    const r = await PB._zip(fixDir, outZip);
    ok("!! _zip reports ok and the entry count matches the fixture", r.ok && r.entries === 5, JSON.stringify(r));
    ok("!! and normalizeZipSeparators found NOTHING to fix -- this writer's own names are forward-slash already",
        r.separatorsFixed === 0, "separatorsFixed=" + r.separatorsFixed);

    entries = readZip(outZip);
    ok("!! the independent reader also finds exactly 5 entries", entries.length === 5);

    const byRel = {};
    for (const e of entries) byRel[e.name.split("/").slice(1).join("/")] = e;

    ok("!! every entry's stored CRC matches an INDEPENDENTLY recomputed CRC of the inflated data",
        entries.every((e) => PB._crc32(e.data) === e.crc),
        entries.map((e) => e.name + ":" + (PB._crc32(e.data) === e.crc)).join(", "));
    ok("!! every entry's data matches the real source file byte-for-byte",
        byRel["a.txt"].data.toString() === "hello world, plain text file" &&
        byRel["empty.txt"].data.length === 0 &&
        byRel["sub/deep/repeated.txt"].data.toString() === "abcdefgh".repeat(20000) &&
        byRel["sub/random.bin"].data.equals(fs.readFileSync(path.join(fixDir, "sub", "random.bin"))));

    ok("!! the empty file is STORED (method 0), not deflated -- deflate(empty) is 2 bytes, bigger than nothing",
        byRel["empty.txt"].method === 0 && byRel["empty.txt"].compSize === 0);
    ok("!! the incompressible binary is STORED -- deflate did not help, so the fallback took it",
        byRel["sub/random.bin"].method === 0 && byRel["sub/random.bin"].compSize === byRel["sub/random.bin"].uncompSize);
    ok("!! the highly compressible file IS deflated, and shrinks by more than 100x",
        byRel["sub/deep/repeated.txt"].method === 8 && byRel["sub/deep/repeated.txt"].compSize < 2000,
        "160000 -> " + byRel["sub/deep/repeated.txt"].compSize);

    const uni = Object.keys(byRel).find((k) => k.includes("é"));
    ok("!! the non-ASCII filename round-trips exactly, with the UTF-8 general-purpose flag bit SET",
        !!uni && (byRel[uni].flag & 0x0800) !== 0 && byRel[uni].data.toString() === "unicode content",
        "name=" + uni + " flag=" + (uni ? byRel[uni].flag.toString(16) : "?"));

    ok("!! NO entry name contains a backslash -- the exact defect class normalizeZipSeparators exists to repair",
        entries.every((e) => !e.name.includes("\\")));
}

console.log("\n3. SABOTAGE -- a corrupted archive must actually be CAUGHT, not waved through by a vacuous check");
{
    const b = fs.readFileSync(outZip);
    // Flip one byte inside the FIRST entry's compressed data (well past its local header + name) so the stream
    // is still structurally parseable but the content is wrong -- proving the CRC recheck above is load-bearing.
    const victim = Buffer.from(b);
    let eocd = -1;
    for (let i = victim.length - 22; i >= 0; i--) if (victim.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    const cdStart = victim.readUInt32LE(eocd + 16);
    const firstLho = victim.readUInt32LE(cdStart + 42);
    const nLen = victim.readUInt16LE(firstLho + 26), eLen = victim.readUInt16LE(firstLho + 28);
    const dataStart = firstLho + 30 + nLen + eLen;
    victim[dataStart] = victim[dataStart] ^ 0xFF;   // flip a bit inside the first entry's stored/compressed bytes
    const sabPath = outZip + ".sabotage";
    fs.writeFileSync(sabPath, victim);

    let caught = false, reason = "";
    try {
        const bad = readZip(sabPath);
        const crcOk = bad.every((e) => PB._crc32(e.data) === e.crc);
        if (!crcOk) caught = true; else reason = "CRC check passed on corrupted data -- vacuous";
    } catch (e) { caught = true; reason = "reader threw: " + e.message; }
    ok("!! a single flipped byte in entry 1's data is CAUGHT (bad CRC or a parse failure), not silently accepted",
        caught, reason || "(CRC mismatch, as expected)");
    try { fs.unlinkSync(sabPath); } catch {}
}

console.log("\n4. PROGRESS -- GET /package/progress's shape after a completed zip");
{
    const p = PB.progress();
    ok("!! progress() reports the zip step complete: pct 100, done === total",
        p.step === "zip" && p.pct === 100 && p.done === p.total && p.total === 5,
        JSON.stringify(p));
}

try { fs.rmSync(fixDir, { recursive: true, force: true }); } catch {}
try { fs.rmSync(outZip, { force: true }); } catch {}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: the full real-tree run (5,974 files, 8.2s, unzip -t clean, Python zipfile.testzip() " +
    "clean, main.js byte-identical round-trip) -- done by hand before this gate was written, not repeated here " +
    "since it duplicates what section 2 above already proves per-mechanism, just slower; and the spawned-clone " +
    "console.log progress path (tools/ship/packRelease.mjs), which needs a real clone to drive and is exercised " +
    "by using the actual panel, not a unit gate.");
process.exit(fails ? 1 : 0);

function crypto_random(n) {
    const b = Buffer.alloc(n);
    for (let i = 0; i < n; i++) b[i] = (Math.random() * 256) | 0;
    return b;
}
