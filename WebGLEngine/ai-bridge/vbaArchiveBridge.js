// FILE: ai-bridge/vbaArchiveBridge.js
// VERSION: v4159 -- link the VBA archive into this install, and drive the workbook once it is linked.
//
// *** THE ARCHIVE IS NOT IN THIS REPOSITORY AND THIS BRIDGE NEVER PUTS IT THERE. *** Keith's VBA half was
// started before any of this -- the transmitter, the OpenGL render engine, the connector workbook -- and the
// root README has said for hundreds of versions that those module folders "ship separately". This links to a
// copy on the machine. It does not copy one in.
//
// WHY A POINTER AND NOT A COPY. Copying 189 transmitter modules into this tree would FORK them: the archive
// stays the thing Keith edits, this tree gets a snapshot, and the two drift silently until somebody wonders
// which one the workbook was built from. A pointer cannot drift. It can go stale -- the folder can move or be
// deleted -- and that is a condition this reports rather than one it hides, because a broken pointer announces
// itself the first time you look at it while a stale copy never does.
//
// *** WHAT IS WRITTEN, AND WHERE. *** One file, `vba-archive.local.json`, beside host-timings.local.json and
// gitignored the same way. Deleting it unlinks the archive and nothing else changes. Nothing is EVER written
// inside the archive: it is opened read-only, and a bridge that could write into the source of the workbooks
// is a bridge that could damage the one copy of work started years before this engine existed.
//
// EXTRACTION IS THE ONE WRITE, AND IT NEVER TARGETS THIS TREE. A zip lands in ~/.voxelbridge/vba/<name>, which
// is the same out-of-tree location repoTerrainBridge already allowlists for checkouts. Extracting into the
// repository would put a 189-module VBA project inside a tree whose gates walk every file in it.
//
// *** MACRO EXECUTION IS AN ALLOWLIST, NOT A DENYLIST -- the same call iosDeviceBridge made and for the same
// reason. *** Application.Run takes any name; VBA can delete files, reach the network and drive COM. A
// denylist of dangerous macro names would be correct exactly until the archive gained the next one. So this
// runs THE ENGINE'S OWN ENTRY POINTS BY NAME and refuses everything else, including anything a caller invents.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const cp = require("node:child_process");

const PREFIX = "/vba";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const ENGINE = path.resolve(__dirname, "..");          // .../WebGLEngine
const REPO   = path.resolve(ENGINE, "..");             // .../SweK_Engine
const PARENT = path.resolve(REPO, "..");
const VOXEL  = path.join(os.homedir(), ".voxelbridge");
const VBA_HOME = path.join(VOXEL, "vba");              // where an extracted zip lands
const LINK = path.join(ENGINE, "tools", "ship", "vba-archive.local.json");

const MAX_DEPTH = 4;          // an archive nests addons/VBAOpenGL_Demos/ -- three is not quite enough
const MAX_FOLDERS = 400;      // a bound, so a wrong root cannot walk a whole disk

// The manifest is ESM and this file is CommonJS, so it is imported once, lazily, and cached. A dynamic import
// inside a request handler that ran on every call would re-resolve the module graph per request.
let _manifest = null;
async function manifest() {
    if (!_manifest) _manifest = await import("../vba/archiveManifest.mjs");
    return _manifest;
}

// ---------------------------------------------------------------------------------------------------------
// The link file
// ---------------------------------------------------------------------------------------------------------
function readLink() {
    try { return JSON.parse(fs.readFileSync(LINK, "utf8")); } catch { return null; }
}
function writeLink(data) {
    try {
        fs.mkdirSync(path.dirname(LINK), { recursive: true });
        fs.writeFileSync(LINK, JSON.stringify({
            note: "LOCAL POINTER TO THE VBA ARCHIVE. Not shipped -- the archive is not in this repository and " +
                  "this file only says where a copy lives on this machine. Delete it to unlink; nothing else changes.",
            ...data,
        }, null, 1));
        return true;
    } catch { return false; }
}

// ---------------------------------------------------------------------------------------------------------
// Walking a root
// ---------------------------------------------------------------------------------------------------------
const SKIP = new Set([".git", "node_modules", ".svn", ".hg", "__pycache__", ".venv", "venv", ".cache",
                      "dist", "build", "out", "target", ".gradle", "obj", "bin"]);

/** Every folder under `root` that DIRECTLY holds VBA source, with its module names. Depth- and count-bounded. */
function vbaFolders(root, { maxDepth = MAX_DEPTH, maxFolders = MAX_FOLDERS } = {}) {
    const out = [];
    const walk = (dir, depth) => {
        if (depth > maxDepth || out.length >= maxFolders) return;
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        const modules = [];
        for (const e of ents) if (e.isFile() && /\.(bas|cls|frm)$/i.test(e.name)) modules.push(e.name);
        if (modules.length) out.push({ dir, name: path.basename(dir), modules });
        for (const e of ents) {
            if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith(".")) continue;
            walk(path.join(dir, e.name), depth + 1);
        }
    };
    walk(path.resolve(root), 0);
    return out;
}

/** Walk a root and classify what is in it. Pure read -- `scan` never writes the link file. */
async function scan(root) {
    const M = await manifest();
    const abs = path.resolve(String(root || "").trim());
    if (!abs || !fs.existsSync(abs)) return { ok: false, error: "not-found", root: abs, message: "no folder there" };
    let stat; try { stat = fs.statSync(abs); } catch { return { ok: false, error: "not-found", root: abs }; }
    if (!stat.isDirectory()) return { ok: false, error: "not-a-folder", root: abs, message: "point at a folder, not a file" };

    const found = vbaFolders(abs).map((f) => {
        const c = M.classifyFolder({ name: f.name, modules: f.modules });
        return { dir: f.dir, name: f.name, rel: path.relative(abs, f.dir) || ".", ...c,
                 // A SAMPLE, not the listing. A folder's full module names are the archive's business; five
                 // are enough to recognise it on the page and to say why a classification went the way it did.
                 sample: f.modules.slice(0, 5) };
    });
    const report = M.linkReport(found);
    return { ...report, root: abs, folders: found.length };
}

/** Roots worth offering without the user typing a path: where an extracted zip lands, and this repo's siblings. */
function candidateRoots() {
    const out = [];
    const push = (dir, why) => { try { if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) out.push({ dir, why }); } catch {} };
    push(VBA_HOME, "where this bridge extracts an archive zip");
    push(REPO, "this repository -- holds the in-tree fragments (Shared/, WebGLEngine/vba/), not the archive");
    push(PARENT, "the folder holding this repository -- a sibling archive would be here");
    push(path.join(os.homedir(), "Downloads"), "where a downloaded zip usually lands");
    return out;
}

// ---------------------------------------------------------------------------------------------------------
// Extracting the zip
// ---------------------------------------------------------------------------------------------------------
/**
 * Extract an archive zip into ~/.voxelbridge/vba/<name>. `unzip` first, `tar -xf` as the fallback -- which is
 * what covers Keith's box, since Windows 10 1803 ships bsdtar as `tar` and does not ship unzip.
 *
 * THE DESTINATION IS NOT A PARAMETER. Taking one would make this a general-purpose "write these bytes wherever
 * I say" endpoint reachable by anything that can POST to the bridge, and a zip can carry `../` in its entries.
 */
function extractZip(zipPath) {
    const abs = path.resolve(String(zipPath || "").trim());
    if (!abs || !fs.existsSync(abs)) return { ok: false, error: "no zip at that path" };
    if (!/\.zip$/i.test(abs)) return { ok: false, error: "expected a .zip" };
    const dest = path.join(VBA_HOME, path.basename(abs).replace(/\.zip$/i, ""));
    try { fs.mkdirSync(dest, { recursive: true }); } catch (e) { return { ok: false, error: "couldn't create " + dest + ": " + e.message }; }
    let r = cp.spawnSync("unzip", ["-o", "-q", abs, "-d", dest], { timeout: 600000 });
    if (r.error || r.status !== 0) r = cp.spawnSync("tar", ["-xf", abs, "-C", dest], { timeout: 600000 });
    if (r.error || r.status !== 0) {
        return { ok: false, error: "extract failed (tried unzip, then tar)", detail: String((r.stderr || "")).slice(0, 300) };
    }
    return { ok: true, dest };
}

// ---------------------------------------------------------------------------------------------------------
// Driving the workbook
// ---------------------------------------------------------------------------------------------------------
/**
 * *** THE ALLOWLIST. *** Each entry is an entry point this tree can point at a line that documents it, and the
 * `why` is shown on the page so a button never says only "Run". Anything not here is refused BY NAME, so
 * adding a macro to the archive does not silently add a button to this engine.
 */
const MACROS = [
    { name: "StartEngineDemo", part: "transmitter", why: "start the transmitter's HTTP + WebSocket servers so it hosts the panels with Node down (VBATransmitter/modWebGLEngineHost.bas)" },
    { name: "StopEngineDemo",  part: "transmitter", why: "stop those servers and release the port" },
    { name: "Init",            part: "engine",      why: "the render workbook's own boot -- what Workbook_Open calls (modInit.Init, per the README's import recipe)" },
    { name: "InstallHAPanel",  part: "engine",      why: "the Install HA Panel sheet button -- opens the My Home Assistant add-on redirect (modHAInstall.bas)" },
    { name: "Raycaster_Start", part: "connector",   why: "the GPU-brain raycaster demo: walls render and enemies chase (WebGLEngine/vba/modRaycasterDemo.bas)" },
    { name: "BridgeTick",      part: "connector",   why: "one bridge tick by hand -- POST the entity state to /bridge/game_tick and drain the directives (Shared/modEngineBridge.bas)" },
    { name: "ResolveBridgeHost", part: "connector", why: "re-probe Node :8787 then the transmitter :8099 and repoint the workbook at whichever answers" },
];
const MACRO_NAMES = new Set(MACROS.map((m) => m.name));

const RUN_VBS = path.join(__dirname, "run-macro.vbs");
const RUN_ERR = {
    "usage": "internal: bad arguments",
    "no-book": "workbook not found",
    "no-excel": "couldn't start Excel (is Excel installed?)",
    "no-macro": "Excel has no macro by that name in that workbook",
    "run-failed": "the macro raised an error -- check Excel",
};

/** Run one allowlisted macro in a workbook. Windows + Excel only, and it says so rather than pretending. */
function runMacro({ book, macro } = {}) {
    return new Promise((resolve) => {
        // *** THE ALLOWLIST IS CHECKED BEFORE THE PLATFORM, AND THE ORDER IS LOAD-BEARING. *** The first draft
        // returned "needs Windows + Excel" first, which made the refusal UNTESTABLE ON THE BOX THIS WAS
        // WRITTEN ON: every gate assertion about the allowlist would have been answered by the platform check
        // instead, and excel.html's claim that "the allowlist and every refusal still answer" would have been
        // false on the one machine that could check it. A refusal by name does not depend on the platform, so
        // it does not wait for it.
        const name = String(macro || "").trim();
        if (!MACRO_NAMES.has(name)) {
            return resolve({ ok: false, error: "not on the allowlist: " + (name || "(empty)"), allowed: [...MACRO_NAMES] });
        }
        if (process.platform !== "win32") return resolve({ ok: false, error: "running a macro needs Windows + Excel" });
        const wb = path.resolve(String(book || "").trim());
        if (!wb || !fs.existsSync(wb)) return resolve({ ok: false, error: "pick a workbook first" });
        let so = "", se = "", done = false, child;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: "macro timed out (is an Excel dialog open?)" }); }, 120000);
        try { child = cp.spawn("cscript", ["//NoLogo", "//B", RUN_VBS, wb, name], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "couldn't run cscript: " + e.message }); }
        child.stdout.on("data", (d) => so += d);
        child.stderr.on("data", (d) => se += d);
        child.on("error", (e) => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: String(e && e.message) }); });
        child.on("close", () => {
            if (done) return; done = true; clearTimeout(t);
            const line = (so.trim().split(/\r?\n/).pop() || "").trim();
            if (line.startsWith("OK:")) return resolve({ ok: true, macro: name, book: wb, result: line.slice(3) });
            if (line.startsWith("ERROR:")) {
                const code = line.slice(6).split(":")[0];
                return resolve({ ok: false, error: RUN_ERR[code] || line, code });
            }
            resolve({ ok: false, error: (se || line || "macro run failed").slice(0, 240) });
        });
    });
}

// ---------------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------------
async function state() {
    const M = await manifest();
    const link = readLink();
    if (!link || !link.root) {
        return { ...M.linkReport([]), linked: false, root: null, candidates: candidateRoots(),
                 macros: MACROS, excel: process.platform === "win32",
                 hint: "nothing linked yet. Point this at a folder holding the archive, or extract its zip." };
    }
    const s = await scan(link.root);
    // A pointer whose folder is gone is STALE, and it says so. The alternative -- quietly reporting "not
    // linked" -- is the same lie a stale copy tells, in the other direction.
    if (!s.ok) return { ...M.linkReport([]), linked: false, root: link.root, stale: true, candidates: candidateRoots(),
                        macros: MACROS, excel: process.platform === "win32",
                        hint: "the linked folder is gone: " + link.root };
    return { ...s, linkedAt: link.at || null, candidates: candidateRoots(), macros: MACROS,
             excel: process.platform === "win32" };
}

async function handle(req, res, ctx) {
    const sendJson = ctx && ctx.sendJson, readJson = ctx && ctx.readJson;
    const [route] = String(req.url || "").split("?");

    if (req.method === "GET" && (route === PREFIX || route === PREFIX + "/state")) { sendJson(await state()); return; }
    if (req.method === "GET" && route === PREFIX + "/manifest") {
        const M = await manifest();
        sendJson({ ok: true, provisional: M.PROVISIONAL, minDecisive: M.MIN_DECISIVE, parts: M.PARTS, macros: MACROS });
        return;
    }
    if (req.method === "POST" && route === PREFIX + "/scan") {
        readJson(async (d) => { try { sendJson(await scan((d && d.root) || "")); } catch (e) { sendJson({ ok: false, error: String(e && e.message || e) }, 500); } });
        return;
    }
    if (req.method === "POST" && route === PREFIX + "/link") {
        readJson(async (d) => {
            try {
                const s = await scan((d && d.root) || "");
                if (!s.ok) return sendJson(s, 400);
                // *** LINKING A ROOT WITH NOTHING IN IT IS REFUSED. *** Storing a pointer to a folder holding
                // no recognised part would leave the page saying "linked" over an empty report, which reads as
                // "the archive is here and empty" rather than "you pointed at the wrong folder".
                if (!s.linked && !s.unclassified.length) {
                    return sendJson({ ...s, ok: false, error: "no VBA source found under that folder -- not linking it" }, 400);
                }
                const wrote = writeLink({ root: s.root, at: new Date().toISOString(), present: s.present });
                sendJson({ ...s, saved: wrote, linkFile: LINK });
            } catch (e) { sendJson({ ok: false, error: String(e && e.message || e) }, 500); }
        });
        return;
    }
    if (req.method === "POST" && route === PREFIX + "/unlink") {
        try { fs.unlinkSync(LINK); } catch {}
        sendJson({ ok: true, ...(await state()) });
        return;
    }
    if (req.method === "POST" && route === PREFIX + "/extract") {
        readJson(async (d) => {
            try {
                const r = extractZip((d && d.zip) || "");
                if (!r.ok) return sendJson(r, 400);
                sendJson({ ...(await scan(r.dest)), extractedTo: r.dest });
            } catch (e) { sendJson({ ok: false, error: String(e && e.message || e) }, 500); }
        });
        return;
    }
    if (req.method === "POST" && route === PREFIX + "/run") {
        readJson(async (d) => { try { sendJson(await runMacro(d || {})); } catch (e) { sendJson({ ok: false, error: String(e && e.message || e) }, 500); } });
        return;
    }
    sendJson({ ok: false, error: "unknown route",
               routes: [PREFIX + "/state", PREFIX + "/manifest", PREFIX + "/scan", PREFIX + "/link",
                        PREFIX + "/unlink", PREFIX + "/extract", PREFIX + "/run"] }, 404);
}

module.exports = { owns, handle, PREFIX, scan, state, readLink, writeLink, vbaFolders, candidateRoots,
                   extractZip, runMacro, MACROS, MACRO_NAMES, LINK, VBA_HOME, MAX_DEPTH, SKIP };
