// printingPressBridge.js — v1136
// Browses the Printing Press Library catalog (mvanhorn/printing-press-library) and
// runs installed pp-CLIs. The Printing Press is an agent-native CLI generator; the
// library is its published catalog of ~85+ ready CLIs (each <api>-pp-cli, with a local
// SQLite mirror + MCP server). This bridge fetches the catalog and can shell out to a
// CLI the user has already installed (go install / npx). MIT, by Matt Van Horn.

const { spawn } = require("child_process");

const REGISTRY_URL = "https://raw.githubusercontent.com/mvanhorn/printing-press-library/main/registry.json";
let _cache = null, _cacheAt = 0;

async function catalog(opts = {}) {
    if (!opts.refresh && _cache && (Date.now() - _cacheAt) < 3600e3) return _cache;
    let raw;
    try { const r = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(12000) }); if (!r.ok) return { ok: false, error: "registry HTTP " + r.status }; raw = await r.json(); }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
    const entries = (raw.entries || []).map(e => ({
        name: e.name || e.api || "", api: e.api || "", category: e.category || "other",
        description: e.description || "", mcp: !!e.mcp, creator: (typeof e.creator === "string" ? e.creator : (e.creator && (e.creator.name || e.creator.handle)) || e.printer_name || ""),
        search: [(e.name || ""), (e.api || ""), (e.description || ""), ...(Array.isArray(e.search_terms) ? e.search_terms : [])].join(" ").toLowerCase(),
    }));
    const categories = {};
    for (const e of entries) (categories[e.category] = categories[e.category] || []).push(e.name);
    _cache = { ok: true, count: entries.length, schema: raw.schema_version || null, entries, categories: Object.keys(categories).sort() };
    _cacheAt = Date.now();
    return _cache;
}

// Run an installed pp-CLI (spawn, no shell — args passed as an array, so no injection).
// The binary is conventionally "<api>-pp-cli". rig-verify: requires the CLI on PATH.
function run(api, args, timeoutMs) {
    return new Promise((resolve) => {
        if (!api) return resolve({ ok: false, error: "api/cli name required" });
        const bin = /-pp-cli$/.test(api) ? api : (api + "-pp-cli");
        const argv = Array.isArray(args) ? args.map(String) : (args ? String(args).split(/\s+/).filter(Boolean) : ["--help"]);
        let out = "", err = "", done = false, child;
        const finish = (o) => { if (done) return; done = true; try { child && child.kill(); } catch {} resolve(o); };
        const t = setTimeout(() => finish({ ok: false, error: "timed out", stdout: out.slice(0, 4000), stderr: err.slice(0, 1000) }), Math.min(timeoutMs || 30000, 120000));
        try { child = spawn(bin, argv, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ ok: false, error: "spawn: " + e.message }); }
        child.stdout.on("data", d => { out += d; if (out.length > 200000) out = out.slice(-200000); });
        child.stderr.on("data", d => { err += d; if (err.length > 40000) err = err.slice(-40000); });
        child.on("error", e => { clearTimeout(t); finish({ ok: false, error: bin + ": " + e.message + " (is it installed + on PATH?)" }); });
        child.on("close", code => { clearTimeout(t); finish({ ok: code === 0, code, bin, stdout: out.slice(0, 12000), stderr: err.slice(0, 4000) }); });
    });
}

module.exports = { catalog, run, REGISTRY_URL };
