#!/usr/bin/env node
// tools/render-qa/render-qa.mjs — headless render QA for SweK pages.
//
// Boots each page in the manifest in a headless (GPU-accelerated where possible) Chromium, waits for the
// render to settle, screenshots the canvas, and runs the pixel invariants in checks.mjs — so a page can't
// silently ship a BLACK SCREEN or a broken render. This is the thing the sandbox can't do (no GPU/browser),
// so it runs on YOUR box: Galaxina (Windows + real GPU + Chrome) is ideal — hardware WebGL works headless
// there with no xvfb. Optionally diffs each screenshot against a saved baseline (pixelmatch) to catch
// regressions.
//
// USAGE (with the SweK bridge already running on :8787):
//   cd tools/render-qa && npm install         # pulls playwright + pngjs + pixelmatch, downloads Chromium
//   node render-qa.mjs                          # run all manifest pages against http://127.0.0.1:8787
//   node render-qa.mjs --base http://127.0.0.1:8787 --only showcase,webgpu-bench
//   node render-qa.mjs --update-baselines       # capture/refresh the baseline PNGs (REFUSES a failing page)
//   node render-qa.mjs --update-baselines --force-baselines   # ...and do it anyway, deliberately
//   node render-qa.mjs --headed                 # watch it (needed if headless WebGL misbehaves)
// Exit 0 = all pages passed. Exit 1 = at least one page failed a check or diffed over threshold.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, loadPrints, savePrints, shouldRun } from "./pageFingerprint.mjs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { runCheck, stats } from "./checks.mjs";
const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : true) : def; }
const BASE = (arg("--base", process.env.SWEK_BRIDGE || "http://127.0.0.1:8787")).replace(/\/+$/, "");
// v2598 -- Keith: "if we ran the test already, and it is still the same version of page, then we wouldnt have
// to re run the test, only do the ones that have never run / or are new." He is right: 239 pages at ~3.5s of
// settle each is fourteen minutes. --all forces everything, because A CACHE THAT CANNOT BE OVERRIDDEN IS A BUG
// THAT CANNOT BE FIXED.
const ALL = process.argv.includes("--all");
const ONLY = (arg("--only", "") || "").toString().split(",").map(s => s.trim()).filter(Boolean);
const UPDATE = !!arg("--update-baselines", false);
const FORCE_BASELINE = !!arg("--force-baselines", false);   // v2848 -- bake in a FAILING render, deliberately
const HEADED = !!arg("--headed", false);
const VIDEO = !!arg("--video", false);   // v2265 -- record each page to webm, convert to mp4 if ffmpeg is around

// Prefer the ffmpeg the engine already bundles (ffmpegStatic, macOS); else fall back to ffmpeg on PATH
// (Galaxina etc). If neither converts, the .webm is kept -- Playwright always produces that.
function ffmpegBin() {
  try { const fst = require("../../ai-bridge/ffmpegStatic.js"); const p = fst.binPath && fst.binPath(); if (p) return p; } catch {}
  return "ffmpeg";
}
function toMp4(webm, mp4) {
  try {
    const r = spawnSync(ffmpegBin(), ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: "ignore" });
    return r.status === 0 && fs.existsSync(mp4);
  } catch { return false; }
}
const OUT = path.join(__dirname, "out");
const BASE_DIR = path.join(__dirname, "baselines");
const DIFF_THRESHOLD = parseFloat(process.env.SWEK_QA_DIFF || "0.02"); // 2% of pixels may differ

// GPU-friendly flags. On Windows/desktop these get hardware WebGL; the swiftshader fallback keeps it working
// on a GPU-less box (slow but not black). WebGPU pages additionally need --enable-unsafe-webgpu.
const GPU_ARGS = [
  "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--enable-zero-copy",
  "--use-gl=angle", "--use-angle=default",
  "--enable-unsafe-webgpu", "--enable-features=Vulkan",
  // v3110 -- A SYNTHETIC CAMERA, so pages that need getUserMedia can be QA'd at all. Without these, headless
  // Chromium either prompts (and hangs) or denies, and face-mirror.html was simply absent from the manifest as a
  // result -- the page driving MediaPipe was the one page nothing checked. The fake device feeds a moving test
  // pattern, which is enough for "does it render and stay responsive" and is NOT enough for "does it track a
  // real face". The second question still belongs to a human at the rig, and the manifest says so.
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
];

async function loadManifest() {
  const p = path.join(__dirname, "manifest.json");
  const m = JSON.parse(fs.readFileSync(p, "utf8"));
  let pages = m.pages || [], defaults = m.defaults || {};
  // v2444 -- the manifest listed 25 pages; the engine has 212. Auto-discovery walks the folder and checks everything
  // that is not explicitly excluded, so a page can no longer avoid QA by nobody remembering it. Hand-tuned entries
  // always win over discovered ones, and every exclusion has to state a reason.
  if (m.auto !== false) {
    const { discover } = await import("./discover.mjs");
    const d = discover({ dir: path.join(__dirname, "..", ".."), manifest: m });
    pages = d.pages; defaults = d.defaults;
    console.log(`[render-qa] ${d.kept.length} tuned + ${d.added.length} discovered = ${pages.length} pages; ${d.skipped.length} excluded (each with a reason)` + (d.orphans.length ? `; ${d.orphans.length} STALE entries for pages that no longer exist: ${d.orphans.join(", ")}` : ""));
    for (const s of d.skipped) if (process.env.SWEK_QA_VERBOSE) console.log(`[render-qa]   skip ${s.file} -- ${s.reason}`);
  }
  if (ONLY.length) pages = pages.filter(pg => ONLY.some(o => pg.url.includes(o) || (pg.name || "").includes(o)));

  // v3171 -- A BOX THAT CANNOT JUDGE A PAGE SHOULD SAY SO, NOT FAIL IT.
  //
  // v3170 derived what each page REQUIRES (webgl2, webgpu, float_target, camera, bridge...) and stopped short
  // of using it, deliberately, because skipping is a BEHAVIOUR change. This is that change.
  //
  // *** v3120's LAW, MOVED UP A LEVEL. *** That round established that UNSUPPORTED and FAILED must stay apart:
  // one word for "this laptop has no float targets" and "this shader is broken" makes every limited machine
  // look defective. THE DISTINCTION LIVED INSIDE ONE PAGE. Now a box states what it HAS, and every page it
  // cannot judge is named with the capability it is missing -- BEFORE the browser opens it.
  //
  // OPT-IN, AND THAT IS NOT TIMIDITY. With no --have flag NOTHING IS SKIPPED and the runner behaves exactly as
  // it did, because A RUNNER THAT QUIETLY SKIPPED PAGES WOULD BE THE FAILURE renderQaDoor ALREADY NAMES: a
  // green run over fewer pages than you think is the failure that looks most like success. You must SAY what
  // the box has before it is allowed to excuse itself from anything.
  const HAVE = (arg("--have", "") || "").toString().split(",").map(s => s.trim()).filter(Boolean);
  let unjudgeable = [];
  if (HAVE.length) {
    const { manifestRequirements, judgeable } = await import("./pageRequirements.mjs");
    const rows = manifestRequirements(new URL("../../", import.meta.url).pathname);
    const byUrl = new Map(rows.map(r => [r.url, r]));
    const split = judgeable(pages.map(pg => byUrl.get(pg.url) || { name: pg.name, url: pg.url, ok: true, needs: [] }), HAVE);
    const cannot = new Set(split.cannot.map(r => r.url));
    unjudgeable = split.cannot;
    pages = pages.filter(pg => !cannot.has(pg.url));
    console.log(`[render-qa] box has: ${HAVE.join(", ")}`);
    // NAMED, NOT COUNTED. "17 skipped" tells you nothing; "water needs webgl2,float_target" tells you which
    // machine to move to.
    for (const r of unjudgeable) console.log(`[render-qa]   CANNOT JUDGE ${r.name} -- needs ${r.missing.join(", ")}`);
    if (!pages.length) {
      // A FILTER THAT MATCHES NOTHING EXITS NONZERO (v3126's renderQaDoor law): a green run over ZERO pages is
      // the failure that looks most like success, and a capability filter can produce exactly that.
      console.log("[render-qa] NO PAGES LEFT after capability filtering -- that is a configuration error, not a pass");
      process.exit(1);
    }
  }

  // v2857 -- SAY WHETHER THE ASSETS FOLDER IS SET, BEFORE A SINGLE PAGE LOADS.
  //
  // KEITH CAUGHT THE MISTAKE THAT MAKES THIS NECESSARY. A QA run showed ~20 pages failing on the same three
  // 404s (RobotExpressive.glb, RobotWoman.glb, test_rig.glb) and I concluded the models were missing from the
  // tree. THEY ARE NOT MISSING -- THEY ARE OUTSIDE IT ON PURPOSE. Since v978 the real models live in an EXTERNAL
  // assets directory (VOXEL_ASSETS_DIR, else ~/.voxelbridge/config.json assetsDir); the in-tree GPU_Assets/
  // subfolders hold nothing but README placeholders, so that a fresh clone does not expect the original author's
  // paths. With no external dir configured, /GPU_Assets/<model>.glb falls back in-tree and 404s -- once, for one
  // reason, on every page that shows an avatar.
  //
  // AND THE BANNER I JUST SUPPRESSED WAS THE DIAGNOSIS. ui/assetsFolder.js shows "Assets folder not set" for
  // exactly this state. It was on screen in every shot, saying why the 404s happened, and I read it as clutter.
  // Hiding it from the SCREENSHOT is right -- it inflates nonBlackFrac and uniqueColors, and a page that rendered
  // nothing could pass on the banner alone. Hiding the FACT is not. So the fact moves here, where a report reader
  // sees it before the failures it explains.
  let assetsNote = "";
  try {
    const cfg = await fetch(BASE + "/config/assets-dir", { cache: "no-store" }).then(r => r.json());
    if (cfg && cfg.ok !== false) {
      const src = cfg.source || "default";
      assetsNote = src === "default"
        ? "NOT SET (falling back to the in-tree GPU_Assets/, which holds only README placeholders)"
        : `${cfg.assetsDir || "?"} (source: ${src})`;
      if (src === "default") {
        console.log("[render-qa] ASSETS FOLDER " + assetsNote);
        console.log("[render-qa]   Expect 404s for GPU_Assets/*.glb on every avatar-bearing page -- ONE cause, not one bug per page.");
        console.log("[render-qa]   Point it at your models first: set VOXEL_ASSETS_DIR, or use Settings -> Assets, then re-run.");
      } else {
        console.log("[render-qa] assets folder: " + assetsNote);
      }
    }
  } catch { /* bridge not up yet; the per-page failures will say so far more loudly */ }
  return { defaults, pages };
}

function nameOf(pg) { return pg.name || pg.url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""); }

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(BASE_DIR, { recursive: true });

  let chromium, PNG, pixelmatch;
  try {
    ({ chromium } = await import("playwright"));
    ({ PNG } = await import("pngjs"));
    const pm = await import("pixelmatch"); pixelmatch = pm.default || pm;
  } catch (e) {
    console.error("[render-qa] missing deps — run `npm install` in tools/render-qa/ first. (" + e.message + ")");
    process.exit(2);
  }

  const { defaults, pages } = await loadManifest();
  if (!pages.length) { console.error("[render-qa] no pages matched."); process.exit(2); }

  const browser = await chromium.launch({ headless: !HEADED, args: GPU_ARGS });
  const results = [];
  let qaIndex = 0;
  const PRINTS = path.join(OUT, "fingerprints.json");
  const prevPrints = loadPrints(PRINTS);
  const nowPrints = {};
  let skipped = 0;
  for (const pg of pages) {
    qaIndex++;
    // ---- THE SKIP, AND WHY THE KEY IS THE CLOSURE AND NOT THE PAGE -------------------------------------------
    //
    // A PAGE HASH IS A LIE. Measured before writing this: touch blobPhantom.js and blob-selfie.html's own bytes
    // DO NOT MOVE ONE BIT. And that is EXACTLY the bug Keith's rig found -- paramecium.html NEVER CHANGED;
    // brain/bench/bandit.mjs was what broke it. NAIVE PAGE-HASH CACHING WOULD HAVE SKIPPED paramecium.html
    // FOREVER AND NEVER FOUND IT: THE CACHE WOULD HAVE BEEN FASTEST AT EXACTLY THE MOMENT IT WAS MOST WRONG.
    const entry = path.join(__dirname, "..", "..", pg.file || (pg.name + ".html"));
    const rootDir = path.join(__dirname, "..", "..");
    let print = null;
    try { print = fs.existsSync(entry) ? fingerprint(entry, rootDir) : null; } catch { print = null; }
    if (print && !ALL) {
      const d = shouldRun(pg.name, print, prevPrints);
      if (!d.run) {
        const was = prevPrints.prints[pg.name];
        results.push(was.rec ? { ...was.rec, skipped: true } : { name: pg.name, url: "", ok: true, checks: [], errors: [], skipped: true });
        nowPrints[pg.name] = was;
        skipped++;
        console.log(`[render-qa] SKIP ${pg.name} — ${d.why} (${print.files} files in its closure)`);
        continue;
      }
    }
    // v2466 -- Keith asked for this while watching a 200-page sweep with no idea how far in it was. Printed BEFORE
    // the page runs, not after, so a page that HANGS is named on screen instead of leaving a silent terminal.
    const name = nameOf(pg);
    const qaTag = `${String(qaIndex).padStart(String(pages.length).length)}/${pages.length}`;
    process.stdout.write(`[render-qa] ${qaTag}  ${name} ... `);
    const url = BASE + pg.url;
    const wait = pg.wait ?? defaults.wait ?? 3500;
    const vw = pg.width ?? defaults.width ?? 1280, vh = pg.height ?? defaults.height ?? 800;
    const rec = { name, url, ok: true, checks: [], errors: [], diff: null };
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, ...(VIDEO ? { recordVideo: { dir: OUT, size: { width: vw, height: vh } } } : {}) });
    // v2857 -- KILL THE FIRST-RUN BANNER BEFORE IT CAN BE PHOTOGRAPHED. Keith spotted it during a QA review:
    // ui/assetsFolder.js shows a "Assets folder not set" prompt whose ONLY suppressor is
    // localStorage["swek.assetsFolderPrompt"] === "done". A fresh Playwright context has empty localStorage, so
    // the banner appeared on EVERY page of EVERY run, in EVERY screenshot.
    //
    // THAT IS NOT COSMETIC, AND THE DANGEROUS DIRECTION IS THE PASSES, NOT THE FAILURES. The banner is
    // position:fixed, ~560px wide, bright-bordered, z-index 99998 -- it paints real non-black pixels and real
    // unique colours into the shot. Most pages here are graded on nonBlackFrac >= 0.01 and a uniqueColors floor.
    // A page that rendered NOTHING could clear both on the strength of the banner alone. Every thin pass in this
    // report (shipavatar 0.0252, benchmark 0.0365, spectator 0.0509) was measured with that thing in frame.
    //
    // Fixed HARNESS-SIDE, not by adding a ?param to the shipping pages: addInitScript runs before any page script,
    // so the banner never mounts, no shipping code changes, and there is no new production code path that could
    // itself break. The pixel thresholds now measure the PAGE.
    await ctx.addInitScript(() => {
        try { localStorage.setItem("swek.assetsFolderPrompt", "done"); } catch {}
    });
    const page = await ctx.newPage();
    const video = VIDEO ? page.video() : null;
    const consoleErrors = [];
    // v2242 — a bare "Failed to load resource: 404" (no URL) is useless. Capture the URL from the
    // network events instead, and treat the brain/peer connection-refused (those services aren't up
    // under headless QA) plus any per-page ignoreConsole patterns as benign so they don't fail the gate.
    const BENIGN = [/ERR_CONNECTION_REFUSED/, /ERR_CONNECTION_TIMED_OUT/, /ERR_NAME_NOT_RESOLVED/, /ERR_ADDRESS_UNREACHABLE/, /ERR_CONNECTION_RESET/,
      // v2857 -- MISSING OPTIONAL CONTENT IS NOT A CODE DEFECT, AND CONFLATING THE TWO COST A WHOLE REPORT.
      //
      // One run showed 30 failures. TWENTY of them were the same three 404s -- GPU_Assets/RobotExpressive.glb,
      // RobotWoman.glb, test_rig.glb -- on pages that had otherwise rendered perfectly and passed every pixel
      // check. That is one cause wearing twenty costumes, and it buried the ONE page that had actually broken
      // (indexPlus, rendering pure black). A gate that fires twenty times to say one thing gets ignored, which is
      // the lesson the browser-safety regex and the 169-file graveyard detector each taught once already.
      //
      // THE DISTINCTION THAT MATTERS: missing CODE (.js/.mjs/.wasm) means the page is broken -- that still fails.
      // Missing CONTENT (a model, a decorative photo) means the page is running fine against an asset library
      // this machine does not have. Models live OUTSIDE the tree on purpose (v978: the external assets dir), so
      // absent .glb is the NORMAL state of a fresh clone, not a regression. Keith's dedication.jpg on lineage is
      // the same shape: an optional picture he may or may not drop in.
      //
      // Scoped deliberately: a 404 on a .js is still a failure, and the assets-folder state is REPORTED at the
      // top of every run so "no models configured" is visible as a fact rather than hidden as an excuse.
      /404 .*\.(glb|gltf|fbx|hdr|exr)(\?|$)/i,
      /404 .*\/(dedication|latest)\.(jpg|jpeg|png|webp)(\?|$)/i,
    ];
    const pageIgnore = (pg.ignoreConsole || []).map((s) => new RegExp(s));
    const isBenign = (t) => BENIGN.some((re) => re.test(t)) || pageIgnore.some((re) => re.test(t));
    page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (/Failed to load resource/i.test(t)) return; consoleErrors.push(t.slice(0, 200)); } });
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e.message).slice(0, 200)));
    page.on("requestfailed", (r) => { const f = r.failure(); consoleErrors.push(((f && f.errorText) || "requestfailed") + " " + String(r.url()).slice(0, 160)); });
    page.on("response", (r) => { const s = r.status(); if (s >= 400) consoleErrors.push(s + " " + String(r.url()).slice(0, 160)); });
    let probeResult = null, probeError = null, shotFallback = null;
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
      // wait for a canvas to exist + have non-zero size, then a settle delay for the first frames
      await page.waitForFunction(() => { const c = document.querySelector("canvas"); return c && c.width > 0 && c.height > 0; }, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(wait);

      // v2837 -- STRESS, then PROBE. Both optional; a page without them behaves exactly as before.
      //
      // WHY: getting wasmGenStats out of the engine used to be a nine-step manual ritual ending in a clipboard
      // paste -- build, launch, open DevTools, fly around for two or three minutes, teleport once to stress the
      // worker, then type a copy(JSON.stringify(...)) incantation. Every one of those steps is something the
      // harness already does or can do, and the numbers belong in the same report as everything else rather
      // than in somebody's clipboard.
      //
      // The one part that genuinely needed a human was the FLYING -- a worker only shows its behaviour under
      // load. A scripted camera path substitutes for most of it: sweep, then teleport, which is exactly the
      // "fly fast at least once" the manual recipe asked for. What it CANNOT replace is the feel, and the feel
      // was always half the decision, so the report says so rather than pretending the number is the whole
      // answer.
      if (pg.stress) {
        const st = { seconds: 8, radius: 400, teleports: 2, ...(typeof pg.stress === "object" ? pg.stress : {}) };
        await page.evaluate(async (cfg) => {
          const cam = window.camera;
          if (!cam || !cam.position) return;
          if (window.streamer && window.streamer.setEnabled) window.streamer.setEnabled(true);
          const t0 = performance.now(), end = t0 + cfg.seconds * 1000;
          let tp = 0;
          while (performance.now() < end) {
            const u = (performance.now() - t0) / (cfg.seconds * 1000);
            // a sweep the streamer has to keep up with...
            cam.position.x = Math.cos(u * Math.PI * 2) * cfg.radius;
            cam.position.z = Math.sin(u * Math.PI * 2) * cfg.radius;
            // ...and a hard teleport, which is the case that actually breaks a worker: every chunk at once
            if (tp < cfg.teleports && u > (tp + 1) / (cfg.teleports + 1)) {
              cam.position.x += cfg.radius * 4; cam.position.z -= cfg.radius * 3; tp++;
            }
            await new Promise((r) => requestAnimationFrame(r));
          }
        }, st).catch(() => {});
        await page.waitForTimeout(1200);            // let the last generations land before reading
      }

      // PROBE: run an expression in the page and keep whatever it returns. The result is DATA in the report,
      // never a pass/fail -- a number nobody has a threshold for yet should still be collected.
      // v3110 -- a probe may be written inline OR referenced as "@name" from probes.mjs. Named is preferred:
      // an inline probe duplicated across manifest entries is the duplicated-table bug in a JSON file, and this
      // tree has found that shape often enough to not invite it.
      if (pg.probe) {
        if (typeof pg.probe === "string" && pg.probe.startsWith("@")) {
          const { PROBES } = await import("./probes.mjs");
          const named = PROBES[pg.probe.slice(1)];
          if (!named) { probeError = `unknown named probe ${pg.probe} -- probes.mjs exports: ${Object.keys(PROBES).join(", ")}`; pg = { ...pg, probe: null }; }
          else pg = { ...pg, probe: named };
        }
      }
      if (pg.probe) {
        try {
          probeResult = await page.evaluate(`(() => { try { return ${pg.probe}; } catch (e) { return { __probeError: String(e && e.message || e) }; } })()`);
          if (probeResult && probeResult.__probeError) { probeError = probeResult.__probeError; probeResult = null; }
        } catch (e) { probeError = String((e && e.message) || e).slice(0, 200); }
      }

      // screenshot: the largest canvas if present, else the viewport
      const target = pg.canvas === "viewport" ? null : await page.$("canvas");
      // v2839 -- AN INVISIBLE TARGET FALLS BACK TO THE VIEWPORT INSTEAD OF TIMING OUT. Playwright waits for
      // an element to be stable and visible before it will screenshot it, and a canvas that is never shown
      // simply never arrives: face.html spent the whole 30-second budget retrying scroll-into-view and
      // returned no image, so the page could not even be judged. A picture of the page is worth more than
      // a perfect picture of nothing, and the fallback is RECORDED so it cannot be mistaken for normal.
      let buf, shotFallback = null;
      if (target) {
        try { buf = await target.screenshot({ type: "png", timeout: 8000 }); }
        catch (e) { shotFallback = "canvas not visible (" + String((e && e.message) || e).split("\n")[0].slice(0, 80) + ") -- shot the viewport instead"; buf = await page.screenshot({ type: "png" }); }
      } else buf = await page.screenshot({ type: "png" });
      const png = PNG.sync.read(buf);
      const img = { data: png.data, width: png.width, height: png.height };
      fs.writeFileSync(path.join(OUT, name + ".png"), buf);

      // console-error gate (opt-in per page). Benign network failures + per-page ignores don't count;
      // everything else fails the gate and now carries the URL, so a 404 is fixable at a glance.
      if (pg.noConsoleErrors) {
        const real = consoleErrors.filter((t) => !isBenign(t));
        const ok = real.length === 0;
        rec.checks.push({ type: "noConsoleErrors", ok, msg: real.slice(0, 3).join(" | ") || (consoleErrors.length ? "clean (benign only)" : "clean") });
        if (!ok) rec.ok = false;
      }
      rec.errors = consoleErrors.slice(0, 6);

      // pixel invariants from the manifest
      for (const desc of (pg.checks || [])) {
        const r = runCheck(img, desc);
        rec.checks.push({ type: desc.type, ok: r.ok, msg: r.msg });
        if (!r.ok) rec.ok = false;
      }
      const s = stats(img);
      rec.stats = { nonBlackFrac: +s.nonBlackFrac.toFixed(4), meanLum: +s.meanLum.toFixed(1), uniqueColors: s.uniqueColors };

      // baseline diff
      const baseFile = path.join(BASE_DIR, name + ".png");
      if (UPDATE) {
        // v2848 -- A COMMITMENT BOUNDARY, AND THE CHECK NOW RUNS AT IT.
        //
        // Writing a baseline is the one operation in this harness that CANNOT BE UNDONE BY RUNNING IT AGAIN.
        // Every other mistake here is transient: a bad run is re-run, a flaky page is re-shot. But a baseline
        // captured from a BROKEN render becomes the reference that every future run is compared against -- so
        // the broken state passes, forever, silently. It does not merely miss a fault; IT DESTROYS THE ABILITY
        // TO DETECT THAT FAULT.
        //
        // The page's own checks already ran twenty lines above. Nothing consulted them. So the expensive
        // question -- "is this render actually good?" -- was being asked AFTER failures instead of BEFORE the
        // irreversible act. Now it is asked here, which is the only place it pays for itself.
        //
        // --force-baselines exists because sometimes a page legitimately fails a check you are about to change,
        // and refusing forever would be its own trap. But it has to be TYPED, so baking in a broken reference
        // is a decision somebody made rather than something that happened.
        const failed = rec.checks.filter((c) => !c.ok);
        if (failed.length && !FORCE_BASELINE) {
          rec.diff = "baseline-REFUSED";
          rec.baselineRefused = failed.map((c) => c.type).join(",");
          console.log(`[render-qa] ${name}: BASELINE REFUSED -- ${rec.baselineRefused} failing. A baseline taken from a broken render would make that break permanent and invisible. Fix it, or pass --force-baselines.`);
        } else {
          fs.writeFileSync(baseFile, buf);
          rec.diff = failed.length ? "baseline-updated-FORCED" : "baseline-updated";
          if (failed.length) console.log(`[render-qa] ${name}: baseline FORCED over ${failed.length} failing check(s) -- recorded as such.`);
        }
      }
      else if (fs.existsSync(baseFile)) {
        const basePng = PNG.sync.read(fs.readFileSync(baseFile));
        if (basePng.width === png.width && basePng.height === png.height) {
          const diff = new PNG({ width: png.width, height: png.height });
          const nDiff = pixelmatch(basePng.data, png.data, diff.data, png.width, png.height, { threshold: 0.1 });
          const frac = nDiff / (png.width * png.height);
          // v3339 -- PERCEPTUAL SIGNALS BESIDE THE PIXEL COUNT, BECAUSE THE PIXEL COUNT IS WHY amplifiedDiff EXISTS.
          // A browser screenshot differs by a fraction of a percent for reasons that are not regressions:
          // antialiasing, font hinting, a driver revision, compositor timing. pixelmatch cannot tell those from a
          // real change, which is exactly the problem amplifiedDiff was built to make VISIBLE rather than to solve.
          // SSIM, pHash and silhouette IoU are the standard answer: a one-pixel shift moves SSIM by 0.04 and pHash
          // by 4 bits of 63 while the pixel count calls it 1.5% changed.
          //
          // THEY ARE RECORDED, NOT YET GATING. There is no measured floor for browser screenshots in this tree --
          // only for the headless rasteriser, where it is exactly zero because Jolt is deterministic and a browser
          // is not. Gating on a number nobody has measured is the failure this whole line of work exists to avoid,
          // so these run, get written into the record, and a later round earns thresholds from what they report.
          let perceptual = null;
          try {
            const pm = await import("../../render/perceptual.mjs");
            const sm = await import("../../render/silhouette.mjs");
            const A = { data: basePng.data, width: basePng.width, height: basePng.height };
            const B = { data: png.data, width: png.width, height: png.height };
            perceptual = {
              ssim: +pm.ssim(A, B).toFixed(6),
              phashBits: pm.hamming(pm.pHash(A), pm.pHash(B)),
              edgeOverlap: +pm.edgeOverlap(A, B).toFixed(6),
              silhouetteIoU: +sm.iou(A, B).iou.toFixed(6),
              scaleDelta: +sm.scaleDelta(A, B).toFixed(6),
              gating: false,
              why: "recorded only -- no measured floor for browser screenshots yet; see render/perceptual-selfcheck.mjs",
            };
          } catch (e) { perceptual = { error: String((e && e.message) || e).slice(0, 90) }; }
          rec.diff = { changedFrac: +frac.toFixed(4), threshold: DIFF_THRESHOLD, perceptual };
          if (frac > DIFF_THRESHOLD) { rec.ok = false; fs.writeFileSync(path.join(OUT, name + ".diff.png"), PNG.sync.write(diff)); }
        } else rec.diff = "size-changed (baseline stale)";
      } else {
        // v3339 -- "no baseline" USED TO MEAN "NOTHING CAN BE SAID". It can now say one thing: the page's own
        // structural fingerprint, which needs no stored PNG. Two runs of the same page should produce the same
        // pHash even with no baseline to diff against, so a page that is wildly non-deterministic between runs is
        // visible before anyone decides to freeze a baseline from it -- which is the one operation in this
        // harness that cannot be undone by running it again.
        let fingerprint = null;
        try {
          const pm = await import("../../render/perceptual.mjs");
          fingerprint = pm.pHash({ data: png.data, width: png.width, height: png.height }).toString(16);
        } catch { /* absence is reported below, not guessed at */ }
        rec.diff = fingerprint ? { state: "no-baseline", phash: fingerprint,
          why: "no stored PNG to diff against, but the structural fingerprint is recorded: two runs that disagree here are non-deterministic BEFORE anyone freezes a baseline from one of them" }
          : "no-baseline";
      }
    } catch (e) {
      rec.ok = false; rec.errors.push("harness: " + e.message);
    } finally { await ctx.close(); }
    if (video) {
      try {
        const raw = await video.path();
        const webm = path.join(OUT, name + ".webm");
        try { fs.renameSync(raw, webm); } catch { fs.copyFileSync(raw, webm); try { fs.unlinkSync(raw); } catch {} }
        rec.video = name + ".webm";
        const mp4 = path.join(OUT, name + ".mp4");
        if (toMp4(webm, mp4)) rec.video = name + ".mp4";
        console.log(`[render-qa] video ${name} -> ${rec.video}`);
      } catch (e) { rec.errors.push("video: " + (e && e.message)); }
    }
    // v2866 -- AN ASSERT IS A VERDICT, AND IT IS A SEPARATE THING FROM A PROBE ON PURPOSE.
    //
    // The probe below is deliberately DATA and must stay that way. But eleven open claims settle by "Keith loads
    // the page and looks", and several of those have a fact the PAGE can state about itself -- which mesher
    // actually ran, whether a flag took effect. Those do not need eyes, they need someone to ask. So `assert` is
    // an opt-in, per-page expression that MUST come back truthy, and it DOES flip the verdict.
    //
    // THREE RULES, each because the alternative fails quietly:
    //   1. AN ASSERT THAT THROWS IS A FAILURE, NOT A SKIP. A probe tolerates a moved hook because it is
    //      exploratory; an assert that silently stopped running would be a check not in the gate, which is the
    //      oldest lesson here. A renamed hook must break the run loudly.
    //   2. EVERY ASSERT NAMES THE CLAIM IT SETTLES. An assertion that cannot say what it is for is just a test,
    //      and the whole point is moving a specific claim from open to settled on evidence.
    //   3. ABSENT `assert` MEANS BEHAVIOUR IS EXACTLY AS BEFORE. No page is newly failable by adding this.
    if (pg.assert) {
      const a = pg.assert;
      let val = null, aerr = null;
      try {
        val = await page.evaluate(`(() => { try { return { v: !!(${a.expr}), raw: JSON.stringify((${a.expr})) }; } catch (e) { return { __err: String(e && e.message || e) }; } })()`);
      } catch (e) { aerr = String((e && e.message) || e).slice(0, 200); }
      if (aerr || !val || val.__err) {
        rec.checks.push({ type: "assert", ok: false, msg: "assert THREW (" + (aerr || val.__err) + ") -- claim: " + (a.claim || "?") });
        rec.ok = false;
      } else {
        const passed = !!val.v;
        rec.checks.push({
          type: "assert", ok: passed,
          msg: (passed ? "holds" : "FAILED") + ": " + (a.claim || "?") + (a.why ? "  -- " + a.why : "") + (val.raw ? "  [" + String(val.raw).slice(0, 80) + "]" : ""),
        });
        if (!passed) rec.ok = false;
      }
      rec.assertClaim = a.claim || null;
    }

    // A probe is DATA, not a verdict: it never flips rec.ok. A number nobody has a threshold for yet is still
    // worth collecting, and a page that renders correctly should not fail because a debug hook moved.
    if (typeof probeResult !== "undefined" && probeResult !== null) {
      rec.probe = probeResult;
      console.log(`[render-qa] probe ${name}: ` + JSON.stringify(probeResult).slice(0, 400));
    }
    if (typeof probeError !== "undefined" && probeError) rec.probeError = probeError;
    if (typeof shotFallback !== "undefined" && shotFallback) { rec.shotFallback = shotFallback; console.log("[render-qa] " + name + ": " + shotFallback); }
    console.log(`${rec.ok ? "PASS" : "FAIL"}  ${rec.checks.filter(c => !c.ok).map(c => c.type).join(",") || ""}`);
    results.push(rec);
  }
  await browser.close();

  // remember what we just proved so the next run can skip it -- fingerprint and verdict only.
  for (const r of results) {
    if (nowPrints[r.name]) continue;
    const pg = pages.find(p => p.name === r.name) || {};
    const e = path.join(__dirname, "..", "..", pg.file || (r.name + ".html"));
    try {
      if (fs.existsSync(e)) nowPrints[r.name] = { hash: fingerprint(e, path.join(__dirname, "..", "..")).hash, ok: !!r.ok, when: new Date().toISOString().slice(0, 16), rec: r };
    } catch { /* unhashable -- it will simply re-run, which is the safe direction */ }
  }
  savePrints(PRINTS, nowPrints);
  if (skipped) console.log(`[render-qa] ${skipped} page(s) skipped — unchanged since their last PASS. --all forces everything.`);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, when: new Date().toISOString(), results }, null, 2));
  writeHtmlReport(results);
  const failed = results.filter(r => !r.ok);
  console.log(`\n[render-qa] ${results.length - failed.length}/${results.length} pages passed. Report: tools/render-qa/out/report.html`);
  process.exit(failed.length ? 1 : 0);
}

function writeHtmlReport(results) {
  // ---- TWO TABS, AND ONE OF THEM IS A CLIPBOARD -----------------------------------------------------------------
  //
  // Keith: "we could update the Render QA so it separates the Non working on the result report tab, and then
  // another tab with the successful 0 error ones, so i could just copy the result report back to you."
  //
  // The old report was ONE FLAT WALL of cards, PASS and FAIL interleaved, 239 of them, each with a screenshot.
  // To send me the failures he would have had to hand-pick them out of the noise, and A REPORT YOU HAVE TO
  // HAND-EDIT BEFORE SENDING IS A REPORT THAT DOES NOT GET SENT.
  //
  // So: failures first (that is the tab that opens), clean ones behind a second tab, and a COPY button that
  // emits PLAIN TEXT containing ONLY what is diagnostic -- the page, the failed checks, and the console errors.
  // NOT the passing checks. NOT the screenshots. NOT the stats of pages that are fine.
  //
  // The console errors are the point: `bandit.mjs:208 Uncaught ReferenceError: process is not defined` came out
  // of exactly this field on Keith's rig, and it was a REAL BUG IN THREE FILES (v2594).
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const failed = results.filter(r => !r.ok);
  const passed = results.filter(r => r.ok);

  const card = (r) => {
    const shot = r.name + ".png";
    const checks = r.checks.map(c => `<div class="${c.ok ? "ok" : "bad"}">${c.ok ? "PASS" : "FAIL"} ${esc(c.msg)}</div>`).join("");
    const diff = typeof r.diff === "object" && r.diff ? `changed ${(r.diff.changedFrac * 100).toFixed(2)}%` : "-";
    return `<div class="card ${r.ok ? "pass" : "failc"}"><h3>${r.ok ? "PASS" : "FAIL"} &mdash; ${esc(r.name)}</h3>
      <img src="${shot}" width="360" loading="lazy"><div class="meta">
      <div>${esc(r.url)}</div><div>stats: ${esc(JSON.stringify(r.stats || {}))}</div><div>diff: ${diff}</div>
      ${checks}${r.errors.length ? `<div class="bad">console: ${esc(r.errors.join(" | "))}</div>` : ""}</div></div>`;
  };

  // THE COPYABLE REPORT. Plain text, failures only, and ONLY the diagnostic fields.
  const plain = failed.length === 0
    ? `SweK render QA — ${passed.length}/${results.length} pages, ZERO FAILURES.`
    : [
        `SweK render QA — ${failed.length} of ${results.length} pages need work`,
        `base ${BASE} — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        "",
        ...failed.map(r => {
          const bad = r.checks.filter(c => !c.ok).map(c => "    check: " + c.msg);
          const errs = (r.errors || []).map(e => "    console: " + e);
          // stats only when they exist -- a black page's nonBlackFrac is the whole story
          const st = r.stats ? "    stats: " + JSON.stringify(r.stats) : null;
          return [`FAIL  ${r.name}`, ...bad, ...errs, st].filter(Boolean).join("\n");
        }),
      ].join("\n");

  const html = `<!doctype html><meta charset=utf-8><title>SweK render QA</title><style>
    body{background:#0b0f0d;color:#cfe6d8;font:13px ui-monospace,monospace;margin:16px}
    .card{display:inline-block;vertical-align:top;width:380px;margin:8px;padding:10px;border:1px solid #24382c;border-radius:6px}
    .pass{border-color:#2a5a3a}.failc{border-color:#6a2a2a}img{border:1px solid #24382c;border-radius:4px;background:#000}
    .ok{color:#7fe0a0}.bad{color:#f6a}h3{margin:0 0 6px}.meta div{margin:2px 0}
    .tabs{margin:10px 0}.tab{background:#16211b;color:#cfe6d8;border:1px solid #2c4436;border-radius:14px;
      padding:5px 14px;font:inherit;cursor:pointer;margin-right:6px}
    .tab.on{background:#2c4436;color:#fff}
    #plain{width:100%;height:260px;background:#050a07;color:#cfe6d8;border:1px solid #2c4436;border-radius:5px;
      font:12px ui-monospace,monospace;padding:8px;display:none}
    #copy{background:#2c4436;color:#fff;border:0;border-radius:14px;padding:5px 14px;font:inherit;cursor:pointer}
    .hint{opacity:.65;font-size:12px;margin:6px 0}
  </style>
  <h1>SweK render QA &mdash; ${passed.length}/${results.length} passed</h1>
  <div class="tabs">
    <button class="tab on" id="tNeeds">needs work (${failed.length})</button>
    <button class="tab" id="tClean">clean (${passed.length})</button>
    <button class="tab" id="tCopy">copyable report</button>
  </div>
  <div id="needs">${failed.length ? failed.map(card).join("") : '<p class="ok">Nothing failed. Every page rendered.</p>'}</div>
  <div id="clean" style="display:none">${passed.map(card).join("")}</div>
  <div id="copyPane" style="display:none">
    <div class="hint">Failures only &mdash; the failed checks and the console errors, no screenshots and no passing noise. Select all, copy, paste it back.</div>
    <button id="copy">copy to clipboard</button> <span id="copied" class="ok"></span>
    <textarea id="plain" readonly>${esc(plain)}</textarea>
  </div>
  <script>
    var panes = { tNeeds: "needs", tClean: "clean", tCopy: "copyPane" };
    Object.keys(panes).forEach(function (id) {
      document.getElementById(id).addEventListener("click", function () {
        Object.keys(panes).forEach(function (k) {
          document.getElementById(k).className = "tab" + (k === id ? " on" : "");
          var el = document.getElementById(panes[k]);
          el.style.display = k === id ? "block" : "none";
          if (k === "tCopy") document.getElementById("plain").style.display = k === id ? "block" : "none";
        });
      });
    });
    document.getElementById("copy").addEventListener("click", function () {
      var t = document.getElementById("plain");
      t.select();
      // execCommand is deprecated AND it is the one that works without a secure context.
      // The rig serves over plain http on the LAN, where navigator.clipboard IS UNDEFINED.
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) { done = false; }
      if (!done && navigator.clipboard) { navigator.clipboard.writeText(t.value); done = true; }
      document.getElementById("copied").textContent = done ? "copied." : "select the box and copy manually.";
    });
  </script>`;
  fs.writeFileSync(path.join(OUT, "report.html"), html);
  // AND THE SAME THING AS A FILE, because a clipboard is not a paper trail.
  fs.writeFileSync(path.join(OUT, "failures.txt"), plain + "\n");
  console.log(`[render-qa] report.html has ${failed.length} needing work, ${passed.length} clean` +
              ` — copyable text also written to ${path.join(OUT, "failures.txt")}`);
}

main().catch(e => { console.error("[render-qa] fatal:", e); process.exit(2); });
