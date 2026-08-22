// FILE: ai-bridge/traderBridge.js
// v968 — "What if we traded like they did?" demo backing.
//
// Two halves:
//  1) WHO TRADED WHAT — pull publicly-disclosed politician stock trades (STOCK
//     Act / Periodic Transaction Reports). Default source is the free, no-key
//     senate-stock-watcher data on GitHub (Senate only; House Stock Watcher's
//     S3 went 403 in early 2026). Optional Finnhub / FMP sources if a key is set
//     (fresher + both chambers). NOTE: disclosures lag the actual trade by up to
//     30–45 days, so "mirroring" is never real-time — this is a demo/education
//     lens, not investment advice.
//  2) THE THINKING — TradingAgents (TauricResearch, LangGraph multi-agent LLM
//     firm) runs LOCALLY on Ollama and debates a ticker into a buy/sell/hold
//     verdict + reasoning. This bridge detects / installs / uninstalls it
//     (git clone + pip install .) and runs it headless on a ticker, so the
//     engine can show "the Senator bought NVDA — here's what our agents think."
//
// Owner-gated (sits behind the v961 auth gate). Repo URL + tools are fixed
// (no injection from request fields).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
let aiProviders = null, aiCreds = null;
try { aiProviders = require("./aiProviders.js"); aiCreds = require("./aiCreds.js"); } catch {}

const WIN = process.platform === "win32";
const CFG_PATH = process.env.TRADER_CONFIG || path.join(os.homedir(), ".voxelbridge", "trader.json");
const TA_REPO = "https://github.com/TauricResearch/TradingAgents.git";
const SENATE_URL = "https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/master/aggregate/all_transactions.json";

const DEFAULTS = {
    source: "senate",                 // "senate" | "finnhub" | "fmp"
    apiKey: "",                       // for finnhub/fmp only
    pyExe: WIN ? "python" : "python3",
    taDir: path.join(os.homedir(), ".voxelbridge", "TradingAgents"),
    provider: "ollama",
    ollamaUrl: "http://localhost:11434/v1",
    deepModel: "llama3.2",            // needs tool-calling (NOT plain llama3)
    quickModel: "llama3.2",
};

function loadCfg() { try { if (fs.existsSync(CFG_PATH)) return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); } catch {} return Object.assign({}, DEFAULTS); }
function saveCfg(o) { try { fs.mkdirSync(path.dirname(CFG_PATH), { recursive: true }); fs.writeFileSync(CFG_PATH, JSON.stringify(o, null, 2), { mode: 0o600 }); return true; } catch (e) { console.warn("[trader] cfg save failed:", e.message); return false; } }

function config(patch) {
    const c = loadCfg();
    if (patch && typeof patch === "object") {
        for (const k of ["source", "apiKey", "pyExe", "taDir", "provider", "ollamaUrl", "deepModel", "quickModel"]) {
            if (patch[k] != null) c[k] = String(patch[k]);
        }
    }
    saveCfg(c);
    const safe = Object.assign({}, c); if (safe.apiKey) safe.apiKey = "set";
    return { ok: true, config: safe };
}

// ---- process helper (same shape as hostingBridge) -------------------------
function runProc(cmd, args, timeoutMs, opts) {
    return new Promise(resolve => {
        let child, done = false, out = "", err = "";
        const finish = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
        const t = setTimeout(() => { try { child && child.kill(); } catch {} finish({ code: -2, stdout: out, stderr: err || "timed out" }); }, timeoutMs || 8000);
        try { child = spawn(cmd, args, Object.assign({ windowsHide: true }, opts || {})); }
        catch (e) { return finish({ code: -1, stdout: "", stderr: "spawn failed: " + (e && e.message) }); }
        if (child.stdout) child.stdout.on("data", d => { out += d; });
        if (child.stderr) child.stderr.on("data", d => { err += d; });
        child.on("error", e => finish({ code: -1, stdout: out, stderr: (err || "") + " " + (e && e.message) }));
        child.on("close", c => finish({ code: c, stdout: out, stderr: err }));
    });
}
async function _timedFetch(url, opts, ms) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms || 20000);
    try { return await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {})); } finally { clearTimeout(t); }
}
// v969 — run a FULL command STRING via cmd/bash (args passed as one element, so
// the shell never re-splits quoted python like `-c "import x; y"`). This is the
// reliable pattern (same as taInstall); the old runProc(py,["-c",...],{shell:true})
// dropped everything after the first space → "import" alone → SyntaxError.
function runShell(cmdStr, timeoutMs) {
    return new Promise(resolve => {
        let child, done = false, out = "", err = "";
        const finish = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
        const t = setTimeout(() => { try { child && child.kill(); } catch {} finish({ code: -2, stdout: out, stderr: err || "timed out" }); }, timeoutMs || 10000);
        try { child = spawn(WIN ? "cmd" : "bash", WIN ? ["/c", cmdStr] : ["-lc", cmdStr], { windowsHide: true }); }
        catch (e) { return finish({ code: -1, stdout: "", stderr: "spawn failed: " + (e && e.message) }); }
        child.stdout.on("data", d => { out += d; });
        child.stderr.on("data", d => { err += d; });
        child.on("error", e => finish({ code: -1, stdout: out, stderr: (err || "") + " " + (e && e.message) }));
        child.on("close", c => finish({ code: c, stdout: out, stderr: err }));
    });
}

// ---- 1) disclosed political trades ----------------------------------------
function _norm(s) { return String(s || "").toLowerCase().replace(/[^a-z ]/g, "").trim(); }
function _parseDate(s) { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ""); return m ? new Date(+m[3], +m[1] - 1, +m[2]).getTime() : 0; }

async function trades({ name = "", limit = 25 } = {}) {
    const c = loadCfg();
    try {
        if (c.source === "finnhub") {
            if (!c.apiKey) return { ok: false, error: "finnhub source needs an apiKey (trader.config)" };
            // finnhub wants a symbol; without one we can't list by member — guide the user.
            return { ok: false, error: "finnhub mode queries by ticker, not member; use source 'senate' to browse by politician name" };
        }
        if (c.source === "fmp") {
            if (!c.apiKey) return { ok: false, error: "fmp source needs an apiKey (free FMP key — 250 calls/day covers congressional). trader.config({source:'fmp', apiKey:'...'})" };
            const key = encodeURIComponent(c.apiKey);
            // FMP field names vary across endpoints/versions; map defensively.
            const mapRow = (t, chamber) => ({
                politician: (((t.firstName || "") + " " + (t.lastName || "")).trim()) || t.representative || t.office || t.name || "",
                ticker: t.symbol || t.ticker || "",
                asset: t.assetDescription || t.asset_description || "",
                type: t.type || t.transactionType || "",
                amount: t.amount || t.range || "",
                transaction_date: t.transactionDate || t.transaction_date || t.dateRecieved || t.disclosureDate || "",
                chamber, source: "fmp",
            });
            const pull = async (url, chamber) => {
                try {
                    const r = await _timedFetch(url, {}, 20000);
                    if (!r.ok) return [];
                    const arr = await r.json().catch(() => []);
                    return (Array.isArray(arr) ? arr : []).map(t => mapRow(t, chamber));
                } catch { return []; }
            };
            // Senate feed is the proven one; the House feed is attempted and
            // degrades silently if FMP renames/relocates it (senate still carries).
            const [sen, hou] = await Promise.all([
                pull(`https://financialmodelingprep.com/api/v4/senate-trading-rss-feed?page=0&apikey=${key}`, "senate"),
                pull(`https://financialmodelingprep.com/api/v4/senate-disclosure-rss-feed?page=0&apikey=${key}`.replace("senate-disclosure", "house-disclosure"), "house"),
            ]);
            let rows = sen.concat(hou).filter(t => t.ticker && t.ticker !== "--");
            const want = _norm(name);
            if (want) rows = rows.filter(t => _norm(t.politician).includes(want));
            rows.forEach(t => { t._t = _parseDate(t.transaction_date); });
            rows.sort((a, b) => b._t - a._t);
            rows.forEach(t => delete t._t);
            const chambers = [sen.length ? "senate" : null, hou.length ? "house" : null].filter(Boolean).join("+") || "none";
            return { ok: true, source: "fmp", chambers, note: `Current via FMP (${chambers}); ~30–45 day STOCK Act lag.`, count: rows.length, trades: rows.slice(0, limit) };
        }
        // default: senate-stock-watcher (free, no key)
        const r = await _timedFetch(SENATE_URL, {}, 25000);
        if (!r.ok) return { ok: false, error: "senate-watcher fetch " + r.status };
        const all = await r.json();
        const want = _norm(name);
        let rows = (Array.isArray(all) ? all : []).map(t => ({
            politician: t.senator, ticker: t.ticker, asset: t.asset_description,
            type: t.type, amount: t.amount, owner: t.owner,
            transaction_date: t.transaction_date, _t: _parseDate(t.transaction_date), source: "senate-watcher",
        }));
        if (want) rows = rows.filter(t => _norm(t.politician).includes(want));
        rows = rows.filter(t => t.ticker && t.ticker !== "--");
        rows.sort((a, b) => b._t - a._t);
        rows.forEach(t => delete t._t);
        return { ok: true, source: "senate-watcher", note: "Senate only; up to 30–45 day STOCK Act reporting lag.", count: rows.length, trades: rows.slice(0, limit) };
    } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
}

// ---- 2) TradingAgents: detect / install / uninstall / run -----------------
let _install = { running: false, log: "", code: null, startedAt: 0 };

function taDetect() {
    const c = loadCfg();
    // Prefer the venv python inside taDir if present, else the configured pyExe.
    const venvPy = WIN ? path.join(c.taDir, ".venv", "Scripts", "python.exe") : path.join(c.taDir, ".venv", "bin", "python");
    const py = fs.existsSync(venvPy) ? venvPy : c.pyExe;
    const probe = path.join(os.tmpdir(), "voxel_ta_probe.py");
    try { fs.writeFileSync(probe, "import tradingagents\nprint(getattr(tradingagents,'__version__','ok'))\n"); }
    catch (e) { return Promise.resolve({ ok: false, error: "probe write failed: " + e.message }); }
    return runShell(`"${py}" "${probe}"`, 15000)
        .then(r => {
            const text = ((r.stdout || "") + (r.stderr || "")).trim();
            const installed = r.code === 0 && !/Traceback|ModuleNotFound|No module|SyntaxError/i.test(text);
            return { ok: true, installed, python: py, taDir: c.taDir, version: installed ? text : null, detail: installed ? null : text.slice(0, 300) };
        });
}

function taInstall() {
    if (_install.running) return { ok: true, already: true, status: "running" };
    const c = loadCfg();
    _install = { running: true, log: "", code: null, startedAt: Date.now() };
    // clone (or pull) then create a venv and pip install . — long-running.
    const sh = [
        `git clone ${TA_REPO} "${c.taDir}" 2>&1 || (cd "${c.taDir}" && git pull 2>&1)`,
        `"${c.pyExe}" -m venv "${c.taDir}/.venv" 2>&1`,
        (WIN ? `"${c.taDir}\\.venv\\Scripts\\python.exe"` : `"${c.taDir}/.venv/bin/python"`) + ` -m pip install -U pip 2>&1`,
        (WIN ? `"${c.taDir}\\.venv\\Scripts\\python.exe"` : `"${c.taDir}/.venv/bin/python"`) + ` -m pip install "${c.taDir}" 2>&1`,
    ].join(" && ");
    const child = spawn(WIN ? "cmd" : "bash", WIN ? ["/c", sh] : ["-lc", sh], { windowsHide: true });
    child.stdout.on("data", d => { _install.log += d; if (_install.log.length > 20000) _install.log = _install.log.slice(-20000); });
    child.stderr.on("data", d => { _install.log += d; if (_install.log.length > 20000) _install.log = _install.log.slice(-20000); });
    child.on("close", code => { _install.running = false; _install.code = code; });
    child.on("error", e => { _install.running = false; _install.code = -1; _install.log += "\nspawn error: " + (e && e.message); });
    return { ok: true, started: true };
}
function taInstallStatus() { return { ok: true, running: _install.running, code: _install.code, tail: (_install.log || "").slice(-1500) }; }

async function taUninstall() {
    const c = loadCfg();
    let removed = false;
    try { if (fs.existsSync(c.taDir)) { fs.rmSync(c.taDir, { recursive: true, force: true }); removed = true; } } catch (e) { return { ok: false, error: "rm failed: " + e.message }; }
    // best-effort global uninstall too (in case it was pip-installed outside the venv)
    await runShell(`"${c.pyExe}" -m pip uninstall -y tradingagents`, 30000).catch(() => {});
    return { ok: true, removed, taDir: c.taDir };
}

// Run TradingAgents headless on one ticker. Writes a tiny runner that drives the
// programmatic API with the Ollama provider, prints JSON {decision, ...}.
async function analyze({ ticker, date } = {}) {
    const c = loadCfg();
    if (!ticker) return { ok: false, error: "no ticker" };
    const det = await taDetect();
    if (!det.installed) return { ok: false, error: "TradingAgents not installed — run trader.ta.install() first", detail: det.detail };
    const day = date || new Date().toISOString().slice(0, 10);
    const runner = path.join(c.taDir, "_voxel_runner.py");
    const py = WIN ? path.join(c.taDir, ".venv", "Scripts", "python.exe") : path.join(c.taDir, ".venv", "bin", "python");
    const usePy = fs.existsSync(py) ? py : c.pyExe;
    // NOTE: import paths follow TradingAgents' programmatic API. If upstream
    // renames modules, tweak here (kept in one place on purpose).
    const code = `
import json, sys
try:
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.default_config import DEFAULT_CONFIG
    cfg = dict(DEFAULT_CONFIG)
    cfg["llm_provider"] = "ollama"
    cfg["backend_url"] = ${JSON.stringify(c.ollamaUrl)}
    cfg["deep_think_llm"] = ${JSON.stringify(c.deepModel)}
    cfg["quick_think_llm"] = ${JSON.stringify(c.quickModel)}
    ta = TradingAgentsGraph(debug=False, config=cfg)
    _, decision = ta.propagate(${JSON.stringify(String(ticker).toUpperCase())}, ${JSON.stringify(day)})
    print("VOXEL_JSON" + json.dumps({"ok": True, "ticker": ${JSON.stringify(String(ticker).toUpperCase())}, "date": ${JSON.stringify(day)}, "decision": str(decision)}))
except Exception as e:
    print("VOXEL_JSON" + json.dumps({"ok": False, "error": repr(e)}))
`;
    try { fs.writeFileSync(runner, code); } catch (e) { return { ok: false, error: "runner write failed: " + e.message }; }
    const r = await runShell(`"${usePy}" "${runner}"`, 300000);
    const m = /VOXEL_JSON(\{.*\})/s.exec((r.stdout || "") + (r.stderr || ""));
    if (m) { try { return JSON.parse(m[1]); } catch {} }
    return { ok: false, error: "TradingAgents run produced no parseable result", tail: ((r.stdout || "") + (r.stderr || "")).slice(-800) };
}

// ---- light verdict via the unified AI gateway (no TradingAgents install) ----
// Returns a fast buy/sell/hold + one-line rationale using whichever provider
// has a key in the vault. This is the DEFAULT verdict engine for the floor;
// TradingAgents (analyze) stays available as the heavy local-Ollama option.
const _VERDICT_PROVIDERS = ["gemini", "openai", "claude", "grok"];
function _pickProvider() {
    if (!aiCreds) return null;
    for (const p of _VERDICT_PROVIDERS) {
        try { if (aiCreds.getApiKey(p === "claude" ? "claude" : p)) return p; } catch {}
    }
    return null;
}
async function verdict({ ticker, provider } = {}) {
    if (!ticker) return { ok: false, error: "no ticker" };
    if (!aiProviders) return { ok: false, error: "AI gateway unavailable" };
    const prov = provider || _pickProvider();
    if (!prov) return { ok: false, error: "no AI key set — add one in Settings (Gemini/OpenAI/Claude/Grok) or use TradingAgents (mode:'ta')" };
    const tk = String(ticker).toUpperCase();
    const prompt = `You are an equity analyst. For the stock ticker ${tk}, give a single-word call of BUY, SELL, or HOLD, then a brief one-sentence rationale. This is for an educational simulation, not investment advice. Respond EXACTLY as: CALL: <BUY|SELL|HOLD> — <one sentence>.`;
    try {
        const r = await aiProviders.chat(prov, prompt, { });
        if (!r || !r.ok) return { ok: false, error: (r && r.error) || "ai_failed", provider: prov };
        const text = String(r.text || "").trim();
        const call = (text.match(/\b(BUY|SELL|HOLD)\b/i) || ["HOLD"])[0].toUpperCase();
        return { ok: true, ticker: tk, provider: prov, decision: call, rationale: text.replace(/^CALL:\s*/i, "").slice(0, 240) };
    } catch (e) { return { ok: false, error: (e && e.message) || String(e), provider: prov }; }
}

// Pair a politician's disclosed trades with a per-ticker verdict.
//   mode:"off" (default) — just the disclosed trades (fast)
//   mode:"ai"            — light verdict via the AI gateway (seconds, no install)
//   mode:"ta"            — TradingAgents local-Ollama debate (slow, needs install)
// Legacy: runTA:true maps to mode:"ta".
async function mirror({ name = "", limit = 12, mode, runTA = false } = {}) {
    const t = await trades({ name, limit });
    if (!t.ok) return t;
    mode = mode || (runTA ? "ta" : "off");
    if (mode === "off") return Object.assign({ mode, hint: "pass mode:'ai' (fast) or 'ta' (TradingAgents) to add verdicts" }, t);
    const seen = new Map(); const out = [];
    for (const tr of t.trades) {
        const tk = String(tr.ticker || "").toUpperCase();
        if (!tk || tk === "--") { out.push(Object.assign({}, tr, { taVerdict: null })); continue; }
        if (seen.has(tk)) { out.push(Object.assign({}, tr, { taVerdict: seen.get(tk), rationale: "(see above)" })); continue; }
        const a = mode === "ta" ? await analyze({ ticker: tk }) : await verdict({ ticker: tk });
        const v = a.ok ? (a.decision || "?") : ("error: " + a.error);
        seen.set(tk, v);
        out.push(Object.assign({}, tr, { taVerdict: v, rationale: a.rationale || "" }));
    }
    return { ok: true, source: t.source, mode, note: t.note, trades: out };
}

module.exports = { config, loadCfg, trades, taDetect, taInstall, taInstallStatus, taUninstall, analyze, mirror, verdict, members, memberAnalysis };

// ---- v1025: congressional member list + per-member analysis (education/sim) ----
let _senateCache = { ts: 0, rows: null };
async function _senateRows() {
    if (_senateCache.rows && (Date.now() - _senateCache.ts) < 600000) return _senateCache.rows;
    const r = await _timedFetch(SENATE_URL, {}, 25000);
    if (!r.ok) throw new Error("senate-watcher fetch " + r.status);
    const all = await r.json();
    const rows = (Array.isArray(all) ? all : []).map(t => ({
        politician: t.senator, ticker: t.ticker, asset: t.asset_description,
        type: t.type, amount: t.amount, owner: t.owner,
        transaction_date: t.transaction_date, _t: _parseDate(t.transaction_date),
    })).filter(t => t.politician);
    _senateCache = { ts: Date.now(), rows };
    return rows;
}
async function members({ limit = 0, sort = "trades" } = {}) {
    try {
        const rows = await _senateRows();
        const m = {};
        for (const t of rows) {
            if (!m[t.politician]) m[t.politician] = { name: t.politician, trades: 0, lastDate: 0, tickers: {} };
            const e = m[t.politician]; e.trades++;
            if (t._t > e.lastDate) e.lastDate = t._t;
            if (t.ticker && t.ticker !== "--") e.tickers[t.ticker] = 1;
        }
        let list = Object.values(m).map(x => ({ name: x.name, trades: x.trades, tickers: Object.keys(x.tickers).length, lastTrade: x.lastDate ? new Date(x.lastDate).toISOString().slice(0, 10) : "" }));
        list.sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.trades - a.trades);
        if (limit > 0) list = list.slice(0, limit);
        return { ok: true, source: "senate-watcher", count: list.length, members: list,
            note: "Senate only; STOCK Act disclosures lag the trade 30-45 days. Education/simulation only - not investment advice." };
    } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
}
async function memberAnalysis({ name = "", limit = 15 } = {}) {
    if (!name) return { ok: false, error: "name required" };
    try {
        const rows = await _senateRows();
        const want = _norm(name);
        const mine = rows.filter(t => _norm(t.politician).includes(want) && t.ticker && t.ticker !== "--");
        if (!mine.length) return { ok: false, error: "no disclosed trades for '" + name + "'" };
        const isBuy = s => /purchase|buy/i.test(s || ""), isSell = s => /sale|sell/i.test(s || "");
        let buys = 0, sells = 0, minT = Infinity, maxT = 0; const tc = {};
        for (const t of mine) {
            if (isBuy(t.type)) buys++; else if (isSell(t.type)) sells++;
            tc[t.ticker] = (tc[t.ticker] || 0) + 1;
            if (t._t) { if (t._t < minT) minT = t._t; if (t._t > maxT) maxT = t._t; }
        }
        const topTickers = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ticker, n]) => ({ ticker, trades: n }));
        const recent = mine.slice().sort((a, b) => b._t - a._t).slice(0, limit).map(t => ({ date: t.transaction_date, ticker: t.ticker, type: t.type, amount: t.amount, asset: t.asset }));
        return { ok: true, member: mine[0].politician, source: "senate-watcher",
            note: "Education/simulation only - disclosures lag 30-45 days; amounts are STOCK Act ranges, not exact.",
            summary: { totalTrades: mine.length, buys, sells, uniqueTickers: Object.keys(tc).length,
                firstTrade: minT < Infinity ? new Date(minT).toISOString().slice(0, 10) : "", lastTrade: maxT ? new Date(maxT).toISOString().slice(0, 10) : "" },
            topTickers, recent };
    } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
}
