// ai-bridge/workbookBridge.js - v1124
// Assemble a folder of VBA source modules (.bas/.cls/.frm) into a real workbook
// (.xlsm / .xlsb / .xlsx) via Excel COM + the VBE. openpyxl can't build a VBA
// project from source - Excel can, so this shells out to assemble-workbook.vbs.
// listVbaFolders() auto-discovers the project's VBA module folders for the UI.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ENGINE_ROOT = path.resolve(__dirname, "..");        // WebGLEngine/
const PROJECT_ROOT = path.resolve(ENGINE_ROOT, "..");     // EngineProject_vNNN/
const VBS = path.join(__dirname, "assemble-workbook.vbs");
const VBA_EXT = new Set([".bas", ".cls", ".frm"]);

const ERR_MAP = {
    "usage": "internal: bad arguments",
    "no-folder": "source folder not found",
    "no-excel": "couldn't start Excel (is Excel installed?)",
    "vba-trust": "Excel blocked VBA access \u2014 enable Options \u203A Trust Center \u203A Macro Settings \u203A \u201CTrust access to the VBA project object model\u201D, then retry",
    "save-failed": "Excel couldn't save the workbook",
};

function _countVba(dir) {
    let n = 0;
    try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isFile() && VBA_EXT.has(path.extname(e.name).toLowerCase())) n++; } catch {}
    return n;
}

// Walk the project tree (bounded) and return every folder that directly holds
// VBA source files, newest-largest first.
function listVbaFolders() {
    const found = [];
    const seen = new Set();
    const walk = (dir, depth) => {
        if (depth > 4 || found.length > 80) return;
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        const c = _countVba(dir);
        if (c > 0 && !seen.has(dir)) { seen.add(dir); found.push({ path: dir, name: path.relative(PROJECT_ROOT, dir) || path.basename(dir), count: c }); }
        for (const e of ents) {
            if (!e.isDirectory()) continue;
            const nm = e.name;
            if (nm === "node_modules" || nm === ".git" || nm === "__pycache__" || nm.startsWith("EngineProject_")) continue;
            walk(path.join(dir, nm), depth + 1);
        }
    };
    walk(PROJECT_ROOT, 0);
    found.sort((a, b) => b.count - a.count);
    return { ok: true, projectRoot: PROJECT_ROOT, folders: found };
}

function assemble({ srcDir, out, format } = {}) {
    return new Promise((resolve) => {
        if (process.platform !== "win32") return resolve({ ok: false, error: "workbook assembly needs Windows + Excel" });
        if (!srcDir || !fs.existsSync(srcDir)) return resolve({ ok: false, error: "pick a VBA source folder first" });
        const fmt = ["xlsm", "xlsb", "xlsx"].includes(String(format || "").toLowerCase()) ? String(format).toLowerCase() : "xlsm";
        let outPath = (out || "").trim();
        if (!outPath) outPath = path.join(srcDir, path.basename(srcDir) + "." + fmt);
        else if (!/\.(xlsm|xlsb|xlsx)$/i.test(outPath)) outPath += "." + fmt;

        let so = "", se = "", done = false, child;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ ok: false, error: "assembly timed out (is an Excel dialog open?)" }); }, 120000);
        try { child = spawn("cscript", ["//NoLogo", "//B", VBS, srcDir, outPath, fmt], { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "couldn't run cscript: " + e.message }); }
        child.stdout.on("data", d => so += d);
        child.stderr.on("data", d => se += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, error: String(e && e.message) }); });
        child.on("close", () => {
            if (done) return; done = true; clearTimeout(t);
            const line = (so.trim().split(/\r?\n/).pop() || "").trim();
            if (line.startsWith("OK:")) {
                const p = line.split(":"); const imported = +p[1] || 0, skipped = +p[2] || 0;
                const savedPath = line.slice(("OK:" + imported + ":" + skipped + ":").length);
                return resolve({ ok: true, imported, skipped, path: savedPath, format: fmt, droppedMacros: fmt === "xlsx" && imported > 0 });
            }
            if (line.startsWith("ERROR:")) {
                const code = line.slice("ERROR:".length).split(":")[0];
                return resolve({ ok: false, error: ERR_MAP[code] || line, code });
            }
            resolve({ ok: false, error: (se || line || "assembly failed").slice(0, 240) });
        });
    });
}

module.exports = { assemble, listVbaFolders, PROJECT_ROOT };
