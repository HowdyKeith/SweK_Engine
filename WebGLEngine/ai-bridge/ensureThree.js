// ai-bridge/ensureThree.js — self-heal for the bundled three.js viewer assets.
//
// vendor/three (three.module.js + three.core.js + the three jsm modules the 3D viewer pages need:
// pipboy-models / glb_viewer / graph_viewer / voxel-photo-cube, and the dozens of other pages and
// real engine modules that import "three") normally SHIPS in the zip, so it loads instantly and
// offline. This is only a safety net: if those files are ever missing (a ship-strip slip, or the
// user deleted them), the bridge quietly re-fetches the exact 0.185.1 closure on boot so the
// regression that broke the viewers before can't recur.
//
// *** WHY THE NPM TARBALL AND NOT PER-FILE raw.githubusercontent.com FETCHES, UNLIKE THIS FILE'S OWN
// PRIOR SHAPE. *** three.js's GitHub tags never adopted the semver scheme npm publishes under (r160,
// r180, etc. still resolve on GitHub; there is no "0.185.1" tag) -- so a REV string here can no
// longer double as a raw.githubusercontent.com path segment the way "r160" once did. The npm
// registry tarball (same one vendor/three-webgpu's own re-vendor used, see that directory's
// README.md) carries build/ and examples/jsm/ together under one immutable, versioned artefact, so
// this module fetches that once and copies every file this directory vendors out of it, rather than
// juggling 15+ individual URLs against a tag scheme that no longer maps cleanly to the version.
//
// *** WHY curl+tar AND NOT NODE'S BUILT-IN fetch/https. *** This sandbox's outbound HTTPS goes
// through an agent proxy, and Node's own http/https modules (which its global fetch is built on)
// have never honored HTTP_PROXY/HTTPS_PROXY -- a Node-wide gap, not specific to this sandbox (a real
// corporate-proxy user would hit the identical silent failure). curl DOES read those env vars, and
// every install script in this tree that needed this fix already shells out to it
// (ai-bridge/ffmpegWasmBridge.js, verifiedPolygonIntersectionBridge.js, install-mac.sh,
// install-steamdeck.sh) -- this file now follows the same precedent instead of being the one holdout
// still calling fetch() directly against a third-party host.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

// vendor/three is served to the browser from the WebGLEngine web root, which is
// the parent of ai-bridge (the import map resolves "/vendor/three/..."). ai-bridge
// has its OWN vendor/ (go2rtc) — do NOT confuse them.
const DIR = path.join(__dirname, "..", "vendor", "three");
const REV = "0.185.1";   // the npm "three" package version this directory is vendored from
const TARBALL_URL = "https://registry.npmjs.org/three/-/three-" + REV + ".tgz";

// [ local path under vendor/three , path inside the npm tarball's "package/" root ]
const FILES = [
    ["three.module.js", "build/three.module.js"],
    // Split out of three.module.js since three r160: three.module.js is now a thin re-export shim
    // over this file (60,000+ lines) -- both are required for the module to actually resolve.
    ["three.core.js", "build/three.core.js"],
    ["jsm/controls/OrbitControls.js", "examples/jsm/controls/OrbitControls.js"],
    ["jsm/loaders/GLTFLoader.js", "examples/jsm/loaders/GLTFLoader.js"],
    // *** NOT DEAD WEIGHT -- GLTFLoader.js ITSELF STATICALLY IMPORTS THIS, AT r160 AND AT 0.185.1 BOTH. ***
    // `import { toTrianglesDrawMode } from '../utils/BufferGeometryUtils.js'` sits in GLTFLoader.js's own
    // top-level import block (used for TRIANGLE_STRIP/TRIANGLE_FAN primitive-mode conversion), confirmed by
    // reading the vendored file directly. A prior round's "zero real callers" finding only grepped for
    // callers OUTSIDE vendor/three -- true as far as it went, but GLTFLoader.js's dependency on it is a real
    // caller INSIDE vendor/three, and dropping this file breaks GLTFLoader.js's module graph outright (every
    // page that imports GLTFLoader fails at `import()` time, not just glTF files using strip/fan). Caught by
    // dracoEncode-selfcheck.mjs failing "Failed to fetch dynamically imported module" the first time this
    // file was dropped during this same re-vendor; restored before shipping. See PROVENANCE.txt.
    ["jsm/utils/BufferGeometryUtils.js", "examples/jsm/utils/BufferGeometryUtils.js"],
    // *** ALSO NOT OPTIONAL, FOR THE SAME REASON. *** GLTFLoader.js grew a second internal dependency
    // between r160 and 0.185.1 that r160's copy did not have: `import { clone } from
    // '../utils/SkeletonUtils.js'`. Missing this 404s the same way missing BufferGeometryUtils.js did --
    // the whole module fails to resolve. Found the same way: a real gate failure, re-confirmed by reading
    // the vendored file's own `^import` lines. See PROVENANCE.txt.
    ["jsm/utils/SkeletonUtils.js", "examples/jsm/utils/SkeletonUtils.js"],
    // GLTFExporter.js was already on disk (tools/krbn/riggedExport.js depends on it) but missing from this
    // self-heal list -- a latent gap a prior round found and closed rather than one it created.
    ["jsm/exporters/GLTFExporter.js", "examples/jsm/exporters/GLTFExporter.js"],
    // Backlog "fbx-ingest-has-no-loader" (tools/ship/nextRounds.mjs, commit 48488938): .fbx is a
    // first-class recognized model extension throughout the tree (ai-bridge/assetIngest.js's MODEL_EXTS,
    // assetLibraryBridge.js's _LOOSE_MESH) but nothing ever parsed one. FBXLoader.js pulls in fflate (zlib
    // inflate, for compressed-binary FBX) and NURBSCurve.js (which itself needs NURBSUtils.js) -- vendored
    // as a closed dependency set, not a partial copy.
    ["jsm/loaders/FBXLoader.js", "examples/jsm/loaders/FBXLoader.js"],
    ["jsm/libs/fflate.module.js", "examples/jsm/libs/fflate.module.js"],
    ["jsm/curves/NURBSCurve.js", "examples/jsm/curves/NURBSCurve.js"],
    ["jsm/curves/NURBSUtils.js", "examples/jsm/curves/NURBSUtils.js"],
    // KTX2/Basis closure (gpu/gltfKtx2.js): KTX2Loader.js + its own dependency closure, the same shape
    // FBXLoader's got above.
    ["jsm/loaders/KTX2Loader.js", "examples/jsm/loaders/KTX2Loader.js"],
    // A THIRD new internal dependency KTX2Loader.js grew between r160 and 0.185.1, same shape as
    // BufferGeometryUtils.js/SkeletonUtils.js above: `import { DisplayP3ColorSpace,
    // LinearDisplayP3ColorSpace } from '../math/ColorSpaces.js'`. r160's KTX2Loader.js had no such
    // import. Found by an exhaustive pass over every vendored file's own relative imports (not by
    // another gate failure this time -- see PROVENANCE.txt for how that pass was run).
    ["jsm/math/ColorSpaces.js", "examples/jsm/math/ColorSpaces.js"],
    ["jsm/libs/ktx-parse.module.js", "examples/jsm/libs/ktx-parse.module.js"],
    ["jsm/libs/zstddec.module.js", "examples/jsm/libs/zstddec.module.js"],
    ["jsm/libs/meshopt_decoder.module.js", "examples/jsm/libs/meshopt_decoder.module.js"],
    ["jsm/libs/basis/basis_transcoder.js", "examples/jsm/libs/basis/basis_transcoder.js"],
    ["jsm/libs/basis/basis_transcoder.wasm", "examples/jsm/libs/basis/basis_transcoder.wasm"],
    ["jsm/libs/basis/README.md", "examples/jsm/libs/basis/README.md"],
    ["jsm/utils/WorkerPool.js", "examples/jsm/utils/WorkerPool.js"],
    // NOTE: jsm/libs/meshoptGltf.js is NOT in this list on purpose -- it is this engine's own code
    // (wires EXT_meshopt_compression into GLTFLoader), not an upstream file; there is nothing to
    // re-fetch it FROM. jsm/utils/TextureUtils.js was dropped from vendor/three entirely at the
    // 0.185.1 re-vendor (zero real callers, confirmed both outside AND inside vendor/three, and
    // upstream no longer ships a matching file at this path at all -- see PROVENANCE.txt) and is
    // correspondingly not self-healed here. jsm/utils/BufferGeometryUtils.js, by contrast, IS still
    // self-healed (above) -- see that entry's own comment for why the original plan to drop it too
    // was wrong.
];
const SENTINEL = path.join(DIR, "three.module.js");
const CORE_SENTINEL = path.join(DIR, "three.core.js");

// "present" = the main build AND its required core split are on disk and look real (not
// truncated/error pages). three.module.js alone is no longer enough to load a page since the
// r160->0.185.1 split: without three.core.js every import of "three" throws at module-resolution time.
function present() {
    try {
        return fs.statSync(SENTINEL).size > 100000 && fs.statSync(CORE_SENTINEL).size > 500000;
    } catch { return false; }
}

function _run(cmd, args) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, _stdout, stderr) => {
            if (err) reject(new Error(cmd + " " + args.join(" ") + " failed: " + ((err && err.message) || err) +
                                       (stderr ? " -- " + String(stderr).slice(0, 300) : "")));
            else resolve();
        });
    });
}

let _running = false;
let _last = null;
function status() { return { present: present(), running: _running, rev: REV, last: _last }; }

// Fetch any missing files into vendor/three by downloading the npm tarball once and copying the
// needed files out of it. Returns once done (or on first error).
async function ensure(force) {
    if (!force && present()) return { ok: true, present: true };
    if (_running) return { ok: true, running: true };
    _running = true;
    let scratch = null;
    try {
        fs.mkdirSync(DIR, { recursive: true });

        // Which files actually need fetching -- same "already present and non-trivial size" skip
        // logic this file always used, just evaluated up front instead of per-file, since a single
        // tarball now serves every file rather than one request per file.
        const need = [];
        for (const pair of FILES) {
            const dest = path.join(DIR, pair[0]);
            if (!force) { try { if (fs.statSync(dest).size > 200) continue; } catch (e) {} }
            need.push(pair);
        }
        if (need.length === 0) { _last = { ok: true, fetched: 0, ts: Date.now() }; return _last; }

        scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ensure-three-"));
        const tgz = path.join(scratch, "three.tgz");
        await _run("curl", ["-fsSL", "--max-time", "180", "-o", tgz, TARBALL_URL]);
        const tgzSize = fs.statSync(tgz).size;
        if (tgzSize < 1000000) throw new Error("tarball suspiciously small (" + tgzSize + " bytes) -- " + TARBALL_URL);

        const extractDir = path.join(scratch, "extracted");
        fs.mkdirSync(extractDir, { recursive: true });
        await _run("tar", ["-xzf", tgz, "-C", extractDir]);

        let fetched = 0;
        for (const pair of need) {
            const src = path.join(extractDir, "package", pair[1]);
            const dest = path.join(DIR, pair[0]);
            const buf = fs.readFileSync(src); // throws if the tarball didn't contain this path
            if (buf.length < 200) throw new Error(pair[1] + " -> suspiciously small (" + buf.length + " bytes)");
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, buf);
            fetched++;
        }
        _last = { ok: true, fetched, ts: Date.now() };
        return _last;
    } catch (e) {
        _last = { ok: false, error: String((e && e.message) || e), ts: Date.now() };
        return _last;
    } finally {
        _running = false;
        if (scratch) { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) {} }
    }
}

module.exports = { ensure, present, status, DIR, REV };
