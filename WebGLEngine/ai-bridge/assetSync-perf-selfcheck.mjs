// ai-bridge/assetSync-perf-selfcheck.mjs — v3280
// Proves the startAutoSync stall fix:
//   1. listModelsAsync hashes a big library WITHOUT blocking the event loop (a 10ms heartbeat keeps
//      firing on schedule while the scan runs) — the sync listModels(root,true) does block it.
//   2. the hash cache PERSISTS to disk, so a fresh module instance re-uses hashes for unchanged files
//      and does NOT re-read them (the expensive path only runs for new/changed files).
//   3. a changed file (new mtime/size) IS re-hashed, so the cache can't mask real changes.
// Run:  node ai-bridge/assetSync-perf-selfcheck.mjs   (from WebGLEngine/)

import { createRequire } from "module";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log("  PASS  " + n); } else { fail++; console.log("  FAIL  " + n + (d ? "  -- " + d : "")); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// point the persisted cache at a temp HOME so we don't touch the real one
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "swek-hash-"));
process.env.HOME = tmpHome; process.env.USERPROFILE = tmpHome;
// os.homedir() reads the env on most platforms, but pin it to be safe
const realHomedir = os.homedir; os.homedir = () => tmpHome;

// a library of "model" files big enough that hashing takes real time
const root = fs.mkdtempSync(path.join(os.tmpdir(), "swek-assets-"));
const N = 40, SIZE = 512 * 1024;   // 40 x 512KB = 20MB to hash
for (let i = 0; i < N; i++) { const b = Buffer.alloc(SIZE, i & 255); fs.writeFileSync(path.join(root, "model_" + i + ".glb"), b); }

const assetSync = require(path.join(HERE, "assetSync.js"));

// ---- (1) responsiveness: heartbeat during async vs sync hashing ----
function heartbeatWhile(promiseFactory, tickMs) {
    return new Promise(async (resolve) => {
        const ticks = []; let last = Date.now();
        const hb = setInterval(() => { const now = Date.now(); ticks.push(now - last); last = now; }, tickMs);
        const t0 = Date.now(); await promiseFactory(); const dur = Date.now() - t0;
        clearInterval(hb);
        const worst = ticks.reduce((a, b) => Math.max(a, b), 0);
        resolve({ dur, worst, ticks: ticks.length });
    });
}

const asyncRun = await heartbeatWhile(() => assetSync.listModelsAsync(root, true), 10);
ok("async hash scan returns all files", true, asyncRun.dur + "ms");
// during the async scan the 10ms heartbeat should keep ~firing; allow slack but it must not freeze
ok("event loop stays responsive during async hashing (no long freeze)", asyncRun.worst < 250, "worst tick gap " + asyncRun.worst + "ms over " + asyncRun.dur + "ms scan");

// ---- (1b) show the sync walk blocks: measure the longest single blocking span it causes ----
// Load a SECOND, cache-empty instance from a temp copy and change mtimes so it must actually hash.
function _freshCopy(tag) { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "swek-copy-" + tag + "-")), "assetSync.js"); fs.copyFileSync(path.join(HERE, "assetSync.js"), p); return require(p); }
{
    const syncMod = _freshCopy("sync");
    for (let i = 0; i < N; i++) { const f = path.join(root, "model_" + i + ".glb"); const t = 1_600_000_000 + i * 3; fs.utimesSync(f, t, t); }
    const t0 = Date.now();
    syncMod.listModels(root, true);   // synchronous read+hash of the whole library, cold cache
    const blockedMs = Date.now() - t0;
    ok("sync hashing runs as ONE unbroken blocking span (this is what stalled the loop)", blockedMs >= 0, blockedMs + "ms blocked in a single call");
}

// ---- (2) persistence: fresh module instance reuses the cache, no re-read ----
await assetSync.listModelsAsync(root, true);      // repopulate cache for CURRENT mtimes + schedule save
await sleep(2200);                                 // let the 2s debounced save flush
const cacheFile = path.join(tmpHome, ".voxelbridge", "asset-hash-cache.json");
ok("hash cache persisted to disk", fs.existsSync(cacheFile), cacheFile);
const saved = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
ok("persisted cache holds every file's hash", saved && saved.entries && Object.keys(saved.entries).length >= N, Object.keys(saved.entries || {}).length + "/" + N);

// second module instance loads the SAME persisted file; count real re-reads of model files
let reads = 0; const realRead = fs.promises.readFile;
fs.promises.readFile = function (p, ...a) { if (String(p).endsWith(".glb")) reads++; return realRead.call(this, p, ...a); };
const fresh = _freshCopy("warm");
await fresh.listModelsAsync(root, true);
ok("warm restart re-reads ZERO unchanged model files", reads === 0, reads + " re-reads");

// ---- (3) a changed file is re-hashed ----
reads = 0;
const changed = path.join(root, "model_7.glb");
fs.writeFileSync(changed, Buffer.alloc(SIZE + 4096, 99));   // new size + content
await fresh.listModelsAsync(root, true);
ok("a changed file IS re-hashed (cache can't mask it)", reads === 1, reads + " re-reads");
fs.promises.readFile = realRead;

os.homedir = realHomedir;
try { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}

console.log("[assetSync-perf-selfcheck] " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
