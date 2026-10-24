// WebGLEngine/tools/denoiseStudy.mjs -- the denoiser arc's study, from the command line
//
// Run:  node tools/denoiseStudy.mjs --harvest-fsr1  the shipped network at HALF resolution, upscaled by FSR1, against the frames it could be
//                                                  instead (section 81) -> render/denoise-results-fsr1.json
// Run:  node tools/denoiseStudy.mjs --harvest-halfres  round 29 (section 89): the same question at 256 x 256, traced at 128,
//                                                     EASU the candidate -> render/denoise-results-halfres.json
// Run:  node tools/denoiseStudy.mjs --harvest-temporalup  round 32 (section 95): round 30's chain over eight jittered frames,
//       accumulated at full size, against the same chain on the measured frame alone and full size at 1 sample a frame.
// Run:  node tools/denoiseStudy.mjs --harvest-emitter  round 30 (section 91): round 29's chain with the emitters taken out of the
//                                                     upscale and composited at full size -> render/denoise-results-emitter.json
//       node tools/denoiseStudy.mjs --harvest-mesh  the SHIPPED network and filter on the engine's own geometry, nothing trained (section 79)
//                                                  -> render/denoise-results-mesh.json
//       node tools/denoiseStudy.mjs --harvest-mesh-c  the same, the shapes in family C's materials and light (section 127)
//                                                  -> render/denoise-results-mesh-c.json
//       node tools/denoiseStudy.mjs --harvest-page  the same on path-tracer.html's own six scenes (section 131)
//                                                  -> render/denoise-results-page.json
//       node tools/denoiseStudy.mjs --harvest-framegen  FSR3's generator between two of round 32's chain frames (section 133)
//                                                  -> render/denoise-results-framegen.json
//       node tools/denoiseStudy.mjs --harvest-framegen-lf  the same between light-free frames, lit at the midpoint (section 136)
//                                                  -> render/denoise-results-framegen-lf.json
//       node tools/denoiseStudy.mjs --harvest-framegen-display  round 60's arms graded in display space, C1 of the candidate (section 139)
//                                                  -> render/denoise-results-framegen-display.json
//       node tools/denoiseStudy.mjs --harvest-framegen-large    round 61's arrangement on 24 new scenes, C1 at 22 (section 142)
//                                                  -> render/denoise-results-framegen-large.json
//       node tools/denoiseStudy.mjs --harvest-r47  round 11 with the network 16 channels wide, the 32-channel one beside it (section 116) -> render/denoise-results-r47.json
//       node tools/denoiseStudy.mjs --harvest-r11  one large network trained on families R and C together (section 32) -> render/denoise-results-r11.json
//       node tools/denoiseStudy.mjs --secondary-r11  round 11 again, for section 32's secondary the first run skipped (section 33)
//                                                    -> render/denoise-results-r11-secondary.json
//       node tools/denoiseStudy.mjs --harvest-r10  the large network trained on family C (section 30) -> render/denoise-results-r10.json
//       node tools/denoiseStudy.mjs --harvest-r9   the large network, trained longer, the sign-flip test (section 28) -> render/denoise-results-r9.json
//       node tools/denoiseStudy.mjs --harvest-r8   round 7 with C1 on the training images (section 26) -> render/denoise-results-r8.json
//       node tools/denoiseStudy.mjs --harvest-r7   the randomized round (section 23) -> render/denoise-results-r7.json
//       node tools/denoiseStudy.mjs --harvest-r6   the emitter-mask round (section 21) -> render/denoise-results-r6.json
//       node tools/denoiseStudy.mjs --harvest-r5   the third-family round (section 19) -> render/denoise-results-r5.json
//       node tools/denoiseStudy.mjs --harvest-r4   the temporal round (section 17) -> render/denoise-results-r4.json
//       node tools/denoiseStudy.mjs --harvest-r3   the kernel-predicting round (section 15) -> render/denoise-results-r3.json
//       node tools/denoiseStudy.mjs --harvest-r2   the re-run (pre-registration section 13) -> render/denoise-results-r2.json
//       node tools/denoiseStudy.mjs --harvest-r1   round 1 exactly as harvested at b023baa4 (section 12) -> render/denoise-results.json
//       node tools/denoiseStudy.mjs --mini         the same pipeline on a miniature of NON-dataset scenes
//
//       ... --harvest-rN --cache <dir>   keep every rendered scene, tuned filter and trained network in <dir>; the same
//                                        command again resumes where the last stopped (section 24). The directory is
//                                        stamped with the round, the commit and the working tree's diff of the code, and
//                                        refused by any other.
//       ... --harvest-rN --workers <n>   train up to n networks at once in worker threads -- bit for bit the same
//                                        networks (render/denoisePool.mjs); the count is recorded beside the results.
//
// The pipeline is render/denoiseStudy.mjs (gated by render/denoiseStudy-selfcheck.mjs); this file only runs it and
// writes the results. *** A HARVEST NEVER OVERWRITES ONE. *** Each results file is its run's own output, committed
// unedited; this refuses to start when the file it would write already exists.
//
// *** EVERY OPTION A ROUND NAMES REACHES THE STUDY. *** Until section 33 this file passed each option by name, and
// round 11's harvest ran without its secondary because compareTrainSplits was not among them. Now a round's options
// are passed whole, less the file it writes -- render/denoiseStudy.mjs's studyOptions, each command's round from its
// HARVESTS -- and render/denoiseStudy-selfcheck.mjs holds that for every round. This file exports nothing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { openCache, hashArrays } from "../render/denoiseCache.mjs";
import { runStudy, MINI, HARVESTS, studyOptions, runShippedStudy, ROUND_MESH, ROUND_MESH_C, ROUND_PAGE, SHIPPED_NET, runUpscaleStudy, ROUND_FSR1, ROUND_HALFRES, runEmitterAwareStudy, ROUND_EMITTER, runTemporalUpscaleStudy, ROUND_TEMPORALUP, runFrameGenStudy, ROUND_FRAMEGEN, ROUND_FRAMEGEN_LF, ROUND_FRAMEGEN_DISPLAY, ROUND_FRAMEGEN_LARGE } from "../render/denoiseStudy.mjs";
import { decodeNet } from "../render/denoiseDevice.mjs";
import crypto from "node:crypto";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");


if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const args = process.argv.slice(2);
    const flag = Object.keys(HARVESTS).find((f) => args.includes(f)), round = flag ? HARVESTS[flag] : null;
    if (args.includes("--mini")) {
        const out = runStudy({ ...MINI, c0: false, log: (m) => console.log("[denoiseStudy --mini] " + m) });
        console.log(JSON.stringify({ run: out.verdict.run, reasons: out.verdict.reasons, determinism: out.determinism }, null, 1));
    } else if (args.includes("--harvest-temporalup")) {
        // section 95, round 32: round 30's chain over eight jittered frames, accumulated at full size -- nothing trained, the
        // shipped network decoded as denoise.html decodes it, its sha-256 beside the results
        const file = path.join(ENG, ROUND_TEMPORALUP.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_TEMPORALUP.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_TEMPORALUP.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "fx/fsr", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runTemporalUpscaleStudy({ splits: ROUND_TEMPORALUP.splits, image: ROUND_TEMPORALUP.image, test: ROUND_TEMPORALUP.test, c2Prior: ROUND_TEMPORALUP.c2Prior,
                                              net: decodeNet(shipped.net), harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        out.commit = git("rev-parse", "--short=8", "HEAD").trim();
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_TEMPORALUP.results}`);
    } else if (args.includes("--harvest-emitter")) {
        // section 91, round 30: round 29's chain with the emitters filled out of the half-size frame and composited at full size
        // from the geometry -- nothing trained, the shipped network decoded as denoise.html decodes it, its sha-256 beside the results
        const file = path.join(ENG, ROUND_EMITTER.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_EMITTER.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_EMITTER.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "fx/fsr", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runEmitterAwareStudy({ splits: ROUND_EMITTER.splits, image: ROUND_EMITTER.image, test: ROUND_EMITTER.test, c2Prior: ROUND_EMITTER.c2Prior,
                                           net: decodeNet(shipped.net), harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_EMITTER.results}`);
    } else if (args.includes("--harvest-halfres")) {
        // section 89, round 29: round 26's chain at 256 x 256 with EASU the candidate -- nothing trained, the shipped network decoded
        // as denoise.html decodes it, its sha-256 beside the results
        const file = path.join(ENG, ROUND_HALFRES.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_HALFRES.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_HALFRES.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "fx/fsr", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runUpscaleStudy({ splits: ROUND_HALFRES.splits, image: ROUND_HALFRES.image, candidate: ROUND_HALFRES.candidate, test: ROUND_HALFRES.test,
                                      c2Prior: ROUND_HALFRES.c2Prior, net: decodeNet(shipped.net), harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_HALFRES.results}`);
    } else if (args.includes("--harvest-fsr1")) {
        // section 81: nothing trained -- the shipped network decoded as denoise.html decodes it, its sha-256 beside the results
        const file = path.join(ENG, ROUND_FSR1.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_FSR1.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_FSR1.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "fx/fsr", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runUpscaleStudy({ net: decodeNet(shipped.net), harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_FSR1.results}`);
    } else if (args.includes("--harvest-mesh")) {
        // section 79: nothing trained -- the shipped pair, decoded here exactly as denoise.html decodes it (decodeNet over
        // the file's `net`, the filter the file names), and the file's own sha-256 written beside the results
        const file = path.join(ENG, ROUND_MESH.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_MESH.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_MESH.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runShippedStudy({ net: decodeNet(shipped.net), filter: shipped.filter, harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_MESH.results}`);
    } else if (args.includes("--harvest-mesh-c")) {
        // section 127: section 79's round in family C's materials and light, nothing trained -- the shipped pair, decoded here exactly as denoise.html decodes it (decodeNet over
        // the file's `net`, the filter the file names), and the file's own sha-256 written beside the results
        const file = path.join(ENG, ROUND_MESH_C.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_MESH_C.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_MESH_C.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runShippedStudy({ splits: ROUND_MESH_C.splits, net: decodeNet(shipped.net), filter: shipped.filter, harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_MESH_C.results}`);
    } else if (args.includes("--harvest-page")) {
        // section 131: section 79's round on path-tracer.html's own six scenes, nothing trained -- the shipped pair, decoded here exactly as denoise.html decodes it (decodeNet over
        // the file's `net`, the filter the file names), and the file's own sha-256 written beside the results
        const file = path.join(ENG, ROUND_PAGE.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_PAGE.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_PAGE.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runShippedStudy({ splits: ROUND_PAGE.splits, c1Min: ROUND_PAGE.c1Min, net: decodeNet(shipped.net), filter: shipped.filter, harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_PAGE.results}`);
    } else if (args.includes("--harvest-framegen")) {
        // section 133, round 59: FSR3's generator between two of round 32's chain frames -- nothing trained, the shipped
        // network decoded as denoise.html decodes it, its sha-256 beside the results
        const file = path.join(ENG, ROUND_FRAMEGEN.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_FRAMEGEN.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_FRAMEGEN.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "fx/fsr", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runFrameGenStudy({ splits: ROUND_FRAMEGEN.splits, image: ROUND_FRAMEGEN.image, test: ROUND_FRAMEGEN.test, c2Prior: ROUND_FRAMEGEN.c2Prior,
                                              net: decodeNet(shipped.net), harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        out.commit = git("rev-parse", "--short=8", "HEAD").trim();
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_FRAMEGEN.results}`);
    } else if (args.includes("--harvest-framegen-lf")) {
        // section 136, round 60: the same generator between LIGHT-FREE frames, the lights put back at the midpoint -- nothing trained, the shipped
        // network decoded as denoise.html decodes it, its sha-256 beside the results
        const file = path.join(ENG, ROUND_FRAMEGEN_LF.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_FRAMEGEN_LF.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_FRAMEGEN_LF.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "fx/fsr", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runFrameGenStudy({ splits: ROUND_FRAMEGEN_LF.splits, image: ROUND_FRAMEGEN_LF.image, arrangement: ROUND_FRAMEGEN_LF.arrangement, test: ROUND_FRAMEGEN_LF.test, c2Prior: ROUND_FRAMEGEN_LF.c2Prior,
                                              net: decodeNet(shipped.net), harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        out.commit = git("rev-parse", "--short=8", "HEAD").trim();
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_FRAMEGEN_LF.results}`);
    } else if (args.includes("--harvest-framegen-display")) {
        // section 139, round 61: round 60's arrangement graded in display space, C1 of the candidate alone -- nothing trained, the shipped
        // network decoded as denoise.html decodes it, its sha-256 beside the results
        const file = path.join(ENG, ROUND_FRAMEGEN_DISPLAY.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_FRAMEGEN_DISPLAY.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_FRAMEGEN_DISPLAY.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "fx/fsr", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runFrameGenStudy({ splits: ROUND_FRAMEGEN_DISPLAY.splits, image: ROUND_FRAMEGEN_DISPLAY.image, arrangement: ROUND_FRAMEGEN_DISPLAY.arrangement, test: ROUND_FRAMEGEN_DISPLAY.test, c2Prior: ROUND_FRAMEGEN_DISPLAY.c2Prior,
                                              net: decodeNet(shipped.net), harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        out.commit = git("rev-parse", "--short=8", "HEAD").trim();
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_FRAMEGEN_DISPLAY.results}`);
    } else if (args.includes("--harvest-framegen-large")) {
        // section 142, round 62: round 61's arrangement on 24 new scenes, C1 at 22 of the candidate alone -- nothing trained, the shipped
        // network decoded as denoise.html decodes it, its sha-256 beside the results
        const file = path.join(ENG, ROUND_FRAMEGEN_LARGE.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${ROUND_FRAMEGEN_LARGE.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const bytes = fs.readFileSync(path.join(ENG, SHIPPED_NET)), shipped = JSON.parse(bytes.toString("utf8"));
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: ROUND_FRAMEGEN_LARGE.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "mesh", "fx/fsr", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const out = runFrameGenStudy({ splits: ROUND_FRAMEGEN_LARGE.splits, image: ROUND_FRAMEGEN_LARGE.image, arrangement: ROUND_FRAMEGEN_LARGE.arrangement, test: ROUND_FRAMEGEN_LARGE.test, c2Prior: ROUND_FRAMEGEN_LARGE.c2Prior, c1Min: ROUND_FRAMEGEN_LARGE.c1Min,
                                              net: decodeNet(shipped.net), harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        out.shipped = { file: SHIPPED_NET, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: shipped.source };
        out.commit = git("rev-parse", "--short=8", "HEAD").trim();
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] wrote ${ROUND_FRAMEGEN_LARGE.results}`);
    } else if (round) {
        const file = path.join(ENG, round.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${round.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: round.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const wAt = args.indexOf("--workers"), workers = wAt >= 0 ? Number(args[wAt + 1]) : 0;
        if (wAt >= 0 && !(Number.isInteger(workers) && workers >= 1)) { console.log("[denoiseStudy] --workers needs a whole number of at least 1"); process.exit(2); }
        const out = runStudy({ ...studyOptions(round), workers, harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        // disclosed beside the results: how much of this run was read back from an earlier, interrupted one
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        if (workers) out.workers = workers;
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        // section 33: the verdict is in the file, which is committed before it is read -- the log says only that it was written
        console.log(`[denoiseStudy] wrote ${round.results}`);
    } else {
        console.log("usage: node tools/denoiseStudy.mjs --mini | --harvest-temporalup | --harvest-emitter | --harvest-halfres | --harvest-fsr1 | --harvest-mesh | --harvest-mesh-c | --harvest-page | --harvest-framegen | --harvest-framegen-lf | --harvest-framegen-display | --harvest-framegen-large | --harvest-r47 | --secondary-r11 | --harvest-r11 | --harvest-r10 | --harvest-r9 | --harvest-r8 | --harvest-r7 | --harvest-r6 | --harvest-r5 | --harvest-r4 | --harvest-r3 | --harvest-r2 | --harvest-r1 [--cache <dir>] [--workers <n>]   (a harvest renders the pre-registered dataset; see render/learned-denoiser-preregistration.md)");
        process.exit(2);
    }
}
