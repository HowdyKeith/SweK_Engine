#!/usr/bin/env node
// WebGLEngine/tools/ship/fsrCaches.mjs -- v4778: the FSR frame-generation caches live in WebGLEngine/fsr-caches/,
// leave the release zip, and come back on request.
//
// Keith: "Can we put the FSR frame caches in its own repo folder, and access /install from there if the user
// chooses? So there would be an install FSR caches page."
//
// *** THE RELEASE ZIP WAS 333 MB AND TWELVE FILES WERE 300 MB OF IT. *** Measured before anything moved
// (packRelease --out, 332,668,227 bytes, 6618 files): the nine frame*-cache.json.gz files (14-31 MB each) and
// three genGate harvests (genGate-folds.json 21 MB plain JSON, genGate-folds7.json.gz and
// genGate-absolute4.json.gz 14 MB each), 300,016,258 bytes together, are per-block feature rows harvested off
// fsr.html by tools/ship/genGateTrain.mjs's harvest() -- a WebGPU browser drive of the page, minutes per scene
// and up to an hour per harvest. They are the DATA the H3-H16 measurement gates re-derive their verdicts from.
// Nothing at runtime reads them: no page, no bridge route, no engine module. A user who never runs those gates
// downloads 300 MB of evidence for claims they will never re-check.
//
// *** NONE OF THEM REGENERATES ON A MISS, SO THE ONLY HONEST ABSENCE IS A NAMED SKIP. *** Every reader read the
// file straight off disk and died on ENOENT when it was gone; re-harvesting needs a WebGPU browser and the page,
// which is not "cheap" by any reading. So a reader whose cache is absent calls skipUnlessInstalled(), which
// prints that it is NOT a pass, names the page that installs the caches, and exits 0 -- the
// placementRender-selfcheck precedent for an absent optional input. In a git checkout the files are present and
// every gate runs exactly as before.
//
// *** THE -result.json FILES STAY WHERE THEY ARE. *** They are a few KB each, they are the records the verdict
// gates read, and they are not caches -- the measurement's ANSWER, not its input.
//
// ---- WHAT THIS MODULE OWNS ---------------------------------------------------------------------------------
//
//   CACHES          the one declaration of which files are FSR caches and what each is for
//   cacheRel(name)  the ENG-relative path ("fsr-caches/<name>"), forward slashes on every OS, refusing a name
//                   that is not declared -- every reader's constant is built through it
//   status()        present / missing / bad (present but the bytes or sha256 disagree with manifest.json)
//   install()       download each missing or bad file, verify sha256 BEFORE keeping it, refuse anything else
//   handleRoute()   GET/POST /install/fsr-caches, which ai-bridge/server.js forwards here
//   --write-manifest  rebuild fsr-caches/manifest.json from the files on disk (run it after a re-harvest)
//
// ai-bridge/packagerBridge.js reads manifest.json and leaves every blob it names out of the zip; the manifest
// itself ships, so an installed tree knows exactly what it is missing and what the right bytes hash to.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require_ = createRequire(import.meta.url);
const VM = require_("./versionMarker.js");

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DIR_REL = "fsr-caches";
// SWEK_FSR_CACHES_DIR moves where PRESENCE is judged and where install() writes, never where a reader reads:
// readers join cacheRel() onto ENG. fsrCaches-selfcheck points it at an empty folder to prove every reader
// skips by name before it opens anything.
export const DIR = process.env.SWEK_FSR_CACHES_DIR ? path.resolve(process.env.SWEK_FSR_CACHES_DIR) : path.join(ENG, DIR_REL);
export const MANIFEST_NAME = "manifest.json";
export const INSTALL_PAGE = "install-fsr-caches.html";
export const ROUTE = "/install/fsr-caches";
export const REPO = "HowdyKeith/SweK_Engine";
export const SOURCE_TEMPLATE = "https://raw.githubusercontent.com/" + REPO + "/<tag>/WebGLEngine/" + DIR_REL + "/<file>";
export const NOT_INSTALLED = "NOT a pass -- FSR caches not installed; install them from " + INSTALL_PAGE;

/**
 * *** THE ONE LIST. *** name -> what it is for and which runner writes it. Who READS it is not typed here: the
 * manifest builder derives it from the imports (readersOf), because a hand-kept reader list is the second copy
 * this tree keeps finding stale.
 */
export const CACHES = Object.freeze({
    "frameGate-cache.json.gz": Object.freeze({ hyp: "H7", writer: "tools/ship/frameGate.mjs",
        what: "H7 frame-level gate: per-frame laplacian vs generated-minus-crossfade dB, harvested at every declared speed" }),
    "frameHoles-cache.json.gz": Object.freeze({ hyp: "H8", writer: "tools/ship/frameHoles.mjs",
        what: "H8 occlusion: per-frame hole fraction vs the generation advantage" }),
    "frameHoled-cache.json.gz": Object.freeze({ hyp: "H9", writer: "tools/ship/frameHoled.mjs",
        what: "H9 replication of the holed-frame contrast on fresh cells" }),
    "frameVertical-cache.json.gz": Object.freeze({ hyp: "H10", writer: "tools/ship/frameVertical.mjs",
        what: "H10 the holed-frame question on vertical slab motion nobody had harvested" }),
    "frameGain-cache.json.gz": Object.freeze({ hyp: "H11", writer: "tools/ship/frameGain.mjs",
        what: "H11 the motion-gain score asked of the whole frame" }),
    "frameReverse-cache.json.gz": Object.freeze({ hyp: "H12/H13", writer: "tools/ship/frameReverse.mjs",
        what: "H12/H13 H11's negation on unseen cells, and the same question with the clock partialled out" }),
    "frameSway-cache.json.gz": Object.freeze({ hyp: "H14", writer: "tools/ship/frameSway.mjs",
        what: "H14 the sway path: the window's clock removed by design" }),
    "frameSwayRep-cache.json.gz": Object.freeze({ hyp: "H15", writer: "tools/ship/frameSwayRep.mjs",
        what: "H15 H14 replicated at a second speed" }),
    "frameDisagree-cache.json.gz": Object.freeze({ hyp: "H16", writer: "tools/ship/frameDisagree.mjs",
        what: "H16 motion-candidate disagreement as a trust signal" }),
    "genGate-folds.json": Object.freeze({ hyp: "H3", writer: "tools/ship/genGateTransfer.mjs",
        what: "H3 learned-gate transfer: three scenes of per-block v1/v2 features, leave one scene out" }),
    "genGate-folds7.json.gz": Object.freeze({ hyp: "H4/H6", writer: "tools/ship/genGateFolds.mjs",
        what: "H4 seven-fold learned gate at x2 (also H6's x2 cell)" }),
    "genGate-absolute4.json.gz": Object.freeze({ hyp: "H5/H6", writer: "tools/ship/genGateAbsolute.mjs",
        what: "H5 absolute feature set at x4 (also H6's x4 cell)" }),
});

/** A cache name is a plain basename: no separator, no dot-dot, nothing that can resolve outside the folder. */
export function safeName(name) {
    return typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes("..") &&
        name !== MANIFEST_NAME;
}

/** "fsr-caches/<name>" -- forward slashes on every OS, because readers join it onto ENG and gates compare it. */
export function cacheRel(name) {
    if (!Object.prototype.hasOwnProperty.call(CACHES, name)) throw new Error(`fsrCaches.cacheRel: "${name}" is not a declared FSR cache`);
    return DIR_REL + "/" + name;
}

/**
 * Absolute path into the cache folder (or a scratch folder a gate passes). Refuses anything that is not a plain
 * basename; WHICH names may be fetched is the manifest's call, made in install(), not this function's.
 */
export function cachePath(name, dir = DIR) {
    if (!safeName(name)) throw new Error(`fsrCaches.cachePath: refused "${name}" -- not a plain cache name`);
    return path.join(dir, name);
}

/** A name, or an ENG-relative path ending in one, reduced to the basename the folder is keyed by. */
const baseOf = (p) => String(p).split(/[\\/]/).pop();

export function present(name, dir = DIR) {
    try { return fs.statSync(cachePath(baseOf(name), dir)).isFile(); } catch { return false; }
}

/**
 * The reader's guard. Any listed cache absent -> print a named SKIP that says it is NOT a pass, exit 0.
 * `names` may be cache names or the ENG-relative constants readers already hold.
 */
export function skipUnlessInstalled(gate, names, { dir = DIR, exit = (c) => process.exit(c), log = console.log } = {}) {
    const missing = names.map(baseOf).filter((n) => !present(n, dir));
    if (!missing.length) return false;
    log(`  SKIP  ${gate}: ${missing.length} FSR cache(s) absent -- ${missing.join(", ")}`);
    log(`        ${NOT_INSTALLED}.`);
    log(`        Nothing below ran. These are harvested off fsr.html by a WebGPU browser drive (tools/ship/genGateTrain.mjs);`);
    log(`        they are not regenerated on a miss. In a git checkout they are present in ${DIR_REL}/.`);
    log(`\n${gate}: skipped (FSR caches not installed)`);
    exit(0);
    return true;
}

// ---- THE MANIFEST ----------------------------------------------------------------------------------------

export function readManifest(dir = DIR) {
    return JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_NAME), "utf8"));
}

const _hashMemo = new Map();
/** sha256 of a file, memoised on path+size+mtime so a page that polls GET does not re-hash 300 MB per poll. */
export function sha256File(p) {
    const st = fs.statSync(p), key = p + "|" + st.size + "|" + st.mtimeMs;
    if (_hashMemo.has(key)) return _hashMemo.get(key);
    const h = crypto.createHash("sha256"), fd = fs.openSync(p, "r"), buf = Buffer.allocUnsafe(1 << 20);
    try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); }
    finally { fs.closeSync(fd); }
    const out = h.digest("hex");
    _hashMemo.set(key, out);
    return out;
}

/**
 * Who reads each cache, DERIVED: a module that builds a binding with cacheRel("<name>") owns that name, and
 * every module importing that binding from it reads it. Paths are ENG-relative with forward slashes.
 */
export function readersOf(root = ENG) {
    const dirs = ["tools/ship", "render"], files = [];
    for (const d of dirs) { let ents = []; try { ents = fs.readdirSync(path.join(root, d)); } catch {}
        for (const e of ents) if (/\.mjs$/.test(e)) files.push(d + "/" + e); }
    const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
    const owns = {};                                         // file -> { binding -> [names] }
    for (const [f, s] of Object.entries(src)) {
        if (f === "tools/ship/fsrCaches.mjs") continue;
        // One statement per export, up to its semicolon -- which also covers genGateRule's CELLS, an object
        // literal holding two cacheRel() calls, as one binding owning both names.
        for (const m of s.matchAll(/export const (\w+)\s*=\s*([^;]*?cacheRel\([\s\S]*?);/g)) {
            const names = [...m[2].matchAll(/cacheRel\("([^"]+)"\)/g)].map((x) => x[1]);
            if (names.length) (owns[f] ||= {})[m[1]] = names;
        }
    }
    const readers = Object.fromEntries(Object.keys(CACHES).map((n) => [n, new Set()]));
    for (const [f, b] of Object.entries(owns)) for (const ns of Object.values(b)) for (const n of ns) if (readers[n]) readers[n].add(f);
    for (const [f, s] of Object.entries(src)) {
        for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/([\w.-]+\.mjs)"/g)) {
            const from = path.posix.join(path.posix.dirname(f), m[2]);
            if (!owns[from]) continue;
            for (const b of m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]))
                for (const n of owns[from][b] || []) readers[n].add(f);
        }
    }
    return Object.fromEntries(Object.entries(readers).map(([n, s]) => [n, [...s].sort()]));
}

export function buildManifest(dir = DIR, root = ENG) {
    const readers = readersOf(root);
    const files = Object.entries(CACHES).map(([name, c]) => {
        const p = cachePath(name, dir), st = fs.statSync(p);
        return { name, bytes: st.size, sha256: sha256File(p), hyp: c.hyp, what: c.what, writer: c.writer, readers: readers[name] };
    });
    return {
        note: "WebGLEngine/fsr-caches/ holds the FSR frame-generation measurement caches: per-block feature rows " +
              "harvested off fsr.html by a WebGPU browser drive (tools/ship/genGateTrain.mjs), which the H3-H16 " +
              "measurement gates re-derive their verdicts from. Nothing at runtime reads them. The release zip " +
              "leaves every file listed here out and keeps this manifest; " + INSTALL_PAGE + " (GET/POST " + ROUTE +
              ") downloads them from the release tag and keeps a file only if its sha256 matches. A gate whose " +
              "cache is absent skips by name and says it is NOT a pass. Rebuild this file with " +
              "node tools/ship/fsrCaches.mjs --write-manifest after a re-harvest.",
        generatedBy: "tools/ship/fsrCaches.mjs --write-manifest",
        installPage: INSTALL_PAGE,
        route: ROUTE,
        source: SOURCE_TEMPLATE,
        totalBytes: files.reduce((a, f) => a + f.bytes, 0),
        files,
    };
}

// ---- STATUS ----------------------------------------------------------------------------------------------

/** Per file: present (bytes and sha256 match), missing, or bad (present, but not the manifest's bytes). */
export function status({ dir = DIR, manifest = null, hash = true } = {}) {
    const m = manifest || readManifest(dir);
    const files = m.files.map((f) => {
        const base = { name: f.name, bytes: f.bytes, sha256: f.sha256, what: f.what, hyp: f.hyp, readers: f.readers || [] };
        if (!safeName(f.name)) return { ...base, state: "bad", why: "manifest names something that is not a plain cache name" };
        let st = null; try { st = fs.statSync(cachePath(f.name, dir)); } catch {}
        if (!st || !st.isFile()) return { ...base, state: "missing" };
        if (st.size !== f.bytes) return { ...base, state: "bad", haveBytes: st.size, why: `${st.size} bytes on disk, manifest says ${f.bytes}` };
        if (hash) { const h = sha256File(cachePath(f.name, dir));
            if (h !== f.sha256) return { ...base, state: "bad", haveBytes: st.size, why: `sha256 ${h.slice(0, 12)} on disk, manifest says ${f.sha256.slice(0, 12)}` }; }
        return { ...base, state: "present" };
    });
    const by = (s) => files.filter((f) => f.state === s);
    return { files, present: by("present").length, missing: by("missing").length, bad: by("bad").length,
             totalBytes: files.reduce((a, f) => a + f.bytes, 0),
             missingBytes: files.filter((f) => f.state !== "present").reduce((a, f) => a + f.bytes, 0) };
}

export const engineTag = (root = ENG) => VM.engineVersion(root);
export const sourceBase = (tag) => "https://raw.githubusercontent.com/" + REPO + "/" + tag + "/WebGLEngine/" + DIR_REL + "/";

// ---- INSTALL ---------------------------------------------------------------------------------------------

/**
 * *** curl FIRST, fetch SECOND, AND THE ORDER IS MEASURED RATHER THAN TASTE. *** verifiedPolygonIntersectionBridge
 * found that Node's own HTTP stack does not honour HTTPS_PROXY and curl does, on this box and on any office
 * network; curl.exe ships with Windows 10+. fetch is the fallback for a box with no curl at all. Either way the
 * download lands in a temp name and is HASHED before it is kept -- the transport's own success is not evidence.
 * --max-filesize caps the write at the manifest's size, so a hostile or wrong URL cannot fill the disk.
 *
 * v4778 review -- *** NO REDIRECT IS FOLLOWED, BY EITHER TRANSPORT. *** The first draft passed -L with no limit and
 * called fetch() with its default redirect: "follow", so a 3xx from the source went to any host it named; only
 * the sha256 stood between that host and the folder. raw.githubusercontent.com serves a tagged file with a plain
 * 200 (measured: HowdyKeith/SweK_Engine v4777, genGate-folds7.json.gz, 200, 14,465,294 bytes, no Location), so a
 * redirect is not the source answering -- --max-redirs 0 turns one into curl exit 47 and redirect: "error" into
 * a fetch rejection, and the file is not kept. fsrCaches-selfcheck drives both against a 302 to a second server
 * that WOULD serve the right bytes. The why also carries curl's own stderr now: the first draft kept only the
 * first line of err.message, which is the command line, so a 404 on an unpublished tag read as "Command failed".
 */
function curlTo(url, tmp, maxBytes) {
    return new Promise((resolve) => {
        // --noproxy for loopback only: a proxy in the environment still carries the GitHub fetch, but a mirror or a
        // gate's fixture on 127.0.0.1 must not be sent to it.
        execFile("curl", ["-fsSL", "--max-redirs", "0", "--noproxy", "127.0.0.1,localhost", "--connect-timeout", "20", "-Y", "1024", "-y", "60", "--max-filesize", String(maxBytes + 1),
                          "-o", tmp, url], { windowsHide: true, timeout: 3600000 }, (err, _stdout, stderr) => {
            if (err && err.code === "ENOENT") return resolve({ ok: false, noCurl: true });
            const said = String(stderr || "").trim().split(/\r?\n/).filter(Boolean).pop() || String((err && err.message) || err).split("\n")[0];
            resolve(err ? { ok: false, why: "curl exit " + (err.code == null ? "?" : err.code) + ": " + said.slice(0, 200) } : { ok: true });
        });
    });
}
async function fetchTo(url, tmp, maxBytes) {
    let r;
    try { r = await fetch(url, { redirect: "error" }); }
    catch (e) { return { ok: false, why: "fetch: " + (String((e && e.message) || e) + (e && e.cause && e.cause.message ? " (" + e.cause.message + ")" : "")).slice(0, 200) }; }
    if (!r.ok || !r.body) return { ok: false, why: "HTTP " + r.status };
    const fd = fs.openSync(tmp, "w");
    let n = 0;
    try { for await (const c of r.body) { n += c.length; if (n > maxBytes) return { ok: false, why: `more than the manifest's ${maxBytes} bytes` }; fs.writeSync(fd, c); } }
    catch (e) { return { ok: false, why: "fetch body: " + String((e && e.message) || e).slice(0, 200) }; }
    finally { fs.closeSync(fd); }
    return { ok: true };
}
export async function download(url, tmp, maxBytes, transport = "auto") {
    if (transport === "fetch") return fetchTo(url, tmp, maxBytes);
    const c = await curlTo(url, tmp, maxBytes);
    if (c.noCurl && transport === "auto") return fetchTo(url, tmp, maxBytes);
    return c;
}

let _job = null;
export const job = () => _job && { ..._job, results: _job.results.slice() };

/**
 * Download each missing or bad file. `only` narrows it to named files, and a name the manifest does not hold
 * is REFUSED, never fetched. A file is kept only when its bytes AND sha256 match the manifest; otherwise the
 * temp file is deleted and the result says why. Nothing is written outside `dir`.
 */
export async function install({ dir = DIR, manifest = null, baseUrl = "", tag = "", only = null, transport = "auto" } = {}) {
    if (_job && _job.running) return { ok: false, busy: true, error: "an FSR cache install is already running", job: job() };
    const m = manifest || readManifest(dir);
    const t = tag || engineTag();
    const base = baseUrl || process.env.SWEK_FSR_CACHES_BASE || sourceBase(t);
    const known = new Map(m.files.map((f) => [f.name, f]));
    const results = [];
    let want = m.files.map((f) => f.name);
    if (Array.isArray(only)) {
        for (const n of only) if (!known.has(n)) results.push({ name: String(n).slice(0, 120), ok: false, refused: true, why: "not in fsr-caches/manifest.json -- refused, nothing fetched" });
        want = only.filter((n) => known.has(n));
    }
    const st = status({ dir, manifest: m });
    const state = new Map(st.files.map((f) => [f.name, f]));
    _job = { running: true, startedAt: Date.now(), base, current: null, results };
    try {
        fs.mkdirSync(dir, { recursive: true });
        const real = fs.realpathSync(dir);
        for (const name of want) {
            const f = known.get(name), s = state.get(name);
            if (s.state === "present") { results.push({ name, ok: true, kept: true, already: true, bytes: f.bytes }); continue; }
            if (!safeName(name)) { results.push({ name, ok: false, refused: true, why: "not a plain cache name" }); continue; }
            const final = cachePath(name, dir), tmp = final + ".part-" + process.pid + "-" + Date.now().toString(36);
            if (path.dirname(path.resolve(final)) !== path.resolve(dir) || fs.realpathSync(path.dirname(final)) !== real) {
                results.push({ name, ok: false, refused: true, why: "would resolve outside the cache folder" }); continue; }
            _job.current = name;
            const url = base + encodeURIComponent(name);
            const t0 = Date.now(), d = await download(url, tmp, f.bytes, transport);
            let r;
            if (!d.ok) r = { name, ok: false, kept: false, url, why: d.why };
            else {
                let size = -1, h = "";
                try { size = fs.statSync(tmp).size; h = sha256File(tmp); } catch {}
                if (size === f.bytes && h === f.sha256) {
                    // v4778 review -- a rename that throws (on Windows a scanner holding the fresh temp file gives
                    // EPERM) used to escape the loop past the rmSync below, leaving the .part file and failing
                    // every later file; now it is that one file's result and the temp is still removed.
                    try { fs.renameSync(tmp, final); r = { name, ok: true, kept: true, bytes: size, ms: Date.now() - t0, url }; }
                    catch (e) { r = { name, ok: false, kept: false, url, why: "verified, but could not be moved into place: " + String((e && e.message) || e).slice(0, 160) }; }
                } else r = { name, ok: false, kept: false, url,
                    why: size !== f.bytes ? `got ${size} bytes, manifest says ${f.bytes} -- not kept` : `sha256 ${h.slice(0, 12)} does not match the manifest's ${f.sha256.slice(0, 12)} -- not kept` };
            }
            try { fs.rmSync(tmp, { force: true }); } catch {}
            results.push(r);
        }
    } finally { _job.running = false; _job.current = null; _job.finishedAt = Date.now(); }
    const after = status({ dir, manifest: m });
    return { ok: results.every((r) => r.ok), tag: t, base, source: SOURCE_TEMPLATE, results,
             present: after.present, missing: after.missing, bad: after.bad, missingBytes: after.missingBytes };
}

/** GET: what is here, what is missing, how much it would download, from where. */
export function plan({ dir = DIR, baseUrl = "" } = {}) {
    let m;
    try { m = readManifest(dir); } catch (e) { return { ok: false, error: "no " + DIR_REL + "/" + MANIFEST_NAME + " -- " + String(e.message).slice(0, 160) }; }
    const t = engineTag(), st = status({ dir, manifest: m });
    return { ok: true, tag: t, source: SOURCE_TEMPLATE, base: baseUrl || process.env.SWEK_FSR_CACHES_BASE || sourceBase(t),
             folder: DIR_REL, installPage: INSTALL_PAGE, note: m.note, job: job(), ...st };
}

/**
 * ai-bridge/server.js forwards GET/POST /install/fsr-caches here. POST takes an optional JSON body
 * { files: [names] }; with none it installs every missing or bad file.
 */
export async function handleRoute(req, res, { sendJson, dir = DIR, baseUrl = "", transport = "auto" } = {}) {
    if (req.method === "GET") return sendJson(plan({ dir, baseUrl }));
    if (req.method !== "POST") return sendJson({ ok: false, error: "GET or POST" }, 405);
    let body = "";
    for await (const c of req) { body += c; if (body.length > 65536) return sendJson({ ok: false, error: "body too large" }, 413); }
    let only = null;
    try { const j = JSON.parse(body || "{}"); if (Array.isArray(j.files)) only = j.files.map(String); }
    catch { return sendJson({ ok: false, error: "bad JSON in body" }, 400); }
    let m;
    try { m = readManifest(dir); } catch (e) { return sendJson({ ok: false, error: "no manifest: " + String(e.message).slice(0, 160) }, 500); }
    return sendJson(await install({ dir, manifest: m, baseUrl, only, transport }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    if (process.argv.includes("--write-manifest")) {
        const m = buildManifest();
        fs.writeFileSync(path.join(DIR, MANIFEST_NAME), JSON.stringify(m, null, 1) + "\n");
        console.log(`[fsrCaches] wrote ${DIR_REL}/${MANIFEST_NAME}: ${m.files.length} files, ${(m.totalBytes / 1048576).toFixed(1)} MB`);
    } else {
        const s = status();
        for (const f of s.files) console.log(`  ${f.state.padEnd(8)} ${f.name.padEnd(30)} ${(f.bytes / 1048576).toFixed(1).padStart(6)} MB${f.why ? "   " + f.why : ""}`);
        console.log(`[fsrCaches] ${s.present} present, ${s.missing} missing, ${s.bad} bad; ${(s.missingBytes / 1048576).toFixed(1)} MB to download`);
    }
}
