#!/usr/bin/env node
// WebGLEngine/tools/ship/fsrCaches-selfcheck.mjs -- v4778: the FSR caches' own folder, the zip that leaves them
// out, and the route that brings them back.
//
// Keith: "Can we put the FSR frame caches in its own repo folder, and access /install from there if the user
// chooses? So there would be an install FSR caches page." tools/ship/fsrCaches.mjs is the one helper; this gate
// holds the six things that make the move safe rather than merely done:
//
//   1. fsr-caches/manifest.json is the files: same names as fsrCaches.CACHES, and bytes + sha256 + readers match
//      what is on disk and in the imports today (a re-harvest without --write-manifest goes red here)
//   2. every reader goes through the helper: no "tools/ship/<cache>" path left anywhere, no cache name outside
//      cacheRel()/cachePath(), and every reader gate, RUN with the caches judged absent, skips by name, says it
//      is NOT a pass, exits 0 and runs no row
//   3. the release packer leaves every blob out and keeps manifest.json, by the packer's own predicate
//   4. the install route, driven over real HTTP against a local fixture server -- no network: installs a missing
//      file, REJECTS a corrupted one and a short one (not kept, no temp file left), refuses a name outside the
//      manifest without fetching it, refuses a manifest entry that would escape the folder, writes nothing
//      outside the folder, and repairs a damaged file
//   5. status() says present / missing / bad, and bad means the HASH, not just the size
//   6. the bridge forwards the route, the page talks to it, server.html links it and pageSections files it
//
// A release install has manifest.json and none of the blobs: section 1 then hashes nothing and SKIPS that by
// name (NOT a pass); every other section needs no cache and runs.
//
// Run: node tools/ship/fsrCaches-selfcheck.mjs
//
// ---- SABOTAGES, MEASURED v4778 -- each on the tree file, the gate run, the file restored and sha256-compared ------
// (the earlier draft of this header listed predicted counts that were never run; these are the runs, exit=1 each
// unless said otherwise, every red row named)
//   A   manifest.json: one sha256 hex digit changed           -> 1 red "manifest bytes + sha256 match"
//   A2  manifest.json: last entry dropped                     -> 1 red "names exactly the caches ... CACHES declares"
//   A3  manifest.json: one reader dropped from a file         -> 1 red "readers are the ones the imports say TODAY"
//   A4  a stray tools/ship/genGate-folds7.json.gz written     -> 2 red "no cache is left at its old address",
//                                                                "no OTHER file ... shares a blob's name"
//   B   frameGate.mjs: CACHE_H7 back to its tools/ship/ literal -> 3 red: "readers TODAY", "no hard-coded
//                                                                tools/ship/<cache> path", "no cache name outside"
//   B2  genGateRule.mjs: CELLS x2 cache as "fsr-caches/..." literal -> 2 red: "readers TODAY", "no cache name outside"
//   C   frameGateMeasure-selfcheck.mjs: its skipUnlessInstalled line deleted -> 1 red "every reader gate ... SKIPS"
//   D   packagerBridge.js: the FSR_CACHE_BLOBS line in _skipFile deleted -> 1 red "the packer skips every blob"
//   D2  packagerBridge.js: _skipFile also skips "manifest.json" -> 1 red "...and keeps manifest.json"
//   D3  packagerBridge.js: _fsrCacheBlobs drops the first name -> 2 red "blob set IS the manifest's names",
//                                                                "the packer skips every blob" (11 of 12)
//   D4  packRelease.mjs: makeInstallable -> makeGmailSafe     -> 1 red "packRelease.mjs ... calls makeInstallable"
//   S   manifest.json deleted                                 -> 1 red "manifest.json exists and parses", gate stops
//   E   install(): the size + sha256 condition made `true`    -> 3 red "corrupted file ... NOT kept", "short file
//                                                                NOT kept", "no temp file ... POST said not ok"
//   F   install(): the `only` filter lets every name through  -> 1 red "a name outside the manifest is refused"
//   G1  safeName() reduced to `typeof name === "string"`      -> exit=0, 0 red: the dirname/realpath check in
//                                                                install() is a second layer and still refused it
//   G2  G1 AND that dirname/realpath check made `false`       -> 2 red "escape ... refused", "nothing written
//                                                                outside the folder" (root held escape.json).
//       The FIRST run of G2 was 0 red: the fixture 404'd "../escape.json", so nothing escaped because nothing
//       arrived. The fixture now serves by basename, and G2 is red.
//   H   status(): the sha256 comparison skipped               -> 3 red "same-size corruption reads bad", "GET
//                                                                agrees", "a POST repairs the bad one"
//   I   install(): the temp-file rmSync deleted               -> 1 red "no temp file is left behind"
//   J   plan(): base ignores the injected baseUrl             -> 1 red "GET reports ... the injected source"
//   K   fetchTo(): every response treated as an HTTP failure  -> 1 red "a re-POST installs the rest (fetch ...)"
//   L   status(): a matching file reported "ok", not "present" -> 6 red incl. "a good file reads present"
//   M   status(): a missing file reported "bad"               -> 3 red incl. "a deleted file reads missing"
//   N   install(): a "bad" file treated as already installed  -> 2 red "escape ... refused" (reported ok/already),
//                                                                "a POST repairs the bad one"
//   O   server.js: the route matches GET only                 -> 1 red "server.js forwards GET and POST"
//   P   install-fsr-caches.html: POST sent as PUT             -> 1 red "reads GET and POSTs the same route"
//   Q   server.html: the anchor's title attribute renamed     -> 1 red "server.html carries an anchor ... title"
//   R   pageSections.mjs: install-fsr-caches.html unclaimed   -> 1 red "pageSections claims it in a drawer"
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as FC from "./fsrCaches.mjs";
import { noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PB = require_("../../ai-bridge/packagerBridge.js");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const skip = (l, why) => console.log(`  SKIP  ${l}   ${why} -- NOT a pass`);
const say = (s) => console.log(`  ----  ${s}`);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const J = (x) => JSON.stringify(x);
const posix = (p) => String(p).split(path.sep).join("/");

console.log("fsrCaches-selfcheck -- the FSR caches in their own folder, out of the zip, installable on request\n");

// ---------------------------------------------------------------------------------------------------------
console.log("1. *** THE MANIFEST IS THE FILES ***");
let man = null, manErr = "";
try { man = FC.readManifest(path.join(ENG, FC.DIR_REL)); } catch (e) { manErr = String(e.message).slice(0, 160); }
ok("!! fsr-caches/manifest.json exists and parses", !!man, man ? `${man.files.length} files, ${(man.totalBytes / 1048576).toFixed(1)} MB` : manErr);
if (!man) { console.log(`\nfsrCaches-selfcheck: ${fails} FAILED`); process.exit(1); }
const names = man.files.map((f) => f.name);
ok("!! it names exactly the caches fsrCaches.CACHES declares, every one a plain basename",
   J(names.slice().sort()) === J(Object.keys(FC.CACHES).sort()) && names.every(FC.safeName),
   `${names.length} declared; the manifest is BUILT from CACHES, so a disagreement is a hand edit or a stale build`);
const realDir = path.join(ENG, FC.DIR_REL);
const onDisk = names.filter((n) => fs.existsSync(path.join(realDir, n)));
if (onDisk.length === 0) {
    skip("manifest bytes + sha256 match the files on disk", "no cache is installed in this tree (a release install)");
} else {
    const st = FC.status({ dir: realDir, manifest: man });
    // A MISSING file is an install state (a release that installed some of them), not a disagreement; only a file
    // that is HERE with other bytes is. Missing ones are named, and said not to be checked.
    const off = st.files.filter((f) => f.state !== "present" && f.state !== "missing");
    const absent = st.files.filter((f) => f.state === "missing");
    ok("!! *** manifest bytes + sha256 match the files on disk ***", off.length === 0,
       off.length ? off.map((f) => `${f.name} ${f.state}${f.why ? " (" + f.why + ")" : ""}`).join("; ") + " -- after a re-harvest run node tools/ship/fsrCaches.mjs --write-manifest"
                  : `${st.present} of ${st.files.length} present and hashed`);
    if (absent.length) skip(`${absent.length} cache(s) not installed, so not hashed: ${absent.map((f) => f.name).join(", ")}`, "install them from " + FC.INSTALL_PAGE);
}
{
    const derived = FC.readersOf();
    const stale = man.files.filter((f) => J(f.readers || []) !== J(derived[f.name] || []));
    ok("!! each file's readers are the ones the imports say TODAY", stale.length === 0 && man.files.every((f) => (f.readers || []).length > 0),
       stale.length ? stale.map((f) => `${f.name}: manifest ${J(f.readers)} vs imports ${J(derived[f.name])}`).join("; ").slice(0, 400)
                    : `${Object.values(derived).reduce((a, r) => a + r.length, 0)} reader edges, derived from cacheRel() bindings and their importers`);
    const left = names.filter((n) => fs.existsSync(path.join(ENG, "tools", "ship", n)));
    ok("!! and no cache is left at its old address in tools/ship/", left.length === 0, left.join(", ") || "moved with git mv");
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n2. *** EVERY READER GOES THROUGH THE HELPER ***");
const SELF = new Set(["tools/ship/fsrCaches.mjs", "tools/ship/fsrCaches-selfcheck.mjs"]);
const sources = [];
{
    const walk = (dir, rel) => {
        let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.isDirectory()) { if (!PB.SKIP_DIRS.has(e.name) && e.name !== "vendor" && !e.name.startsWith(".")) walk(path.join(dir, e.name), rel ? rel + "/" + e.name : e.name); continue; }
            if (/\.(m?js|html|json)$/.test(e.name)) sources.push(rel ? rel + "/" + e.name : e.name);
        }
    };
    walk(ENG, "");
}
const hardPath = [], loose = [];
for (const rel of sources) {
    if (SELF.has(rel) || rel === FC.DIR_REL + "/" + FC.MANIFEST_NAME || /input-sets\.json$/.test(rel)) continue;
    let raw; try { raw = fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { continue; }
    if (!names.some((n) => raw.includes(n))) continue;
    const code = /\.json$/.test(rel) ? raw : noComments(raw);
    for (const n of names) {
        if (code.includes("tools/ship/" + n)) hardPath.push(`${rel}: tools/ship/${n}`);
        // A PATH IN CODE is a string literal that IS the name or ends in "/name". A record's prose that mentions
        // a cache in a sentence (gateSweep's v4701 note sizes genGate-folds.json in words) is not a read.
        const lit = new RegExp(`(["'\`])([^"'\`\\s]*/)?${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`, "g");
        for (const m of code.matchAll(lit)) {
            const before = code.slice(Math.max(0, m.index - 10), m.index);
            if (m[2] || !/(cacheRel|cachePath)\($/.test(before)) { loose.push(`${rel}: ...${code.slice(Math.max(0, m.index - 30), m.index + m[0].length).replace(/\s+/g, " ")}`); break; }
        }
    }
}
ok("!! *** no hard-coded tools/ship/<cache> path is left anywhere in the tree ***", hardPath.length === 0,
   hardPath.length ? hardPath.slice(0, 6).join("; ") : `${sources.length} .js/.mjs/.html/.json files scanned, comments excluded`);
ok("!! *** no cache name outside the helper -- every one is cacheRel(\"...\") or cachePath(\"...\") ***", loose.length === 0,
   loose.length ? loose.slice(0, 6).join("; ") : "so moving the folder again is a one-line change in fsrCaches.mjs");
const readerGates = [...new Set(Object.values(FC.readersOf()).flat())].filter((f) => /-selfcheck\.mjs$/.test(f)).sort();
{
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "fsrCachesAbsent-"));
    const bad = [];
    try {
        for (const g of readerGates) {
            const r = spawnSync(process.execPath, [path.join(ENG, g)], { cwd: ENG, encoding: "utf8", timeout: 120000,
                env: { ...process.env, SWEK_FSR_CACHES_DIR: empty } });
            const out = (r.stdout || "") + (r.stderr || "");
            const skipped = r.status === 0 && out.includes(FC.NOT_INSTALLED) && /skipped \(FSR caches not installed\)/.test(out) && !/^\s+(PASS|FAIL)\s/m.test(out);
            if (!skipped) bad.push(`${g.split("/").pop()} exit ${r.status}${r.error ? " " + r.error.code : ""}: ${out.trim().split("\n").slice(-1)[0].slice(0, 120)}`);
        }
    } finally { fs.rmSync(empty, { recursive: true, force: true }); }
    ok("!! *** every reader gate, with the caches absent, SKIPS BY NAME before any row, says NOT a pass, exits 0 ***",
       readerGates.length >= 20 && bad.length === 0,
       bad.length ? bad.slice(0, 5).join("; ") : `${readerGates.length} reader gates run under an empty SWEK_FSR_CACHES_DIR -- none regenerates on a miss (a harvest is a WebGPU browser drive of fsr.html), so a named skip is the only honest absence`);
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n3. *** THE RELEASE ZIP LEAVES THE BLOBS OUT AND KEEPS THE MANIFEST ***");
{
    const blobs = PB.FSR_CACHE_BLOBS || new Set();
    ok("!! the packer's blob set IS the manifest's names, read rather than typed", J([...blobs].sort()) === J(names.slice().sort()), `${blobs.size} names`);
    const skipped = names.filter((n) => PB._skipFile(n));
    ok("!! *** the packer skips every blob ***", skipped.length === names.length, `${skipped.length} of ${names.length} skipped by _skipFile, the predicate _copyTree and artifactCensus both use`);
    ok("!! ...and keeps manifest.json, so an installed tree knows what it lacks", !PB._skipFile(FC.MANIFEST_NAME));
    // _skipFile is keyed by NAME, so a same-named file anywhere else in the project would vanish from the zip too.
    const twins = [];
    const walk = (dir, rel) => {
        let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.isDirectory()) { if (!PB.SKIP_DIRS.has(e.name) && !e.name.startsWith("EngineProject_GmailSafe_")) walk(path.join(dir, e.name), rel + "/" + e.name); }
            else if (blobs.has(e.name) && rel !== "/WebGLEngine/" + FC.DIR_REL) twins.push(rel + "/" + e.name);
        }
    };
    walk(PB.PROJECT_ROOT, "");
    ok("!! and no OTHER file in the project shares a blob's name, so the name-keyed skip removes only caches", twins.length === 0, twins.join(", ") || "the walk _copyTree does, over the whole project");
    const pack = fs.readFileSync(path.join(ENG, "tools", "ship", "packRelease.mjs"), "utf8");
    ok("!! packRelease.mjs still has no packing logic of its own -- it calls makeInstallable, which copies through _skipFile",
       /makeInstallable/.test(noComments(pack)) && /_skipFile\(e\.name\)/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "packagerBridge.js"), "utf8")));
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n4. *** THE INSTALL ROUTE, OVER REAL HTTP, AGAINST A LOCAL FIXTURE SERVER ***");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "fsrCachesInstall-"));
const dir = path.join(root, "fsr-caches");
fs.mkdirSync(dir);
fs.writeFileSync(path.join(root, "sibling.txt"), "outside the folder\n");
const good = Buffer.from("good bytes for frameGate " + "x".repeat(5000));
const holes = Buffer.from("the right bytes for frameHoles " + "y".repeat(3000));
const holed = Buffer.from("the right bytes for frameHoled " + "z".repeat(2000));
const served = {
    "frameGate-cache.json.gz": good,
    "frameHoles-cache.json.gz": Buffer.from(holes.toString().replace(/y/g, "Y")),   // same length, wrong bytes
    "frameHoled-cache.json.gz": holed.subarray(0, 100),                              // truncated
    "notInManifest.json": Buffer.from("never asked for"),
    "escape.json": Buffer.from("escaped"),
};
const fixtureManifest = { files: [
    { name: "frameGate-cache.json.gz", bytes: good.length, sha256: sha(good), what: "fixture", readers: [] },
    { name: "frameHoles-cache.json.gz", bytes: holes.length, sha256: sha(holes), what: "fixture", readers: [] },
    { name: "frameHoled-cache.json.gz", bytes: holed.length, sha256: sha(holed), what: "fixture", readers: [] },
] };
fs.writeFileSync(path.join(dir, FC.MANIFEST_NAME), JSON.stringify(fixtureManifest));
const asked = [];
const fixture = http.createServer((req, res) => {
    // Keyed by the BASENAME of the decoded request, so a hostile "../escape.json" entry is SERVED its bytes. The first
    // draft keyed by the raw last segment, 404'd it, and a sabotage that removed both escape guards stayed green --
    // nothing escaped only because nothing arrived. A refusal is only proven against a source that would deliver.
    const n = decodeURIComponent(req.url.split("?")[0]).split("/").pop();
    asked.push(n);
    if (served[n]) { res.writeHead(200, { "Content-Type": "application/octet-stream" }); res.end(served[n]); }
    else { res.writeHead(404); res.end(); }
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${fixture.address().port}/WebGLEngine/fsr-caches/`;
let transport = "auto";
const bridge = http.createServer((req, res) => {
    const sendJson = (obj, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.url.split("?")[0] !== FC.ROUTE) return sendJson({ ok: false }, 404);
    FC.handleRoute(req, res, { sendJson, dir, baseUrl: base, transport }).catch((e) => sendJson({ ok: false, error: String(e.message) }, 500));
});
await new Promise((r) => bridge.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${bridge.address().port}${FC.ROUTE}`;
const get = async () => (await fetch(B)).json();
const post = async (body) => (await fetch(B, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })).json();
const listing = (d) => fs.readdirSync(d).sort();
const rootBefore = listing(root);
try {
    const g0 = await get();
    ok("!! GET reports every file missing, the total download, and the injected source", g0.ok && g0.missing === 3 && g0.present === 0 &&
       g0.missingBytes === good.length + holes.length + holed.length && g0.base === base && g0.source === FC.SOURCE_TEMPLATE,
       `missing ${g0.missing}, ${g0.missingBytes} bytes, base ${g0.base}`);
    const p1 = await post({});
    const by = Object.fromEntries((p1.results || []).map((r) => [r.name, r]));
    const kept = (n) => fs.existsSync(path.join(dir, n));
    ok("!! *** a missing file is installed, and what landed IS the manifest's bytes ***",
       by["frameGate-cache.json.gz"] && by["frameGate-cache.json.gz"].ok && kept("frameGate-cache.json.gz") &&
       sha(fs.readFileSync(path.join(dir, "frameGate-cache.json.gz"))) === fixtureManifest.files[0].sha256,
       J(by["frameGate-cache.json.gz"] || null).slice(0, 160));
    ok("!! *** a corrupted file (right length, wrong bytes) is NOT kept, and says sha256 ***",
       by["frameHoles-cache.json.gz"] && !by["frameHoles-cache.json.gz"].ok && !kept("frameHoles-cache.json.gz") && /sha256/.test(by["frameHoles-cache.json.gz"].why),
       J(by["frameHoles-cache.json.gz"] || null).slice(0, 200));
    ok("!! *** a short file is NOT kept either ***",
       by["frameHoled-cache.json.gz"] && !by["frameHoled-cache.json.gz"].ok && !kept("frameHoled-cache.json.gz"),
       J(by["frameHoled-cache.json.gz"] || null).slice(0, 200));
    ok("!! no temp file is left behind, and the POST said it was not ok", !listing(dir).some((n) => /\.part-/.test(n)) && p1.ok === false,
       listing(dir).join(", "));
    asked.length = 0;
    const p2 = await post({ files: ["notInManifest.json", "../sibling.txt", "frameGate-cache.json.gz"] });
    const r2 = Object.fromEntries((p2.results || []).map((r) => [r.name, r]));
    ok("!! *** a name outside the manifest is refused and NEVER fetched ***",
       r2["notInManifest.json"] && r2["notInManifest.json"].refused && r2["../sibling.txt"] && r2["../sibling.txt"].refused &&
       !asked.includes("notInManifest.json") && !asked.includes("sibling.txt") && r2["frameGate-cache.json.gz"] && r2["frameGate-cache.json.gz"].already,
       `fixture server was asked for: [${asked.join(", ")}]`);
    // A manifest entry that tries to leave the folder -- the manifest is a file on disk, so it is not trusted either.
    fs.writeFileSync(path.join(dir, FC.MANIFEST_NAME), JSON.stringify({ files: [...fixtureManifest.files,
        { name: "../escape.json", bytes: served["escape.json"].length, sha256: sha(served["escape.json"]), what: "hostile", readers: [] }] }));
    asked.length = 0;
    const p3 = await post({ files: ["../escape.json"] });
    const r3 = (p3.results || []).find((r) => r.name === "../escape.json");
    ok("!! *** a manifest entry that would escape the folder is refused ***", !!r3 && r3.ok === false && !asked.includes("escape.json") &&
       !fs.existsSync(path.join(root, "escape.json")), J(r3 || null).slice(0, 160));
    fs.writeFileSync(path.join(dir, FC.MANIFEST_NAME), JSON.stringify(fixtureManifest));
    ok("!! *** nothing was written outside the folder ***", J(listing(root)) === J(rootBefore) &&
       fs.readFileSync(path.join(root, "sibling.txt"), "utf8") === "outside the folder\n", `root holds ${listing(root).join(", ")}`);
    // The server now serves the right bytes: a re-POST repairs both, through the fetch transport this time.
    served["frameHoles-cache.json.gz"] = holes; served["frameHoled-cache.json.gz"] = holed;
    transport = "fetch";
    const p4 = await post({});
    ok("!! once the source is right, a re-POST installs the rest (fetch transport; the first pass used curl when present)",
       p4.ok === true && p4.present === 3 && p4.missing === 0, `present ${p4.present}, missing ${p4.missing}`);
    transport = "auto";

    // ---------------------------------------------------------------------------------------------------------
    console.log("\n5. *** STATUS: PRESENT, MISSING, BAD -- AND BAD MEANS THE HASH ***");
    const flip = Buffer.from(holes); flip[10] ^= 1;
    fs.writeFileSync(path.join(dir, "frameHoles-cache.json.gz"), flip);
    fs.rmSync(path.join(dir, "frameHoled-cache.json.gz"));
    const s = FC.status({ dir, manifest: fixtureManifest });
    const stOf = (n) => (s.files.find((f) => f.name === n) || {}).state;
    ok("!! a good file reads present", stOf("frameGate-cache.json.gz") === "present");
    ok("!! a deleted file reads missing", stOf("frameHoled-cache.json.gz") === "missing");
    ok("!! *** same-size corruption reads bad -- the size alone would have called it present ***", stOf("frameHoles-cache.json.gz") === "bad",
       (s.files.find((f) => f.name === "frameHoles-cache.json.gz") || {}).why || "");
    const g5 = await get();
    ok("!! GET agrees, and counts the bad file's bytes as still to download", g5.present === 1 && g5.missing === 1 && g5.bad === 1 &&
       g5.missingBytes === holes.length + holed.length, `present ${g5.present}, missing ${g5.missing}, bad ${g5.bad}, ${g5.missingBytes} bytes`);
    const p5 = await post({});
    ok("!! and a POST repairs the bad one and fetches the missing one", p5.ok && p5.present === 3 &&
       sha(fs.readFileSync(path.join(dir, "frameHoles-cache.json.gz"))) === sha(holes));
} finally {
    bridge.close(); fixture.close();
    fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------
console.log("\n6. *** THE BRIDGE ROUTE, THE PAGE, AND WHERE IT IS LINKED ***");
{
    const srv = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8"));
    ok("!! ai-bridge/server.js forwards GET and POST /install/fsr-caches to fsrCaches.handleRoute",
       /\/install\/fsr-caches"[^\n]*GET[^\n]*POST/.test(srv) && /import\("\.\.\/tools\/ship\/fsrCaches\.mjs"\)\s*\.then\(\(m\) => m\.handleRoute\(req, res, \{ sendJson \}\)\)/.test(srv));
    const page = fs.readFileSync(path.join(ENG, FC.INSTALL_PAGE), "utf8");
    ok("!! install-fsr-caches.html reads GET and POSTs the same route, and downloads nothing on load",
       /api\("\/install\/fsr-caches"\)/.test(page) && /api\("\/install\/fsr-caches", \{ method: "POST"/.test(page) && /<title>[^<]+<\/title>/.test(page));
    const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const a = /<a href="\/install-fsr-caches\.html"[^>]*title="([^"]{40,})"[^>]*>/.exec(html);
    ok("!! server.html carries an anchor for it with a hand-written title", !!a, a ? a[1].slice(0, 80) + "..." : "no anchor");
    const PS = await import("./pageSections.mjs");
    const claim = PS.SECTIONS.filter((x) => x.pages.includes(FC.INSTALL_PAGE));
    ok("!! pageSections claims it in a drawer inside MAX_PER_PANEL", claim.length >= 1 && claim.every((x) => x.pages.length <= PS.MAX_PER_PANEL),
       claim.map((x) => `${x.id} (${x.pages.length}/${PS.MAX_PER_PANEL})`).join(", "));
}

console.log(`\nfsrCaches-selfcheck: ${fails ? fails + " FAILED" : "ALL PASS"}`);
process.exit(fails ? 1 : 0);
