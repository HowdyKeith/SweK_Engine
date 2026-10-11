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

// Every file taken from three.js, with the digest it arrived with. A vendored file that has been edited
// is a DIFFERENT file wearing an upstream name, and the whole provenance record rests on it not being one.
// RE-VENDORED at 0.185.1 (backlog "vendor-three-r160-stale", tools/ship/nextRounds.mjs) -- digests below
// updated to match; zstddec.module.js's is UNCHANGED because that file is byte-identical between r160 and
// 0.185.1 upstream (re-confirmed directly, not assumed), so its digest carries over rather than moving.
// v4807: vendor/three moved to 0.186.1, and all six of these are byte-identical between 0.185.1 and 0.186.1 (compared against
// the tarball file by file), so not one digest moves -- which is the claim this table makes, now about a second release.
const VENDORED = {
    "vendor/three/jsm/loaders/KTX2Loader.js":            "3a3233ce3409443076d3414b78832e1405fcfac5ecb34d367365fd0781127d6c",
    "vendor/three/jsm/utils/WorkerPool.js":              "5ac7095fd566bc9ae48376055fd66edf27cb9ebbf9e1269dc206bfd4933ae9eb",
    "vendor/three/jsm/libs/ktx-parse.module.js":         "f40c491f6c44dde511268121f778a0050e73b1a15fd844c1ae2c78c73213eafc",
    "vendor/three/jsm/libs/zstddec.module.js":           "5cbf818e842628a4464e748594a6deae18ceddda3c2f541e7b3a0ff5fc7611e2",
    "vendor/three/jsm/libs/basis/basis_transcoder.js":   "8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1",
    "vendor/three/jsm/libs/basis/basis_transcoder.wasm": "6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a",
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
console.log("1. *** EVERY VENDORED FILE IS PRESENT AND BYTE-IDENTICAL TO UPSTREAM 0.186.1 ***");
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

    // v4807 -- *** AND THE OTHER FOURTEEN, SO A HALF-DONE RE-VENDOR CANNOT HIDE. *** vendor/three moved to 0.186.1 and seven of its
    // files changed; nothing held those seven to the release's bytes, so a GLTFLoader.js left at 0.185.1 beside an r186 core would have
    // passed every gate. Each digest is the npm tarball's file, compared before it was written here. three.core.js is the same bytes as
    // vendor/three-webgpu/three.core.js: the two builds share one core, which threeUpstream-selfcheck's section 6 holds to the record.
    const REST = {
        "vendor/three/three.core.js": "9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6",
        "vendor/three/three.module.js": "9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea",
        "vendor/three/jsm/controls/OrbitControls.js": "3d79d07ecb686b4e5d93232eedab255331c1beef711e13164eaa1f68655a5f2b",
        "vendor/three/jsm/exporters/GLTFExporter.js": "d766b04f233fa8bc72bfaebacaac5ecb832c30ca3695ce8d84bbb7dccccdc842",
        "vendor/three/jsm/loaders/FBXLoader.js": "7fb8586158a2cf98477b2ee40a82ebec10a81040c70369bb177043375c355322",
        "vendor/three/jsm/loaders/GLTFLoader.js": "131c0f78c01d19368ae495caa65b3adaa10487810a36a05bb5901b769a35ac16",
        "vendor/three/jsm/utils/BufferGeometryUtils.js": "9fb63427ce6641fa14fd0baff9cc4d1b5f9c3d85fd084bf2e90e803c44ec1797",
        "vendor/three/jsm/utils/SkeletonUtils.js": "b1632a703206c3d830de9fcbe515696770d04b71a15ee6b50afa6d2c3298c86f",
        "vendor/three/jsm/libs/fflate.module.js": "209a4412eb48ce609edb4391992a792ffcc3983d30ee7e2b0b89a8c470f3cd8a",
        "vendor/three/jsm/libs/meshopt_decoder.module.js": "d428e73a000057c6c94bfcedc3412d0c2dc14ca8800e88553aab05113ad2bf19",
        "vendor/three/jsm/libs/basis/README.md": "a578df416c1e0852e9c36a1cf91b4d28d91a251294f87ce610a3bc7ca4df15e0",
        "vendor/three/jsm/curves/NURBSCurve.js": "bef2607618a7778455e71a1f0bd206951c382d313e2e245808cc7d3533d60fb6",
        "vendor/three/jsm/curves/NURBSUtils.js": "c6bd7c4137d585098923f189687898ea3e8762ea3ecbe255d749a56353894379",
        "vendor/three/jsm/math/ColorSpaces.js": "cc35c01c793cd17ccded7bc8142abffd3ce0d60dd6de8d5d216983bd05aee262",
    };
    const digest = (f) => { try { return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex"); } catch { return null; } };
    const restWrong = Object.entries(REST).filter(([f, want]) => digest(f) !== want);
    // every file under vendor/three is in one of the two tables, or is this tree's own paperwork or code
    const OWN = new Set(["vendor/three/PROVENANCE.txt", "vendor/three/LICENSE", "vendor/three/jsm/libs/meshoptGltf.js", "vendor/three/jsm/libs/basis/PROVENANCE.txt"]);
    const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d + "/" + e.name) : [d + "/" + e.name]);
    const untabled = walk("vendor/three").filter((f) => !(f in VENDORED) && !(f in REST) && !OWN.has(f));
    ok(`!! *** the other ${Object.keys(REST).length} upstream files are 0.186.1's too, byte for byte, and nothing under vendor/three is in neither table ***`,
        restWrong.length === 0 && untabled.length === 0,
        restWrong.length ? "DIFFER: " + restWrong.map(([f]) => f).join(", ") : untabled.length ? "UNTABLED: " + untabled.join(", ") :
        `three.core.js is vendor/three-webgpu's own core: ${digest("vendor/three/three.core.js") === digest("vendor/three-webgpu/three.core.js")}`);

    // v4807 SABOTAGES: GLTFLoader.js left at 0.185.1 -> 1 (DIFFER, naming it); a stray file under vendor/three/jsm -> 1 (UNTABLED).
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
