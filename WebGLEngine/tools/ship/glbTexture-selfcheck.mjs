#!/usr/bin/env node
// WebGLEngine/tools/ship/glbTexture-selfcheck.mjs -- v4473
//
// *** THE TEXTURE TWIN OF dracoWeld-selfcheck, AND IT SAYS "NOT YET". ***
//
// Six repositories were put to this tree as a question: Basis Universal, crunch, KTX-Software, its Binomial
// fork, a wrapper, and the glTF spec. They are the toolchain for the texture half of what this tree already
// does for geometry through KHR_draco_mesh_compression. The round measures before it builds, which is what
// gpu/glbTexture.mjs's BUDGET records, and this gate is where the measurement is re-derived rather than read.
//
// Run: node tools/ship/glbTexture-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { textureVerdict, needsKtx2, BASISU_EXT, OUTCOME, BUDGET } from "../../gpu/glbTexture.mjs";
import { extensionsOf } from "../../gpu/glbPeek.mjs";
import { MAGIC, JSON_CHUNK } from "../export/voxelGlb.mjs";
import { noComments } from "./sourceScan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

console.log("glbTexture-selfcheck -- the texture half of the Draco question\n");

// =============================================================================================================
console.log("1. THE FIXTURES, BUILT FROM THIS TREE'S OWN GLB CONSTANTS");
{
    // *** THE CONTAINER IS ASSEMBLED FROM voxelGlb's MAGIC AND JSON_CHUNK, THE SAME TWO glbPeek IMPORTS. ***
    // A fixture writer with its own idea of the container would be testing the fixture writer.
    const glb = (obj) => {
        let json = Buffer.from(JSON.stringify(obj), "utf8");
        while (json.length % 4) json = Buffer.concat([json, Buffer.from(" ")]);
        const out = Buffer.alloc(12 + 8 + json.length);
        out.writeUInt32LE(MAGIC, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
        out.writeUInt32LE(json.length, 12); out.writeUInt32LE(JSON_CHUNK, 16);
        json.copy(out, 20);
        return out;
    };
    const img = [{ uri: "fallback.png" }];

    const FIX = {
        plain:    glb({ asset: { version: "2.0" }, textures: [{ source: 0 }], images: img }),
        required: glb({ asset: { version: "2.0" }, extensionsUsed: [BASISU_EXT], extensionsRequired: [BASISU_EXT],
                        textures: [{ extensions: { [BASISU_EXT]: { source: 0 } } }], images: img }),
        optionalWithFallback: glb({ asset: { version: "2.0" }, extensionsUsed: [BASISU_EXT],
                        textures: [{ source: 0, extensions: { [BASISU_EXT]: { source: 0 } } }], images: img }),
        optionalNoFallback: glb({ asset: { version: "2.0" }, extensionsUsed: [BASISU_EXT],
                        textures: [{ extensions: { [BASISU_EXT]: { source: 0 } } }], images: img }),
        declaredUnused: glb({ asset: { version: "2.0" }, extensionsUsed: [BASISU_EXT],
                        textures: [{ source: 0 }], images: img }),
    };
    const v = (k) => textureVerdict(FIX[k]);

    ok("*** every fixture is a GLB this tree's own reader accepts ***",
        Object.keys(FIX).every((k) => v(k).ok),
        `${Object.keys(FIX).length} fixtures through peekGlb, assembled from voxelGlb's MAGIC and JSON_CHUNK`);

    // *** THE EXPECTATIONS ARE NOT ALL ALIKE, WHICH IS THE POINT. *** A fixture set whose every answer is the
    // same is satisfied by a function that returns that answer -- the earned zero this branch has recorded
    // three times. Four distinct outcomes cannot be satisfied by any constant.
    const want = { plain: OUTCOME.NONE, required: OUTCOME.THROWS, optionalWithFallback: OUTCOME.FALLBACK,
                   optionalNoFallback: OUTCOME.TYPEERROR, declaredUnused: OUTCOME.NONE };
    const wrong = Object.entries(want).filter(([k, o]) => v(k).outcome !== o);
    ok("!! *** each fixture lands on its own outcome, and no single answer satisfies them all ***",
        wrong.length === 0 && new Set(Object.values(want)).size === 4,
        wrong.length ? wrong.map(([k, o]) => `${k}: want ${o}, got ${v(k).outcome}`).join("; ")
                     : Object.entries(want).map(([k, o]) => k + "=" + o).join(", ") +
                       ` -- ${new Set(Object.values(want)).size} DISTINCT outcomes across 5 fixtures, so a ` +
                       "constant-returning verdict fails at least three of them");

    ok("  and `source: 0` is a fallback, not a missing one",
        v("optionalWithFallback").textures[0].hasFallback === true &&
        v("optionalNoFallback").textures[0].hasFallback === false,
        "image index 0 is a perfectly good image; a `!t.source` test would call it absent, which is why the " +
        "check is typeof === 'number'");

    ok("  and a declared-but-unused extension is reported, not smoothed over",
        v("declaredUnused").declared === true && v("declaredUnused").usingBasisu === 0 &&
        /did not need/.test(v("declaredUnused").why),
        "glbPeek says the same thing about Draco: somebody's exporter wrote a declaration it does not use");

    ok("  and attaching a transcoder changes the answer, so the verdict is about THIS tree's wiring",
        textureVerdict(FIX.required, { hasKtx2Loader: true }).outcome === OUTCOME.NONE &&
        v("required").outcome === OUTCOME.THROWS,
        "the same bytes read as THROWS with no KTX2Loader and NONE with one -- the file is not the problem, the wiring is");

    ok("  and needsKtx2 agrees with the verdict rather than re-deriving it",
        needsKtx2(FIX.required) && needsKtx2(FIX.optionalNoFallback) &&
        needsKtx2(FIX.optionalWithFallback) && !needsKtx2(FIX.plain) && !needsKtx2(FIX.declaredUnused),
        "one rule, two callers -- gltfDraco's shape, where glbPeek decides and the loader obeys");
}

// =============================================================================================================
console.log("\n2. *** THE THREE OUTCOMES ARE READ OUT OF THE VENDORED LOADER, NOT ASSUMED ***");
{
    const GL = path.join(ROOT, "vendor", "three", "jsm", "loaders", "GLTFLoader.js");
    const src = fs.readFileSync(GL, "utf8");

    ok("*** the vendored loader already speaks " + BASISU_EXT + " ***",
        src.includes("KHR_TEXTURE_BASISU: 'KHR_texture_basisu'") && /setKTX2Loader\s*\(/.test(src),
        "GLTFTextureBasisUExtension, setKTX2Loader and the spec link are all present -- three r160 has spoken " +
        "this extension the whole time. WHAT IS MISSING IS THE TRANSCODER, exactly as gltfDraco found for geometry");

    ok("  and nothing in this tree attaches one",
        sourcesNaming("setKTX2Loader").length === 0,
        "no call to setKTX2Loader outside vendor/, and no KTX2Loader vendored -- so every basisu asset takes " +
        "one of the three paths below");

    ok("!! outcome 1 -- REQUIRED throws, and the message names the missing thing",
        /setKTX2Loader must be called before loading KTX2 textures/.test(src),
        "the good failure: it says what to do");

    ok("!! outcome 2 -- OPTIONAL falls through, because a falsy result means NOT HANDLED",
        /if\s*\(\s*result\s*\)\s*return result;/.test(src) && /extensions\.push\(\s*this\s*\);/.test(src),
        "_invokeOne walks the plugins and pushes the PARSER LAST, so the extension returning null hands the " +
        "texture to GLTFParser.loadTexture and the PNG fallback loads. It works because of the dispatcher's " +
        "rule, not because anything checked");

    // *** THE ONE THAT MATTERS, AND THE REASON THIS GATE EXISTS. ***
    //
    // *** THIS ASSERTED THE LOADER'S COMMENT TEXT AND gateQuality-selfcheck SAID NO, CORRECTLY. *** The first
    // version matched /Assumes that the extension is optional and that a fallback texture is present/ against
    // the vendored source -- PROSE-MATCHING, which that gate ratchets against precisely because three.js can
    // reword a comment and turn this red without anything changing about what the code does. The comment is
    // colour; THE CLAIM IS STRUCTURAL, and the structure is an unguarded dereference: `json.images[undefined]`
    // followed by `.uri`, with no test that the image exists. That is what makes outcome 3 real, and it
    // survives any rewording.
    const unguarded = /const sourceDef = json\.images\[\s*sourceIndex\s*\];[\s\S]{0,120}?if\s*\(\s*sourceDef\.uri\s*\)/.test(src);
    ok("!! *** outcome 3 -- nothing guards the fallback, so the failure names the wrong thing ***",
        unguarded,
        "GLTFParser.loadTexture reads json.images[textureDef.source] and immediately tests sourceDef.uri, with " +
        "no check that the image exists. The loader's own comment nearby says it ASSUMES a fallback is " +
        "present; nothing verifies that, and it is not asserted here because a comment is not a mechanism. " +
        "Nothing verifies it. When it is false the fall-through reaches `json.images[undefined].uri` and the " +
        "load dies with \"Cannot read properties of undefined (reading 'uri')\" -- AN ERROR THAT SAYS NOTHING " +
        "ABOUT BASIS, KTX2 OR A TRANSCODER, and reads like a corrupt file. The glTF spec does not require " +
        "`source` on a texture, so such an asset is legal");

    ok("  and this module predicts that outcome from the header alone, before anything is loaded",
        textureVerdict((() => {
            let json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, extensionsUsed: [BASISU_EXT],
                textures: [{ extensions: { [BASISU_EXT]: { source: 0 } } }], images: [{ uri: "x.ktx2" }] }), "utf8");
            while (json.length % 4) json = Buffer.concat([json, Buffer.from(" ")]);
            const out = Buffer.alloc(20 + json.length);
            out.writeUInt32LE(MAGIC, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
            out.writeUInt32LE(json.length, 12); out.writeUInt32LE(JSON_CHUNK, 16); json.copy(out, 20);
            return out;
        })()).outcome === OUTCOME.TYPEERROR,
        "which is the whole value of a peek: the header says what the load will do, so a caller can attach a " +
        "transcoder or refuse the file instead of catching a TypeError about 'uri'");
}

// =============================================================================================================
console.log("\n3. *** THE MEASUREMENT THAT SAYS NOT YET, RE-DERIVED FROM THE TREE RATHER THAN READ ***");
{
    const imgs = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (/node_modules|^\.git$|^vendor$/.test(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(png|jpe?g)$/i.test(e.name)) continue;
            const b = fs.readFileSync(p);
            let w = 0, h = 0;
            if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
            imgs.push({ rel: path.relative(ROOT, p).split(path.sep).join("/"), bytes: b.length, w, h });
        }
    })(ROOT);

    const disk = imgs.reduce((n, t) => n + t.bytes, 0);
    const rgba = imgs.reduce((n, t) => n + t.w * t.h * 4, 0);
    const mips = Math.round(rgba * 4 / 3);
    report(`${imgs.length} images: ${(disk / 1048576).toFixed(2)} MB on disk, ` +
           `${(rgba / 1048576).toFixed(2)} MB decoded RGBA8, ${(mips / 1048576).toFixed(2)} MB with mips`);

    ok("*** the number that matters is VRAM, and it is many times the number on disk ***",
        rgba > disk * 4,
        `${(rgba / disk).toFixed(1)}x. A PNG's size is what it costs to DOWNLOAD; a GPU holds it decoded to ` +
        "RGBA8 forever, and with mips at 4/3 of that. Any argument for a compressed texture format made in " +
        "download bytes is being made in the wrong unit");

    // *** AND THEN ONE FILE OWNS THE ANSWER, WHICH IS WHY THIS IS A DISTRIBUTION AND NOT A TOTAL. ***
    const big = imgs.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const share = (big.w * big.h * 4) / rgba;
    const bigLoaded = sourcesNaming(path.basename(big.rel)).length > 0;
    ok("!! *** and the total is dominated by ONE image that nothing in the tree loads ***",
        share > 0.5 && bigLoaded === false,
        `${big.rel} (${big.w}x${big.h}) is ${(share * 100).toFixed(0)}% of the decoded total and is REFERENCED ` +
        "NOWHERE outside vendor/ -- a preview PNG in tools/, never a GPU texture. A total that one unused file " +
        "owns is not a measurement of what this engine costs");

    const loadedRgba = rgba - big.w * big.h * 4;
    ok("!! *** so the verdict is NOT YET, and it is a measurement rather than a preference ***",
        loadedRgba < 1048576 && /NOT YET/.test(BUDGET.verdict),
        `everything else decodes to ${(loadedRgba / 1048576).toFixed(2)} MB. ETC1S would make that ` +
        `${(loadedRgba / 8 / 1048576).toFixed(2)} MB -- A SAVING OF UNDER A MEGABYTE, against a transcoder, a ` +
        "build step, and a vendored dependency carrying thirteen licences. The 8x is real and the base is too " +
        "small for it to matter");

    ok("  and what was NOT measured is named, because that is where the answer could change",
        /streamed/.test(BUDGET.notMeasured) && BUDGET.dominatedByIsLoaded === false,
        BUDGET.notMeasured + " -- taking that number is a round of its own, and it is the one that would " +
        "overturn this verdict");

    // The record must not drift from the tree the way COMMIT_BELT_V4418 did: this re-derives and compares.
    const near = (a, b, tol) => Math.abs(a - b) / b < tol;
    ok("  and BUDGET's recorded figures still match a fresh walk of the tree",
        near(BUDGET.diskBytes, disk, 0.1) && near(BUDGET.withMipsBytes, mips, 0.1) && BUDGET.files >= imgs.length,
        `recorded ${(BUDGET.diskBytes / 1048576).toFixed(2)}/${(BUDGET.withMipsBytes / 1048576).toFixed(2)} MB ` +
        `against a measured ${(disk / 1048576).toFixed(2)}/${(mips / 1048576).toFixed(2)} MB. A recorded number ` +
        "nobody re-derives is the defect v4472 spent a round on");
}

// *** A NEEDLE-FILTERED WALK, BECAUSE THE FIRST TWO DRAFTS WERE BOTH OVER THE CAP. ***
// Draft one re-read every .js/.mjs/.html per call: 9.7 s. Draft two memoised the whole corpus and stripped
// comments from all 1500 files: 4.7 s. Both are over the quick sweep's 3000 ms, and A GATE BORN OVER THE CAP
// IS BORN EXILED -- into the absorbing state this very round measured at 503 gates, where nothing would ever
// re-time it. So the strip is done only where it can matter: "raw text contains the needle" is a strict
// superset of "code contains the needle", so filtering on the raw text first and stripping only the survivors
// gives the identical answer for a fraction of the work.
function sourcesNaming(needle) {
    const out = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (/node_modules|^\.git$|^vendor$|GPU_Assets/.test(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs|html)$/.test(e.name)) continue;
            if (p.includes("glbTexture")) continue;   // a scan must not count the scanner -- orreryFleetScan's rule
            const raw = fs.readFileSync(p, "utf8");
            if (!raw.includes(needle)) continue;
            // *** COMMENTS ARE STRIPPED, BECAUSE THIS ROUND'S OWN CHANGELOG NOTE BROKE THIS CHECK. *** The
            // v4473 note in main.js and brain/brain.js explains that nothing calls setKTX2Loader -- and by
            // naming it, made a raw scan report that something does. A CHECK ABOUT CODE STRIPS COMMENTS
            // FIRST, the rule this tree settled at v4266, or a round's own prose becomes evidence against it.
            if (noComments(raw).includes(needle)) out.push(path.relative(ROOT, p).split(path.sep).join("/"));
        }
    })(ROOT);
    return out;
}

console.log("\nglbTexture-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
