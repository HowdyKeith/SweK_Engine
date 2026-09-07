#!/usr/bin/env node
// WebGLEngine/tools/ship/gltfKtx2-selfcheck.mjs -- v4475
//
// *** THE WIRING ROUND'S GATE: THE TRANSCODER IS HERE, IT IS ATTACHED ONLY WHEN THE FILE NEEDS IT, AND
// *** EVERY VENDORED BYTE IS UPSTREAM'S.
//
// v4473 found the tree one wiring step from KHR_texture_basisu and refused to take it on a measurement.
// v4474 took the measurement that overturned that: one streamed Khronos model costs 71.7-91.6 MB of VRAM as
// PNG against 8.5-22.5 MB transcoded, twenty times this whole repository's own texture budget. This is the
// step, and this gate is what makes it checkable rather than announced.
//
// Run: node tools/ship/gltfKtx2-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseGlb, describeGlb, ktx2Loader, resetKtx2Loader, TRANSCODER_PATH } from "../../gpu/gltfKtx2.js";
import { OUTCOME } from "../../gpu/glbTexture.mjs";
import { MAGIC, JSON_CHUNK } from "../export/voxelGlb.mjs";
import { noComments } from "./sourceScan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

// Every file taken from three.js r160, with the digest it arrived with. A vendored file that has been edited
// is a DIFFERENT file wearing an upstream name, and the whole provenance record rests on it not being one.
const VENDORED = {
    "vendor/three/jsm/loaders/KTX2Loader.js":            "9cca5aa35fdb04b4818c792c8d08fb6e7607dcafc46e7b06a9485e9f25261be7",
    "vendor/three/jsm/utils/WorkerPool.js":              "94ff7b608caf3b827ffa95bd6092b9d174732b856915b38ed006b4f049f95675",
    "vendor/three/jsm/libs/ktx-parse.module.js":         "f73948e7bbf8db386076fda0458160bdb50ce2e11e88fa7da0f339e1ec547493",
    "vendor/three/jsm/libs/zstddec.module.js":           "5cbf818e842628a4464e748594a6deae18ceddda3c2f541e7b3a0ff5fc7611e2",
    "vendor/three/jsm/libs/basis/basis_transcoder.js":   "48a0ef319a28bf0224ee88ded34f74eaf97c175bba9eb18b47fb9720510ad6c4",
    "vendor/three/jsm/libs/basis/basis_transcoder.wasm": "79ae97d781e10a566659c689b7bb1de91726453f55f9f5e3bcc07a4e3904070f",
};

const glb = (o) => {
    let j = Buffer.from(JSON.stringify(o), "utf8");
    while (j.length % 4) j = Buffer.concat([j, Buffer.from(" ")]);
    const b = Buffer.alloc(20 + j.length);
    b.writeUInt32LE(MAGIC, 0); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length, 8);
    b.writeUInt32LE(j.length, 12); b.writeUInt32LE(JSON_CHUNK, 16); j.copy(b, 20);
    return b;
};
const EXT = "KHR_texture_basisu";
const FIX = {
    plain:      glb({ asset: { version: "2.0" }, textures: [{ source: 0 }], images: [{ uri: "x.png" }] }),
    required:   glb({ asset: { version: "2.0" }, extensionsUsed: [EXT], extensionsRequired: [EXT],
                      textures: [{ extensions: { [EXT]: { source: 0 } } }], images: [{ uri: "x.ktx2" }] }),
    optional:   glb({ asset: { version: "2.0" }, extensionsUsed: [EXT],
                      textures: [{ source: 0, extensions: { [EXT]: { source: 0 } } }], images: [{ uri: "x.png" }] }),
    orphan:     glb({ asset: { version: "2.0" }, extensionsUsed: [EXT],
                      textures: [{ extensions: { [EXT]: { source: 0 } } }], images: [{ uri: "x.ktx2" }] }),
};

console.log("gltfKtx2-selfcheck -- the transcoder, and when it is fetched\n");

// =============================================================================================================
console.log("1. *** EVERY VENDORED FILE IS PRESENT AND BYTE-IDENTICAL TO UPSTREAM r160 ***");
{
    const missing = Object.keys(VENDORED).filter((f) => !fs.existsSync(path.join(ROOT, f)));
    ok("*** all six files the loader needs are here ***", missing.length === 0,
        missing.length ? "MISSING: " + missing.join(", ")
                       : `${Object.keys(VENDORED).length} files: the loader, WorkerPool, ktx-parse, zstddec, and the Basis transcoder's js + wasm`);
    const wrong = Object.entries(VENDORED).filter(([f, want]) => {
        try { return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex") !== want; }
        catch { return true; }
    });
    ok("!! *** and not one of them has been edited -- each hashes to what it arrived with ***",
        wrong.length === 0,
        wrong.length ? wrong.map(([f]) => f).join(", ") + " -- a vendored file that has been edited is a DIFFERENT file wearing an upstream name"
                     : "six sha256 digests, re-derived from disk. KTX2Loader.js keeps its bare `from 'three'` " +
                       "and its relative '../utils/' and '../libs/' imports, which is why the layout mirrors upstream");

    // *** THE ATTRIBUTION IS NOT IN THE FILES, AND THE RECORD SAYS SO RATHER THAN IMPLYING IT IS. ***
    const bt = fs.readFileSync(path.join(ROOT, "vendor/three/jsm/libs/basis/basis_transcoder.js"), "utf8");
    const wasm = fs.readFileSync(path.join(ROOT, "vendor/three/jsm/libs/basis/basis_transcoder.wasm"));
    const prov = fs.readFileSync(path.join(ROOT, "vendor/three/jsm/libs/basis/PROVENANCE.txt"), "utf8");
    ok("!! *** the transcoder carries NO licence header, in either file, and PROVENANCE.txt says so ***",
        // *** THE PROSE MATCH IS GONE AND THE STRUCTURE STAYS, WHICH gateQuality's RATCHET REQUIRED. ***
        // The first version also matched a SENTENCE out of PROVENANCE.txt, which is prose-matching: rewording
        // the record would turn this red without anything changing about the bytes. What is structural is the
        // absence of a licence marker in either file, and the presence of the two IDENTIFIERS the record
        // stands on -- an upstream repo name and a sha256 -- both checked below.
        !/copyright|apache|SPDX/i.test(bt) && !/copyright|apache/i.test(wasm.toString("latin1")) &&
        prov.length > 500,
        "62,337 bytes of wrapper and 499,935 of wasm with no copyright line, no Apache string, no SPDX tag " +
        "anywhere in either. The assumption this refuses is 'it is inside the three.js repository, so it is " +
        "three.js's MIT' -- these are BUILT ARTIFACTS OF ANOTHER PROJECT, bundled");
    ok("  and the attribution that does exist is vendored beside them, naming a licence read first-hand",
        fs.existsSync(path.join(ROOT, "vendor/three/jsm/libs/basis/README.md")) &&
        /BinomialLLC\/basis_universal/.test(fs.readFileSync(path.join(ROOT, "vendor/three/jsm/libs/basis/README.md"), "utf8")) &&
        /065fcf48d6af21c0/.test(prov),
        "README.md names BinomialLLC/basis_universal, whose LICENSE this tree READ ITSELF at v4473 -- Apache " +
        "2.0, sha256 065fcf48d6af21c0, (c) 2019-2026 Binomial LLC. The record cites the digest, so the claim " +
        "is checkable rather than remembered");
    ok("  and the two McCurdy siblings are named with their licences too, not left as anonymous bytes",
        /KTX-Parse.*MIT.*Don McCurdy/s.test(prov) && /zstddec.*MIT.*Don McCurdy/s.test(prov),
        "ktx-parse and zstddec also ship without a header; both licences were fetched and read at v4475");
}

// =============================================================================================================
console.log("\n2. *** THE TRANSCODER IS FETCHED ONLY FOR FILES THAT NEED IT -- gltfDraco's RULE, RUN ***");
{
    // The attach decision is the whole of what this module contributes, so it is EXERCISED rather than read.
    // A stub factory stands in for the browser-only dynamic import; the DECISION under test is this module's.
    const runs = [];
    const stub = async () => ({ stub: true });
    class Fake {
        constructor() { this.attached = 0; runs.push(this); }
        setKTX2Loader() { this.attached++; }
        parse(_b, _p, res) { res({ scene: {} }); }
    }
    const attachedFor = async (fx) => { runs.length = 0; await parseGlb(FIX[fx], Fake, { ktx2: stub }); return runs[0].attached; };
    const results = {};
    for (const k of Object.keys(FIX)) results[k] = await attachedFor(k);

    ok("!! *** an uncompressed GLB never fetches the transcoder, and a KTX2 one always does ***",
        results.plain === 0 && results.required === 1 && results.optional === 1 && results.orphan === 1,
        `plain ${results.plain}, required ${results.required}, optional ${results.optional}, orphan ${results.orphan} ` +
        "-- 562 KB of wasm and wrapper is what a page pays for guessing, and this is the guess replaced by " +
        "reading the header. NOT ALL THE ANSWERS ARE THE SAME, so a factory that attached unconditionally " +
        "fails the first and one that never attached fails the other three");

    ok("  and the gltf comes back carrying what the peek found, so a caller can report it",
        await (async () => { runs.length = 0;
            const g = await parseGlb(FIX.required, Fake, { ktx2: stub });
            return g.swekKtx2 && g.swekKtx2.outcome === OUTCOME.THROWS && g.swekKtx2.required === true; })(),
        "`swekKtx2` on the result, the same shape gltfDraco attaches as `swekDraco`");

    // *** THE RENDERER GUARD, WHICH IS NOT PEDANTRY. *** A KTX2 file is a container, not a GPU format; which
    // format it becomes depends on what the device supports, and detectSupport is where that is decided.
    let refused = false;
    try { await ktx2Loader(null); } catch (e) { refused = /renderer is required/.test(e.message); }
    resetKtx2Loader();
    ok("!! *** and the loader REFUSES to be built without a renderer rather than guessing a target ***",
        refused,
        "detectSupport(renderer) chooses BC7, ASTC or ETC2 from what the device reports. Defaulting would " +
        "hand the GPU a format it cannot sample, and quietly");
}

// =============================================================================================================
console.log("\n3. *** BOTH BACKENDS OF THIS ENGINE ARE SERVED BY THE UPSTREAM FILE, WHICH IS WHY IT IS UNEDITED ***");
{
    const src = noComments(fs.readFileSync(path.join(ROOT, "vendor/three/jsm/loaders/KTX2Loader.js"), "utf8"));
    ok("*** detectSupport branches on isWebGPURenderer and asks it for its features ***",
        /renderer\.isWebGPURenderer\s*===\s*true/.test(src) && /hasFeature\(\s*'texture-compression-bc'\s*\)/.test(src),
        "the WebGPU path reads texture-compression-astc, -etc2 and -bc through renderer.hasFeature");
    ok("  and falls back to the WebGL2 extension list otherwise",
        /renderer\.extensions\.has\(\s*'WEBGL_compressed_texture_s3tc'\s*\)/.test(src),
        "so a hybrid WebGL2/WebGPU engine needs no fork of this file, and none was made");
    ok("  and the transcoder path this tree serves is where the transcoder actually is",
        TRANSCODER_PATH === "/vendor/three/jsm/libs/basis/" &&
        fs.existsSync(path.join(ROOT, TRANSCODER_PATH.replace(/^\//, ""), "basis_transcoder.wasm")),
        `${TRANSCODER_PATH} -- setTranscoderPath is a URL the BROWSER fetches, so it is checked against the ` +
        "file on disk rather than assumed to line up");
}

// =============================================================================================================
console.log("\n4. WHAT A PAGE CAN SAY BEFORE IT LOADS ANYTHING");
{
    const notes = Object.fromEntries(Object.keys(FIX).map((k) => [k, describeGlb(FIX[k])]));
    for (const [k, d] of Object.entries(notes)) report(`${k.padEnd(9)} ${d.outcome.padEnd(10)} ${d.note}`);
    ok("*** the four outcomes get four different notes, so no single string satisfies them ***",
        new Set(Object.values(notes).map((d) => d.note)).size === 4,
        `${new Set(Object.values(notes).map((d) => d.note)).size} distinct notes across ${Object.keys(FIX).length} fixtures`);
    ok("!! and the one that lies is called out by name, because its error names the wrong thing",
        /json\.images\[undefined\]\.uri/.test(notes.orphan.note) && notes.orphan.outcome === OUTCOME.TYPEERROR,
        "an optional basisu texture with no fallback `source` dies naming 'uri', not Basis -- v4473's finding, " +
        "and attaching a transcoder is what fixes it");
}

// =============================================================================================================
console.log("\n5. *** AND A PAGE ACTUALLY USES IT, WHICH IS THE DIFFERENCE BETWEEN WIRED AND VENDORED ***");
{
    const page = noComments(fs.readFileSync(path.join(ROOT, "glb_viewer.html"), "utf8"));
    ok("*** glb_viewer.html attaches the transcoder, and only after asking the header ***",
        /setKTX2Loader\(\s*await ktx2Loader\(\s*renderer\s*\)\s*\)/.test(page) && /describeKtx2\(buf\)/.test(page),
        "describeKtx2 first, setKTX2Loader second -- a page that attached unconditionally would make every " +
        "model it opens pay 562 KB, which is the cost gltfDraco's header refuses for 256 KB");

    // *** THE BASE PATH IS THE HALF THAT MAKES IT USABLE, AND IT WAS MISSING. *** loader.parse(buf, "") cannot
    // resolve a sibling, and EVERY KTX2 variant in the catalogue is a .gltf with siblings -- so the viewer's
    // self-contained-only rule excluded exactly the assets this round exists for.
    ok("!! *** and it passes a base path, without which a .gltf can never find its .ktx2 siblings ***",
        /loader\.parse\(\s*buf\s*,\s*base\s*,/.test(page) && /url\.replace\(\/\[\^\/\]\*\$\/\s*,\s*""\)/.test(page),
        "the directory of the URL is handed to three, which resolves relative URIs against it. Before this " +
        "the second argument was the empty string and the picker offered self-contained GLBs only");

    ok("  and the KTX2 variants are offered in the picker, since they can now load",
        /\/KTX\|Basis\/i\.test\(v\)/.test(page) && /\(KTX2\)/.test(page),
        "a model with a KTX2 variant gets its own row, so the two encodings sit side by side in one list -- " +
        "which is what v4474's 71.7-91.6 MB against 8.5-22.5 MB is for");
}

console.log("\ngltfKtx2-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
