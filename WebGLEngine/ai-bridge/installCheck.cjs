// FILE: /ai-bridge/installCheck.cjs
// ---------------------------------------------------------------------------
// v470 — pure derivation + filesystem-check logic for the install panel's
// disk verification. Extracted from server.js so it's unit-testable without
// standing up the whole HTTP/WS bridge. Server.js requires this and supplies
// the live comfyRoot + pip set.
//
//   node-*   → custom_nodes/<folder> exists   (folder parsed from cmds)
//   py-*     → every parsed pip package present in the pip list
//   model-*  → only when the entry carries an explicit checkPath
//   patch-*  → never (edits inside files) → "unknown"
//
// "unknown" is intentionally distinct from "missing" — we only report missing
// when absence was positively verified.
// ---------------------------------------------------------------------------
const fs   = require("fs");
const path = require("path");

function nodeFolderFromCmds(cmds) {
    for (const c of (cmds || [])) {
        let m = /Test-Path\s+['"]([^'"]+)['"]/i.exec(c);
        if (m) return m[1];
        m = /git\s+clone\s+\S+\s+([^\s'"}]+)/i.exec(c);   // explicit destination folder
        if (m) return m[1];
        m = /git\s+clone\s+(\S+)/i.exec(c);               // derive from repo URL basename
        if (m) {
            const base = m[1].replace(/\.git\b.*$/, "").split(/[\\/]/).pop();
            if (base) return base;
        }
    }
    return null;
}

function pyPkgsFromCmds(cmds) {
    const pkgs = [];
    for (const c of (cmds || [])) {
        const m = /pip\s+install\s+(.+)$/i.exec(String(c).trim());
        if (!m) continue;
        for (let tok of m[1].split(/\s+/)) {
            tok = tok.replace(/^["']|["']$/g, "");   // strip surrounding quotes
            if (tok.startsWith("-")) {
                if (/^-r$/i.test(tok)) return null;   // requirements.txt — opaque
                continue;                              // other flag
            }
            // Wheel file or URL → derive the package name from the wheel
            // filename (e.g. nvdiffrast-0.3.1-py3-none-any.whl → nvdiffrast),
            // so a "pip install <wheel-url>" item is still verifiable.
            const base = tok.split(/[\\/]/).pop();
            const whl = /^([A-Za-z0-9][A-Za-z0-9._]*?)-\d.*\.whl$/i.exec(base);
            if (whl) { pkgs.push(whl[1].toLowerCase().replace(/[_.]/g, "-")); continue; }
            if (/[\\/]/.test(tok) || /^https?:/i.test(tok)) continue;   // other path/url
            tok = tok.replace(/\[.*?\]/, "").replace(/[<>=!~].*$/, "").trim();
            if (tok) pkgs.push(tok.toLowerCase().replace(/[_.]/g, "-"));
        }
    }
    return pkgs.length ? pkgs : null;
}

// pipSet: a Set of normalized package names, or null if pip couldn't be read.
function checkInstallItem(id, entry, comfyRoot, pipSet) {
    if (!entry) return "unknown";
    if (entry.ping)   return "ping";
    // v471 — an explicit checkPath is disk truth and wins even over `manual`:
    // a model that needs a manual token download is still "installed" once the
    // file is actually on disk. (Answers "I thought I installed these?")
    if (entry.checkPath) {
        const p = path.isAbsolute(entry.checkPath) ? entry.checkPath : path.join(comfyRoot, entry.checkPath);
        try { return fs.existsSync(p) ? "installed" : "missing"; } catch { return "unknown"; }
    }
    if (entry.manual) return "manual";
    if (id.startsWith("node-")) {
        const folder = nodeFolderFromCmds(entry.cmds);
        if (!folder) return "unknown";
        const p = path.join(comfyRoot, "ComfyUI", "custom_nodes", folder);
        try { return fs.existsSync(p) ? "installed" : "missing"; } catch { return "unknown"; }
    }
    if (id.startsWith("py-")) {
        const pkgs = pyPkgsFromCmds(entry.cmds);
        if (!pkgs || !pipSet) return "unknown";
        return pkgs.every(pk => pipSet.has(pk)) ? "installed" : "missing";
    }
    return "unknown";   // model-* w/o checkPath, patch-*, flag-*
}

// v560 — resolve the single on-disk target whose size best approximates an
// item's install footprint, for GET /install/size. checkPath wins; for a
// package-marker file (__init__.py / _C.pyd) size the PARENT package dir.
// node-* → the cloned custom_nodes folder. py-* without checkPath, patch-*,
// flag-* → null (pip files are scattered/shared; not a clean single target).
function sizeTargetPath(id, entry, comfyRoot) {
    if (entry && entry.checkPath) {
        let p = path.isAbsolute(entry.checkPath) ? entry.checkPath : path.join(comfyRoot, entry.checkPath);
        // separator-agnostic basename (checkPaths may use / or \)
        const base = String(p).replace(/\\/g, "/").split("/").pop().toLowerCase();
        if (base === "__init__.py" || base === "_c.pyd") {
            const norm = String(p).replace(/\\/g, "/");
            p = norm.slice(0, norm.length - base.length - 1);  // strip "/<base>"
        }
        return p;
    }
    const folder = nodeFolderFromCmds(entry && entry.cmds);
    if (folder) return path.join(comfyRoot, "ComfyUI", "custom_nodes", folder);
    return null;
}

module.exports = { nodeFolderFromCmds, pyPkgsFromCmds, checkInstallItem, sizeTargetPath };
