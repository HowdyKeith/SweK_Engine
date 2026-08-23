// WebGLEngine/ai-bridge/sharpBridge.js -- v3948
//
// APPLE'S ml-sharp: ONE PHOTOGRAPH -> A 3D GAUSSIAN SPLAT, IN UNDER A SECOND.
//
// *** THE REASON THIS IS A SMALL BRIDGE AND NOT A PORT: THE CONSUMER SIDE ALREADY EXISTS AND IS FINISHED. ***
// engine/splatParser.js parses the INRIA .ply layout SHARP emits -- f_dc_0/1/2, opacity, scale_0..2, rot_0..3,
// skipping f_rest_* -- and its own header names that format by the repos that produce it. SplatRenderer.js draws
// it, splat_viewer.html and universal-viewer.html show it, and .ply already travels through the asset menu and
// the install panel. Everything downstream of "a .ply appears" has been working for six hundred versions. The
// only missing piece was a PRODUCER, and that is all this file is.
//
// *** THE LICENCE IS A CONSTRAINT ON THIS PROJECT, NOT A FOOTNOTE. *** apple/ml-sharp dual-licenses: code under
// LICENSE, and the trained WEIGHTS under LICENSE_MODEL, which grants use "exclusively for Research Purposes"
// and states that this "does not include any commercial exploitation, product development or use in any
// commercial product or service." Derivatives must stay research-limited and disclose their modifications;
// redistribution must carry the agreement along. THIS ENGINE PUBLISHES PUBLIC RELEASE ZIPS, so two rules fall
// straight out and are enforced below rather than remembered:
//
//   1. THE WEIGHTS ARE NEVER VENDORED. They live in torch's own cache (~/.cache/torch/hub/checkpoints), which
//      is outside the tree and therefore outside the release zip. Nothing here downloads them into the project.
//   2. THE OUTPUTS ARE NEVER WRITTEN WHERE THE PACKER WOULD SWEEP THEM UP. A .ply that _copyTree copies rides
//      into the next release, and a release zip is a REDISTRIBUTION. So the default destination is the asset
//      library -- which assetMigrate.js's own note says "the ship ritual EXCLUDES, so a fresh build ships none"
//      -- and a destination the packer WOULD copy is REFUSED, not silently redirected.
//      *** THAT TEST IS "WOULD THE PACKER COPY IT", NOT "IS IT INSIDE THE PROJECT", and the difference is not
//      pedantry: the first version of this file asked the cruder question and refused its own default, because
//      ai-bridge/asset_library is inside the tree AND skipped. wouldBePackaged() reads SKIP_DIRS from the packer.
//
// status() reports the licence terms every time rather than hiding them behind a link, because the person who
// needs to see "non-commercial" is whoever is about to press the button, not whoever read this header once.
//
// *** WHAT IS NOT VERIFIED HERE, STATED PLAINLY: NO PREDICTION HAS EVER RUN IN THIS SANDBOX. *** There is no
// PyTorch and no weights on the box this was written on, so everything below the CLI boundary is built against
// apple/ml-sharp's documented contract (`sharp predict -i <in> -o <out>`), not against an observed run. The gate
// drives the refusals, the path safety and the licence surface, which is all that can be honestly driven from
// here; ONE REAL RUN ON GALAXINA is what turns the rest from a contract into a fact.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const py = require("./pythonResolve.js");

const ENGINE_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(ENGINE_ROOT, "..");

// Recorded here so status() can state the terms without a network call, and so a gate can assert the engine
// has not quietly started treating research-only weights as shippable.
const LICENCE = {
    code: "apple/ml-sharp LICENSE",
    model: "apple/ml-sharp LICENSE_MODEL",
    research_only: true,
    commercial_use: false,
    summary: "The trained weights are licensed for Research Purposes only -- explicitly NOT commercial " +
             "exploitation, product development, or use in any commercial product or service. Derivatives must " +
             "stay research-limited and disclose their modifications. Weights are never bundled into a SweK " +
             "release; they are fetched by torch into its own cache on the machine that runs them.",
    url: "https://github.com/apple/ml-sharp",
};

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);

/**
 * Where a produced .ply may land. The asset library is chosen because it is ALREADY excluded from packaging for
 * a reason somebody else wrote down -- SKIP_DIRS holds "asset_library" and assetMigrate.js explains that
 * everything in one is user-accumulated. Resolved THROUGH assetLibraryBridge rather than rebuilt here, so this
 * file does not become a second opinion about where the library lives.
 */
function defaultOutDir() {
    try {
        const lib = require("./assetLibraryBridge.js");
        const s = typeof lib.status === "function" ? lib.status() : null;
        if (s && s.libDir) return path.join(s.libDir, "sharp-splats");
    } catch { /* the library is optional; fall through to a path that is still outside the tree */ }
    return path.join(os.homedir(), ".voxelbridge", "sharp-splats");
}

/**
 * *** WOULD A FILE HERE END UP IN A RELEASE ZIP? *** Which is NOT the same question as "is it inside the
 * project", and getting those two confused is a bug this file shipped for about ten minutes: the first version
 * asked the cruder one and therefore refused ai-bridge/asset_library -- its OWN default destination -- because
 * that path is inside the tree. It is also in SKIP_DIRS, so _copyTree never copies it, and the finished release
 * zip contains zero entries matching it. Measured, not assumed.
 *
 * So the rule is READ FROM THE PACKER rather than approximated here: inside the project AND no path segment
 * skipped. A second, cruder copy of a packaging rule is the same defect as a second copy of the exclude list --
 * it just fails in the opposite direction, refusing correct paths instead of shipping wrong ones.
 */
function wouldBePackaged(p) {
    const r = path.resolve(p);
    if (r !== PROJECT_ROOT && !r.startsWith(PROJECT_ROOT + path.sep)) return false;
    let skipDirs = null;
    try { skipDirs = require("./packagerBridge.js").SKIP_DIRS; } catch {}
    // No packer to ask means no way to prove the path is excluded, and the safe answer to an unanswerable
    // question about redistributing research-licensed output is "yes, it would be packaged".
    if (!skipDirs || typeof skipDirs.has !== "function") return true;
    const rel = path.relative(PROJECT_ROOT, r);
    return !rel.split(path.sep).some((seg) => skipDirs.has(seg));
}

function _run(cmd, args, opts) {
    return new Promise((res) => {
        let done = false;
        const child = execFile(cmd, args, Object.assign({ windowsHide: true, timeout: 300000, maxBuffer: 8 * 1024 * 1024 }, opts || {}),
            (err, stdout, stderr) => { if (done) return; done = true; res({ ok: !err, out: String(stdout || ""), err: String(stderr || "") + (err ? " " + ((err && err.message) || err) : "") }); });
        child.on("error", (e) => { if (done) return; done = true; res({ ok: false, out: "", err: String((e && e.message) || e) }); });
    });
}

/**
 * Is this box able to run a prediction, and if not, WHICH part is missing. Three independent facts reported on
 * their own evidence rather than collapsed into one "not available" -- the misattributed-skip failure
 * playwrightResolve.mjs was extracted to stop.
 */
async function status() {
    const cand = py.resolve();
    const python = py.label(cand);
    const pythonVersion = cand ? py.version(cand) : "";
    const out = {
        ok: true, licence: LICENCE, outDir: defaultOutDir(),
        python: cand ? python : "", pythonVersion,
        sharpInstalled: false, sharpVersion: "", weightsCached: false, weightsDir: "",
        ready: false, why: "",
    };
    if (!cand) { out.why = "no working Python found (tried: " + py.candidates().map(py.label).join(", ") + ")"; return out; }

    // `sharp` is the CLI the project documents. Asked for its help rather than a version flag, because the
    // documented surface is `sharp predict` and a --version that does not exist would read as "not installed".
    const probe = await _run(cand.cmd, [...cand.base, "-m", "sharp", "--help"], { timeout: 60000 });
    out.sharpInstalled = probe.ok || /predict/i.test(probe.out + probe.err);
    if (!out.sharpInstalled) {
        out.why = "ml-sharp is not installed for " + python + " -- see " + LICENCE.url +
                  " (install it into a venv; it pulls PyTorch, which is multi-GB and must not go in the engine tree)";
        return out;
    }
    const wd = path.join(os.homedir(), ".cache", "torch", "hub", "checkpoints");
    out.weightsDir = wd;
    try { out.weightsCached = fs.existsSync(wd) && fs.readdirSync(wd).some((f) => /sharp/i.test(f)); } catch {}
    out.ready = true;
    out.why = out.weightsCached ? "" : "weights are not cached yet -- the first prediction downloads them into " + wd +
              " (torch's own cache, deliberately outside this tree)";
    return out;
}

/**
 * One image in, one .ply out. Every refusal below happens BEFORE anything is spawned or written.
 */
async function predict({ image, outDir } = {}) {
    const img = String(image || "").trim();
    if (!img) return { ok: false, error: "no image given" };
    if (!fs.existsSync(img)) return { ok: false, error: "no such image: " + img };
    let st = null; try { st = fs.statSync(img); } catch {}
    if (!st || !st.isFile()) return { ok: false, error: "not a file: " + img };
    if (!IMAGE_EXT.has(path.extname(img).toLowerCase()))
        return { ok: false, error: "not an image this accepts (" + [...IMAGE_EXT].join(" ") + "): " + path.basename(img) };

    const dest = String(outDir || "").trim() || defaultOutDir();
    // *** THE PACKAGING REFUSAL, AND IT REFUSES RATHER THAN REDIRECTING. *** A .ply written into the project is
    // swept into the next release zip by _copyTree, and a release is a REDISTRIBUTION of research-only-licensed
    // model output. Quietly moving the caller's chosen path would hide that; saying no explains it once.
    if (wouldBePackaged(dest))
        return { ok: false, error: "refusing to write splats somewhere the packer would sweep into a release (" + dest + "): " +
                 "a release zip is a REDISTRIBUTION, and the ml-sharp weights that produced the file are " +
                 "research-licensed. Use the asset library (the default, which the packer skips) or any path " +
                 "outside " + PROJECT_ROOT };

    const s = await status();
    if (!s.ready) return { ok: false, error: s.why || "ml-sharp is not ready on this box", status: s };

    try { fs.mkdirSync(dest, { recursive: true }); } catch (e) { return { ok: false, error: "cannot create " + dest + ": " + ((e && e.message) || e) }; }

    // What is already there, so the new file is identified by APPEARING rather than by guessing SHARP's naming.
    const before = new Set();
    try { for (const f of fs.readdirSync(dest)) if (f.toLowerCase().endsWith(".ply")) before.add(f); } catch {}

    const cand = py.resolve();
    const t0 = Date.now();
    const r = await _run(cand.cmd, [...cand.base, "-m", "sharp", "predict", "-i", img, "-o", dest], { timeout: 600000 });
    const ms = Date.now() - t0;
    if (!r.ok) return { ok: false, error: "sharp predict failed: " + (r.err || "").trim().split("\n").slice(-3).join(" ").slice(0, 400), ms };

    let made = [];
    try { made = fs.readdirSync(dest).filter((f) => f.toLowerCase().endsWith(".ply") && !before.has(f)); } catch {}
    if (!made.length)
        return { ok: false, error: "sharp reported success but wrote no .ply into " + dest + " -- treating that as a failure rather than reporting a file that is not there", ms, out: r.out.slice(0, 400) };

    const ply = path.join(dest, made[0]);
    let bytes = 0; try { bytes = fs.statSync(ply).size; } catch {}
    return { ok: true, ply, name: made[0], bytes, mb: +(bytes / 1048576).toFixed(2), ms, image: img, outDir: dest,
             licence: LICENCE, alsoWrote: made.slice(1) };
}

module.exports = { status, predict, defaultOutDir, wouldBePackaged, LICENCE, PROJECT_ROOT };
