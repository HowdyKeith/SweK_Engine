// FILE: ai-bridge/repoTerrainBridge.js
// VERSION: v4149 -- count a source tree so world/repoHeightfield.js can make ground out of it.
//
// This bridge does exactly one thing: walk a directory and return `[{ path, lines, bytes, binary }]`. It does
// NOT compute the terrain -- that is world/repoHeightfield.js, a pure ESM module the browser imports directly,
// which is what lets the gate exercise the mathematics without a server running.
//
// *** IT NEVER RETURNS FILE CONTENTS, AND IT WILL NOT WALK ANYWHERE IT LIKES. *** A line count is not a
// secret; a listing of every filename under $HOME is closer to one than it looks. Scannable roots are
// therefore an allowlist (this engine tree, its siblings -- which is where githubBridge's clone lands -- and
// ~/.voxelbridge), and a requested directory must resolve INSIDE one of them after realpath, so a symlink
// pointing out of an allowed root cannot be followed out of it.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PREFIX = "/repoterrain";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const ENGINE = path.resolve(__dirname, "..");            // .../WebGLEngine
const REPO   = path.resolve(ENGINE, "..");               // .../SweK_Engine
const PARENT = path.resolve(REPO, "..");                 // where cloneEngineSource drops checkouts
const VOXEL  = path.join(os.homedir(), ".voxelbridge");

// *** THE FIRST DRAFT ALLOWED THE WHOLE PARENT DIRECTORY, WHICH IS $HOME. *** The header two dozen lines up
// says a listing of every filename under $HOME is closer to a secret than it looks, and then allowedRoots()
// added PARENT itself -- so `?dir=/home/user/Documents` resolved inside an allowed root and would have been
// walked. The allowlist is now the REPOSITORIES, not the folders that contain them: this engine tree, plus
// each direct child of PARENT or ~/.voxelbridge that actually carries a .git. Scanning a subdirectory of one
// of those (WebGLEngine/render, say) still works, because containment is checked against the repo root.
function allowedRoots() {
    return listRoots().map((r) => ({ label: r.label, dir: r.path }));
}

function insideAllowed(abs) {
    let real; try { real = fs.realpathSync(abs); } catch { return null; }
    for (const r of allowedRoots()) {
        if (real === r.dir || real.startsWith(r.dir + path.sep)) return { real, root: r };
    }
    return null;
}

// Directories that are never a repository's own shape: its history, its vendored dependencies, its build
// output. Leaving node_modules in would make every JS repo the same mountain range -- somebody else's.
const SKIP_DIRS = new Set([".git", "node_modules", ".svn", ".hg", "dist", "build", "out", "target",
                           "__pycache__", ".venv", "venv", ".next", ".cache", "vendor", "Pods", ".gradle"]);

// Extensions we count by LINES. Everything else is sized by bytes and flagged `binary`, because a 4 MB PNG has
// no lines and pretending it has 4 million of them would make an asset folder the tallest thing in any repo.
const TEXT = new Set(("js mjs cjs ts tsx jsx json jsonc html htm css scss less md mdx txt py rb go rs c h cpp hpp cc " +
    "cs java kt swift m mm sh bash zsh ps1 bat cmd yml yaml toml ini cfg conf sql graphql vue svelte lua pl php " +
    "r jl scala clj ex exs erl hs ml fs vb vba bas cls frm glsl vert frag comp wgsl hlsl xml svg gitignore " +
    "dockerfile makefile cmake gradle properties env command bat awk sed csv tsv gitattributes " +
    "editorconfig npmrc nvmrc babelrc eslintrc prettierrc").split(" "));

const BYTES_PER_PSEUDO_LINE = 80;   // what one "line" of a binary is worth, so assets have mass but not summits
const MAX_READ = 8 * 1024 * 1024;   // above this, estimate rather than read -- a 500 MB file is not worth a pass

function isText(name) {
    // "Makefile" matches by whole name; ".gitignore" by its name WITHOUT the leading dot, which the first
    // draft got wrong -- lastIndexOf(".") is 0 there, so it fell through to the whole name ".gitignore" and
    // missed the "gitignore" entry, classifying every dotfile in every repo as binary.
    const base = name.toLowerCase().replace(/^\./, "");
    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot + 1) : base;
    return TEXT.has(ext);
}

function countLines(file, size) {
    if (size > MAX_READ) return { lines: Math.max(1, Math.ceil(size / BYTES_PER_PSEUDO_LINE)), estimated: true };
    let buf; try { buf = fs.readFileSync(file); } catch { return { lines: 1, estimated: true }; }
    let n = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++;
    if (buf.length && buf[buf.length - 1] !== 10) n++;    // a final line with no trailing newline is still a line
    return { lines: Math.max(1, n), estimated: false };
}

/**
 * Walk `dir` into the listing repoHeightfield() consumes.
 * @returns { ok, root, label, entries, files, lines, textFiles, binaryFiles, estimated, skippedDirs, truncated }
 */
function scanTree(dir, opts = {}) {
    const maxFiles = Math.max(1, Math.min(200000, Number(opts.maxFiles) || 20000));
    const includeBinary = opts.includeBinary !== false;
    const hit = insideAllowed(dir);
    if (!hit) return { ok: false, error: "not inside a scannable root", roots: allowedRoots().map((r) => r.dir) };
    const base = hit.real;
    let st; try { st = fs.statSync(base); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    if (!st.isDirectory()) return { ok: false, error: base + " is not a directory" };

    const entries = [];
    let files = 0, lines = 0, textFiles = 0, binaryFiles = 0, estimated = 0, skippedDirs = 0, skippedFiles = 0;
    let truncated = false;
    (function walk(abs, rel) {
        if (truncated) return;
        let list = [];
        try { list = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
        for (const e of list) {
            if (truncated) return;
            if (e.isSymbolicLink()) continue;                       // never followed: see the header
            if (e.isDirectory()) {
                if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) { skippedDirs++; continue; }
                walk(path.join(abs, e.name), rel ? rel + "/" + e.name : e.name);
                continue;
            }
            if (!e.isFile()) continue;
            const text = isText(e.name);
            if (!text && !includeBinary) { skippedFiles++; continue; }
            const full = path.join(abs, e.name);
            let size = 0; try { size = fs.statSync(full).size; } catch { continue; }
            if (size === 0) { skippedFiles++; continue; }           // an empty file is not a hill
            let n, est = false;
            if (text) { const c = countLines(full, size); n = c.lines; est = c.estimated; textFiles++; }
            else { n = Math.max(1, Math.ceil(size / BYTES_PER_PSEUDO_LINE)); est = true; binaryFiles++; }
            if (est) estimated++;
            entries.push({ path: rel ? rel + "/" + e.name : e.name, lines: n, bytes: size, binary: !text });
            files++; lines += n;
            if (files >= maxFiles) { truncated = true; return; }
        }
    })(base, "");

    return { ok: true, root: base, label: hit.root.label, entries, files, lines,
             textFiles, binaryFiles, estimated, skippedDirs, skippedFiles, truncated, maxFiles,
             bytesPerPseudoLine: BYTES_PER_PSEUDO_LINE };
}

/** Directories that are plausible scan targets right now, so the UI can offer real choices rather than a box. */
function listRoots() {
    const out = [];
    const seen = new Set();
    const push = (label, dir) => {
        let real; try { real = fs.realpathSync(dir); } catch { return; }
        if (seen.has(real)) return; seen.add(real);
        let isRepo = false; try { isRepo = fs.existsSync(path.join(real, ".git")); } catch {}
        out.push({ label, path: real, name: path.basename(real), isRepo });
    };
    push("engine", REPO);
    for (const dir of [PARENT, VOXEL]) {
        let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of list) {
            if (!e.isDirectory() || e.name.startsWith(".")) continue;
            const full = path.join(dir, e.name);
            try { if (fs.existsSync(path.join(full, ".git"))) push(dir === VOXEL ? "voxelbridge" : "sibling", full); } catch {}
        }
    }
    return out;
}

async function handle(req, res, ctx) {
    const sendJson = ctx && ctx.sendJson;
    const [route, qs] = String(req.url || "").split("?");
    const q = new URLSearchParams(qs || "");
    if (req.method === "GET" && route === PREFIX + "/roots") { sendJson({ ok: true, roots: listRoots() }); return; }
    if (req.method === "GET" && (route === PREFIX + "/scan" || route === PREFIX)) {
        const dir = (q.get("dir") || "").trim() || REPO;
        const r = scanTree(dir, { maxFiles: q.get("max"), includeBinary: q.get("binary") !== "0" });
        sendJson(r, r.ok ? 200 : 400);
        return;
    }
    sendJson({ ok: false, error: "unknown route", routes: [PREFIX + "/roots", PREFIX + "/scan?dir=…&max=…&binary=0|1"] }, 404);
}

module.exports = { owns, handle, PREFIX, scanTree, listRoots, allowedRoots, insideAllowed, isText, countLines,
                   SKIP_DIRS, TEXT, BYTES_PER_PSEUDO_LINE };
